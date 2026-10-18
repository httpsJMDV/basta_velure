<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\PaymentSession;

/** An order as the buyer sees it: in the list, in the details panel, and in the checkout response. */
class BuyerOrderPresenter
{
    /** Buyer tabs (A10): To Pay, To Ship, To Receive, Completed, Cancelled, Return/Refund. */
    public const TABS = ['to_pay', 'to_ship', 'to_receive', 'completed', 'cancelled', 'return_refund'];

    public const TO_SHIP = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'];
    public const TO_RECEIVE = ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED'];

    /** The tab an order is in. */
    public static function tab(Order $o): string
    {
        $status = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;
        if ($o->awaitingPayment()) {
            return 'to_pay';
        }

        return match (true) {
            in_array($status, self::TO_SHIP, true)    => 'to_ship',
            in_array($status, self::TO_RECEIVE, true) => 'to_receive',
            $status === 'COMPLETED'                   => 'completed',
            $status === 'CANCELLED'                   => 'cancelled',
            default                                   => 'return_refund',
        };
    }

    /** Narrows an order query to one tab. */
    public static function scopeTab($query, string $tab)
    {
        $gateway = Order::GATEWAY_METHODS;
        $unpaid = fn ($q) => $q->whereIn('payment_method', $gateway)->whereIn('payment_status', ['pending', 'failed'])->where('status', 'PLACED');

        return match ($tab) {
            'to_pay'        => $query->where($unpaid),
            'to_ship'       => $query->whereIn('status', self::TO_SHIP)->whereNot($unpaid),
            'to_receive'    => $query->whereIn('status', self::TO_RECEIVE),
            'completed'     => $query->where('status', 'COMPLETED'),
            'cancelled'     => $query->where('status', 'CANCELLED'),
            'return_refund' => $query->whereIn('status', ['DISPUTED', 'RETURNED']),
            default         => $query,
        };
    }

