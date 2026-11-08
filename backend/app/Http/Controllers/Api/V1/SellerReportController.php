<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use App\Support\XlsxWorkbook;

class SellerReportController extends Controller
{
    private function excludedStatuses(): array
    {
        return [OrderStatus::CANCELLED->value, OrderStatus::RETURNED->value, 'cancelled', 'returned'];
    }

    /**
     * GET /api/v1/seller/reports/summary
     */
    public function summary(Request $request): JsonResponse
    {
        [$startDate, $endDate] = $this->window($request);

        return response()->json(['data' => $this->summaryFor($request->user()->id, $startDate, $endDate)]);
    }

    /** @return array<string, mixed> the summary cards of one shop for a window (nulls: all time) */
    private function summaryFor(int $sellerId, ?Carbon $startDate, ?Carbon $endDate): array
    {
        $orders = Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->whereNotIn('status', $this->excludedStatuses())
            ->when($startDate, fn ($q) => $q->whereBetween('created_at', [$startDate, $endDate]))
            ->get();

        $items = OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) =>
                $q->whereNotIn('status', $this->excludedStatuses())
                  ->when($startDate, fn ($q2) => $q2->whereBetween('created_at', [$startDate, $endDate]))
            )
            ->get();

        // A9: gross sales are the item subtotals; shipping is not part of them. The shop's own vouchers and
        // promotions come off before the 5% commission; Loved-IT's vouchers do not touch the shop's money.
        $grossSales = round((float) $items->sum('subtotal'), 2);
        $sellerDiscounts = round((float) $items->sum(fn ($i) => (float) $i->store_voucher_share + (float) $i->promo_share), 2);
        $commissionPaid = (float) $items->sum('commission_amount');
        $netEarnings = (float) $items->sum('seller_earnings');
        $totalOrders = $orders->count();
        $deliveredOrders = $orders->filter(function ($o) {
            $st = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;
            return in_array($st, [OrderStatus::DELIVERED->value, OrderStatus::COMPLETED->value, 'delivered'], true);
        })->count();
        $unitsSold = (int) $items->sum('quantity');

        return [
            'gross_sales'      => $grossSales,
            'seller_discounts' => $sellerDiscounts,
            'net_earnings'     => $netEarnings,
            'from'             => $startDate?->copy()->setTimezone('Asia/Manila')->toDateString(),
            'to'               => $endDate?->copy()->setTimezone('Asia/Manila')->toDateString(),
            'commission_paid'  => $commissionPaid,
            'total_orders'     => $totalOrders,
            'delivered_orders' => $deliveredOrders,
            'units_sold'       => $unitsSold,
        ];
    }

    /**
     * GET /api/v1/seller/reports/revenue-chart
     *
     * Uses the same window as the summary (S13), so the chart and the cards agree. Gross is the shop's own item
     * subtotals (A9: shipping is not a sale, and other shops' items in the same order are not this shop's sales).
     * Daily points, or monthly ones for 12 months, when asked, or for a window longer than 92 days.
     */
    public function revenueChart(Request $request): JsonResponse
    {
        [$start, $end] = $this->window($request);
        $monthly = $request->query('interval') === 'monthly' || $request->query('range') === '12m';

        return response()->json(['data' => $this->chartFor($request->user()->id, $start, $end, $monthly)]);
    }

    /**
     * Sales by day (or by month, when asked or for a window longer than 92 days). All time shows the last 12 months.
     *
     * @return list<array{date: string, iso_date: string, gross_sales: float, net_earnings: float, commission: float}>
     */
    private function chartFor(int $sellerId, ?Carbon $start, ?Carbon $end, bool $monthly): array
    {
        $tz = 'Asia/Manila';
        if (! $start) {
            $start = now($tz)->subMonths(11)->startOfMonth()->utc();
            $end = now($tz)->endOfDay()->utc();
        }
        $from = $start->copy()->setTimezone($tz);
        $to = $end->copy()->setTimezone($tz);
        $monthly = $monthly || $from->diffInDays($to) > 92;

        $items = OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', $this->excludedStatuses())->whereBetween('created_at', [$start, $end]))
            ->with('order:id,created_at')
            ->get(['id', 'order_id', 'subtotal', 'seller_earnings', 'commission_amount']);

        $key = fn (Carbon $d) => $monthly ? $d->format('Y-m') : $d->toDateString();
        $points = [];
        $cursor = $monthly ? $from->copy()->startOfMonth() : $from->copy()->startOfDay();
        while ($cursor->lte($to)) {
            $points[$key($cursor)] = [
                'date'         => $monthly ? $cursor->format('M Y') : $cursor->format('M d'),
                'iso_date'     => $cursor->toDateString(),
                'gross_sales'  => 0.0,
                'net_earnings' => 0.0,
                'commission'   => 0.0,
            ];
            $monthly ? $cursor->addMonthNoOverflow() : $cursor->addDay();
        }

        foreach ($items as $item) {
            $k = $key($item->order->created_at->copy()->setTimezone($tz));
            if (! isset($points[$k])) {
                continue;
            }
            $points[$k]['gross_sales'] += (float) $item->subtotal;
            $points[$k]['net_earnings'] += (float) $item->seller_earnings;
            $points[$k]['commission'] += (float) $item->commission_amount;
        }

        return array_map(fn ($p) => [
            ...$p,
            'gross_sales'  => round($p['gross_sales'], 2),
            'net_earnings' => round($p['net_earnings'], 2),
            'commission'   => round($p['commission'], 2),
        ], array_values($points));
    }

    /**
     * GET /api/v1/seller/reports/payment-methods
     */
    public function paymentMethods(Request $request): JsonResponse
    {
        [$startDate, $endDate] = $this->window($request);

        return response()->json(['data' => $this->paymentsFor($request->user()->id, $startDate, $endDate)]);
    }

    /** @return array<string, mixed> orders and order totals by how the buyer paid */
    private function paymentsFor(int $sellerId, ?Carbon $startDate, ?Carbon $endDate): array
    {
        $orders = Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->whereNotIn('status', $this->excludedStatuses())
            ->when($startDate, fn ($q) => $q->whereBetween('created_at', [$startDate, $endDate]))
            ->get();

        $gcash = $orders->where('payment_method', 'gcash');
        $cod   = $orders->where('payment_method', 'cod');
        $wallet = $orders->whereIn('payment_method', ['e_wallet', 'card']);

        return [
            'gcash' => [
                'count'  => $gcash->count(),
                'volume' => (float) $gcash->sum('total'),
            ],
            'cod' => [
                'count'  => $cod->count(),
                'volume' => (float) $cod->sum('total'),
            ],
            'e_wallet_card' => [
                'count'  => $wallet->count(),
                'volume' => (float) $wallet->sum('total'),
            ],
            'total_orders' => $orders->count(),
            'total_volume' => (float) $orders->sum('total'),
        ];
    }

    /**
     * GET /api/v1/seller/reports/top-products
     */
    public function topProducts(Request $request): JsonResponse
    {
        [$startDate, $endDate] = $this->window($request);

        return response()->json(['data' => array_slice($this->productsFor($request->user()->id, $startDate, $endDate), 0, 10)]);
    }

    /** @return list<array<string, mixed>> every product the shop sold in the window, best gross first */
    private function productsFor(int $sellerId, ?Carbon $startDate, ?Carbon $endDate, bool $categoryNames = false): array
    {
        $items = OrderItem::with($categoryNames ? ['product.category:id,name'] : ['product'])
            ->where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) =>
                $q->whereNotIn('status', $this->excludedStatuses())
                  ->when($startDate, fn ($q2) => $q2->whereBetween('created_at', [$startDate, $endDate]))
            )
            ->get();

        $productMap = [];

        foreach ($items as $item) {
            // A product deleted since keeps the name the order saved.
            $pId = $item->product_id ?? 'line:' . $item->product_name;
            $name = $item->product?->name ?? $item->product_name ?? 'Product';
            $category = $categoryNames
                ? ($item->product?->category?->name ?? 'General')
                : ($item->category_id ?: ($item->product?->category_id ?? 'General'));

            if (!isset($productMap[$pId])) {
                $productMap[$pId] = [
                    'product_id'   => $pId,
                    'name'         => $name,
                    'category'     => $categoryNames ? (string) $category : ucwords(str_replace(['-', '_'], ' ', $category)),
                    'units_sold'   => 0,
                    'gross_sales'  => 0.0,
                    'net_earnings' => 0.0,
                ];
            }

            $productMap[$pId]['units_sold']   += (int) $item->quantity;
            $productMap[$pId]['gross_sales']  += (float) $item->subtotal;
            $productMap[$pId]['net_earnings'] += (float) ($item->seller_earnings ?? ($item->subtotal - $item->commission_amount));
        }

        $top = array_values($productMap);
        usort($top, fn ($a, $b) => $b['gross_sales'] <=> $a['gross_sales']);

        return $top;
    }

    /**
     * GET /api/v1/seller/reports/export?range=|from=&to= : the report as an Excel workbook (docs/api/seller-reports.md):
     * Summary, Sales by day (or month), Payment methods, Products and Orders, for the same window as the page.
     * Cancelled and returned orders are left out, as on the page.
     */
    public function export(Request $request): Response
    {
        $seller = $request->user();
        [$start, $end] = $this->window($request);
        $tz = 'Asia/Manila';
        $shop = (string) ($seller->sellerProfile?->shop_name ?: 'Your shop');
        $period = $start
            ? $start->copy()->setTimezone($tz)->format('M j, Y') . ($start->copy()->setTimezone($tz)->toDateString() === $end->copy()->setTimezone($tz)->toDateString() ? '' : ' to ' . $end->copy()->setTimezone($tz)->format('M j, Y'))
            : 'All time';

        $summary = $this->summaryFor($seller->id, $start, $end);
        $chart = $this->chartFor($seller->id, $start, $end, $request->query('range') === '12m');
        // The same rule chartFor() uses: months for 12 months, all time, or more than 92 days.
        $byMonth = $request->query('range') === '12m' || ! $start || $start->diffInDays($end) > 92;
        $payments = $this->paymentsFor($seller->id, $start, $end);
        $products = $this->productsFor($seller->id, $start, $end, true);
        $orders = $this->ordersFor($seller->id, $start, $end);

        $x = new XlsxWorkbook("{$shop} sales report", 'Loved-IT');
        $heading = fn (string $title) => [
            [XlsxWorkbook::text($title, 'title')],
            [XlsxWorkbook::text("{$shop} · {$period} · Manila time", 'muted')],
            [XlsxWorkbook::text('Made on Loved-IT ' . now($tz)->format('M j, Y g:i A'), 'muted')],
            [],
        ];
        $aov = $summary['total_orders'] > 0 ? $summary['gross_sales'] / $summary['total_orders'] : 0;

        $x->sheet('Summary', [34, 20, 64], [
            ...$heading('Sales report'),
            [XlsxWorkbook::header('Figure'), XlsxWorkbook::header('Amount'), XlsxWorkbook::header('What it means')],
            [XlsxWorkbook::text('Gross sales', 'label'), XlsxWorkbook::money($summary['gross_sales']), 'Your items\' prices times quantities. Shipping is not a sale.'],
            [XlsxWorkbook::text('Shop discounts', 'label'), XlsxWorkbook::money($summary['seller_discounts']), 'Your own vouchers and promotions. Loved-IT\'s vouchers do not reduce your money.'],
            [XlsxWorkbook::text('Commission', 'label'), XlsxWorkbook::money($summary['commission_paid']), 'Loved-IT\'s commission on what you sold.'],
            [XlsxWorkbook::text('Net earnings', 'total'), XlsxWorkbook::money($summary['net_earnings'], true), XlsxWorkbook::text('What the shop keeps.', 'total')],
            [],
            [XlsxWorkbook::text('Orders', 'label'), XlsxWorkbook::int($summary['total_orders']), 'Cancelled and returned orders are left out.'],
            [XlsxWorkbook::text('Delivered or completed', 'label'), XlsxWorkbook::int($summary['delivered_orders']), ''],
            [XlsxWorkbook::text('Units sold', 'label'), XlsxWorkbook::int($summary['units_sold']), ''],
            [XlsxWorkbook::text('Average order (gross)', 'label'), XlsxWorkbook::money($aov), ''],
        ], 0);

        $dayRows = array_map(fn ($p) => [
            XlsxWorkbook::date(Carbon::parse($p['iso_date'], $tz)), XlsxWorkbook::money($p['gross_sales']), XlsxWorkbook::money($p['commission']), XlsxWorkbook::money($p['net_earnings']),
        ], $chart);
        $x->sheet($byMonth ? 'Sales by month' : 'Sales by day', [18, 18, 18, 18], [
            ...$heading($byMonth ? 'Sales by month' : 'Sales by day'),
            [XlsxWorkbook::header($byMonth ? 'Month starting' : 'Date'), XlsxWorkbook::header('Gross sales'), XlsxWorkbook::header('Commission'), XlsxWorkbook::header('Net earnings')],
            ...$dayRows,
            [XlsxWorkbook::text('Total', 'total'), XlsxWorkbook::money(array_sum(array_column($chart, 'gross_sales')), true),
                XlsxWorkbook::money(array_sum(array_column($chart, 'commission')), true), XlsxWorkbook::money(array_sum(array_column($chart, 'net_earnings')), true)],
        ], 5);

        $methods = [['Cash on delivery', $payments['cod']], ['GCash to your shop', $payments['gcash']], ['E-wallet and card (via Loved-IT)', $payments['e_wallet_card']]];
        $volume = max(0.0001, (float) $payments['total_volume']);
        $x->sheet('Payment methods', [34, 12, 20, 12], [
            ...$heading('Payment methods'),
            [XlsxWorkbook::header('Paid by'), XlsxWorkbook::header('Orders'), XlsxWorkbook::header('Order totals'), XlsxWorkbook::header('Share')],
            ...array_map(fn ($m) => [$m[0], XlsxWorkbook::int($m[1]['count']), XlsxWorkbook::money($m[1]['volume']), XlsxWorkbook::percent($m[1]['volume'] / $volume)], $methods),
            [XlsxWorkbook::text('Total', 'total'), XlsxWorkbook::int($payments['total_orders'], true), XlsxWorkbook::money($payments['total_volume'], true), XlsxWorkbook::percent($payments['total_volume'] > 0 ? 1 : 0, true)],
            [],
            [XlsxWorkbook::text('Order totals include shipping and come off any vouchers, so they differ from gross sales.', 'muted')],
        ], 5);

        $x->sheet('Products', [46, 28, 12, 18, 18], [
            ...$heading('Products sold'),
            [XlsxWorkbook::header('Product'), XlsxWorkbook::header('Category'), XlsxWorkbook::header('Units'), XlsxWorkbook::header('Gross sales'), XlsxWorkbook::header('Net earnings')],
            ...array_map(fn ($p) => [$p['name'], $p['category'], XlsxWorkbook::int($p['units_sold']), XlsxWorkbook::money($p['gross_sales']), XlsxWorkbook::money($p['net_earnings'])], $products),
            [XlsxWorkbook::text('Total', 'total'), XlsxWorkbook::text('', 'total'), XlsxWorkbook::int(array_sum(array_column($products, 'units_sold')), true),
                XlsxWorkbook::money(array_sum(array_column($products, 'gross_sales')), true), XlsxWorkbook::money(array_sum(array_column($products, 'net_earnings')), true)],
        ], 5);

        $x->sheet('Orders', [26, 22, 22, 26, 9, 16, 16, 16, 16], [
            ...$heading('Orders'),
            [XlsxWorkbook::header('Order'), XlsxWorkbook::header('Placed'), XlsxWorkbook::header('Status'), XlsxWorkbook::header('Paid by'), XlsxWorkbook::header('Units'),
                XlsxWorkbook::header('Gross sales'), XlsxWorkbook::header('Shop discounts'), XlsxWorkbook::header('Commission'), XlsxWorkbook::header('Net earnings')],
            ...array_map(fn ($o) => [
                $o['order_number'], XlsxWorkbook::date($o['placed_at'], true), $o['status'], $o['payment'], XlsxWorkbook::int($o['units']),
                XlsxWorkbook::money($o['gross']), XlsxWorkbook::money($o['discounts']), XlsxWorkbook::money($o['commission']), XlsxWorkbook::money($o['net']),
            ], $orders),
            [XlsxWorkbook::text('Total', 'total'), XlsxWorkbook::text(count($orders) . ' orders', 'total'), XlsxWorkbook::text('', 'total'), XlsxWorkbook::text('', 'total'),
                XlsxWorkbook::int(array_sum(array_column($orders, 'units')), true), XlsxWorkbook::money(array_sum(array_column($orders, 'gross')), true),
                XlsxWorkbook::money(array_sum(array_column($orders, 'discounts')), true), XlsxWorkbook::money(array_sum(array_column($orders, 'commission')), true),
                XlsxWorkbook::money(array_sum(array_column($orders, 'net')), true)],
        ], 5);

        $slug = Str::slug($shop) ?: 'shop';
        $span = $start ? $start->copy()->setTimezone($tz)->toDateString() . '_to_' . $end->copy()->setTimezone($tz)->toDateString() : 'all-time';

        return response($x->bytes(), 200, [
            'Content-Type'        => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$slug}-sales-report-{$span}.xlsx\"",
            'Cache-Control'       => 'no-store',
        ]);
    }

    /** @return list<array<string, mixed>> one row per order of the shop in the window, newest first */
    private function ordersFor(int $sellerId, ?Carbon $startDate, ?Carbon $endDate): array
    {
        $methods = ['cod' => 'Cash on delivery', 'gcash' => 'GCash', 'e_wallet' => 'E-wallet', 'card' => 'Card'];

        return Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->whereNotIn('status', $this->excludedStatuses())
            ->when($startDate, fn ($q) => $q->whereBetween('created_at', [$startDate, $endDate]))
            ->with(['items' => fn ($q) => $q->where('seller_id', $sellerId)])
            ->latest('created_at')->limit(5000)->get()
            ->map(function (Order $o) use ($methods) {
                $status = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;

                return [
                    'order_number' => (string) $o->order_number,
                    'placed_at'    => $o->created_at,
                    'status'       => ucfirst(strtolower(str_replace('_', ' ', $status))),
                    'payment'      => $methods[$o->payment_method] ?? ucfirst((string) $o->payment_method),
                    'units'        => (int) $o->items->sum('quantity'),
                    'gross'        => round((float) $o->items->sum('subtotal'), 2),
                    'discounts'    => round((float) $o->items->sum(fn ($i) => (float) $i->store_voucher_share + (float) $i->promo_share), 2),
                    'commission'   => round((float) $o->items->sum('commission_amount'), 2),
                    'net'          => round((float) $o->items->sum('seller_earnings'), 2),
                ];
            })->values()->all();
    }

    /**
     * The report window (S13): range=today|7d|30d|90d|12m|all, or from/to as Manila dates (both days included). An
     * end before the start is refused.
     *
     * @return array{0: ?Carbon, 1: ?Carbon} UTC bounds, or nulls for all time
     */
    private function window(Request $request): array
    {
        $tz = 'Asia/Manila';
        if ($request->filled('from') || $request->filled('to')) {
            $request->validate([
                'from' => ['nullable', 'date_format:Y-m-d'],
                'to'   => ['nullable', 'date_format:Y-m-d'],
            ], [
                'from.date_format' => 'Enter the start date as YYYY-MM-DD.',
                'to.date_format'   => 'Enter the end date as YYYY-MM-DD.',
            ]);
            $from = $request->filled('from') ? Carbon::parse($request->input('from'), $tz)->startOfDay() : Carbon::create(2000, 1, 1, 0, 0, 0, $tz);
            $to = $request->filled('to') ? Carbon::parse($request->input('to'), $tz)->endOfDay() : Carbon::now($tz)->endOfDay();
            if ($to->lt($from)) {
                throw \Illuminate\Validation\ValidationException::withMessages(['to' => 'The end date cannot be before the start date.']);
            }

            return [$from->utc(), $to->utc()];
        }
        $range = (string) $request->query('range', '30d');
        if ($range === 'today') {
            return [Carbon::now($tz)->startOfDay()->utc(), Carbon::now($tz)->endOfDay()->utc()];
        }
        $start = $this->getStartDate($range);

        return [$start, $start ? Carbon::now($tz)->endOfDay()->utc() : null];
    }

    private function getStartDate(string $range): ?Carbon
    {
        return match ($range) {
            // "Last 7 days" is today and the 6 days before it, in Manila.
            '7d'  => now('Asia/Manila')->subDays(6)->startOfDay()->utc(),
            '30d' => now('Asia/Manila')->subDays(29)->startOfDay()->utc(),
            '90d' => now('Asia/Manila')->subDays(89)->startOfDay()->utc(),
            '12m' => now('Asia/Manila')->subYear()->startOfDay()->utc(),
            default => null,
        };
    }
}

