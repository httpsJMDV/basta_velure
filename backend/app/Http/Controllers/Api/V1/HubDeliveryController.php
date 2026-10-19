<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Mail\ParcelReturnedMail;
use App\Mail\ParcelsAssignedMail;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\OrderStateMachine;
use App\Services\RiderAreaCoverage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\Validation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class HubDeliveryController extends Controller
{
    /** The live board shows at most this many parcels; meta.total says how many exist. */
    protected const OUT_LIMIT = 500;

    protected const NOT_FOUND_MESSAGE = 'Parcel or rider not found for this hub.';

    public function __construct(
        protected OrderStateMachine $stateMachine,
        protected RiderAreaCoverage $coverage,
    ) {
    }

    /**
     * GET /api/v1/hub/deliveries/out?search=&rider_id=
     *
     * This hub's parcels that are out for delivery right now. No recipient phone and no COD amount.
     */
    public function out(Request $request): JsonResponse
    {
        $request->validate([
            'search'   => ['nullable', 'string', 'max:100'],
            'rider_id' => ['nullable', 'integer'],
        ]);

        $hub = $this->hub($request);

        $base = Parcel::where('sorting_center_id', $hub->id)->where('status', Parcel::STATUS_OUT_FOR_DELIVERY);

        // Counts per rider come from the unfiltered set, so the rider filter keeps stable options.
        $perRider = (clone $base)
            ->selectRaw('assigned_rider_id, COUNT(*) as total')
            ->groupBy('assigned_rider_id')
            ->pluck('total', 'assigned_rider_id');
        $riders = Rider::with('user')->whereIn('id', $perRider->keys())->get()->keyBy('id');

        $query = clone $base;
        if ($request->filled('rider_id')) {
            $query->where('assigned_rider_id', (int) $request->query('rider_id'));
        }
        $this->applySearch($query, (string) $request->query('search', ''));

        $total = (clone $query)->count();
        $parcels = $query->with(['order:id,order_number', 'assignedRider.user'])
            ->orderBy('assigned_rider_id')
            ->orderBy('out_for_delivery_at')
            ->orderBy('id')
            ->limit(self::OUT_LIMIT)
            ->get();

        return response()->json([
            'data' => $parcels->map(fn (Parcel $p) => $this->outRow($p))->values(),
            'meta' => [
                'total'     => $total,
                'truncated' => $total > self::OUT_LIMIT,
                'riders'    => $perRider->map(function ($count, $riderId) use ($riders) {
                    $rider = $riders->get($riderId);

                    return [
                        'rider_id'     => $riderId !== null ? (int) $riderId : null,
                        'name'         => $this->riderName($rider),
                        'plate_number' => $rider?->plate_number,
                        'count'        => (int) $count,
                    ];
                })->sortBy('name')->values(),
            ],
        ]);
    }

    /**
     * GET /api/v1/hub/deliveries/failed?reason=&search=
     *
     * This hub's failed deliveries with the rider's reason and note, newest failure first.
     */
    public function failed(Request $request): JsonResponse
    {
        $request->validate([
            'reason'   => ['nullable', Rule::enum(DeliveryFailureReason::class)],
            'search'   => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer'],
        ]);

        $hub = $this->hub($request);
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        $query = Parcel::where('sorting_center_id', $hub->id)->where('status', Parcel::STATUS_DELIVERY_FAILED);
        if ($request->filled('reason')) {
            $query->where('failure_reason', $request->query('reason'));
        }
        $this->applySearch($query, (string) $request->query('search', ''));

        $paginated = $query->with(['order:id,order_number', 'assignedRider.user'])
            ->orderByDesc('failed_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => $paginated->getCollection()->map(fn (Parcel $p) => $this->failedRow($p))->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
                'max_attempts' => $this->maxAttempts(),
                // The reasons a rider can give, from the same enum, so the filter never drifts from it.
                'reasons'      => DeliveryFailureReason::options(),
            ],
        ]);
    }

    /**
     * POST /api/v1/hub/deliveries/{tracking}/reschedule   { rider_id }
     *
     * Give a failed parcel another attempt: DELIVERY_FAILED -> ASSIGNED_TO_RIDER with an eligible
     * rider. The rider collects it at the hub again. The failure columns stay as the record of the
     * last failure.
     */
    public function reschedule(Request $request, string $tracking): JsonResponse
    {
        $validated = $request->validate([
            'rider_id' => ['required', 'integer'],
        ]);

        $hub = $this->hub($request);
        $trackingNumber = Str::upper(trim($tracking));

        /** @var array{rider: Rider, barangay: string}|null $notify */
        $notify = null;

        $response = DB::transaction(function () use ($request, $hub, $trackingNumber, $validated, &$notify) {
            $parcel = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->where('tracking_number', $trackingNumber)
                ->lockForUpdate()
                ->first();

            // Another hub's rider and an unknown rider read exactly like an unknown parcel.
            $rider = Rider::with('user')
                ->where('id', (int) $validated['rider_id'])
                ->where('sorting_center_id', $hub->id)
                ->lockForUpdate()
                ->first();

            if (! $parcel || ! $rider) {
                return $this->notFound();
            }
            if ($parcel->status !== Parcel::STATUS_DELIVERY_FAILED) {
                return $this->conflict($parcel);
            }

            $max = $this->maxAttempts();
            if ($parcel->delivery_attempts >= $max) {
                return response()->json([
                    'message' => "This parcel has already failed {$parcel->delivery_attempts} of {$max} allowed delivery attempts, so it can only be returned to the seller.",
                ], 422);
            }

            $code = (string) $parcel->destination_barangay_code;
            $eligible = $code !== '' ? ($this->coverage->eligibleByBarangayCode($hub)[$code] ?? []) : [];
            if (! array_key_exists($rider->id, $eligible)) {
                return response()->json([
                    'message' => 'This rider is not eligible for the parcel\'s destination barangay.',
                    'errors'  => ['rider_id' => ['This rider is not eligible for this barangay.']],
                ], 422);
            }

            if (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::ASSIGNED_TO_RIDER, 'hub')) {
                return $this->cannotUpdate();
            }

            // The state machine also syncs parcels.status and writes the history row.
            $this->stateMachine->transition(
                $parcel->order,
                OrderStatus::ASSIGNED_TO_RIDER,
                'hub',
                $request->user()->id,
                'Rescheduled for another delivery attempt.',
                [
                    'sorting_center_id' => $hub->id,
                    'rider_id'          => $rider->id,
                    'tracking_number'   => $parcel->tracking_number,
                    'attempts_so_far'   => $parcel->delivery_attempts,
                ]
            );

            // failed_at, failure_reason and failure_note stay: they record the last failure.
            Parcel::where('id', $parcel->id)->update([
                'assigned_rider_id' => $rider->id,
                'assigned_at'       => now(),
            ]);

            $notify = ['rider' => $rider, 'barangay' => (string) ($parcel->destination_barangay ?? '')];

            return response()->json([
                'message'           => 'Parcel rescheduled.',
                'tracking_number'   => $parcel->tracking_number,
                'rider'             => ['id' => $rider->id, 'name' => $this->riderName($rider)],
                'delivery_attempts' => $parcel->delivery_attempts,
                'max_attempts'      => $max,
            ]);
        });

        // Only after the transaction committed. A mail failure must never undo the reschedule.
        if ($notify !== null) {
            $this->notifyRider($hub, $notify['rider'], $notify['barangay']);
        }

        return $response;
    }

    /**
     * POST /api/v1/hub/deliveries/{tracking}/return-to-seller   { note? }
     *
     * The hub hands a failed parcel back to the seller (A13): the order is Cancelled (failed delivery) for the buyer, a
     * prepaid order is refunded in full, and the seller confirms the parcel arrived before the stock goes back.
     */
    public function returnToSeller(Request $request, string $tracking): JsonResponse
    {
        $validated = $request->validate([
            'note' => Validation::sentence(false, 5, 500),
        ], Validation::sentenceMessages('note', 'The note', 5, 500));

        $hub = $this->hub($request);
        $trackingNumber = Str::upper(trim($tracking));
        $note = isset($validated['note']) ? trim((string) $validated['note']) : null;
        $note = $note === '' ? null : $note;

        /** @var array{parcel: Parcel}|null $notify */
        $notify = null;

        $response = DB::transaction(function () use ($request, $hub, $trackingNumber, $note, &$notify) {
            $parcel = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->where('tracking_number', $trackingNumber)
                ->lockForUpdate()
                ->first();

            if (! $parcel) {
                return $this->notFound();
            }
            if (! in_array($parcel->status, [Parcel::STATUS_DELIVERY_FAILED, Parcel::STATUS_RETURN_TO_SENDER], true)) {
                return $this->conflict($parcel);
            }
            if (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::CANCELLED, 'hub')) {
                return $this->cannotUpdate();
            }

            app(\App\Services\Courier\ReturnToSender::class)->complete($parcel, 'hub', $request->user()->id, $note);

            $notify = ['parcel' => $parcel];

            return response()->json([
                'message'         => 'Parcel returned to the seller.',
                'tracking_number' => $parcel->tracking_number,
            ]);
        });

        // Only after the transaction committed. A mail failure must never undo the return.
        if ($notify !== null) {
            $this->notifySeller($hub, $notify['parcel']);
        }

        return $response;
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    protected function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }

    protected function maxAttempts(): int
    {
        return max(1, (int) config('logistics.max_delivery_attempts', 3));
    }

    protected function notFound(): JsonResponse
    {
        return response()->json(['message' => self::NOT_FOUND_MESSAGE], 404);
    }

    /** The project's conflict response (409): the parcel is not in a state this action applies to. */
    protected function conflict(Parcel $parcel): JsonResponse
    {
        return response()->json([
            'message' => 'Only a parcel with a failed delivery can be rescheduled or returned. This parcel is ' . str_replace('_', ' ', strtolower($parcel->status)) . '.',
        ], 409);
    }

    protected function cannotUpdate(): JsonResponse
    {
        return response()->json(['message' => 'This parcel cannot be updated right now.'], 422);
    }

    protected function riderName(?Rider $rider): string
    {
        return trim(($rider?->user?->first_name ?? '') . ' ' . ($rider?->user?->last_name ?? ''));
    }

    /**
     * Free-text search over tracking number, order number, recipient, destination and rider name.
     */
    protected function applySearch(Builder $query, string $search): void
    {
        $search = trim($search);
        if ($search === '') {
            return;
        }

        $like = '%' . addcslashes($search, '%_\\') . '%';
        $likeLower = Str::lower($like);

        $query->where(function (Builder $w) use ($like, $likeLower) {
            // Text pulled out of a JSON column compares case-sensitively in MySQL, so lowercase both sides.
            $w->where('tracking_number', 'like', $like)
                ->orWhere('destination_barangay', 'like', $like)
                ->orWhereRaw("LOWER(JSON_UNQUOTE(JSON_EXTRACT(recipient_snapshot, '$.name'))) LIKE ?", [$likeLower])
                ->orWhereRaw("LOWER(JSON_UNQUOTE(JSON_EXTRACT(recipient_snapshot, '$.city'))) LIKE ?", [$likeLower])
                ->orWhereHas('order', fn (Builder $o) => $o->where('order_number', 'like', $like))
                ->orWhereHas('assignedRider.user', fn (Builder $u) => $u->where(DB::raw("CONCAT(first_name, ' ', last_name)"), 'like', $like));
        });
    }

    /**
     * @return array<string, mixed>
     */
    protected function baseRow(Parcel $p): array
    {
        $recipient = $p->recipient_snapshot ?? [];
        $rider = $p->assignedRider;

        return [
            'tracking_number' => $p->tracking_number,
            'order_number'    => $p->order?->order_number,
            'rider'           => $rider ? [
                'id'           => $rider->id,
                'name'         => $this->riderName($rider),
                'plate_number' => $rider->plate_number,
            ] : null,
            'destination'     => [
                'barangay_code' => $p->destination_barangay_code,
                'barangay_name' => (string) ($p->destination_barangay ?: ($recipient['barangay'] ?? '')),
                'city'          => (string) ($recipient['city'] ?? ''),
            ],
            'recipient_name'  => (string) ($recipient['name'] ?? ''),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function outRow(Parcel $p): array
    {
        $since = $p->out_for_delivery_at;

        return $this->baseRow($p) + [
            'out_for_delivery_at' => $since?->toIso8601String(),
            'elapsed_minutes'     => $since ? (int) floor(max(0, now()->getTimestamp() - $since->getTimestamp()) / 60) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function failedRow(Parcel $p): array
    {
        $reason = $p->failure_reason ? DeliveryFailureReason::tryFrom($p->failure_reason) : null;
        $max = $this->maxAttempts();

        return $this->baseRow($p) + [
            'failure_reason'    => $p->failure_reason ? [
                'code'  => $p->failure_reason,
                'label' => $reason?->label() ?? $p->failure_reason,
            ] : null,
            'failure_note'      => $p->failure_note,
            'failed_at'         => $p->failed_at?->toIso8601String(),
            'delivery_attempts' => $p->delivery_attempts,
            'max_attempts'      => $max,
            'can_reschedule'    => $p->delivery_attempts < $max,
        ];
    }

    protected function notifyRider(SortingCenter $hub, Rider $rider, string $barangayName): void
    {
        $email = $rider->user?->email;
        if (! $email) {
            return;
        }

        try {
            // Same email as a 1.8 assignment: one parcel is assigned to the rider again.
            Mail::to($email)->queue(new ParcelsAssignedMail($rider->user, $hub, 1, $barangayName));
        } catch (\Throwable $e) {
            Log::error("Failed sending reschedule email to rider #{$rider->id}: {$e->getMessage()}");
        }
    }

    protected function notifySeller(SortingCenter $hub, Parcel $parcel): void
    {
        try {
            /** @var User|null $seller */
            $seller = $parcel->seller_id ? User::with('sellerProfile')->find($parcel->seller_id) : null;
            if (! $seller || ! $seller->email) {
                return;
            }

            $reason = $parcel->failure_reason ? DeliveryFailureReason::tryFrom($parcel->failure_reason) : null;
            $shopName = $seller->sellerProfile?->shop_name
                ?? ($parcel->pickup_address_snapshot['shop_name'] ?? ($seller->first_name . "'s shop"));

            Mail::to($seller->email)->queue(new ParcelReturnedMail(
                $seller,
                $hub,
                (string) $shopName,
                (string) ($parcel->order?->order_number ?? ''),
                $parcel->tracking_number,
                $reason?->label() ?? 'Delivery could not be completed',
            ));
        } catch (\Throwable $e) {
            Log::error("Failed sending return email for parcel {$parcel->tracking_number}: {$e->getMessage()}");
        }
    }
}
