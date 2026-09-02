<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PlatformSetting;
use App\Models\SellerProfile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminReportController extends Controller
{
    /**
     * GET /api/v1/admin/reports/summary
     */
    public function summary(Request $request): JsonResponse
    {
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $ordersQuery = Order::whereNotIn('status', ['cancelled', 'returned'])
            ->when($startDate, fn ($q) => $q->where('created_at', '>=', $startDate));

        $totalGmv = (float) $ordersQuery->sum('total');
        $totalOrders = (int) $ordersQuery->count();

        $itemsQuery = OrderItem::whereHas('order', fn ($q) =>
            $q->whereNotIn('status', ['cancelled', 'returned'])
              ->when($startDate, fn ($q2) => $q2->where('created_at', '>=', $startDate))
        );

        $totalCommission = (float) $itemsQuery->sum('commission_amount');
        $totalSellerEarnings = (float) $itemsQuery->sum('seller_earnings');
        $totalUnitsSold = (int) $itemsQuery->sum('quantity');

        $avgCommissionRate = $totalGmv > 0 ? ($totalCommission / $totalGmv) * 100 : 10.0;

        return response()->json([
            'data' => [
                'total_gmv'             => $totalGmv,
                'total_commission'      => $totalCommission,
                'total_seller_earnings' => $totalSellerEarnings,
                'total_orders'          => $totalOrders,
                'total_units_sold'      => $totalUnitsSold,
                'avg_commission_rate'   => round($avgCommissionRate, 2),
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/reports/revenue-chart
     */
    public function revenueChart(Request $request): JsonResponse
    {
        $range = $request->query('range', '30d'); // 7d, 30d, 90d, 12m
        $interval = $request->query('interval', 'daily'); // daily, weekly, monthly

        $now = now();
        $days = match ($range) {
            '7d'  => 7,
            '90d' => 90,
            '12m' => 365,
            default => 30,
        };

        if ($range === '12m' || $interval === 'monthly') {
            // Group by month
            $points = collect(range(11, 0))->map(function ($monthsAgo) use ($now) {
                $monthDate = $now->copy()->subMonths($monthsAgo);
                $year = $monthDate->year;
                $month = $monthDate->month;
                $label = $monthDate->format('M Y');

                $gmv = (float) Order::whereYear('created_at', $year)
                    ->whereMonth('created_at', $month)
                    ->whereNotIn('status', ['cancelled', 'returned'])
                    ->sum('total');

                $commission = (float) OrderItem::whereHas('order', fn ($q) =>
                    $q->whereYear('created_at', $year)
                      ->whereMonth('created_at', $month)
                      ->whereNotIn('status', ['cancelled', 'returned'])
                )->sum('commission_amount');

                $ordersCount = Order::whereYear('created_at', $year)
                    ->whereMonth('created_at', $month)
                    ->whereNotIn('status', ['cancelled'])
                    ->count();

                return [
                    'date'        => $label,
                    'gmv'         => $gmv,
                    'commission'  => $commission,
                    'orders_count'=> $ordersCount,
                ];
            });
        } else {
            // Group by day
            $points = collect(range($days - 1, 0))->map(function ($daysAgo) use ($now) {
                $dateObj = $now->copy()->subDays($daysAgo);
                $dateStr = $dateObj->toDateString();
                $label = $dateObj->format('M d');

                $gmv = (float) Order::whereDate('created_at', $dateStr)
                    ->whereNotIn('status', ['cancelled', 'returned'])
                    ->sum('total');

                $commission = (float) OrderItem::whereHas('order', fn ($q) =>
                    $q->whereDate('created_at', $dateStr)->whereNotIn('status', ['cancelled', 'returned'])
                )->sum('commission_amount');

                $ordersCount = Order::whereDate('created_at', $dateStr)
                    ->whereNotIn('status', ['cancelled'])
                    ->count();

                return [
                    'date'        => $label,
                    'iso_date'    => $dateStr,
                    'gmv'         => $gmv,
                    'commission'  => $commission,
                    'orders_count'=> $ordersCount,
                ];
            });
        }

        return response()->json(['data' => $points]);
    }

    /**
     * GET /api/v1/admin/reports/category-breakdown
     */
    public function categoryBreakdown(Request $request): JsonResponse
    {
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $items = OrderItem::with('product')
            ->whereHas('order', fn ($q) =>
                $q->whereNotIn('status', ['cancelled', 'returned'])
                  ->when($startDate, fn ($q2) => $q2->where('created_at', '>=', $startDate))
            )
            ->get();

        $categoryMap = [];

        foreach ($items as $item) {
            $cat = $item->category_id ?: ($item->product?->category_id ?? 'General Merchandise');
            $catLabel = ucwords(str_replace(['-', '_'], ' ', $cat));
            if (stripos($cat, 'food') !== false || stripos($cat, 'grocery') !== false) {
                $catLabel = 'Food & Grocery';
            }

            if (!isset($categoryMap[$catLabel])) {
                $rate = PlatformSetting::getCommissionRateForCategory($cat);
                $categoryMap[$catLabel] = [
                    'category'          => $catLabel,
                    'gross_sales'       => 0.0,
                    'units_sold'        => 0,
                    'orders_count'      => 0,
                    'commission_rate'   => (float) ($rate * 100),
                    'commission_earned' => 0.0,
                ];
            }

            $categoryMap[$catLabel]['gross_sales']       += (float) $item->subtotal;
            $categoryMap[$catLabel]['units_sold']        += (int) $item->quantity;
            $categoryMap[$catLabel]['orders_count']      += 1;
            $categoryMap[$catLabel]['commission_earned'] += (float) ($item->commission_amount ?? ($item->subtotal * ($categoryMap[$catLabel]['commission_rate'] / 100)));
        }

        // Sort by gross sales descending
        $breakdown = array_values($categoryMap);
        usort($breakdown, fn ($a, $b) => $b['gross_sales'] <=> $a['gross_sales']);

        return response()->json(['data' => $breakdown]);
    }

    /**
     * GET /api/v1/admin/reports/top-sellers
     */
    public function topSellers(Request $request): JsonResponse
    {
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $sellers = User::where('role', 'seller')
            ->with(['sellerProfile', 'sellerOrders' => function ($q) use ($startDate) {
                $q->whereNotIn('status', ['cancelled', 'returned'])
                  ->when($startDate, fn ($q2) => $q2->where('created_at', '>=', $startDate))
                  ->with('items');
            }])
            ->get()
            ->map(function ($seller) {
                $orders = $seller->sellerOrders;
                $grossSales = (float) $orders->sum('total');
                $ordersCount = (int) $orders->count();
                $unitsSold = (int) $orders->flatMap->items->sum('quantity');
                $commissionGenerated = (float) $orders->flatMap->items->sum('commission_amount');
                $netPayoutCredited = (float) $orders->flatMap->items->sum('seller_earnings');

                return [
                    'seller_id'            => $seller->id,
                    'seller_name'          => trim($seller->first_name . ' ' . $seller->last_name),
                    'shop_name'            => $seller->sellerProfile?->shop_name ?? ($seller->first_name . "'s Shop"),
                    'email'                => $seller->email,
                    'gross_sales'          => $grossSales,
                    'orders_count'         => $ordersCount,
                    'units_sold'           => $unitsSold,
                    'commission_generated' => $commissionGenerated,
                    'net_payout_credited'  => $netPayoutCredited,
                    'avg_order_value'      => $ordersCount > 0 ? round($grossSales / $ordersCount, 2) : 0.0,
                ];
            })
            ->filter(fn ($s) => $s['gross_sales'] > 0 || $s['orders_count'] > 0)
            ->sortByDesc('gross_sales')
            ->values()
            ->take(15);

        return response()->json(['data' => $sellers]);
    }

    /**
     * GET /api/v1/admin/reports/payment-method-split
     */
    public function paymentMethodSplit(Request $request): JsonResponse
    {
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $orders = Order::whereNotIn('status', ['cancelled', 'returned'])
            ->when($startDate, fn ($q) => $q->where('created_at', '>=', $startDate))
            ->get();

        $gcashOrders = $orders->where('payment_method', 'gcash');
        $codOrders   = $orders->where('payment_method', 'cod');

        return response()->json([
            'data' => [
                'gcash' => [
                    'count'  => $gcashOrders->count(),
                    'volume' => (float) $gcashOrders->sum('total'),
                ],
                'cod' => [
                    'count'  => $codOrders->count(),
                    'volume' => (float) $codOrders->sum('total'),
                ],
                'total_orders' => $orders->count(),
                'total_volume' => (float) $orders->sum('total'),
            ],
        ]);
    }

    private function getStartDate(string $range): ?Carbon
    {
        return match ($range) {
            '7d'  => now()->subDays(7)->startOfDay(),
            '30d' => now()->subDays(30)->startOfDay(),
            '90d' => now()->subDays(90)->startOfDay(),
            '12m' => now()->subYear()->startOfDay(),
            default => null,
        };
    }
}

