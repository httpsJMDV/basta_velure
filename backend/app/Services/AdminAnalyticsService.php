<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Category;
use App\Models\SellerProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The one place the admin dashboard and the admin Analytics & Reports page get their figures from, so the two can never
 * disagree. Every figure is a SQL aggregate (no order is loaded into memory). The definitions, also shown in
 * docs/api/admin-reports.md:
 *
 *  - Range: inclusive Asia/Manila calendar days. Timestamps are stored in UTC, so a range is the half-open UTC interval
 *    [start of `from` in Manila, start of the day after `to` in Manila). An order is counted on the day it was placed
 *    (`orders.created_at`). The dashboard uses the last DASHBOARD_DAYS days ending today (Manila).
 *  - Soft-deleted orders are never counted.
 *  - "Counted" orders are every status except CANCELLED and RETURNED (the OrderStatus enum values). GMV, the order
 *    count, commission, seller earnings, units, the payment split, the active buyers and sellers and the daily series
 *    all use exactly that set. (`orders_placed` is the one figure over every status, so the cancelled and returned
 *    orders can be shown beside it.)
 *  - GMV is the sum of `orders.total` (shipping included). Commission, seller earnings and units are summed from the
 *    stored `order_items` values, never recomputed from a rate.
 *  - Active buyers / sellers are the distinct buyers who placed, and sellers who sold on, a counted order in the range.
 *  - Nothing is made up: a rate with nothing to divide is null.
 */
class AdminAnalyticsService
{
    public const TIMEZONE = 'Asia/Manila';
    public const DASHBOARD_DAYS = 30;
    public const MAX_DAYS = 800;
    public const PRESETS = ['7d', '30d', '90d', '12m', 'all'];

    /** @return array<int, string> the statuses that never count toward GMV, orders, commission or activity */
    public static function excludedStatuses(): array
    {
        return [OrderStatus::CANCELLED->value, OrderStatus::RETURNED->value];
    }

    /**
     * The order pipeline, grouped for display. Together the groups cover every OrderStatus exactly once.
     *
     * @return array<int, array{key: string, label: string, statuses: array<int, string>}>
     */
    public static function pipelineGroups(): array
    {
        $s = fn (OrderStatus ...$cases) => array_map(fn (OrderStatus $c) => $c->value, $cases);

        return [
            ['key' => 'awaiting_confirmation', 'label' => 'Pending Confirmation',    'statuses' => $s(OrderStatus::PLACED)],
            ['key' => 'processing',            'label' => 'Order Processing',        'statuses' => $s(OrderStatus::CONFIRMED, OrderStatus::PREPARING)],
            ['key' => 'hub_first_mile',        'label' => 'Hub & First-Mile',        'statuses' => $s(OrderStatus::READY_FOR_PICKUP, OrderStatus::PICKED_UP, OrderStatus::AT_SORTING_CENTER, OrderStatus::SORTED)],
            ['key' => 'out_for_delivery',      'label' => 'Out for Delivery',        'statuses' => $s(OrderStatus::ASSIGNED_TO_RIDER, OrderStatus::OUT_FOR_DELIVERY)],
            ['key' => 'delivered_completed',   'label' => 'Delivered / Completed',   'statuses' => $s(OrderStatus::DELIVERED, OrderStatus::COMPLETED)],
            ['key' => 'cancelled_problem',     'label' => 'Cancelled / Returned / Problem', 'statuses' => $s(OrderStatus::DELIVERY_FAILED, OrderStatus::RETURNED, OrderStatus::CANCELLED, OrderStatus::DISPUTED)],
        ];
    }

    // ── Ranges ───────────────────────────────────────────────────────────────

    /** Today in Manila as Y-m-d. */
    public function today(): string
    {
        return CarbonImmutable::now(self::TIMEZONE)->toDateString();
    }

