<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentSession;
use App\Services\MailNotifier;
use App\Services\Notifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The built-in sandbox e-wallet and card gateway (B9). No real money moves. The buyer is sent to Loved-IT's own
 * gateway page, which offers success, decline and cancel; the outcome is reported through the same callback a real
 * gateway would use, signed with config('payments.sandbox_secret'), so closing the browser after paying still marks
 * the orders paid (B9-005). A session is paid at most once; paying after the hour is over is refused (A6).
 */
class SandboxGateway
{
    public static function signature(string $token, string $status, string $reference): string
    {
        return hash_hmac('sha256', "{$token}|{$status}|{$reference}", (string) config('payments.sandbox_secret'));
    }

    /**
     * Applies a gateway outcome to a session and its orders. Idempotent: a repeated callback changes nothing.
     *
     * @return array{session: PaymentSession, changed: bool, message: string}
     */
    public function settle(PaymentSession $session, string $outcome, ?string $reference = null, ?string $failure = null): array
    {
        return DB::transaction(function () use ($session, $outcome, $reference, $failure) {
            /** @var PaymentSession $s */
            $s = PaymentSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            if ($s->status === 'paid') {
                return ['session' => $s, 'changed' => false, 'message' => 'This payment was already received.'];
            }
            if (in_array($s->status, ['expired', 'cancelled', 'failed'], true) && $outcome !== 'success') {
                return ['session' => $s, 'changed' => false, 'message' => 'This payment attempt is closed.'];
            }

            $orders = Order::where('checkout_group_id', $s->checkout_group_id)->lockForUpdate()->get();
            $open = $orders->filter(fn (Order $o) => $o->awaitingPayment());

            if ($outcome === 'success') {
                if ($s->expires_at->lte(now()) || $open->isEmpty() || in_array($s->status, ['expired'], true)) {
                    $s->update(['status' => 'expired']);

                    return ['session' => $s->fresh(), 'changed' => true, 'message' => 'The payment window has closed: unpaid orders are cancelled 1 hour after they are placed.'];
                }
                $ref = $reference ?: 'SBX-' . strtoupper(Str::random(10));
                $s->update(['status' => 'paid', 'gateway_reference' => $ref, 'paid_at' => now()]);
                foreach ($open as $o) {
                    $o->update(['payment_status' => 'paid', 'paid_at' => now(), 'payment_reference' => $ref]);
                    Payment::where('order_id', $o->id)->update(['status' => 'paid', 'paid_at' => now(), 'gateway_reference' => $ref, 'payment_session_id' => $s->id]);
                    // The seller hears about an e-wallet or card order once it is paid.
                    app(Notifier::class)->newOrder($o, paid: true);
                    app(MailNotifier::class)->sellerNewOrder($o);
                }

                return ['session' => $s->fresh(), 'changed' => true, 'message' => 'Payment received. Your order is now To Ship.'];
            }

            if ($outcome === 'decline') {
                $s->update(['status' => 'failed', 'failure_reason' => $failure ?: 'The card or e-wallet declined the payment.']);
                foreach ($open as $o) {
                    $o->update(['payment_status' => 'failed']);
                    Payment::where('order_id', $o->id)->update(['status' => 'failed']);
                }

                return ['session' => $s->fresh(), 'changed' => true, 'message' => 'Payment failed. Your order is still To Pay: try again before the hour is up.'];
            }

            $s->update(['status' => 'cancelled']);

            return ['session' => $s->fresh(), 'changed' => true, 'message' => 'Payment cancelled. Your order is still To Pay.'];
        });
    }

    /** A new attempt for the unpaid orders of a checkout (Pay Again), or null when none can be paid any more. */
    public function retry(Order $order): ?PaymentSession
    {
        $orders = Order::where('checkout_group_id', $order->checkout_group_id)->get()->filter(fn (Order $o) => $o->awaitingPayment());
        $due = $orders->min('payment_due_at');
        if ($orders->isEmpty() || ! $due || $due->lte(now())) {
            return null;
        }
        PaymentSession::where('checkout_group_id', $order->checkout_group_id)->where('status', 'pending')->update(['status' => 'cancelled']);

        return PaymentSession::create([
            'buyer_id' => $order->buyer_id, 'checkout_group_id' => $order->checkout_group_id, 'token' => Str::random(48),
            'method' => $order->payment_method, 'amount' => round($orders->sum(fn ($o) => (float) $o->total), 2),
            'status' => 'pending', 'expires_at' => $due,
        ]);
    }

    public static function present(PaymentSession $s): array
    {
        $orders = Order::with('items:id,order_id,product_name,variant_label,quantity,subtotal')->where('checkout_group_id', $s->checkout_group_id)->orderBy('id')->get();

        return [
            'token'      => $s->token,
            'method'     => $s->method,
            'amount'     => (float) $s->amount,
            'status'     => $s->status,
            'reference'  => $s->gateway_reference,
            'failure'    => $s->failure_reason,
            'expires_at' => $s->expires_at->toIso8601String(),
            'orders'     => $orders->map(fn (Order $o) => [
                'id' => $o->id, 'order_number' => $o->order_number, 'total' => (float) $o->total,
                'status' => $o->status instanceof OrderStatus ? $o->status->value : $o->status, 'payment_status' => $o->payment_status,
            ])->values(),
        ];
    }
}
