<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\Dispute;
use App\Models\DisputePhoto;
use App\Models\Order;
use App\Models\User;
use App\Services\MailNotifier;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Return and refund requests (B12, S12, A11, A31).
 *
 * The buyer asks after the order is Delivered, within 7 days and before it is Completed, with a reason from the list,
 * a 10 to 500 character description and 1 to 5 photos. The shop approves (the order is refunded and returned) or
 * rejects with a reason; with no answer within 3 days the request is approved. A rejected request can be escalated
 * to Loved-IT once, within 3 days; otherwise it closes and the order completes.
 */
class ReturnService
{
    public const WINDOW_DAYS = 7;

    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly OrderCanceller $canceller,
    ) {}

    /** When the order was delivered (the parcel's time, else the items'). */
    public static function deliveredAt(Order $order): ?\Carbon\CarbonInterface
    {
        return $order->parcel()->value('delivered_at') ? \Illuminate\Support\Carbon::parse($order->parcel()->value('delivered_at'))
            : ($order->items()->max('delivered_at') ? \Illuminate\Support\Carbon::parse($order->items()->max('delivered_at')) : null);
    }

    /** Why a return cannot be requested now, or null. */
    public static function unavailableReason(Order $order): ?string
    {
        $status = $order->status instanceof OrderStatus ? $order->status : OrderStatus::tryFrom((string) $order->status);
        if ($status === OrderStatus::COMPLETED) {
            return 'This order is completed, so a return can no longer be requested.';
        }
        if ($status !== OrderStatus::DELIVERED) {
            return $status === OrderStatus::DISPUTED
                ? 'A return request is already open for this order.'
                : 'You can request a return once the order is delivered.';
        }
        $at = self::deliveredAt($order);
        if ($at && $at->copy()->addDays(self::WINDOW_DAYS)->lt(now()->startOfSecond())) {
            return 'The 7-day return window for this order has ended.';
        }

        return null;
    }

    /** @param  array<int, UploadedFile>  $photos */
    public function request(Order $order, User $buyer, string $reason, string $description, array $photos): Dispute
    {
        $stored = [];
        try {
            return DB::transaction(function () use ($order, $buyer, $reason, $description, $photos, &$stored) {
                $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
                if ($why = self::unavailableReason($locked)) {
                    abort(422, $why);
                }
                $dispute = Dispute::updateOrCreate(['order_id' => $locked->id], [
                    'buyer_id' => $buyer->id, 'seller_id' => $locked->items()->value('seller_id'),
                    'reason' => $reason, 'description' => $description, 'status' => 'pending',
                    'respond_by' => now()->addDays(Dispute::RESPOND_DAYS), 'seller_reason' => null, 'seller_responded_at' => null,
                    'escalate_by' => null, 'escalated_at' => null, 'auto_approved' => false, 'resolution_note' => null,
                    'resolved_by' => null, 'resolved_at' => null, 'refund_amount' => null,
                ]);
                $dispute->photos()->delete();
                foreach (array_values($photos) as $i => $photo) {
                    $path = $photo->store('returns', 'public');
                    $stored[] = $path;
                    DisputePhoto::create(['dispute_id' => $dispute->id, 'path' => $path, 'sort_order' => $i]);
                }
                $this->machine->transition($locked, OrderStatus::DISPUTED, 'buyer', $buyer->id, "Return requested: {$reason}");
                app(MailNotifier::class)->returnRequested($locked, "{$reason} — {$description}");

                return $dispute->fresh('photos');
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($stored);
            throw $e;
        }
    }

    /** The shop (or the 3-day rule, or Loved-IT) approves: the buyer is refunded and the order is Returned. */
    public function approve(Order $order, string $actor, ?int $actorId, ?string $note = null): Dispute
    {
        return DB::transaction(function () use ($order, $actor, $actorId, $note) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $dispute = Dispute::where('order_id', $locked->id)->lockForUpdate()->firstOrFail();
            if (! in_array($dispute->status, ['pending', 'escalated', 'open', 'in_progress'], true)) {
                abort(409, 'This return request has already been answered.');
            }
            $auto = $actor === 'system';
            $dispute->update([
                'status' => 'approved', 'auto_approved' => $auto, 'seller_responded_at' => $actor === 'seller' ? now() : $dispute->seller_responded_at,
                'resolution_note' => $note ?? ($auto ? 'Approved automatically: the shop did not answer within 3 days.' : 'Return approved.'),
                'resolved_by' => $actorId, 'resolved_at' => now(), 'refund_amount' => (float) $locked->total,
            ]);
            $this->machine->transition($locked, OrderStatus::RETURNED, $actor, $actorId, $auto ? 'Return approved automatically after 3 days' : 'Return approved');
            $this->refundReturn($locked->fresh());
            app(MailNotifier::class)->returnResolved($locked, 'accepted');

            return $dispute->fresh('photos');
        });
    }

    public function reject(Order $order, int $sellerId, string $reason): Dispute
    {
        return DB::transaction(function () use ($order, $sellerId, $reason) {
            $dispute = Dispute::where('order_id', $order->id)->lockForUpdate()->firstOrFail();
            if (! in_array($dispute->status, ['pending', 'open'], true)) {
                abort(409, 'This return request has already been answered.');
            }
            $dispute->update([
                'status' => 'rejected', 'seller_reason' => $reason, 'seller_responded_at' => now(),
                'escalate_by' => now()->addDays(Dispute::ESCALATE_DAYS), 'resolution_note' => "Rejected by the shop: {$reason}",
            ]);
            app(Notifier::class)->toUserId($order->buyer_id, 'return.rejected', 'Return request rejected',
                "The shop rejected your return for order {$order->order_number}: {$reason} You can escalate it to Loved-IT within 3 days.",
                "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
            app(MailNotifier::class)->returnResolved($order, 'rejected', $reason);

            return $dispute->fresh('photos');
        });
    }

    public function escalate(Order $order, User $buyer): Dispute
    {
        return DB::transaction(function () use ($order, $buyer) {
            $dispute = Dispute::where('order_id', $order->id)->where('buyer_id', $buyer->id)->lockForUpdate()->firstOrFail();
            if ($dispute->status === 'escalated' || $dispute->escalated_at) {
                abort(409, 'This return request has already been escalated.');
            }
            if ($dispute->status !== 'rejected') {
                abort(409, 'Only a rejected return request can be escalated.');
            }
            if ($dispute->escalate_by && $dispute->escalate_by->lt(now())) {
                abort(409, 'The 3 days to escalate this request have passed.');
            }
            $dispute->update(['status' => 'escalated', 'escalated_at' => now(), 'resolution_note' => 'Escalated to Loved-IT for a decision.']);
            app(Notifier::class)->toUserId($dispute->seller_id, 'return.escalated', 'Return escalated to Loved-IT',
                "The buyer escalated the return for order {$order->order_number}. Loved-IT will decide.", "/seller/orders?order={$order->id}", ['order_id' => $order->id]);

            return $dispute->fresh('photos');
        });
    }

    /** The return refund: the exact amount paid, to the original payment method (or the refund account for COD). */
    private function refundReturn(Order $order): void
    {
        if ($order->payment_method === 'cod') {
            $order->forceFill(['refund_status' => 'refunded', 'refund_amount' => (float) $order->total, 'refunded_at' => now()])->save();

            return;
        }
        $this->canceller->refund($order);
    }

    /**
     * The 3-day rules: unanswered requests are approved; rejected requests not escalated in time close, and the
     * order completes so the shop's earnings are released.
     *
     * @return array{approved: int, closed: int}
     */
    public function processDeadlines(): array
    {
        $approved = 0;
        $closed = 0;
        foreach (Dispute::with('order')->whereIn('status', ['pending', 'open'])->whereNotNull('respond_by')->where('respond_by', '<=', now())->get() as $d) {
            if ($d->order && ($d->order->status instanceof OrderStatus ? $d->order->status : OrderStatus::tryFrom((string) $d->order->status)) === OrderStatus::DISPUTED) {
                $this->approve($d->order, 'system', null);
                $approved++;
            }
        }
        foreach (Dispute::with('order')->where('status', 'rejected')->whereNull('escalated_at')->whereNotNull('escalate_by')->where('escalate_by', '<=', now())->get() as $d) {
            DB::transaction(function () use ($d) {
                $d->update(['status' => 'closed', 'resolved_at' => now(), 'resolution_note' => 'Closed: the rejection was not escalated within 3 days.']);
                $this->machine->transition($d->order, OrderStatus::COMPLETED, 'system', null, 'Return request closed; order completed');
            });
            $closed++;
        }

        return ['approved' => $approved, 'closed' => $closed];
    }

    public static function present(?Dispute $d): ?array
    {
        if (! $d) {
            return null;
        }

        return [
            'id'                  => $d->id,
            'reason'              => $d->reason,
            'description'         => $d->description,
            'status'              => $d->status,
            'photos'              => $d->relationLoaded('photos') ? $d->photos->map(fn ($p) => $p->url())->values() : $d->photos()->get()->map(fn ($p) => $p->url())->values(),
            'respond_by'          => $d->respond_by?->toIso8601String(),
            'seller_reason'       => $d->seller_reason,
            'seller_responded_at' => $d->seller_responded_at?->toIso8601String(),
            'escalate_by'         => $d->escalate_by?->toIso8601String(),
            'escalated_at'        => $d->escalated_at?->toIso8601String(),
            'can_escalate'        => $d->status === 'rejected' && ! $d->escalated_at && (! $d->escalate_by || $d->escalate_by->gte(now())),
            'auto_approved'       => (bool) $d->auto_approved,
            'refund_amount'       => $d->refund_amount !== null ? (float) $d->refund_amount : null,
            'resolution_note'     => $d->resolution_note,
            'resolved_at'         => $d->resolved_at?->toIso8601String(),
            'created_at'          => $d->created_at?->toIso8601String(),
        ];
    }
}