    /**
     * @return array{from: string, to: string, days: int, start: string, end: string, preset: ?string}
     *         start/end are the UTC bounds as 'Y-m-d H:i:s', start inclusive and end exclusive
     */
    public function range(string $from, string $to, ?string $preset = null): array
    {
        $start = CarbonImmutable::createFromFormat('Y-m-d', $from, self::TIMEZONE)->startOfDay();
        $endDay = CarbonImmutable::createFromFormat('Y-m-d', $to, self::TIMEZONE)->startOfDay();

        return [
            'from'   => $from,
            'to'     => $to,
            'days'   => (int) $start->diffInDays($endDay) + 1,
            'start'  => $start->utc()->format('Y-m-d H:i:s'),
            'end'    => $endDay->addDay()->utc()->format('Y-m-d H:i:s'),
            'preset' => $preset,
        ];
    }

    /** The last $days Manila days, ending today. */
    public function lastDays(int $days, ?string $preset = null): array
    {
        $to = $this->today();

        return $this->range(CarbonImmutable::createFromFormat('Y-m-d', $to, self::TIMEZONE)->subDays($days - 1)->toDateString(), $to, $preset);
    }

    /** The fixed window of the dashboard. */
    public function dashboardRange(): array
    {
        return $this->lastDays(self::DASHBOARD_DAYS, self::DASHBOARD_DAYS . 'd');
    }

    /** A named preset (7d, 30d, 90d, 12m, all) ending today. */
    public function preset(string $preset): array
    {
        return match ($preset) {
            '7d'  => $this->lastDays(7, '7d'),
            '90d' => $this->lastDays(90, '90d'),
            '12m' => $this->range(CarbonImmutable::now(self::TIMEZONE)->subYear()->addDay()->toDateString(), $this->today(), '12m'),
            'all' => $this->allTime(),
            default => $this->lastDays(30, '30d'),
        };
    }

    /** From the day of the first order to today (today when there are no orders). */
    public function allTime(): array
    {
        $first = DB::table('orders')->whereNull('deleted_at')->min('created_at');
        $from = $first
            ? CarbonImmutable::parse($first, 'UTC')->setTimezone(self::TIMEZONE)->toDateString()
            : $this->today();

        return $this->range($from, $this->today(), 'all');
    }

    /** The period of the same length that ends the day before $range starts. */
    public function previousRange(array $range): array
    {
        $to = CarbonImmutable::createFromFormat('Y-m-d', $range['from'], self::TIMEZONE)->subDay();
        $from = $to->subDays($range['days'] - 1);

        return $this->range($from->toDateString(), $to->toDateString());
    }

    // ── The shared figures ───────────────────────────────────────────────────

    /**
     * GMV, orders, commission, seller earnings, units, and who was active, for one range.
     *
     * @param array{start: string, end: string} $range
     * @return array<string, mixed>
     */
    public function summary(array $range): array
    {
        $placed = $this->orders($range);
        $counted = $this->countedOrders($range);

        $orders = (clone $counted)->selectRaw('COALESCE(SUM(o.total), 0) as gmv, COUNT(*) as orders')->first();

        $items = $this->countedItems($range)
            ->selectRaw('COALESCE(SUM(i.commission_amount), 0) as commission, COALESCE(SUM(i.seller_earnings), 0) as earnings, COALESCE(SUM(i.quantity), 0) as units, COUNT(DISTINCT i.seller_id) as sellers')
            ->first();

        $gmv = round((float) $orders->gmv, 2);
        $commission = round((float) $items->commission, 2);

        return [
            'gmv'                 => $gmv,
            'orders'              => (int) $orders->orders,
            'orders_placed'       => (int) (clone $placed)->count(),
            'cancelled_orders'    => (int) (clone $placed)->where('o.status', OrderStatus::CANCELLED->value)->count(),
            'returned_orders'     => (int) (clone $placed)->where('o.status', OrderStatus::RETURNED->value)->count(),
            'commission'          => $commission,
            'seller_earnings'     => round((float) $items->earnings, 2),
            'units_sold'          => (int) $items->units,
            // Commission as a share of GMV. Null, never a made-up default, when there was no GMV.
            'avg_commission_rate' => $gmv > 0 ? round($commission / $gmv * 100, 2) : null,
            'active_buyers'       => (int) (clone $counted)->distinct()->count('o.buyer_id'),
            'active_sellers'      => (int) $items->sellers,
        ];
    }

