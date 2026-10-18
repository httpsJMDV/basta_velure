<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DispatchOffer;
use App\Models\Parcel;
use App\Models\Rider;
use App\Services\Courier\CodLedger;
use App\Services\Courier\Dispatcher;
use App\Services\Courier\ReturnToSender;
use App\Services\RiderWorkload;
use App\Support\ShippingSplit;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The rider's working state (Rider workbook R3, R4, R7, R9): going Online or Offline, the pickup offers that last
 * 60 seconds, return trips back to the seller, and the cash on delivery they hold for their company.
 */
class RiderJobController extends Controller
{
    public function __construct(
        private readonly Dispatcher $dispatcher,
        private readonly RiderWorkload $workload,
        private readonly CodLedger $cod,
        private readonly ReturnToSender $rts,
    ) {}

    private function rider(Request $request): Rider
    {
        return Rider::with('user')->where('user_id', $request->user()->id)->firstOrFail();
    }

    /** GET /rider/status: Online or not, and how many of the 3 job slots are used. */
    public function status(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->state($this->rider($request))]);
    }

    /**
     * POST /rider/availability {online} (R3). Only an Active rider goes Online (a suspended one is refused by the
     * middleware with the reason). Going Offline is always allowed: jobs already accepted stay and can be finished;
     * an open offer goes to the next rider.
     */
    public function availability(Request $request): JsonResponse
    {
        $online = (bool) $request->validate(['online' => ['required', 'boolean']])['online'];
        $rider = $this->rider($request);

        if ($online) {
            abort_unless($rider->status === Rider::STATUS_ACTIVE, 403, 'Only a verified, active rider can go Online.');
            abort_if($rider->license_expiry && $rider->license_expiry->lt(now('Asia/Manila')->startOfDay()), 403,
                'Your driver\'s license has expired. Update it in your account before going Online.');
            $rider->forceFill(['is_online' => true, 'online_at' => $rider->isAvailable() ? $rider->online_at : now(), 'last_seen_at' => now()])->save();
        } else {
            DB::transaction(function () use ($rider) {
                $rider->forceFill(['is_online' => false])->save();
                $open = DispatchOffer::where('rider_id', $rider->id)->where('status', DispatchOffer::STATUS_OFFERED)->pluck('parcel_id', 'id');
                foreach ($open as $offerId => $parcelId) {
                    $parcel = Parcel::lockForUpdate()->find($parcelId);
                    DispatchOffer::whereKey($offerId)->update(['status' => DispatchOffer::STATUS_CANCELLED, 'responded_at' => now()]);
                    if ($parcel) {
                        $this->dispatcher->offerNext($parcel);
                    }
                }
            });
        }

        $rider->refresh();

        return response()->json([
            'message' => $online ? 'You are Online. New job offers will come to you.' : 'You are Offline. Finish the jobs you already have; no new offers will come.',
            'data'    => $this->state($rider),
        ]);
    }

    private function state(Rider $rider): array
    {
        return [
            'online'          => $rider->isAvailable(),
            'status'          => $rider->status,
            'active_jobs'     => $this->workload->activeJobs($rider),
            'max_active_jobs' => Rider::MAX_ACTIVE_JOBS,
            'online_since'    => $rider->isAvailable() ? $rider->online_at?->toIso8601String() : null,
        ];
    }

    // ── Offers (R4) ──────────────────────────────────────────────────────────

    /** GET /rider/offers: open offers with the seconds left and what the job pays. */
    public function offers(Request $request): JsonResponse
    {
        $rider = $this->rider($request);

        return response()->json([
            'data' => $this->dispatcher->openOffers($rider)->map(fn (DispatchOffer $o) => $this->offer($o))->values(),
            'meta' => $this->state($rider),
        ]);
    }

    public function accept(Request $request, int $offer): JsonResponse
    {
        $parcel = $this->dispatcher->accept($this->rider($request), $offer);

        return response()->json(['message' => 'Job accepted. Head to the shop and scan the waybill to pick it up.', 'data' => ['tracking_number' => $parcel->tracking_number]]);
    }

    public function decline(Request $request, int $offer): JsonResponse
    {
        $this->dispatcher->decline($this->rider($request), $offer);

        return response()->json(['message' => 'Job declined.']);
    }

    private function offer(DispatchOffer $o): array
    {
        $p = $o->parcel;
        $pickup = $p->pickup_address_snapshot ?? [];
        $to = $p->recipient_snapshot ?? [];

        return [
            'id'              => $o->id,
            'tracking_number' => $p->tracking_number,
            'expires_at'      => $o->expires_at->toIso8601String(),
            'seconds_left'    => max(0, now()->diffInSeconds($o->expires_at, false)),
            'pickup'          => [
                'shop_name' => $pickup['shop_name'] ?? 'Shop',
                'phone'     => $pickup['contact_phone'] ?? null,
                'address'   => $pickup['full_address'] ?? trim(($pickup['street'] ?? '') . ', ' . ($pickup['barangay'] ?? '') . ', ' . ($pickup['city'] ?? ''), ', '),
                'barangay'  => $pickup['barangay'] ?? $p->pickup_barangay,
                'city'      => $pickup['city'] ?? null,
            ],
            // Only the area: the full address and the recipient stay hidden until the delivery leg.
            'dropoff_area'    => trim(($to['barangay'] ?? $p->destination_barangay ?? '') . ', ' . ($to['city'] ?? ''), ', '),
            'cod_amount'      => $p->cod_amount !== null ? (float) $p->cod_amount : null,
            'weight_kg'       => $p->weight_kg !== null ? (float) $p->weight_kg : null,
            'pay'             => Money::fromCents(ShippingSplit::pickupPayCents()),
        ];
    }

    // ── Return to sender (R7) ────────────────────────────────────────────────

    /** GET /rider/returns: parcels this rider is taking back to the seller. */
    public function returns(Request $request): JsonResponse
    {
        $rider = $this->rider($request);
        $parcels = Parcel::with('order:id,order_number')->where('rts_rider_id', $rider->id)
            ->where('status', Parcel::STATUS_RETURN_TO_SENDER)->orderBy('rts_assigned_at')->get();

        return response()->json(['data' => $parcels->map(fn (Parcel $p) => [
            'tracking_number' => $p->tracking_number,
            'order_number'    => $p->order?->order_number,
            'seller'          => $p->pickup_address_snapshot ?? [],
            'failures'        => ReturnToSender::failures($p),
            'assigned_at'     => $p->rts_assigned_at?->toIso8601String(),
        ])->values()]);
    }

    /** POST /rider/returns/{tracking}/delivered: handed back to the seller. */
    public function returned(Request $request, string $tracking): JsonResponse
    {
        $note = $request->validate(['note' => ['nullable', 'string', 'max:300']])['note'] ?? null;
        $rider = $this->rider($request);

        DB::transaction(function () use ($request, $rider, $tracking, $note) {
            $parcel = Parcel::with('order')->where('tracking_number', Str::upper(trim($tracking)))->where('rts_rider_id', $rider->id)->lockForUpdate()->first();
            abort_unless($parcel, 404, 'Parcel not found among your returns.');
            abort_unless($parcel->status === Parcel::STATUS_RETURN_TO_SENDER, 409, 'This parcel is already back with the seller.');
            $this->rts->complete($parcel, 'rider', $request->user()->id, $note);
        });

        return response()->json(['message' => 'Returned to the seller. The seller will confirm it arrived.']);
    }

    // ── Cash on delivery (R9) ────────────────────────────────────────────────

    /** GET /rider/cod: the balance, the orders behind it and the remittances. */
    public function cod(Request $request): JsonResponse
    {
        $rider = $this->rider($request);

        return response()->json(['data' => [
            'balance'     => $this->cod->balance($rider),
            'collections' => $this->cod->collections($rider, limit: 50),
            'remittances' => \App\Models\CodRemittance::where('rider_id', $rider->id)->latest('submitted_at')->limit(20)->get()
                ->map(fn ($r) => $this->cod->present($r))->values(),
        ]]);
    }

    /** POST /rider/cod/remittances {amount, reference?} with an Idempotency-Key header. */
    public function remit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount'    => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'reference' => ['nullable', 'string', 'max:40'],
        ], [
            'amount.gt'      => 'Enter an amount above ₱0.',
            'amount.decimal' => 'The amount can have at most 2 decimal places.',
        ]);
        $key = $request->header('Idempotency-Key');
        $r = $this->cod->submit($this->rider($request), (string) $data['amount'], $data['reference'] ?? null, $key ? mb_substr($key, 0, 64) : null);

        return response()->json([
            'message' => 'Remittance submitted. It stays Pending until your company confirms it.',
            'data'    => $this->cod->present($r),
        ], $r->wasRecentlyCreated ? 201 : 200);
    }
}
