<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\DeliveryLog;
use App\Models\Parcel;
use App\Models\Rider;
use App\Services\OrderStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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

    /**
     * GET /api/v1/rider/deliveries/failure-reasons
     *
     * The reasons a rider can give for a failed delivery. Only OTHER requires a note.
     */
    public function failureReasons(): JsonResponse
    {
        return response()->json(['data' => DeliveryFailureReason::options()]);
    }

    /**
     * POST /api/v1/rider/deliveries/{tracking}/delivered   (multipart)
     *
     * Mark one stop delivered with two different photos as proof. The photos go to the private disk. The COD amount
     * is always read from the parcel, never from the client. Escrow handling at DELIVERED is the state
     * machine's, untouched.
     */
    public function delivered(Request $request, string $tracking): JsonResponse
    {
        if ($request->has('cod_collected')) {
            $request->merge([
                'cod_collected' => filter_var($request->input('cod_collected'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE),
            ]);
        }

        $request->validate([
            'proof_photo'   => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'proof_photo_2' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'received_by'   => ['nullable', 'string', 'max:100'],
            'cod_collected' => ['nullable', 'boolean'],
        ]);

        // The two photos must be two different pictures, not the same file sent twice.
        if (hash_file('sha256', $request->file('proof_photo')->getRealPath()) === hash_file('sha256', $request->file('proof_photo_2')->getRealPath())) {
            throw ValidationException::withMessages([
                'proof_photo_2' => ['Take a second, different photo.'],
            ]);
        }

        $rider = $this->rider($request);
        $trackingNumber = Str::upper(trim($tracking));
        $storedPaths = [];

        try {
            return DB::transaction(function () use ($request, $rider, $trackingNumber, &$storedPaths) {
                $parcel = $this->lockOwnParcel($rider, $trackingNumber);

                if (! $parcel) {
                    return $this->notFound();
                }
                if ($parcel->status !== Parcel::STATUS_OUT_FOR_DELIVERY) {
                    return $this->conflict($parcel);
                }
                if (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::DELIVERED, 'rider')) {
                    return $this->cannotUpdate();
                }

                // A COD parcel needs the rider to confirm the cash; the amount itself comes from the parcel.
                $isCod = $parcel->cod_amount !== null;
                if ($isCod && ! $request->boolean('cod_collected')) {
                    throw ValidationException::withMessages([
                        'cod_collected' => ['Confirm that you collected the cash on delivery amount.'],
                    ]);
                }

                // Everything that can reject the request has run; only now are the photos kept.
                foreach (['proof_photo', 'proof_photo_2'] as $field) {
                    $path = $request->file($field)->store('delivery-proofs', 'ids');
                    if (! $path) {
                        throw new \RuntimeException('Could not store the delivery proof.');
                    }
                    $storedPaths[$field] = $path;
                }

                $now = now();

                // The state machine also syncs parcels.status, writes the history row and runs the
                // existing escrow handling for DELIVERED.
                $this->stateMachine->transition(
                    $parcel->order,
                    OrderStatus::DELIVERED,
                    'rider',
                    $request->user()->id,
                    'Delivered to the recipient by the courier.',
                    ['rider_id' => $rider->id, 'tracking_number' => $parcel->tracking_number]
                );

                $receivedBy = trim((string) $request->input('received_by', ''));
                Parcel::where('id', $parcel->id)->update([
                    'delivered_at'        => $now,
                    'delivery_proof_path'   => $storedPaths['proof_photo'],
                    'delivery_proof_path_2' => $storedPaths['proof_photo_2'],
                    'received_by'         => $receivedBy !== '' ? $receivedBy : null,
                    'cod_collected_at'    => $isCod ? $now : null,
                ]);

                DeliveryLog::create([
                    'parcel_id' => $parcel->id,
                    'rider_id'  => $rider->id,
                    'outcome'   => DeliveryLog::OUTCOME_DELIVERED,
                    'logged_at' => $now,
                    'notes'     => $receivedBy !== '' ? "Received by {$receivedBy}" : null,
                ]);

                return response()->json([
                    'message'         => 'Delivery recorded.',
                    'tracking_number' => $parcel->tracking_number,
                    'delivered_at'    => $now->toIso8601String(),
                    'cod_collected'   => $isCod,
                ]);
            });
        } catch (\Throwable $e) {
            // Anything that failed after the photos were stored must not leave the files behind.
            foreach ($storedPaths as $path) {
                Storage::disk('ids')->delete($path);
            }

            throw $e;
        }
    }

    /**
     * POST /api/v1/rider/deliveries/{tracking}/failed   (JSON)
     *
     * Record a failed delivery attempt with a reason. Reschedule and return-to-seller are hub
     * actions (Feature 1.9), not part of this endpoint.
     */
    public function failed(Request $request, string $tracking): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', Rule::enum(DeliveryFailureReason::class)],
            'note'   => [
                'nullable', 'string', 'max:500',
                Rule::requiredIf(fn () => $request->input('reason') === DeliveryFailureReason::OTHER->value),
            ],
        ]);

        $reason = DeliveryFailureReason::from($validated['reason']);
        $note = isset($validated['note']) ? trim((string) $validated['note']) : null;
        $note = $note === '' ? null : $note;

        $rider = $this->rider($request);
        $trackingNumber = Str::upper(trim($tracking));

        return DB::transaction(function () use ($request, $rider, $trackingNumber, $reason, $note) {
            $parcel = $this->lockOwnParcel($rider, $trackingNumber);

            if (! $parcel) {
                return $this->notFound();
            }
            if ($parcel->status !== Parcel::STATUS_OUT_FOR_DELIVERY) {
                return $this->conflict($parcel);
            }
            if (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::DELIVERY_FAILED, 'rider')) {
                return $this->cannotUpdate();
            }

            $now = now();

            // The buyer can read the history note, so it carries only the reason label, not the free-text note.
            $this->stateMachine->transition(
                $parcel->order,
                OrderStatus::DELIVERY_FAILED,
                'rider',
                $request->user()->id,
                'Delivery failed: ' . $reason->label(),
                ['rider_id' => $rider->id, 'tracking_number' => $parcel->tracking_number, 'reason' => $reason->value]
            );

            Parcel::where('id', $parcel->id)->update([
                'failed_at'         => $now,
                'failure_reason'    => $reason->value,
                'failure_note'      => $note,
                'delivery_attempts' => DB::raw('delivery_attempts + 1'),
            ]);

            DeliveryLog::create([
                'parcel_id' => $parcel->id,
                'rider_id'  => $rider->id,
                'outcome'   => DeliveryLog::OUTCOME_DELIVERY_FAILED,
                'logged_at' => $now,
                'notes'     => "{$reason->value}: {$reason->label()}" . ($note !== null ? " - {$note}" : ''),
            ]);

            return response()->json([
                'message'           => 'Delivery failure recorded.',
                'tracking_number'   => $parcel->tracking_number,
                'reason'            => ['code' => $reason->value, 'label' => $reason->label()],
                'delivery_attempts' => (int) Parcel::where('id', $parcel->id)->value('delivery_attempts'),
            ]);
        });
    }

    /**
     * The rider's own parcel, row-locked. Another rider's parcel and an unknown one are the same: null.
     */
    protected function lockOwnParcel(Rider $rider, string $trackingNumber): ?Parcel
    {
        return Parcel::with('order')
            ->where('tracking_number', $trackingNumber)
            ->where('assigned_rider_id', $rider->id)
            ->lockForUpdate()
            ->first();
    }

    protected function notFound(): JsonResponse
    {
        return response()->json(['message' => 'Parcel not found among your assigned deliveries.'], 404);
    }

    /** The project's conflict response (409): the parcel is not in a state this action applies to. */
    protected function conflict(Parcel $parcel): JsonResponse
    {
        $message = match ($parcel->status) {
            Parcel::STATUS_DELIVERED       => 'This parcel has already been delivered.',
            Parcel::STATUS_DELIVERY_FAILED => 'This parcel has already been marked as failed.',
            default                        => 'This parcel is not out for delivery.',
        };

        return response()->json(['message' => $message], 409);
    }

    protected function cannotUpdate(): JsonResponse
    {
        return response()->json(['message' => 'This parcel cannot be updated right now.'], 422);
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