    /**
     * One row per Manila day in the range (zeros included).
     *
     * @param array{from: string, days: int, start: string, end: string} $range
     * @return array<int, array{date: string, gmv: float, commission: float, orders: int, orders_placed: int}>
     */
    public function daily(array $range): array
    {
        $day = $this->dayExpression('o.created_at');

        $placed = $this->orders($range)->selectRaw("{$day} as bucket, COUNT(*) as placed")->groupBy('bucket')->pluck('placed', 'bucket');
        $counted = $this->countedOrders($range)->selectRaw("{$day} as bucket, COUNT(*) as orders, COALESCE(SUM(o.total), 0) as gmv")->groupBy('bucket')->get()->keyBy('bucket');
        $commission = $this->countedItems($range)->selectRaw("{$day} as bucket, COALESCE(SUM(i.commission_amount), 0) as commission")->groupBy('bucket')->pluck('commission', 'bucket');

        $rows = [];
        $cursor = CarbonImmutable::createFromFormat('Y-m-d', $range['from'], self::TIMEZONE);
        for ($n = 0; $n < $range['days']; $n++) {
            $date = $cursor->addDays($n)->toDateString();
            $rows[] = [
                'date'          => $date,
                'gmv'           => round((float) ($counted[$date]->gmv ?? 0), 2),
                'commission'    => round((float) ($commission[$date] ?? 0), 2),
                'orders'        => (int) ($counted[$date]->orders ?? 0),
                'orders_placed' => (int) ($placed[$date] ?? 0),
            ];
        }

        return $rows;
    }

    /**
     * One row per Manila month that overlaps the range. The first and last month hold only the days inside the range.
     *
     * @return array<int, array{date: string, gmv: float, commission: float, orders: int, orders_placed: int}>
     */
    public function monthly(array $range): array
    {
        $month = $this->monthExpression('o.created_at');

        $placed = $this->orders($range)->selectRaw("{$month} as bucket, COUNT(*) as placed")->groupBy('bucket')->pluck('placed', 'bucket');
        $counted = $this->countedOrders($range)->selectRaw("{$month} as bucket, COUNT(*) as orders, COALESCE(SUM(o.total), 0) as gmv")->groupBy('bucket')->get()->keyBy('bucket');
        $commission = $this->countedItems($range)->selectRaw("{$month} as bucket, COALESCE(SUM(i.commission_amount), 0) as commission")->groupBy('bucket')->pluck('commission', 'bucket');

        $rows = [];
        $cursor = CarbonImmutable::createFromFormat('Y-m-d', $range['from'], self::TIMEZONE)->startOfMonth();
        $last = CarbonImmutable::createFromFormat('Y-m-d', $range['to'], self::TIMEZONE)->startOfMonth();
        while ($cursor->lte($last)) {
            $key = $cursor->format('Y-m');
            $rows[] = [
                'date'          => $key . '-01',
                'gmv'           => round((float) ($counted[$key]->gmv ?? 0), 2),
                'commission'    => round((float) ($commission[$key] ?? 0), 2),
                'orders'        => (int) ($counted[$key]->orders ?? 0),
                'orders_placed' => (int) ($placed[$key] ?? 0),
            ];
            $cursor = $cursor->addMonthNoOverflow();
        }

        return $rows;
    }

    /**
     * Orders placed in the range by OrderStatus (every status present, zeros included), and the grouped pipeline.
     *
     * @return array{total: int, by_status: array<string, int>, groups: array<int, array{key: string, label: string, statuses: array<int, string>, count: int}>}
     */
    public function pipeline(array $range): array
    {
        $counts = $this->orders($range)->selectRaw('o.status as status, COUNT(*) as total')->groupBy('o.status')->pluck('total', 'status');

        $byStatus = [];
        foreach (OrderStatus::cases() as $case) {
            $byStatus[$case->value] = (int) ($counts[$case->value] ?? 0);
        }

        $groups = array_map(
            fn (array $group) => $group + ['count' => array_sum(array_map(fn (string $s) => $byStatus[$s], $group['statuses']))],
            self::pipelineGroups()
        );

        return ['total' => array_sum($byStatus), 'by_status' => $byStatus, 'groups' => $groups];
    }

