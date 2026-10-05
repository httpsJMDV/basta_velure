<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderPickupDecline;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RiderPickupController extends Controller
{
    /**
     * Maximum number of seller pickup groups returned per request.
     */
    protected const MAX_GROUPS_LIMIT = 50;

    /**
     * Retrieve the authenticated courier profile.
     */
    protected function getAuthenticatedRider(Request $request): Rider
    {
        $user = $request->user();

        /** @var Rider $rider */
        $rider = Rider::with('areaAssignments')->where('user_id', $user->id)->firstOrFail();

        return $rider;
    }

    /**
     * Extract and deduplicate active PSGC barangay codes for a rider.
     *
     * @return array{activeCodes: array<string>, barangayMap: array<string, string>, hasAreas: bool}
     */
    protected function getRiderActiveAreaCodes(Rider $rider): array
    {
        $activeAssignments = $rider->areaAssignments()
            ->where('is_active', true)
            ->get();

        $barangayMap = [];
        $activeCodes = [];

        foreach ($activeAssignments as $assignment) {
            foreach ($assignment->coverage_barangays ?? [] as $code) {
                $codeStr = trim((string) $code);
                if ($codeStr !== '') {
                    $activeCodes[] = $codeStr;
                    if (! isset($barangayMap[$codeStr])) {
                        $barangayMap[$codeStr] = $assignment->area_label;
                    }
                }
            }
        }

        $activeCodes = array_values(array_unique($activeCodes));

        return [
            'activeCodes' => $activeCodes,
            'barangayMap' => $barangayMap,
            'hasAreas'    => ! empty($activeCodes),
        ];
    }

    /**
     * GET /api/v1/rider/pickups?view=available|mine
     *
     * List pickup requests grouped by seller for either:
     * - available: unclaimed, undeclined READY_FOR_PICKUP parcels in rider's active areas
     * - mine: parcels claimed by this rider that are still READY_FOR_PICKUP
     */
    public function index(Request $request): JsonResponse
    {
        $rider = $this->getAuthenticatedRider($request);
        $view = $request->query('view', 'available');

        ['activeCodes' => $activeCodes, 'barangayMap' => $barangayMap, 'hasAreas' => $hasAreas] = $this->getRiderActiveAreaCodes($rider);

        // Calculate count of available seller groups
        $availableCount = $hasAreas
            ? (int) Parcel::availableForRider($rider, $activeCodes)
                ->distinct('seller_id')
                ->count('seller_id')
            : 0;

        // Calculate count of rider's claimed seller groups
        $mineCount = (int) Parcel::where('pickup_rider_id', $rider->id)
            ->where('status', Parcel::STATUS_READY_FOR_PICKUP)
            ->distinct('seller_id')
            ->count('seller_id');

        $meta = [
            'available_count' => $availableCount,
            'mine_count'      => $mineCount,
            'has_areas'       => $hasAreas,
            'limit'           => self::MAX_GROUPS_LIMIT,
        ];

        if ($view === 'mine') {
            $parcels = Parcel::where('pickup_rider_id', $rider->id)
                ->where('status', Parcel::STATUS_READY_FOR_PICKUP)
                ->orderBy('ready_at', 'asc')
                ->get();

            $groups = [];
            $grouped = $parcels->groupBy('seller_id');

            foreach ($grouped as $sellerId => $sellerParcels) {
                /** @var Parcel $first */
                $first = $sellerParcels->first();
                $snapshot = $first->pickup_address_snapshot ?? [];
                $code = (string) ($first->pickup_barangay_code ?? $snapshot['barangay_code'] ?? '');
                $earliestReady = $sellerParcels->min('ready_at');
                $acceptedAt = $sellerParcels->min('pickup_accepted_at') ?? $first->pickup_accepted_at;

                $groups[] = [
                    'seller_id'          => (int) $sellerId,
                    'shop_name'          => $snapshot['shop_name'] ?? ('Seller #' . $sellerId),
                    'shop_phone'         => $snapshot['contact_phone'] ?? '',
                    'pickup_address'     => [
                        'street'       => $snapshot['street'] ?? '',
                        'barangay'     => $snapshot['barangay'] ?? ($first->pickup_barangay ?? ''),
                        'city'         => $snapshot['city'] ?? '',
                        'province'     => $snapshot['province'] ?? '',
                        'full_address' => $snapshot['full_address'] ?? implode(', ', array_filter([
                            $snapshot['street'] ?? '',
                            $snapshot['barangay'] ?? ($first->pickup_barangay ?? ''),
                            $snapshot['city'] ?? '',
                            $snapshot['province'] ?? '',
                        ])),
                    ],
                    'parcel_count'       => $sellerParcels->count(),
                    'parcel_ids'         => $sellerParcels->pluck('id')->all(),
                    'tracking_numbers'   => $sellerParcels->pluck('tracking_number')->all(),
                    'ready_since'        => $earliestReady ? Carbon::parse($earliestReady)->toIso8601String() : null,
                    'pickup_accepted_at' => $acceptedAt ? Carbon::parse($acceptedAt)->toIso8601String() : null,
                    'matched_area_label' => $barangayMap[$code] ?? $snapshot['barangay'] ?? 'Assigned Area',
                ];
            }

            return response()->json([
                'data' => array_slice($groups, 0, self::MAX_GROUPS_LIMIT),
                'meta' => $meta,
            ]);
        }

        // Default view: available
        if (! $hasAreas) {
            return response()->json([
                'data' => [],
                'meta' => $meta,
            ]);
        }

        $parcels = Parcel::availableForRider($rider, $activeCodes)
            ->orderBy('ready_at', 'asc')
            ->get();

        $groups = [];
        $grouped = $parcels->groupBy('seller_id');

        foreach ($grouped as $sellerId => $sellerParcels) {
            /** @var Parcel $first */
            $first = $sellerParcels->first();
            $snapshot = $first->pickup_address_snapshot ?? [];
            $code = (string) ($first->pickup_barangay_code ?? $snapshot['barangay_code'] ?? '');
            $earliestReady = $sellerParcels->min('ready_at');

            $groups[] = [
                'seller_id'          => (int) $sellerId,
                'shop_name'          => $snapshot['shop_name'] ?? ('Seller #' . $sellerId),
                'shop_phone'         => $snapshot['contact_phone'] ?? '',
                'pickup_address'     => [
                    'street'       => $snapshot['street'] ?? '',
                    'barangay'     => $snapshot['barangay'] ?? ($first->pickup_barangay ?? ''),
                    'city'         => $snapshot['city'] ?? '',
                    'province'     => $snapshot['province'] ?? '',
                    'full_address' => $snapshot['full_address'] ?? implode(', ', array_filter([
                        $snapshot['street'] ?? '',
                        $snapshot['barangay'] ?? ($first->pickup_barangay ?? ''),
                        $snapshot['city'] ?? '',
                        $snapshot['province'] ?? '',
                    ])),
                ],
                'parcel_count'       => $sellerParcels->count(),
                'ready_since'        => $earliestReady ? Carbon::parse($earliestReady)->toIso8601String() : null,
                'matched_area_label' => $barangayMap[$code] ?? $snapshot['barangay'] ?? 'Assigned Area',
            ];
        }

        return response()->json([
            'data' => array_slice($groups, 0, self::MAX_GROUPS_LIMIT),
            'meta' => $meta,
        ]);
    }

    /**
     * POST /api/v1/rider/pickups/sellers/{seller}/accept
     *
     * Accept (claim) all available READY_FOR_PICKUP parcels for a given seller in the rider's areas.
     */
    public function accept(Request $request, int $sellerId): JsonResponse
    {
        $rider = $this->getAuthenticatedRider($request);

        ['activeCodes' => $activeCodes] = $this->getRiderActiveAreaCodes($rider);

        if (empty($activeCodes)) {
            return response()->json([
                'message' => 'Seller pickup location is outside your assigned active areas.',
            ], 404);
        }

        // Verify seller has parcels in rider's assigned areas at all
        $sellerInArea = Parcel::where('seller_id', $sellerId)
            ->whereIn('pickup_barangay_code', $activeCodes)
            ->exists();

        if (! $sellerInArea) {
            return response()->json([
                'message' => 'Seller pickup location is outside your assigned active areas.',
            ], 404);
        }

        return DB::transaction(function () use ($rider, $sellerId, $activeCodes) {
            $availableParcels = Parcel::where('seller_id', $sellerId)
                ->where('status', Parcel::STATUS_READY_FOR_PICKUP)
                ->whereIn('pickup_barangay_code', $activeCodes)
                ->whereNull('pickup_rider_id')
                ->whereDoesntHave('declines', function ($sub) use ($rider) {
                    $sub->where('rider_id', $rider->id);
                })
                ->lockForUpdate()
                ->get();

            if ($availableParcels->isEmpty()) {
                // Check if claimed by another courier
                $claimedByOther = Parcel::where('seller_id', $sellerId)
                    ->where('status', Parcel::STATUS_READY_FOR_PICKUP)
                    ->whereIn('pickup_barangay_code', $activeCodes)
                    ->whereNotNull('pickup_rider_id')
                    ->where('pickup_rider_id', '!=', $rider->id)
                    ->exists();

                if ($claimedByOther) {
                    return response()->json([
                        'message' => 'This pickup request has already been accepted by another courier.',
                    ], 409);
                }

                return response()->json([
                    'message' => 'No available parcels found to accept for this seller.',
                ], 409);
            }

            $now = now();
            $parcelIds = $availableParcels->pluck('id')->all();
            $trackingNumbers = $availableParcels->pluck('tracking_number')->all();

            Parcel::whereIn('id', $parcelIds)->update([
                'pickup_rider_id'    => $rider->id,
                'sorting_center_id'  => $rider->sorting_center_id,
                'pickup_accepted_at' => $now,
            ]);

            return response()->json([
                'message'          => 'Pickup accepted successfully.',
                'claimed_count'    => count($parcelIds),
                'tracking_numbers' => $trackingNumbers,
            ]);
        });
    }

    /**
     * POST /api/v1/rider/pickups/sellers/{seller}/decline
     *
     * Hide currently visible parcels for this seller for this rider only.
     */
    public function decline(Request $request, int $sellerId): JsonResponse
    {
        $rider = $this->getAuthenticatedRider($request);

        ['activeCodes' => $activeCodes] = $this->getRiderActiveAreaCodes($rider);

        if (empty($activeCodes)) {
            return response()->json([
                'message' => 'No visible pickup request found for this seller in your assigned areas.',
            ], 404);
        }

        $visibleParcels = Parcel::availableForRider($rider, $activeCodes)
            ->where('seller_id', $sellerId)
            ->get();

        if ($visibleParcels->isEmpty()) {
            return response()->json([
                'message' => 'No visible pickup request found for this seller in your assigned areas.',
            ], 404);
        }

        $now = now();
        foreach ($visibleParcels as $parcel) {
            RiderPickupDecline::firstOrCreate([
                'rider_id'  => $rider->id,
                'parcel_id' => $parcel->id,
            ], [
                'created_at' => $now,
            ]);
        }

        return response()->json([
            'message'        => 'Pickup request declined for your account.',
            'declined_count' => $visibleParcels->count(),
        ]);
    }

    /**
     * POST /api/v1/rider/pickups/sellers/{seller}/release
     *
     * Release accepted parcels for this seller back to the available pool.
     */
    public function release(Request $request, int $sellerId): JsonResponse
    {
        $rider = $this->getAuthenticatedRider($request);

        return DB::transaction(function () use ($rider, $sellerId) {
            $acceptedParcels = Parcel::where('seller_id', $sellerId)
                ->where('pickup_rider_id', $rider->id)
                ->where('status', Parcel::STATUS_READY_FOR_PICKUP)
                ->lockForUpdate()
                ->get();

            if ($acceptedParcels->isEmpty()) {
                return response()->json([
                    'message' => 'No accepted pickups found to release for this seller.',
                ], 409);
            }

            $count = $acceptedParcels->count();

            Parcel::whereIn('id', $acceptedParcels->pluck('id'))->update([
                'pickup_rider_id'    => null,
                'sorting_center_id'  => null,
                'pickup_accepted_at' => null,
            ]);

            return response()->json([
                'message'        => 'Pickup request released back to available pool.',
                'released_count' => $count,
            ]);
        });
    }
}

