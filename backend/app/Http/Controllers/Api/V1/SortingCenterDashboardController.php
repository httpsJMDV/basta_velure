<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\SortingCenter;
use Carbon\Carbon;
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

        // Philippine calendar day (Asia/Manila UTC+8) converted to UTC boundaries
        $startOfDayUtc = Carbon::now('Asia/Manila')->startOfDay()->utc();
        $endOfDayUtc   = Carbon::now('Asia/Manila')->endOfDay()->utc();

        // Count parcels scanned in today (Asia/Manila)
        $inboundToday = $sortingCenter->parcels()
            ->whereBetween('scanned_in_at', [$startOfDayUtc, $endOfDayUtc])
            ->count();

        // Count parcels currently in AT_SORTING_CENTER status awaiting sorting
        $inSorting = $sortingCenter->parcels()
            ->where('status', Parcel::STATUS_AT_SORTING_CENTER)
            ->count();

        // TODO(2.1): Return active riders once rider table and area assignments exist in Feature 2.1.
        $activeRiders = 0;

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