    /**
     * Counted orders by payment method.
     *
     * @return array{gcash: array{count: int, volume: float}, cod: array{count: int, volume: float}, total_orders: int, total_volume: float}
     */
    public function paymentSplit(array $range): array
    {
        $rows = $this->countedOrders($range)
            ->selectRaw('o.payment_method as method, COUNT(*) as orders, COALESCE(SUM(o.total), 0) as volume')
            ->groupBy('o.payment_method')
            ->get()
            ->keyBy('method');

        $pick = fn (string $method) => [
            'count'  => (int) ($rows[$method]->orders ?? 0),
            'volume' => round((float) ($rows[$method]->volume ?? 0), 2),
        ];
        $gcash = $pick('gcash');
        $cod = $pick('cod');

        return [
            'gcash'        => $gcash,
            'cod'          => $cod,
            'total_orders' => $gcash['count'] + $cod['count'],
            'total_volume' => round($gcash['volume'] + $cod['volume'], 2),
        ];
    }

    /**
     * Disputes opened in the range, and how many are open right now (not tied to the range).
     *
     * @return array{opened: int, open_now: int}
     */
    public function disputes(array $range): array
    {
        return [
            'opened'   => DB::table('disputes')->whereNull('deleted_at')->where('created_at', '>=', $range['start'])->where('created_at', '<', $range['end'])->count(),
            'open_now' => DB::table('disputes')->whereNull('deleted_at')->whereIn('status', ['open', 'in_progress'])->count(),
        ];
    }

    /**
     * Sales by category: items of counted orders, grouped by the category stored on the item. The rate is the stored
     * commission over the stored sales, so it reflects what was actually charged.
     *
     * @return array<int, array{category: string, gross_sales: float, units_sold: int, orders_count: int, commission_rate: float, commission_earned: float}>
     */
    public function categories(array $range): array
    {
        $rows = $this->countedItems($range)
            ->selectRaw('i.category_id as category_key, COALESCE(SUM(i.subtotal), 0) as sales, COALESCE(SUM(i.quantity), 0) as units, COUNT(DISTINCT i.order_id) as orders, COALESCE(SUM(i.commission_amount), 0) as commission')
            ->groupBy('i.category_id')
            ->get();

        $names = Category::query()->get(['id', 'slug', 'name']);
        $label = function (?string $key) use ($names): string {
            if ($key === null || $key === '') {
                return 'Uncategorized';
            }
            $match = ctype_digit($key) ? $names->firstWhere('id', (int) $key) : $names->firstWhere('slug', $key);

            return $match?->name ?? 'Uncategorized';
        };

        // Different keys can resolve to one category (an id and its slug), or to none: merge them.
        $merged = [];
        foreach ($rows as $row) {
            $name = $label($row->category_key);
            $merged[$name] ??= ['sales' => 0.0, 'units' => 0, 'orders' => 0, 'commission' => 0.0];
            $merged[$name]['sales'] += (float) $row->sales;
            $merged[$name]['units'] += (int) $row->units;
            $merged[$name]['orders'] += (int) $row->orders;
            $merged[$name]['commission'] += (float) $row->commission;
        }

        $breakdown = [];
        foreach ($merged as $name => $m) {
            $breakdown[] = [
                'category'          => $name,
                'gross_sales'       => round($m['sales'], 2),
                'units_sold'        => $m['units'],
                'orders_count'      => $m['orders'],
                'commission_rate'   => $m['sales'] > 0 ? round($m['commission'] / $m['sales'] * 100, 2) : 0.0,
                'commission_earned' => round($m['commission'], 2),
            ];
        }
        usort($breakdown, fn ($a, $b) => $b['gross_sales'] <=> $a['gross_sales']);

        return $breakdown;
    }

