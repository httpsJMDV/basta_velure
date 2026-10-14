<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SortingCenterDashboardController extends Controller
{
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

        return response()->json([
            'data' => [
                'inbound_today' => $inboundToday,
                'in_sorting'    => $inSorting,
                'active_riders' => $activeRiders,
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