    public static function present(Order $o, bool $detail = false): array
    {
        $statusStr = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;
        $parcel = $o->relationLoaded('parcel') ? $o->parcel : $o->parcel()->first();
        $deliveredAt = $parcel?->delivered_at;
        $autoCompleteAt = ($statusStr === OrderStatus::DELIVERED->value && $deliveredAt)
            ? $deliveredAt->copy()->addDays(max(0, (int) config('orders.auto_complete_days', 7)))
            : null;
        $session = $o->awaitingPayment()
            ? PaymentSession::where('checkout_group_id', $o->checkout_group_id)->where('status', 'pending')->where('expires_at', '>', now())->latest('id')->first()
            : null;
        $dispute = $o->relationLoaded('dispute') ? $o->dispute : $o->dispute()->first();

        return [
            'id'                  => $o->id,
            'checkout_group_id'   => $o->checkout_group_id,
            'order_number'        => $o->order_number,
            'tracking_number'     => $parcel?->tracking_number,
            'courier'             => LogisticsCompany::summaryFor($o->logistics_company_id),
            'status'              => $statusStr,
            // A32: the 6-digit code the buyer gives the rider at the door, shown only while the parcel is out for
            // delivery and only on the buyer's own order.
            'delivery_otp'        => $parcel && $parcel->status === \App\Models\Parcel::STATUS_OUT_FOR_DELIVERY ? $parcel->delivery_otp : null,
            'delivery_attempt'    => $parcel && $parcel->delivery_attempts > 0 ? ['failed' => (int) $parcel->delivery_attempts, 'max' => \App\Services\Courier\ReturnToSender::maxAttempts()] : null,
            'returning_to_seller' => $parcel?->status === \App\Models\Parcel::STATUS_RETURN_TO_SENDER,
            'tab'                 => self::tab($o),
            'payment_method'      => $o->payment_method,
            'payment_status'      => $o->payment_status,
            'payment_reference'   => $o->payment_reference,
            'payment_proof_url'   => $o->payment_proof_path ? asset('storage/' . $o->payment_proof_path) : null,
            'payment_verified_at' => $o->payment_verified_at?->toIso8601String(),
            'payment_due_at'      => $o->payment_due_at?->toIso8601String(),
            'paid_at'             => $o->paid_at?->toIso8601String(),
            'payment_token'       => $session?->token,
            'rejection_reason'    => $o->verification_rejection_reason,
            'subtotal'            => (float) $o->subtotal,
            'promo_discount'      => (float) $o->promo_discount,
            'store_voucher_discount'    => (float) $o->store_voucher_discount,
            'platform_voucher_discount' => (float) $o->platform_voucher_discount,
            'shipping_voucher_discount' => (float) $o->shipping_voucher_discount,
            'vouchers'            => self::vouchers($o),
            'shipping_fee'        => (float) $o->shipping_fee,
            'chargeable_weight_kg' => $o->chargeable_weight_kg,
            'shipping_route'      => $o->shipping_route,
            'free_delivery'       => (bool) $o->free_delivery,
            'settlement'          => $o->settlement ?? Order::SETTLEMENT_PLATFORM,
            'total'               => (float) $o->total,
            'shipping_name'       => $o->shipping_name,
            'shipping_phone'      => $o->shipping_phone,
            'shipping_address'    => $o->shipping_address,
            'shipping_province'   => $o->shipping_province,
            'shipping_city'       => $o->shipping_city,
            'shipping_barangay'   => $o->shipping_barangay,
            'notes'               => $o->notes,
            'created_at'          => $o->created_at?->toIso8601String(),
            'delivered_at'        => $deliveredAt?->toIso8601String(),
            'auto_complete_at'    => $autoCompleteAt?->toIso8601String(),
            'completed_at'        => $o->completed_at?->toIso8601String(),
            'cancel_reason'       => $o->cancel_reason,
            'cancelled_by'        => $o->cancelled_by,
            'cancelled_at'        => $o->cancelled_at?->toIso8601String(),
            'refund_status'       => $o->refund_status,
            'refund_amount'       => $o->refund_amount !== null ? (float) $o->refund_amount : null,
            'refunded_at'         => $o->refunded_at?->toIso8601String(),
            'can_cancel'          => OrderCanceller::canBuyerCancel($o),
            'can_return'          => ReturnService::unavailableReason($o) === null,
            'return_unavailable_reason' => $statusStr === OrderStatus::DELIVERED->value ? ReturnService::unavailableReason($o) : null,
            'return_window_ends_at' => $deliveredAt ? $deliveredAt->copy()->addDays(\App\Models\PlatformSetting::returnWindowDays())->toIso8601String() : null,
            'delivery_proof_available' => (bool) $parcel?->delivery_proof_path,
            'delivery_proof_count'     => (int) (bool) $parcel?->delivery_proof_path + (int) (bool) $parcel?->delivery_proof_path_2,
            'items'               => $o->items->map(fn ($i) => [
                'id'            => $i->id,
                'product_id'    => $i->product_id,
                'seller_id'     => $i->seller_id,
                'shop_name'     => $i->seller?->sellerProfile?->shop_name ?? ($i->seller?->first_name . "'s Shop"),
                'product_name'  => $i->product_name,
                'variant_label' => $i->variant_label,
                'unit_price'    => (float) $i->unit_price,
                'regular_unit_price' => $i->regular_unit_price !== null ? (float) $i->regular_unit_price : null,
                'price_source'  => $i->price_source,
                'is_gift'       => (bool) $i->is_gift,
                'promo_share'   => (float) $i->promo_share,
                'quantity'      => $i->quantity,
                'subtotal'      => (float) $i->subtotal,
                'image_url'     => $i->image_url,
            ])->values(),
            'dispute'             => ReturnService::present($dispute),
            'status_history'      => ($detail || $o->relationLoaded('statusHistories')) ? $o->statusHistories->map(fn ($h) => [
                'id'          => $h->id,
                'from_status' => $h->from_status,
                'to_status'   => $h->to_status,
                'actor_type'  => $h->actor_type,
                'note'        => $h->note,
                'created_at'  => $h->created_at?->toIso8601String(),
            ])->values() : [],
        ];
    }

    /** The vouchers used on an order, as the buyer saw them at checkout. */
    private static function vouchers(Order $o): array
    {
        $ids = array_filter([$o->store_voucher_id, $o->platform_voucher_id, $o->shipping_voucher_id]);
        if ($ids === []) {
            return [];
        }
        $codes = \App\Models\Voucher::whereIn('id', $ids)->pluck('code', 'id');
        $rows = [];
        foreach ([['store', $o->store_voucher_id, $o->store_voucher_discount], ['platform', $o->platform_voucher_id, $o->platform_voucher_discount], ['shipping', $o->shipping_voucher_id, $o->shipping_voucher_discount]] as [$scope, $id, $amount]) {
            if ($id) {
                $rows[] = ['scope' => $scope, 'code' => $codes[$id] ?? null, 'discount' => (float) $amount];
            }
        }

        return $rows;
    }
}
