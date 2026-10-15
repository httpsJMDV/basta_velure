<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdminReportRequest;
use App\Services\AdminAnalyticsService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

/**
 * The admin Analytics & Reports endpoints. Every figure comes from AdminAnalyticsService, the same service the admin
 * dashboard uses, so the two pages agree for the same range. See docs/api/admin-reports.md for the definitions.
 *
 * All endpoints take either `from` and `to` (inclusive Asia/Manila days, YYYY-MM-DD) or a `range` preset
 * (7d, 30d, 90d, 12m, all; default 30d).
 */
class AdminReportController extends Controller
{
    public function __construct(private AdminAnalyticsService $analytics)
    {
    }

    /**
     * GET /api/v1/admin/reports/summary
     */
    public function summary(AdminReportRequest $request): JsonResponse
    {
        $range = $request->analyticsRange();
        $overview = $this->analytics->overview($range);
        $s = $overview['summary'];

        return response()->json([
            'data' => [
                // The original keys.
                'total_gmv'             => $s['gmv'],
                'total_commission'      => $s['commission'],
                'total_seller_earnings' => $s['seller_earnings'],
                'total_orders'          => $s['orders'],
                'total_units_sold'      => $s['units_sold'],
                'avg_commission_rate'   => $s['avg_commission_rate'],
                // Added so the dashboard and this page can show the same figures.
                'range'                 => $overview['range'],
                'orders_placed'         => $s['orders_placed'],
                'cancelled_orders'      => $s['cancelled_orders'],
                'returned_orders'       => $s['returned_orders'],
                'active_buyers'         => $s['active_buyers'],
                'active_sellers'        => $s['active_sellers'],
                'previous'              => $overview['previous'],
                'pipeline'              => $overview['pipeline'],
                'disputes'              => $overview['disputes'],
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/reports/revenue-chart?interval=daily|monthly
     */
    public function revenueChart(AdminReportRequest $request): JsonResponse
    {
        $range = $request->analyticsRange();
        $interval = $request->chartInterval($range);

        $points = collect($interval === 'monthly' ? $this->analytics->monthly($range) : $this->analytics->daily($range))
            ->map(fn (array $p) => [
                'date'          => $interval === 'monthly'
                    ? CarbonImmutable::createFromFormat('Y-m-d', $p['date'])->format('M Y')
                    : CarbonImmutable::createFromFormat('Y-m-d', $p['date'])->format('M d'),
                'iso_date'      => $p['date'],
                'gmv'           => $p['gmv'],
                'commission'    => $p['commission'],
                'orders_count'  => $p['orders'],
                'orders_placed' => $p['orders_placed'],
            ])
            ->values();

        return response()->json([
            'data' => $points,
            'meta' => ['range' => $this->analytics->describe($range), 'interval' => $interval],
        ]);
    }

    /**
     * GET /api/v1/admin/reports/category-breakdown
     */
    public function categoryBreakdown(AdminReportRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->analytics->categories($request->analyticsRange())]);
    }

    /**
     * GET /api/v1/admin/reports/top-sellers
     */
    public function topSellers(AdminReportRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->analytics->topSellers($request->analyticsRange())]);
    }

    /**
     * GET /api/v1/admin/reports/payment-method-split
     */
    public function paymentMethodSplit(AdminReportRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->analytics->paymentSplit($request->analyticsRange())]);
    }
}
