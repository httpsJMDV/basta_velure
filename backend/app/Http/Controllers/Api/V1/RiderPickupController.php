<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\DeliveryLog;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderPickupDecline;
use App\Services\OrderStateMachine;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RiderPickupController extends Controller
{
    /**
     * Maximum number of seller pickup groups returned per request.
     */
    protected const MAX_GROUPS_LIMIT = 50;

    /**
     * Maximum number of tracking numbers accepted in one handover confirmation.
     */
    protected const MAX_CONFIRM_BATCH = 50;

    public function __construct(protected OrderStateMachine $stateMachine)
    {
    }

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
     * GET /api/v1/rider/pickups?view=available|mine|picked_up
     *
     * List pickup requests grouped by seller for either:
     * - available: unclaimed, undeclined READY_FOR_PICKUP parcels in rider's active areas
     * - mine: parcels claimed by this rider that are still READY_FOR_PICKUP
     * - picked_up: parcels this rider collected (PICKED_UP) that still need hub drop-off
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

        // Calculate count of rider's picked-up seller groups still awaiting hub drop-off
        $pickedUpCount = (int) Parcel::where('pickup_rider_id', $rider->id)
            ->where('status', Parcel::STATUS_PICKED_UP)
            ->distinct('seller_id')
            ->count('seller_id');

        $meta = [
            'available_count' => $availableCount,
            'mine_count'      => $mineCount,
            'picked_up_count' => $pickedUpCount,
            'has_areas'       => $hasAreas,
            'limit'           => self::MAX_GROUPS_LIMIT,
        ];

        if ($view === 'picked_up') {
            return response()->json([
                'data' => $this->pickedUpGroups($rider),
                'meta' => $meta,
            ]);
        }

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

    /**
     * POST /api/v1/rider/pickups/verify
     *
     * Read-only check that a tracking number is one of this rider's accepted,
     * still-uncollected parcels. Never exposes recipient details or COD amounts.
     */
    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'tracking_number' => ['required', 'string', 'max:50'],
        ]);

        $rider = $this->getAuthenticatedRider($request);
        $trackingNumber = $this->normalizeTrackingNumber($request->input('tracking_number'));

        $parcel = Parcel::with('order:id,order_number')
            ->where('tracking_number', $trackingNumber)
            ->where('pickup_rider_id', $rider->id)
            ->first();

        if (! $parcel) {
            return response()->json([
                'message' => 'Parcel not found among your accepted pickups.',
            ], 404);
        }

        if ($parcel->status !== Parcel::STATUS_READY_FOR_PICKUP) {
            return response()->json([
                'message' => 'This parcel has already been picked up.',
            ], 409);
        }

        $snapshot = $parcel->pickup_address_snapshot ?? [];

        return response()->json([
            'data' => [
                'tracking_number' => $parcel->tracking_number,
                'seller_id'       => (int) $parcel->seller_id,
                'shop_name'       => $snapshot['shop_name'] ?? ('Seller #' . $parcel->seller_id),
                'order_number'    => $parcel->order?->order_number,
            ],
        ]);
    }

    /**
     * POST /api/v1/rider/pickups/confirm
     *
     * Confirm physical handover of one or more accepted parcels. All-or-nothing:
     * if any tracking number is invalid, nothing is changed.
     */
    public function confirm(Request $request): JsonResponse
    {
        $input = $request->input('tracking_numbers');
        if (is_array($input)) {
            $request->merge([
                'tracking_numbers' => array_map(
                    fn ($tn) => is_string($tn) ? $this->normalizeTrackingNumber($tn) : $tn,
                    $input
                ),
            ]);
        }

        $validated = $request->validate([
            'tracking_numbers'   => ['required', 'array', 'min:1', 'max:' . self::MAX_CONFIRM_BATCH],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
        ]);

        $rider = $this->getAuthenticatedRider($request);
        $trackingNumbers = array_values($validated['tracking_numbers']);

        return DB::transaction(function () use ($request, $rider, $trackingNumbers) {
            $parcels = Parcel::where('pickup_rider_id', $rider->id)
                ->whereIn('tracking_number', $trackingNumbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');

            $errors = [];
            foreach ($trackingNumbers as $index => $trackingNumber) {
                $parcel = $parcels->get($trackingNumber);
                $key = "tracking_numbers.{$index}";

                if (! $parcel) {
                    $errors[$key] = ['Parcel not found among your accepted pickups.'];
                } elseif ($parcel->status !== Parcel::STATUS_READY_FOR_PICKUP) {
                    $errors[$key] = ['This parcel has already been picked up.'];
                } elseif (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::PICKED_UP, 'rider')) {
                    $errors[$key] = ['This parcel cannot be picked up right now.'];
                }
            }

            if (! empty($errors)) {
                return response()->json([
                    'message' => 'One or more parcels cannot be confirmed. Nothing was changed.',
                    'errors'  => $errors,
                ], 422);
            }

            $now = now();
            foreach ($parcels as $parcel) {
                // The state machine also syncs parcels.status and writes the history row.
                $this->stateMachine->transition(
                    $parcel->order,
                    OrderStatus::PICKED_UP,
                    'rider',
                    $request->user()->id,
                    'Picked up from the seller by the courier.',
                    ['rider_id' => $rider->id, 'tracking_number' => $parcel->tracking_number]
                );

                Parcel::where('id', $parcel->id)->update(['picked_up_at' => $now]);

                DeliveryLog::create([
                    'parcel_id' => $parcel->id,
                    'rider_id'  => $rider->id,
                    'outcome'   => DeliveryLog::OUTCOME_PICKED_UP,
                    'logged_at' => $now,
                ]);
            }

            return response()->json([
                'message'          => 'Handover confirmed.',
                'picked_up_count'  => $parcels->count(),
                'tracking_numbers' => $parcels->pluck('tracking_number')->values()->all(),
                'hub'              => $this->hubPayload($rider),
            ]);
        });
    }

    /**
     * Trim and uppercase a scanned or typed tracking number.
     */
    protected function normalizeTrackingNumber(string $value): string
    {
        return Str::upper(trim($value));
    }

    /**
     * Drop-off details of the rider's own sorting center hub.
     *
     * @return array<string, string>|null
     */
    protected function hubPayload(Rider $rider): ?array
    {
        $hub = $rider->sortingCenter;
        if (! $hub) {
            return null;
        }

        return [
            'hub_name'     => (string) $hub->hub_name,
            'street'       => (string) ($hub->address_street ?? ''),
            'barangay'     => (string) ($hub->address_barangay ?? ''),
            'city'         => (string) ($hub->address_city ?? ''),
            'province'     => (string) ($hub->address_province ?? ''),
            'full_address' => implode(', ', array_filter([
                $hub->address_street,
                $hub->address_barangay,
                $hub->address_city,
                $hub->address_province,
            ])),
        ];
    }

    /**
     * Seller groups of this rider's PICKED_UP parcels, with the hub drop-off details.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function pickedUpGroups(Rider $rider): array
    {
        $parcels = Parcel::where('pickup_rider_id', $rider->id)
            ->where('status', Parcel::STATUS_PICKED_UP)
            ->orderBy('picked_up_at', 'asc')
            ->get();

        $hub = $this->hubPayload($rider);
        $groups = [];

        foreach ($parcels->groupBy('seller_id') as $sellerId => $sellerParcels) {
            /** @var Parcel $first */
            $first = $sellerParcels->first();
            $snapshot = $first->pickup_address_snapshot ?? [];
            $pickedUpAt = $sellerParcels->max('picked_up_at');

            $groups[] = [
                'seller_id'        => (int) $sellerId,
                'shop_name'        => $snapshot['shop_name'] ?? ('Seller #' . $sellerId),
                'parcel_count'     => $sellerParcels->count(),
                'tracking_numbers' => $sellerParcels->pluck('tracking_number')->all(),
                'picked_up_at'     => $pickedUpAt ? Carbon::parse($pickedUpAt)->toIso8601String() : null,
                'hub'              => $hub,
            ];
        }

        return array_slice($groups, 0, self::MAX_GROUPS_LIMIT);
    }
}

