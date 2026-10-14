<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Services\OrderStateMachine;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class HubParcelIntakeController extends Controller
{
    protected const NOT_FOUND_MESSAGE = 'Parcel not found for this hub.';

    public function __construct(protected OrderStateMachine $stateMachine)
    {
    }

    /**
     * GET /api/v1/hub/parcels/{tracking}
     *
     * Read-only lookup of one of this hub's parcels. Never returns the recipient's
     * phone number or the COD amount.
     */
    public function lookup(Request $request, string $tracking): JsonResponse
    {
        $hub = $this->hub($request);

        $parcel = $this->hubParcelQuery($hub, $tracking)
            ->with(['order:id,order_number', 'pickupRider.user'])
            ->first();

        if (! $parcel) {
            return response()->json(['message' => self::NOT_FOUND_MESSAGE], 404);
        }

        return response()->json(['data' => $this->detail($parcel)]);
    }

    /**
     * POST /api/v1/hub/parcels/{tracking}/receive
     *
     * Scan a parcel in: order and parcel go PICKED_UP -> AT_SORTING_CENTER and
     * scanned_in_at is stamped. The row lock makes simultaneous scans of the
     * same parcel resolve to exactly one success.
     */
    public function receive(Request $request, string $tracking): JsonResponse
    {
        $hub = $this->hub($request);

        return DB::transaction(function () use ($request, $hub, $tracking) {
            $parcel = $this->hubParcelQuery($hub, $tracking)->lockForUpdate()->first();

            if (! $parcel) {
                return response()->json(['message' => self::NOT_FOUND_MESSAGE], 404);
            }

            if ($parcel->status === Parcel::STATUS_READY_FOR_PICKUP) {
                return response()->json([
                    'message' => 'This parcel has not been picked up by a rider yet.',
                ], 409);
            }

            if ($parcel->scanned_in_at !== null || $parcel->status !== Parcel::STATUS_PICKED_UP) {
                return response()->json([
                    'message'        => 'This parcel has already been received.',
                    'scanned_in_at'  => $parcel->scanned_in_at?->toIso8601String(),
                ], 409);
            }

            $order = $parcel->order;
            if (! $order || ! $this->stateMachine->canTransition($order, OrderStatus::AT_SORTING_CENTER, 'hub')) {
                return response()->json([
                    'message' => 'This parcel cannot be received right now.',
                ], 409);
            }

            // The state machine also syncs parcels.status and writes the history row.
            $this->stateMachine->transition(
                $order,
                OrderStatus::AT_SORTING_CENTER,
                'hub',
                $request->user()->id,
                'Received at the sorting center.',
                ['sorting_center_id' => $hub->id, 'tracking_number' => $parcel->tracking_number]
            );

            Parcel::where('id', $parcel->id)->update(['scanned_in_at' => now()]);

            $parcel = Parcel::with(['order:id,order_number', 'pickupRider.user'])->find($parcel->id);

            return response()->json([
                'message' => 'Parcel received.',
                'data'    => $this->detail($parcel),
            ]);
        });
    }

    /**
     * GET /api/v1/hub/intake/expected
     *
     * This hub's parcels that riders have collected (PICKED_UP) and that have not been scanned in yet.
     */
    public function expected(Request $request): JsonResponse
    {
        $hub = $this->hub($request);

        $paginated = Parcel::with(['order:id,order_number', 'pickupRider.user'])
            ->where('sorting_center_id', $hub->id)
            ->where('status', Parcel::STATUS_PICKED_UP)
            ->orderBy('picked_up_at', 'asc')
            ->orderBy('id', 'asc')
            ->paginate($this->perPage($request));

        return $this->paginatedResponse($paginated);
    }

    /**
     * GET /api/v1/hub/intake/received-today
     *
     * This hub's parcels scanned in during the current Asia/Manila day, newest first.
     */
    public function receivedToday(Request $request): JsonResponse
    {
        $hub = $this->hub($request);

        $paginated = Parcel::with(['order:id,order_number', 'pickupRider.user'])
            ->where('sorting_center_id', $hub->id)
            ->scannedInToday()
            ->orderBy('scanned_in_at', 'desc')
            ->orderBy('id', 'desc')
            ->paginate($this->perPage($request));

        return $this->paginatedResponse($paginated);
    }

    protected function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }

    protected function perPage(Request $request): int
    {
        return min(max((int) $request->query('per_page', 20), 1), 100);
    }

    /**
     * Parcels of this hub only, matched by normalized tracking number.
     */
    protected function hubParcelQuery(SortingCenter $hub, string $tracking)
    {
        return Parcel::where('sorting_center_id', $hub->id)
            ->where('tracking_number', Str::upper(trim($tracking)));
    }

    protected function paginatedResponse($paginated): JsonResponse
    {
        return response()->json([
            'data' => $paginated->getCollection()->map(fn (Parcel $p) => $this->summary($p))->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
            ],
        ]);
    }

    /**
     * Compact row used in lists and as the base of the lookup record.
     *
     * @return array<string, mixed>
     */
    protected function summary(Parcel $parcel): array
    {
        $pickup = $parcel->pickup_address_snapshot ?? [];
        $rider = $parcel->pickupRider;
        $riderUser = $rider?->user;

        return [
            'tracking_number'      => $parcel->tracking_number,
            'order_number'         => $parcel->order?->order_number,
            'status'               => $parcel->status,
            'shop_name'            => $pickup['shop_name'] ?? ('Seller #' . $parcel->seller_id),
            'destination_barangay' => [
                'code' => $parcel->destination_barangay_code,
                'name' => $parcel->destination_barangay,
            ],
            'pickup_rider'         => $rider ? [
                'name'         => trim(($riderUser?->first_name ?? '') . ' ' . ($riderUser?->last_name ?? '')),
                'plate_number' => $rider->plate_number,
            ] : null,
            'picked_up_at'         => $parcel->picked_up_at?->toIso8601String(),
            'scanned_in_at'        => $parcel->scanned_in_at?->toIso8601String(),
        ];
    }

    /**
     * Full lookup record: summary plus recipient name and delivery address.
     * Deliberately excludes the recipient phone number and the COD amount.
     *
     * @return array<string, mixed>
     */
    protected function detail(Parcel $parcel): array
    {
        $recipient = $parcel->recipient_snapshot ?? [];

        return $this->summary($parcel) + [
            'recipient' => [
                'name'    => $recipient['name'] ?? '',
                'address' => [
                    'street'   => $recipient['street'] ?? '',
                    'barangay' => $recipient['barangay'] ?? ($parcel->destination_barangay ?? ''),
                    'city'     => $recipient['city'] ?? '',
                    'province' => $recipient['province'] ?? '',
                ],
            ],
        ];
    }
}
