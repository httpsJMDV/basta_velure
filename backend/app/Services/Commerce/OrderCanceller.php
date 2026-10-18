<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\FlashSale;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\PaymentSession;
use App\Models\ProductVariant;
use App\Models\Voucher;
use App\Models\VoucherUsage;
use App\Services\OrderStateMachine;
use Illuminate\Support\Facades\DB;

/**
 * Cancels an order (B11, S8, A6) and undoes what placing it did, exactly once:
 * - stock goes back to each variant (and flash units to a flash sale that is still running) (A3);
 * - the vouchers used come back to the wallet when they have not expired, and their usage count drops (A21);
 * - a prepaid order is refunded the exact amount paid (sandbox payments at once; a GCash payment by the shop).
 *
 * The buyer can cancel until the seller marks the order Ready for Pickup; the seller until it is Picked Up; the
 * system cancels unpaid e-wallet and card orders after an hour.
 */
class OrderCanceller
{
    public const BUYER_REASONS = ['Changed my mind', 'Found a better price', 'Ordered by mistake', 'Need to change the delivery address', 'Need to change the payment method', 'Other'];
    public const SELLER_REASONS = ['Out of stock', 'Buyer asked to cancel', 'Cannot ship to this address', 'Pricing error', 'Other'];

    public const BUYER_CANCELLABLE = [OrderStatus::PLACED, OrderStatus::CONFIRMED, OrderStatus::PREPARING];
    public const SELLER_CANCELLABLE = [OrderStatus::PLACED, OrderStatus::CONFIRMED, OrderStatus::PREPARING, OrderStatus::READY_FOR_PICKUP];

    public function __construct(private readonly OrderStateMachine $machine) {}

    public static function canBuyerCancel(Order $order): bool
    {
        return in_array(self::status($order), self::BUYER_CANCELLABLE, true);
    }

    public static function canSellerCancel(Order $order): bool
    {
        if (! in_array(self::status($order), self::SELLER_CANCELLABLE, true)) {
            return false;
        }

        return ! Parcel::where('order_id', $order->id)->whereNotNull('picked_up_at')->exists();
    }

    public function cancel(Order $order, string $actor, ?int $actorId, string $reason): Order
    {
        return DB::transaction(function () use ($order, $actor, $actorId, $reason) {
            /** @var Order $locked */
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (self::status($locked) === OrderStatus::CANCELLED) {
                abort(409, 'This order is already cancelled.');
            }
            $allowed = match ($actor) {
                'buyer'  => self::canBuyerCancel($locked),
                'seller' => self::canSellerCancel($locked),
                default  => true,
            };
            if (! $allowed) {
                abort(409, $actor === 'buyer'
                    ? 'This order can no longer be cancelled: the seller has already handed it over for pickup.'
                    : 'This order can no longer be cancelled: the courier has picked it up.');
            }

            $this->machine->transition($locked, OrderStatus::CANCELLED, $actor, $actorId, $reason);
            $locked->forceFill(['cancel_reason' => $reason, 'cancelled_by' => $actor, 'cancelled_at' => now()])->save();

            $this->restoreStock($locked);
            $this->returnVouchers($locked);
            $this->refund($locked);
            Parcel::where('order_id', $locked->id)->whereNull('picked_up_at')->delete();

            if ($locked->checkout_group_id) {
                $stillOpen = Order::where('checkout_group_id', $locked->checkout_group_id)->get()->contains(fn (Order $o) => $o->awaitingPayment());
                if (! $stillOpen) {
                    PaymentSession::where('checkout_group_id', $locked->checkout_group_id)->where('status', 'pending')->update(['status' => 'cancelled']);
                }
            }

            return $locked->fresh(['items', 'statusHistories']);
        });
    }

    /** Puts the stock of an order back once (stock_restored_at marks each line). */
    public function restoreStock(Order $order): void
    {
        $items = OrderItem::where('order_id', $order->id)->whereNull('stock_restored_at')->lockForUpdate()->get();
        foreach ($items as $item) {
            if ($item->product_variant_id) {
                ProductVariant::withTrashed()->whereKey($item->product_variant_id)->increment('stock_quantity', $item->quantity);
            }
            if ($item->flash_sale_id) {
                $sale = FlashSale::lockForUpdate()->find($item->flash_sale_id);
                if ($sale && ! $sale->ended_at && $sale->slot_end->gt(now())) {
                    $sale->update(['sold' => max(0, $sale->sold - $item->quantity)]);
                }
            }
            $item->update(['stock_restored_at' => now()]);
        }
    }

    /**
     * A21: the vouchers of a cancelled order go back to the wallet when they have not expired. A platform voucher
     * shared by several store orders comes back only when all of them are cancelled.
     */
    private function returnVouchers(Order $order): void
    {
        $usages = VoucherUsage::where('order_id', $order->id)->whereNull('returned_at')->get();
        foreach ($usages as $usage) {
            $voucher = Voucher::lockForUpdate()->find($usage->voucher_id);
            if (! $voucher || $voucher->ended_at || $voucher->ends_at->lte(now())) {
                continue;
            }
            $siblings = VoucherUsage::where('voucher_id', $usage->voucher_id)->where('checkout_group_id', $usage->checkout_group_id)
                ->whereNull('returned_at')->where('id', '!=', $usage->id)
                ->whereHas('order', fn ($q) => $q->where('status', '!=', OrderStatus::CANCELLED->value))->exists();
            if ($siblings) {
                continue;
            }
            VoucherUsage::where('voucher_id', $usage->voucher_id)->where('checkout_group_id', $usage->checkout_group_id)->whereNull('returned_at')->update(['returned_at' => now()]);
            if ($voucher->used_count > 0) {
                $voucher->decrement('used_count');
            }
        }
    }

    /** The exact amount paid goes back: at once for the sandbox gateway, by the shop for a direct GCash payment. */
    public function refund(Order $order, ?float $amount = null): void
    {
        if ($order->payment_status !== 'paid') {
            return;
        }
        $amount ??= (float) $order->total;
        if (in_array($order->payment_method, Order::GATEWAY_METHODS, true)) {
            $order->forceFill(['refund_status' => 'refunded', 'refund_amount' => $amount, 'refunded_at' => now(), 'payment_status' => 'refunded'])->save();
            Payment::where('order_id', $order->id)->update(['status' => 'refunded', 'refund_amount' => $amount, 'refunded_at' => now()]);
        } else {
            // Paid straight to the shop's GCash: the shop sends it back; the order shows the refund as pending.
            $order->forceFill(['refund_status' => 'pending', 'refund_amount' => $amount])->save();
        }
    }

    private static function status(Order $order): ?OrderStatus
    {
        return $order->status instanceof OrderStatus ? $order->status : OrderStatus::tryFrom((string) $order->status);
    }
}
