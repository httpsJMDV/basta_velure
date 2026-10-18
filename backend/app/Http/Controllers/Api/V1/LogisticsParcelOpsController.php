<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Services\Courier\Dispatcher;
use App\Services\Courier\ParcelExceptions;
use App\Services\Courier\ReturnToSender;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * One parcel as the courier company sees it (Logistics L6, L7): its timeline, every failed attempt, the audit trail,
 * and the actions that fix a broken shipment: a manual override with a reason, Lost, Damaged with a photo, and the
 * Return to Sender queue with its return rider.
 */
class LogisticsParcelOpsController extends Controller
{
    public function __construct(
        private readonly ParcelExceptions $exceptions,
        private readonly ReturnToSender $rts,
    ) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    private function parcel(Request $request, int $id): Parcel
    {
        $parcel = LogisticsCompany::constrain(Parcel::query(), $this->company($request)->id)
            ->with(['order.statusHistories', 'order.buyer:id,first_name,last_name', 'sortingCenter:id,hub_name', 'pickupRider.user', 'assignedRider.user', 'rtsRider.user'])
            ->find($id);
        abort_unless($parcel, 404, 'Parcel not found in your network.');

        return $parcel;
    }

    /** GET /logistics/parcels/{parcel} */
    public function show(Request $request, int $parcel): JsonResponse
    {
        $p = $this->parcel($request, $parcel);
        $o = $p->order;

        return response()->json(['data' => [
            'id'               => $p->id,
            'tracking_number'  => $p->tracking_number,
            'status'           => $p->status,
            'status_label'     => Notifier::statusLabel($p->status),
            'order'            => $o ? [
                'id' => $o->id, 'order_number' => $o->order_number, 'status' => $o->status, 'payment_method' => $o->payment_method,
                'total' => (float) $o->total, 'buyer' => $o->buyer ? trim($o->buyer->first_name . ' ' . $o->buyer->last_name) : null,
                'refund_status' => $o->refund_status,
            ] : null,
            'shop'             => $p->pickup_address_snapshot ?? [],
            'recipient'        => array_intersect_key($p->recipient_snapshot ?? [], array_flip(['name', 'barangay', 'city', 'province', 'full_address'])),
            'zone'             => $p->shipping_zone,
            'weight_kg'        => $p->weight_kg !== null ? (float) $p->weight_kg : null,
            'cod_amount'       => $p->cod_amount !== null ? (float) $p->cod_amount : null,
            'hub'              => $p->sortingCenter?->hub_name,
            'riders'           => [
                'pickup'   => $p->pickupRider ? Dispatcher::name($p->pickupRider) : null,
                'delivery' => $p->assignedRider ? Dispatcher::name($p->assignedRider) : null,
                'return'   => $p->rtsRider ? Dispatcher::name($p->rtsRider) : null,
            ],
            'attempts'         => (int) $p->delivery_attempts,
            'max_attempts'     => ReturnToSender::maxAttempts(),
            'failures'         => ReturnToSender::failures($p),
            'exception'        => $p->exception_type ? [
                'type' => $p->exception_type, 'reason' => $p->exception_reason, 'at' => $p->exception_at?->toIso8601String(),
                'photo_url' => $p->exception_photo_path ? url("/api/v1/logistics/parcels/{$p->id}/exception-photo") : null,
            ] : null,
            'override_targets' => array_map(fn ($s) => ['value' => $s, 'label' => Notifier::statusLabel($s)], $this->exceptions->overrideTargets($p)),
            'can_mark_exception' => in_array($p->status, ParcelExceptions::IN_TRANSIT, true),
            'timeline'         => $o ? $o->statusHistories->map(fn ($h) => [
                'status' => $h->to_status instanceof \BackedEnum ? $h->to_status->value : (string) $h->to_status,
                'event'  => is_array($h->meta) ? ($h->meta['event'] ?? null) : null,
                'note'   => $h->note, 'actor' => $h->actor_type, 'at' => $h->created_at?->toIso8601String(),
            ])->reverse()->values() : [],
            // The audit log is read-only: there is no route to edit or delete an entry (LOG-TRK-003).
            'audit'            => AuditLog::with('actor:id,first_name,last_name')->where('subject_type', 'Parcel')->where('subject_id', $p->id)
                ->latest('id')->get()->map(fn ($a) => [
                    'id' => $a->id, 'action' => $a->action, 'from' => $a->old_value, 'to' => $a->new_value, 'reason' => $a->reason,
                    'by' => $a->actor ? trim($a->actor->first_name . ' ' . $a->actor->last_name) : null, 'at' => $a->created_at?->toIso8601String(),
                ])->values(),
        ]]);
    }