    /**
     * The sellers with the most sales in the range (their items on counted orders). A seller is whoever the order item
     * names, whatever their account role: an approved seller is a buyer account with a seller profile.
     *
     * @return array<int, array<string, mixed>>
     */
    public function topSellers(array $range, int $limit = 15): array
    {
        $rows = $this->countedItems($range)
            ->selectRaw('i.seller_id as seller_id, COALESCE(SUM(i.subtotal), 0) as sales, COALESCE(SUM(i.quantity), 0) as units, COUNT(DISTINCT i.order_id) as orders, COALESCE(SUM(i.commission_amount), 0) as commission, COALESCE(SUM(i.seller_earnings), 0) as earnings')
            ->groupBy('i.seller_id')
            ->orderByDesc('sales')
            ->limit($limit)
            ->get();

        $users = User::withTrashed()->with('sellerProfile')->whereIn('id', $rows->pluck('seller_id'))->get()->keyBy('id');

        return $rows->map(function ($row) use ($users) {
            $seller = $users[$row->seller_id] ?? null;
            $sales = round((float) $row->sales, 2);
            $orders = (int) $row->orders;

            return [
                'seller_id'            => (int) $row->seller_id,
                'seller_name'          => $seller ? trim($seller->first_name . ' ' . $seller->last_name) : 'Unknown seller',
                'shop_name'            => $seller?->sellerProfile?->shop_name ?? ($seller ? $seller->first_name . "'s Shop" : 'Unknown shop'),
                'email'                => $seller?->email,
                'gross_sales'          => $sales,
                'orders_count'         => $orders,
                'units_sold'           => (int) $row->units,
                'commission_generated' => round((float) $row->commission, 2),
                'net_payout_credited'  => round((float) $row->earnings, 2),
                'avg_order_value'      => $orders > 0 ? round($sales / $orders, 2) : 0.0,
            ];
        })->values()->all();
    }

    /**
     * Account totals that do not depend on a range.
     *
     * @return array{buyers: int, sellers: int, riders: int}
     */
    public function registeredAccounts(): array
    {
        return [
            // Every buyer account, sellers included: a seller is a buyer whose shop was approved.
            'buyers'  => User::where('role', 'buyer')->count(),
            'sellers' => SellerProfile::where('application_status', 'approved')->count(),
            'riders'  => User::where('role', 'rider')->count(),
        ];
    }

    /**
     * The block both pages show for one range: the summary plus pipeline, payment split and disputes, and the
     * same-length period before it for trends.
     *
     * @return array<string, mixed>
     */
    public function overview(array $range): array
    {
        $previous = $this->previousRange($range);
        $prev = $this->summary($previous);

        return [
            'range'     => $this->describe($range),
            'summary'   => $this->summary($range),
            'previous'  => ['range' => $this->describe($previous)] + array_intersect_key($prev, array_flip(['gmv', 'orders', 'commission', 'active_buyers', 'active_sellers'])),
            'pipeline'  => $this->pipeline($range),
            'payments'  => $this->paymentSplit($range),
            'disputes'  => $this->disputes($range),
        ];
    }

    /** @return array{from: string, to: string, days: int, timezone: string, preset: ?string} */
    public function describe(array $range): array
    {
        return ['from' => $range['from'], 'to' => $range['to'], 'days' => $range['days'], 'timezone' => self::TIMEZONE, 'preset' => $range['preset'] ?? null];
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    /** Every order placed in the range, whatever its status. Alias `o`. */
    private function orders(array $range): Builder
    {
        return DB::table('orders as o')
            ->whereNull('o.deleted_at')
            ->where('o.created_at', '>=', $range['start'])
            ->where('o.created_at', '<', $range['end']);
    }

    /** The orders that count: placed in the range and not CANCELLED or RETURNED. Alias `o`. */
    private function countedOrders(array $range): Builder
    {
        return $this->orders($range)->whereNotIn('o.status', self::excludedStatuses());
    }

    /** The order items of the counted orders. Aliases `i` (items) and `o` (orders). */
    private function countedItems(array $range): Builder
    {
        return $this->countedOrders($range)->join('order_items as i', 'i.order_id', '=', 'o.id');
    }

    /** SQL for the Manila calendar day of a UTC timestamp column ("Y-m-d"). Manila has no daylight saving. */
    private function dayExpression(string $column): string
    {
        return "DATE(DATE_ADD({$column}, INTERVAL {$this->offsetSeconds()} SECOND))";
    }

    /** SQL for the Manila calendar month of a UTC timestamp column ("Y-m"). */
    private function monthExpression(string $column): string
    {
        return "DATE_FORMAT(DATE_ADD({$column}, INTERVAL {$this->offsetSeconds()} SECOND), '%Y-%m')";
    }

    private function offsetSeconds(): int
    {
        return (int) CarbonImmutable::now(self::TIMEZONE)->getOffset();
    }
}
