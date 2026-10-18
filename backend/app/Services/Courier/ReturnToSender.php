<?php

namespace App\Services\Courier;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
use App\Models\AuditLog;
use App\Models\DeliveryLog;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\User;
use App\Services\Commerce\OrderCanceller;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use Illuminate\Support\Facades\DB;

/**
 * Return to Sender (A13, Logistics L7, Rider R7).
 *
 * A parcel the recipient refused, or one that failed its last allowed attempt (3), goes back to the seller at once:
 * no further attempt can be scheduled. The company gives the trip to a rider, who hands it to the seller. Then the
 * order is Cancelled (failed delivery) for the buyer, a prepaid order is refunded in full and the shop earns nothing
 * on it. The seller sees it as Returned, awaiting confirmation; the stock goes back only when the seller confirms
 * the parcel arrived.
 */
class ReturnToSender
{
    public const CANCEL_REASON = 'Failed delivery';

    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly OrderCanceller $canceller,
        private readonly Dispatcher $dispatcher,
    ) {}

    public static function maxAttempts(): int
    {
        return max(1, (int) config('logistics.max_delivery_attempts', 3));
    }

    /**
     * Right after a failed attempt was counted: a refusal, or the last allowed attempt, sends the parcel back. Call
     * with the parcel locked. Returns true when it is now on its way back.
     */
    public function afterFailure(Parcel $parcel, DeliveryFailureReason $reason): bool
    {
        if ($reason !== DeliveryFailureReason::REFUSED && (int) $parcel->delivery_attempts < self::maxAttempts()) {
            return false;
        }

        $parcel->forceFill(['status' => Parcel::STATUS_RETURN_TO_SENDER, 'rts_at' => now()])->save();
        $order = $parcel->order;
        if ($order) {
            $why = $reason === DeliveryFailureReason::REFUSED
                ? 'The recipient refused the parcel'
                : 'The parcel failed ' . self::maxAttempts() . ' delivery attempts';
            $notifier = app(Notifier::class);
            $notifier->toUserId($order->buyer_id, 'order.status', 'Delivery failed: returning to the seller',
                "Order {$order->order_number}: {$why}, so it is going back to the seller. The order will be cancelled" .
                ($order->isPrepaid() ? ' and refunded in full.' : '.'), "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
            $notifier->toUserId($parcel->seller_id, 'order.status', 'A parcel is coming back to you',
                "Order {$order->order_number}: {$why}. The courier is bringing it back to your shop.", "/seller/orders?order={$order->id}", ['order_id' => $order->id]);
            $notifier->send($notifier->companyMembers($parcel->logistics_company_id), 'shipment.rts', 'Return to sender',
                "Parcel {$parcel->tracking_number}: {$why}. Assign a rider to take it back to the seller.", '/logistics/returns',
                ['tracking_number' => $parcel->tracking_number]);
        }

        return true;
    }

    /**
     * Every failed attempt of a parcel, oldest first.
     *
     * @return list<array{attempt: int, reason: string, note: string|null, at: string|null}>
     */
    public static function failures(Parcel $parcel): array
    {
        $labels = collect(DeliveryFailureReason::cases())->mapWithKeys(fn ($r) => [$r->value => $r->label()]);

        return DeliveryLog::where('parcel_id', $parcel->id)->where('outcome', DeliveryLog::OUTCOME_DELIVERY_FAILED)
            ->orderBy('logged_at')->orderBy('id')->get()->values()
            ->map(function (DeliveryLog $log, int $i) use ($labels) {
                [$code, $rest] = array_pad(explode(':', (string) $log->notes, 2), 2, '');
                $note = str_contains($rest, ' - ') ? trim(explode(' - ', $rest, 2)[1]) : null;

                return ['attempt' => $i + 1, 'reason' => $labels[trim($code)] ?? trim($rest ?: $code), 'note' => $note, 'at' => $log->logged_at?->toIso8601String()];
            })->all();
    }

    /** The company gives the trip back to the seller to a rider (L7). */
    public function assign(LogisticsCompany $company, int $parcelId, Rider $rider, User $by): Parcel
    {
        return DB::transaction(function () use ($company, $parcelId, $rider, $by) {
            $parcel = LogisticsCompany::constrain(Parcel::query(), $company->id)->with('order')->lockForUpdate()->find($parcelId);
            abort_unless($parcel, 404, 'Parcel not found in your network.');
            abort_unless($parcel->status === Parcel::STATUS_RETURN_TO_SENDER, 409, 'Only a parcel waiting to go back to the seller can be given a return rider.');
            abort_if($parcel->rts_rider_id === $rider->id, 409, 'This rider already has this return.');
            if ($problem = $this->dispatcher->riderProblem($rider, $parcel)) {
                abort(422, $problem);
            }

            $previous = $parcel->rts_rider_id ? Rider::with('user')->find($parcel->rts_rider_id) : null;
            $parcel->forceFill(['rts_rider_id' => $rider->id, 'rts_assigned_at' => now()])->save();
            if ($parcel->order) {
                $this->machine->recordEvent($parcel->order, 'rts_assigned', 'logistics', $by->id,
                    'Courier ' . Dispatcher::name($rider->loadMissing('user')) . ' is taking the parcel back to the seller.', ['rider_id' => $rider->id]);
            }
            AuditLog::record($by, 'rts.assigned', $parcel, $previous ? ['rider_id' => $previous->id] : null,
                ['rider_id' => $rider->id, 'tracking_number' => $parcel->tracking_number], null, $company->id, 'logistics');

            $notifier = app(Notifier::class);
            $notifier->jobAssigned($rider, $parcel, 'return');
            if ($previous) {
                $notifier->jobRemoved($previous, $parcel, 'The courier company gave this return to another rider.');
            }

            return $parcel->fresh();
        });
    }

    /**
     * The parcel is back with the seller: brought by the return rider, or handed over at the hub. Call with the
     * parcel locked.
     */
    public function complete(Parcel $parcel, string $actor, ?int $actorId, ?string $note = null): void
    {
        abort_unless(in_array($parcel->status, [Parcel::STATUS_RETURN_TO_SENDER, Parcel::STATUS_DELIVERY_FAILED], true), 409,
            'This parcel is not on its way back to the seller.');
        $order = $parcel->order;
        abort_unless($order && $this->machine->canTransition($order, OrderStatus::CANCELLED, $actor), 422, 'This parcel cannot be updated right now.');

        $this->machine->transition($order, OrderStatus::CANCELLED, $actor, $actorId,
            'Cancelled: failed delivery. The parcel went back to the seller.', ['tracking_number' => $parcel->tracking_number, 'return_to_sender' => true]);
        $order = Order::lockForUpdate()->find($order->id);
        $order->forceFill(['cancel_reason' => self::CANCEL_REASON, 'cancelled_by' => 'system', 'cancelled_at' => now()])->save();
        $this->canceller->returnVouchers($order);
        $this->canceller->refund($order);

        $parcel->forceFill(['status' => Parcel::STATUS_RETURNED, 'returned_at' => now(), 'return_note' => $note])->save();
        // A delivery log names a rider; a parcel the hub handed back itself has none to name.
        if ($riderId = $parcel->rts_rider_id ?? ($actor === 'rider' ? $parcel->assigned_rider_id : null)) {
            DeliveryLog::create([
                'parcel_id' => $parcel->id, 'rider_id' => $riderId, 'outcome' => DeliveryLog::OUTCOME_RETURNED,
                'logged_at' => now(), 'notes' => $note,
            ]);
        }

        app(Notifier::class)->toUserId($parcel->seller_id, 'order.returned_to_sender', 'Parcel returned to you',
            "Order {$order->order_number}: the parcel is back with you. Confirm you received it so the stock goes back on sale.",
            "/seller/orders?order={$order->id}", ['order_id' => $order->id]);
    }

    /** The seller confirms the returned parcel arrived: the stock goes back, once (L7, LOG-RTS-003). */
    public function sellerConfirm(Order $order, User $seller): Parcel
    {
        return DB::transaction(function () use ($order, $seller) {
            $parcel = Parcel::where('order_id', $order->id)->where('seller_id', $seller->id)->lockForUpdate()->first();
            abort_unless($parcel && $parcel->status === Parcel::STATUS_RETURNED, 409, 'There is no returned parcel to confirm for this order.');
            abort_if($parcel->seller_return_confirmed_at !== null, 409, 'You already confirmed this parcel came back.');

            $parcel->forceFill(['seller_return_confirmed_at' => now()])->save();
            $this->canceller->restoreStock($order);

            return $parcel->fresh();
        });
    }
}