    /** POST /logistics/parcels/{parcel}/override {status, reason} */
    public function override(Request $request, int $parcel): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(ParcelExceptions::OVERRIDE_TARGETS)],
            'reason' => Validation::reason(),
        ], Validation::reasonMessages() + ['status.required' => 'Choose the status to set.', 'status.in' => 'Choose one of the next steps.']);
        $p = $this->exceptions->override($this->company($request), $parcel, $data['status'], trim($data['reason']), $request->user());

        return response()->json(['message' => 'Status set to ' . Notifier::statusLabel($p->status) . '. The change is in the audit log.']);
    }

    /** POST /logistics/parcels/{parcel}/exception {type: lost|damaged, reason, photo (damaged)} multipart */
    public function exception(Request $request, int $parcel): JsonResponse
    {
        $data = $request->validate([
            'type'   => ['required', Rule::in(['lost', 'damaged'])],
            'reason' => Validation::reason(),
            'photo'  => ['nullable', Rule::requiredIf(fn () => $request->input('type') === 'damaged'), 'file', 'mimes:jpg,jpeg,png', 'mimetypes:image/jpeg,image/png', 'max:5120'],
        ], Validation::reasonMessages() + [
            'photo.required' => 'Add a photo of the damage.',
            'photo.mimes'    => 'The photo must be a JPG or PNG.',
            'photo.mimetypes' => 'The photo must be a JPG or PNG.',
            'photo.max'      => 'The photo can be at most 5 MB.',
        ]);
        $p = $this->exceptions->markException($this->company($request), $parcel, $data['type'], trim($data['reason']), $request->file('photo'), $request->user());

        return response()->json(['message' => 'Parcel marked ' . strtolower($p->status) . '. The buyer and the shop were told, and the order was cancelled.']);
    }

    /** GET /logistics/parcels/{parcel}/exception-photo */
    public function exceptionPhoto(Request $request, int $parcel): BinaryFileResponse
    {
        $p = $this->parcel($request, $parcel);
        abort_unless($p->exception_photo_path && Storage::disk('ids')->exists($p->exception_photo_path), 404, 'No photo.');

        return response()->file(Storage::disk('ids')->path($p->exception_photo_path));
    }

    /**
     * POST /logistics/parcels/{parcel}/reschedule {rider_id}: another delivery attempt after a failure (R7). A parcel
     * that was refused or failed its last attempt goes back to the seller instead and cannot be rescheduled.
     */
    public function reschedule(Request $request, int $parcel): JsonResponse
    {
        $riderId = $request->validate(['rider_id' => ['required', 'integer']], ['rider_id.required' => 'Choose the delivery rider.'])['rider_id'];
        $company = $this->company($request);
        $rider = LogisticsRiderController::companyRiders($company)->with('user')->find($riderId);
        abort_unless($rider, 422, 'This rider is not one of your riders.');

        $attempt = DB::transaction(function () use ($request, $company, $parcel, $rider) {
            $p = LogisticsCompany::constrain(Parcel::query(), $company->id)->with('order')->lockForUpdate()->find($parcel);
            abort_unless($p && $p->order, 404, 'Parcel not found in your network.');
            abort_if($p->status === Parcel::STATUS_RETURN_TO_SENDER, 409, 'This parcel was refused or failed ' . ReturnToSender::maxAttempts() . ' attempts, so it goes back to the seller. It cannot be rescheduled.');
            abort_unless($p->status === Parcel::STATUS_DELIVERY_FAILED, 409, 'Only a failed delivery can be rescheduled.');
            abort_if((int) $p->delivery_attempts >= ReturnToSender::maxAttempts(), 409, 'No attempts are left. Return the parcel to the seller.');
            if ($problem = app(Dispatcher::class)->riderProblem($rider, $p)) {
                abort(422, $problem);
            }
            app(OrderStateMachine::class)->transition($p->order, OrderStatus::ASSIGNED_TO_RIDER, 'logistics', $request->user()->id,
                'Rescheduled for another delivery attempt.', ['tracking_number' => $p->tracking_number, 'rider_id' => $rider->id, 'attempts_so_far' => $p->delivery_attempts]);
            Parcel::whereKey($p->id)->update(['assigned_rider_id' => $rider->id, 'assigned_at' => now()]);
            app(Notifier::class)->jobAssigned($rider, $p, 'delivery');

            return (int) $p->delivery_attempts + 1;
        });

        return response()->json(['message' => "Rescheduled: attempt {$attempt} of " . ReturnToSender::maxAttempts() . ' with ' . Dispatcher::name($rider) . '.']);
    }

    /** GET /logistics/returns : parcels going back to the seller, with every failure reason. */
    public function returns(Request $request): JsonResponse
    {
        $parcels = LogisticsCompany::constrain(Parcel::query(), $this->company($request)->id)->with(['order:id,order_number,payment_method', 'rtsRider.user'])
            ->where('status', Parcel::STATUS_RETURN_TO_SENDER)->orderBy('rts_at')->get();

        return response()->json(['data' => $parcels->map(fn (Parcel $p) => [
            'id'              => $p->id,
            'tracking_number' => $p->tracking_number,
            'order_number'    => $p->order?->order_number,
            'payment_method'  => $p->order?->payment_method,
            'shop'            => ($p->pickup_address_snapshot ?? [])['shop_name'] ?? null,
            'shop_area'       => trim((($p->pickup_address_snapshot ?? [])['barangay'] ?? '') . ', ' . (($p->pickup_address_snapshot ?? [])['city'] ?? ''), ', '),
            'since'           => $p->rts_at?->toIso8601String(),
            'failures'        => ReturnToSender::failures($p),
            'rider'           => $p->rtsRider ? ['id' => $p->rtsRider->id, 'name' => Dispatcher::name($p->rtsRider)] : null,
        ])->values()]);
    }

    /** POST /logistics/returns/{parcel}/assign {rider_id} */
    public function assignReturn(Request $request, int $parcel): JsonResponse
    {
        $riderId = $request->validate(['rider_id' => ['required', 'integer']], ['rider_id.required' => 'Choose a rider.'])['rider_id'];
        $rider = LogisticsRiderController::companyRiders($this->company($request))->with('user')->find($riderId);
        abort_unless($rider, 422, 'This rider is not one of your riders.');
        $this->rts->assign($this->company($request), $parcel, $rider, $request->user());

        return response()->json(['message' => Dispatcher::name($rider) . ' will take the parcel back to the seller.']);
    }
}
