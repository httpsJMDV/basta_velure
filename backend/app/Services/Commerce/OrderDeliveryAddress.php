<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\User;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use Illuminate\Support\Facades\DB;

/** Correct contact/street details before a waybill exists; a different route requires a new checkout quote. */
class OrderDeliveryAddress
{
    public static function editable(Order $order): bool
    {
        return in_array($order->status, [OrderStatus::PLACED, OrderStatus::CONFIRMED, OrderStatus::PREPARING], true)
            && ! $order->parcel()->exists();
    }

    public function update(Order $order, User $buyer, array $values): Order
    {
        return DB::transaction(function () use ($order, $buyer, $values) {
            $locked = Order::where('buyer_id', $buyer->id)->lockForUpdate()->findOrFail($order->id);
            abort_unless(self::editable($locked), 409, 'Delivery details are locked because this order is ready for dispatch or already closed. Contact the shop or courier for help; editing a saved address will not reroute this order.');
            abort_unless((int) ($locked->address_revision ?? 1) === $values['address_revision'], 409, 'These delivery details changed. Refresh the order before saving again.');
            $fields = ['shipping_name', 'shipping_phone', 'shipping_address'];
            $old = $locked->only($fields);
            $changes = array_intersect_key($values, array_flip($fields));
            if ($old === $changes) {
                return $locked;
            }
            $locked->forceFill($changes + ['address_revision' => ($locked->address_revision ?? 1) + 1, 'address_confirmed_at' => null])->save();
            AuditLog::record($buyer, 'order.delivery_address_updated', $locked, $old, $changes, actorRole: 'buyer');
            app(OrderStateMachine::class)->recordEvent($locked, 'delivery_address_updated', 'buyer', $buyer->id,
                'The buyer corrected the recipient, phone or street details within the original delivery barangay.');
            DB::afterCommit(function () use ($locked) {
                if ($locked->fresh()->awaitingPayment()) {
                    return;
                }
                app(OrderConfirmationMessenger::class)->addressUpdated($locked->fresh());
                $sellerId = $locked->items()->value('seller_id');
                if ($sellerId) {
                    app(Notifier::class)->toSeller($sellerId, 'order_updates', 'order.address_updated', 'Delivery details corrected',
                        'The buyer updated the delivery details for order '.$locked->order_number.'. Check the latest details before preparing the parcel.',
                        '/seller/orders?order='.$locked->id, ['order_id' => $locked->id]);
                }
            });

            return $locked;
        });
    }
}
