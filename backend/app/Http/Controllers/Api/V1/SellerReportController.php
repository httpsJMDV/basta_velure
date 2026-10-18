<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $sellerId = $request->user()->id;
        [$startDate, $endDate] = $this->window($request);

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

        return response()->json([
            'data' => [
                'gross_sales'      => $grossSales,
                'seller_discounts' => $sellerDiscounts,
                'net_earnings'     => $netEarnings,
                'from'             => $startDate?->setTimezone('Asia/Manila')->toDateString(),
                'to'               => $endDate?->setTimezone('Asia/Manila')->toDateString(),
                'commission_paid'  => $commissionPaid,
                'total_orders'     => $totalOrders,
                'delivered_orders' => $deliveredOrders,
                'units_sold'       => $unitsSold,
            ],
        ]);
    }

    /**
     * GET /api/v1/seller/reports/revenue-chart
     */
    public function revenueChart(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $range = $request->query('range', '30d');
        $interval = $request->query('interval', 'daily');

        $now = now();
        $days = match ($range) {
            '7d'  => 7,
            '90d' => 90,
            '12m' => 365,
            default => 30,
        };

        if ($range === '12m' || $interval === 'monthly') {
            $points = collect(range(11, 0))->map(function ($monthsAgo) use ($now, $sellerId) {
                $monthDate = $now->copy()->subMonths($monthsAgo);
                $year = $monthDate->year;
                $month = $monthDate->month;
                $label = $monthDate->format('M Y');

                $gross = (float) Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
                    ->whereYear('created_at', $year)
                    ->whereMonth('created_at', $month)
                    ->whereNotIn('status', $this->excludedStatuses())
                    ->sum('total');

                $net = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereYear('created_at', $year)
                          ->whereMonth('created_at', $month)
                          ->whereNotIn('status', $this->excludedStatuses())
                    )->sum('seller_earnings');

                $commission = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereYear('created_at', $year)
                          ->whereMonth('created_at', $month)
                          ->whereNotIn('status', $this->excludedStatuses())
                    )->sum('commission_amount');

                return [
                    'date'        => $label,
                    'gross_sales' => $gross,
                    'net_earnings'=> $net,
                    'commission'  => $commission,
                ];
            });
        } else {
            $points = collect(range($days - 1, 0))->map(function ($daysAgo) use ($now, $sellerId) {
                $dateObj = $now->copy()->subDays($daysAgo);
                $dateStr = $dateObj->toDateString();
                $label = $dateObj->format('M d');

                $gross = (float) Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
                    ->whereDate('created_at', $dateStr)
                    ->whereNotIn('status', $this->excludedStatuses())
                    ->sum('total');

                $net = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereDate('created_at', $dateStr)->whereNotIn('status', $this->excludedStatuses())
                    )->sum('seller_earnings');

                $commission = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereDate('created_at', $dateStr)->whereNotIn('status', $this->excludedStatuses())
                    )->sum('commission_amount');

                return [
                    'date'        => $label,
                    'iso_date'    => $dateStr,
                    'gross_sales' => $gross,
                    'net_earnings'=> $net,
                    'commission'  => $commission,
                ];
            });
        }

        return response()->json(['data' => $points]);
    }

    /**
     * GET /api/v1/seller/reports/payment-methods
     */
    public function paymentMethods(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        [$startDate, $endDate] = $this->window($request);

        $orders = Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->whereNotIn('status', $this->excludedStatuses())
            ->when($startDate, fn ($q) => $q->whereBetween('created_at', [$startDate, $endDate]))
            ->get();

        $gcash = $orders->where('payment_method', 'gcash');
        $cod   = $orders->where('payment_method', 'cod');
        $wallet = $orders->whereIn('payment_method', ['e_wallet', 'card']);

        return response()->json([
            'data' => [
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
            ],
        ]);
    }

    /**
     * GET /api/v1/seller/reports/top-products
     */
    public function topProducts(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        [$startDate, $endDate] = $this->window($request);

        $items = OrderItem::with('product')
            ->where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) =>
                $q->whereNotIn('status', $this->excludedStatuses())
                  ->when($startDate, fn ($q2) => $q2->whereBetween('created_at', [$startDate, $endDate]))
            )
            ->get();

        $productMap = [];

        foreach ($items as $item) {
            $pId = $item->product_id;
            $name = $item->product?->name ?? 'Product';
            $category = $item->category_id ?: ($item->product?->category_id ?? 'General');

            if (!isset($productMap[$pId])) {
                $productMap[$pId] = [
                    'product_id'   => $pId,
                    'name'         => $name,
                    'category'     => ucwords(str_replace(['-', '_'], ' ', $category)),
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

        return response()->json(['data' => array_slice($top, 0, 10)]);
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

