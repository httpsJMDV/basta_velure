<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SortingCenterDashboardController extends Controller
{
    /**
     * The hub's own details for its Settings page, and the courier company it belongs to. Read-only: the hub's name,
     * address and coverage are approved by the courier, so changes go through the courier (its contact is included).
     *
     * GET /api/v1/hub/profile
     */
    public function profile(Request $request): JsonResponse
    {
        /** @var SortingCenter|null $hub */
        $hub = $request->user()->sortingCenter;
        abort_if(! $hub || $hub->status !== SortingCenter::STATUS_APPROVED, 403, 'Sorting center account not approved.');

        $company = LogisticsCompany::find(LogisticsCompany::effectiveId($hub->logistics_company_id));

        return response()->json(['data' => [
            'id'                       => $hub->id,
            'hub_name'                 => $hub->hub_name,
            'status'                   => $hub->status,
            'address_street'           => $hub->address_street,
            'address_barangay'         => $hub->address_barangay,
            'address_city'             => $hub->address_city,
            'address_province'         => $hub->address_province,
            'coverage_barangays_count' => is_array($hub->coverage_barangays) ? count($hub->coverage_barangays) : 0,
            'has_permit'               => (bool) $hub->dti_permit_path,
            'applied_at'               => $hub->created_at?->toIso8601String(),
            'approved_at'              => $hub->reviewed_at?->toIso8601String(),
            'courier'                  => $company ? [
                'name'          => $company->name,
                'code'          => $company->code,
                'contact_email' => $company->contact_email,
                'contact_phone' => $company->contact_phone,
            ] : null,
        ]]);
    }

    /**
     * Return live metrics for the authenticated user's approved sorting center hub.
     *
     * GET /api/v1/hub/dashboard/metrics
     */
    public function metrics(Request $request): JsonResponse
    {
        $user = $request->user();

        /** @var SortingCenter|null $sortingCenter */
        $sortingCenter = $user->sortingCenter;

        if (! $sortingCenter || $sortingCenter->status !== SortingCenter::STATUS_APPROVED) {
            abort(403, 'Sorting center account not approved.');
        }

        // Count parcels scanned in today (Philippine calendar day, Asia/Manila)
        $inboundToday = $sortingCenter->parcels()
            ->scannedInToday()
            ->count();

        // Count parcels currently in AT_SORTING_CENTER status awaiting sorting
        $inSorting = $sortingCenter->parcels()
            ->where('status', Parcel::STATUS_AT_SORTING_CENTER)
            ->count();

        // Count active riders assigned to this sorting center with active area assignments
        $activeRiders = Rider::where('status', Rider::STATUS_ACTIVE)
            ->whereHas('areaAssignments', function ($query) use ($sortingCenter) {
                $query->where('sorting_center_id', $sortingCenter->id)
                    ->where('is_active', true);
            })
            ->count();

        // Feature 1.9: live delivery counts (added alongside the existing keys; none of them changed)
        $outForDelivery = $sortingCenter->parcels()
            ->where('status', Parcel::STATUS_OUT_FOR_DELIVERY)
            ->count();
        $failedDeliveries = $sortingCenter->parcels()
            ->where('status', Parcel::STATUS_DELIVERY_FAILED)
            ->count();

        return response()->json([
            'data' => [
                'inbound_today' => $inboundToday,
                'in_sorting'    => $inSorting,
                'active_riders' => $activeRiders,
                'out_for_delivery'  => $outForDelivery,
                'failed_deliveries' => $failedDeliveries,
                'hub'           => [
                    'id'                       => $sortingCenter->id,
                    'hub_name'                 => $sortingCenter->hub_name,
                    'status'                   => $sortingCenter->status,
                    'address_province'         => $sortingCenter->address_province,
                    'address_city'             => $sortingCenter->address_city,
                    'address_barangay'         => $sortingCenter->address_barangay,
                    'address_street'           => $sortingCenter->address_street,
                    'coverage_barangays_count' => is_array($sortingCenter->coverage_barangays)
                        ? count($sortingCenter->coverage_barangays)
                        : 0,
                ],
            ],
        ]);
    }
}
