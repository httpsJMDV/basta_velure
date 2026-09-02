<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SellerReportController extends Controller
{
    /**
     * GET /api/v1/seller/reports/summary
     */
    public function summary(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $orders = Order::where('seller_id', $sellerId)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->when($startDate, fn ($q) => $q->where('created_at', '>=', $startDate))
            ->get();

        $items = OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) =>
                $q->whereNotIn('status', ['cancelled', 'returned'])
                  ->when($startDate, fn ($q2) => $q2->where('created_at', '>=', $startDate))
            )
            ->get();

        $grossSales = (float) $orders->sum('total');
        $commissionPaid = (float) $items->sum('commission_amount');
        $netEarnings = (float) $items->sum('seller_earnings');
        $totalOrders = $orders->count();
        $deliveredOrders = $orders->where('status', 'delivered')->count();
        $unitsSold = (int) $items->sum('quantity');

        return response()->json([
            'data' => [
                'gross_sales'      => $grossSales,
                'net_earnings'     => $netEarnings,
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

                $gross = (float) Order::where('seller_id', $sellerId)
                    ->whereYear('created_at', $year)
                    ->whereMonth('created_at', $month)
                    ->whereNotIn('status', ['cancelled', 'returned'])
                    ->sum('total');

                $net = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereYear('created_at', $year)
                          ->whereMonth('created_at', $month)
                          ->whereNotIn('status', ['cancelled', 'returned'])
                    )->sum('seller_earnings');

                $commission = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereYear('created_at', $year)
                          ->whereMonth('created_at', $month)
                          ->whereNotIn('status', ['cancelled', 'returned'])
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

                $gross = (float) Order::where('seller_id', $sellerId)
                    ->whereDate('created_at', $dateStr)
                    ->whereNotIn('status', ['cancelled', 'returned'])
                    ->sum('total');

                $net = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereDate('created_at', $dateStr)->whereNotIn('status', ['cancelled', 'returned'])
                    )->sum('seller_earnings');

                $commission = (float) OrderItem::where('seller_id', $sellerId)
                    ->whereHas('order', fn ($q) =>
                        $q->whereDate('created_at', $dateStr)->whereNotIn('status', ['cancelled', 'returned'])
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
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $orders = Order::where('seller_id', $sellerId)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->when($startDate, fn ($q) => $q->where('created_at', '>=', $startDate))
            ->get();

        $gcash = $orders->where('payment_method', 'gcash');
        $cod   = $orders->where('payment_method', 'cod');

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
        $range = $request->query('range', '30d');
        $startDate = $this->getStartDate($range);

        $items = OrderItem::with('product')
            ->where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) =>
                $q->whereNotIn('status', ['cancelled', 'returned'])
                  ->when($startDate, fn ($q2) => $q2->where('created_at', '>=', $startDate))
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

