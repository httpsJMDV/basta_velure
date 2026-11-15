<?php

namespace App\Services\Payments;

use App\Enums\OrderStatus;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\User;
use App\Services\Commerce\OrderCanceller;
use App\Support\Gcash;
use App\Support\Money;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class GcashReview
{
    /** One transfer can cover the orders sharing its reference in this checkout. */
    public function orders(Order $order, bool $lock = false): Collection
    {
        abort_unless($order->isPlatformGcash(), 422, 'This is not a Loved-IT-collected GCash payment.');
        $q = Order::withTrashed()->where('buyer_id', $order->buyer_id)->where('payment_method', 'gcash')
            ->where('settlement', Order::SETTLEMENT_PLATFORM)->whereNotNull('collection_payee');
        if ($order->checkout_group_id && $order->payment_reference) {
            $q->where('checkout_group_id', $order->checkout_group_id)->where('payment_reference', $order->payment_reference)
                ->where('collection_payee->number', $order->collection_payee['number']);
        } else $q->whereKey($order->id);
        $q->orderBy('id');
        if ($lock) $q->lockForUpdate();
        return $q->get();
    }

    public function present(Order $order): ?array
    {
        if (! $order->isPlatformGcash()) return null;
        $orders = $this->orders($order);
        return ['payee' => $order->collection_payee, 'amount' => Money::fromCents($orders->sum(fn ($o) => Money::toCents($o->total))),
            'order_count' => $orders->count(), 'order_ids' => $orders->pluck('id')->all(), 'reference' => $order->payment_reference,
            'can_review' => $orders->every(fn ($o) => in_array($o->payment_status, ['pending', 'pending_verification', 'verification_failed'], true)),
            'has_cancelled_order' => $orders->contains(fn ($o) => in_array($o->status, [OrderStatus::CANCELLED, OrderStatus::RETURNED], true))];
    }

    public function confirm(Order $order, User $admin, string $expectedReference, string|float $received): void
    {
        abort_unless($admin->role === 'admin', 403);
        DB::transaction(function () use ($order, $admin, $expectedReference, $received) {
            $orders = $this->orders($order, true);
            abort_if($orders->isEmpty(), 404);
            $reference = $orders->first()->payment_reference;
            abort_unless(Gcash::reference($expectedReference) === Gcash::reference($reference), 409, 'The receipt changed. Refresh and review the latest payment.');
            $total = $orders->sum(fn ($o) => Money::toCents($o->total));
            if (Money::toCents((string) $received) !== $total) throw ValidationException::withMessages(['received_amount' => 'The amount received must match the full transaction amount.']);
            if ($orders->every(fn ($o) => in_array($o->payment_status, ['paid', 'refunded'], true))) return;
            abort_unless($orders->every(fn ($o) => in_array($o->payment_status, ['pending', 'pending_verification', 'verification_failed'], true)), 409, 'This payment group needs reconciliation before it can be changed.');
            PlatformGcash::claim('incoming', $reference, 'gcash_group', (int) $orders->first()->id);
            foreach ($orders as $o) {
                $o->update(['payment_status' => 'paid', 'paid_at' => now(), 'payment_verified_at' => now(), 'payment_verified_by' => $admin->id, 'verification_rejection_reason' => null]);
                $o->payment?->update(['status' => 'paid', 'paid_at' => now(), 'reference_number' => $reference]);
                if (in_array($o->status, [OrderStatus::CANCELLED, OrderStatus::RETURNED], true)) app(OrderCanceller::class)->refund($o);
                AuditLog::record($admin, 'payment.gcash_received', $o, null, ['reference' => $reference, 'amount' => $o->total, 'recipient' => 'Loved-IT']);
                DB::afterCommit(function () use ($o) {
                    app(\App\Services\MailNotifier::class)->gcashPaymentConfirmed($o);
                    app(\App\Services\Notifier::class)->toUserId($o->buyer_id, 'payment.gcash_received', 'Loved-IT received your payment',
                        "Payment for {$o->order_number} was verified. Check the order for its current fulfillment or refund status.", "/settings/orders?order={$o->id}");
                    app(\App\Services\Notifier::class)->toSeller($o->items()->value('seller_id'), 'orders', 'payment.gcash_received', 'Loved-IT verified payment',
                        "Order {$o->order_number}: payment is verified. Accept the order if it is still open.", "/seller/orders?order={$o->id}");
                });
            }
        });
    }

    public function reject(Order $order, User $admin, string $expectedReference, string $reason): void
    {
        abort_unless($admin->role === 'admin', 403);
        DB::transaction(function () use ($order, $admin, $expectedReference, $reason) {
            $orders = $this->orders($order, true);
            abort_if($orders->isEmpty(), 409, 'The receipt changed. Refresh the payment.');
            abort_unless(Gcash::reference($expectedReference) === Gcash::reference($orders->first()->payment_reference), 409, 'The receipt changed. Refresh the payment.');
            abort_unless($orders->every(fn ($o) => in_array($o->payment_status, ['pending', 'pending_verification', 'verification_failed'], true)), 409, 'A received or refunded payment cannot be rejected.');
            foreach ($orders as $o) {
                $o->update(['payment_status' => 'verification_failed', 'verification_rejection_reason' => $reason]);
                $o->payment?->update(['status' => 'failed']);
                AuditLog::record($admin, 'payment.gcash_rejected', $o, null, ['reason' => $reason]);
                DB::afterCommit(fn () => app(\App\Services\Notifier::class)->toUserId($o->buyer_id, 'payment.gcash_issue', 'GCash receipt needs attention',
                    "{$o->order_number}: {$reason} Do not send another payment without checking with Loved-IT.", "/settings/orders?order={$o->id}"));
                DB::afterCommit(fn () => app(\App\Services\MailNotifier::class)->gcashPaymentRejected($o, $reason));
            }
        });
    }
}
