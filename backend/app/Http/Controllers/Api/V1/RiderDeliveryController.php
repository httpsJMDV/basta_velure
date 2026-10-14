<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\Rider;
use App\Services\OrderStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RiderDeliveryController extends Controller
{
    protected const MAX_START_BATCH = 50;

    /** Item names shown in the short summary before collapsing the rest into "+N more". */
    protected const SUMMARY_ITEMS = 2;

    public function __construct(protected OrderStateMachine $stateMachine)
    {
    }

    /**
     * GET /api/v1/rider/deliveries?view=assigned|out_for_delivery
     *
     * This rider's own parcels in the matching status, grouped by destination barangay.
     * Recipient phone and COD amount are included: only the assigned rider sees them.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'view' => ['nullable', 'in:assigned,out_for_delivery'],
        ]);

        $rider = $this->rider($request);
        $view = $request->query('view', 'assigned');
        $status = $view === 'out_for_delivery'
            ? Parcel::STATUS_OUT_FOR_DELIVERY
            : Parcel::STATUS_ASSIGNED_TO_RIDER;

        $parcels = Parcel::with('order.items')
            ->where('assigned_rider_id', $rider->id)
            ->where('status', $status)
            ->orderBy('assigned_at', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        // Parcels are already oldest-assigned first, so groups keep that order too.
        $groups = $parcels
            ->groupBy(fn (Parcel $p) => (string) $p->destination_barangay_code)
            ->map(function (Collection $group, string $code) {
                /** @var Parcel $first */
                $first = $group->first();
                $snapshot = $first->recipient_snapshot ?? [];

                return [
                    'barangay_code' => $code,
                    'barangay_name' => (string) ($first->destination_barangay ?: ($snapshot['barangay'] ?? '')),
                    'city'          => (string) ($snapshot['city'] ?? ''),
                    'parcels'       => $group->map(fn (Parcel $p) => $this->parcelPayload($p))->values()->all(),
                ];
            })
            ->values();

        $counts = Parcel::where('assigned_rider_id', $rider->id)
            ->whereIn('status', [Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY])
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'data' => $groups,
            'hub'  => $rider->sortingCenter?->riderFacingPayload(),
            'meta' => [
                'view'                   => $view,
                'assigned_count'         => (int) ($counts[Parcel::STATUS_ASSIGNED_TO_RIDER] ?? 0),
                'out_for_delivery_count' => (int) ($counts[Parcel::STATUS_OUT_FOR_DELIVERY] ?? 0),
            ],
        ]);
    }

    /**
     * POST /api/v1/rider/deliveries/start
     *
     * The rider confirms they collected these parcels at the hub and starts the run. All or nothing:
     * every item is validated under row locks first, and nothing is written if any item is invalid.
     */
    public function start(Request $request): JsonResponse
    {
        $input = $request->input('tracking_numbers');
        if (is_array($input)) {
            $request->merge([
                'tracking_numbers' => array_map(
                    fn ($tn) => is_string($tn) ? Str::upper(trim($tn)) : $tn,
                    $input
                ),
            ]);
        }

        $validated = $request->validate([
            'tracking_numbers'   => ['required', 'array', 'min:1', 'max:' . self::MAX_START_BATCH],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
        ]);

        $rider = $this->rider($request);
        $trackingNumbers = array_values($validated['tracking_numbers']);

        return DB::transaction(function () use ($request, $rider, $trackingNumbers) {
            // Another rider's parcel and an unknown one are indistinguishable on purpose.
            $parcels = Parcel::with('order')
                ->where('assigned_rider_id', $rider->id)
                ->whereIn('tracking_number', $trackingNumbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');

            $errors = [];
            foreach ($trackingNumbers as $index => $tn) {
                $parcel = $parcels->get($tn);
                $key = "tracking_numbers.{$index}";

                if (! $parcel) {
                    $errors[$key] = ['Parcel not found among your assigned deliveries.'];
                } elseif ($parcel->status === Parcel::STATUS_OUT_FOR_DELIVERY) {
                    $errors[$key] = ['This parcel is already out for delivery.'];
                } elseif ($parcel->status !== Parcel::STATUS_ASSIGNED_TO_RIDER) {
                    $errors[$key] = ['This parcel is not waiting to be collected.'];
                } elseif (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::OUT_FOR_DELIVERY, 'rider')) {
                    $errors[$key] = ['This parcel cannot be sent out for delivery right now.'];
                }
            }

            if (! empty($errors)) {
                return response()->json([
                    'message' => 'One or more parcels cannot be started. Nothing was changed.',
                    'errors'  => $errors,
                ], 422);
            }

            $now = now();
            foreach ($parcels as $parcel) {
                // The state machine also syncs parcels.status and writes the history row.
                $this->stateMachine->transition(
                    $parcel->order,
                    OrderStatus::OUT_FOR_DELIVERY,
                    'rider',
                    $request->user()->id,
                    'Out for delivery with the courier.',
                    ['rider_id' => $rider->id, 'tracking_number' => $parcel->tracking_number]
                );

                Parcel::where('id', $parcel->id)->update(['out_for_delivery_at' => $now]);
            }

            return response()->json([
                'message'          => 'Delivery started.',
                'started_count'    => $parcels->count(),
                'tracking_numbers' => $parcels->pluck('tracking_number')->values()->all(),
            ]);
        });
    }

    protected function rider(Request $request): Rider
    {
        return Rider::with('sortingCenter')->where('user_id', $request->user()->id)->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    protected function parcelPayload(Parcel $parcel): array
    {
        $recipient = $parcel->recipient_snapshot ?? [];
        $items = $parcel->order?->items ?? collect();

        return [
            'tracking_number'     => $parcel->tracking_number,
            'order_number'        => $parcel->order?->order_number,
            'recipient'           => [
                'name'    => (string) ($recipient['name'] ?? ''),
                'phone'   => (string) ($recipient['phone'] ?? ''),
                'address' => [
                    'street'       => (string) ($recipient['street'] ?? ''),
                    'barangay'     => (string) ($recipient['barangay'] ?? ($parcel->destination_barangay ?? '')),
                    'city'         => (string) ($recipient['city'] ?? ''),
                    'province'     => (string) ($recipient['province'] ?? ''),
                    'full_address' => (string) ($recipient['full_address'] ?? implode(', ', array_filter([
                        $recipient['street'] ?? '',
                        $recipient['barangay'] ?? ($parcel->destination_barangay ?? ''),
                        $recipient['city'] ?? '',
                        $recipient['province'] ?? '',
                    ]))),
                ],
            ],
            'cod_amount'          => $parcel->cod_amount !== null ? (float) $parcel->cod_amount : null,
            'item_count'          => (int) $items->sum('quantity'),
            'item_summary'        => $this->itemSummary($items),
            'assigned_at'         => $parcel->assigned_at?->toIso8601String(),
            'out_for_delivery_at' => $parcel->out_for_delivery_at?->toIso8601String(),
        ];
    }

    /**
     * Short summary such as "Floral Summer Dress x1, Cotton Tee x2, +3 more".
     */
    protected function itemSummary(Collection $items): string
    {
        if ($items->isEmpty()) {
            return '';
        }

        $shown = $items->take(self::SUMMARY_ITEMS)
            ->map(fn ($item) => "{$item->product_name} x{$item->quantity}")
            ->all();

        $rest = $items->count() - count($shown);
        if ($rest > 0) {
            $shown[] = "+{$rest} more";
        }

        return implode(', ', $shown);
    }
}
