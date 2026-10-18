<?php

namespace App\Models;

use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property int $buyer_id
 * @property string $order_number
 * @property float|string $subtotal
 * @property float|string $shipping_fee
 * @property float|string $total
 * @property \App\Enums\OrderStatus|string $status
 * @property-read \App\Models\User|null $seller
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\OrderItem> $items
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\OrderStatusHistory> $statusHistories
 */
class Order extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'settlement',
        'courier_fee',
        'free_delivery',
        'logistics_company_id', 'buyer_id', 'checkout_group_id', 'order_number', 'subtotal', 'shipping_fee',
        'total', 'payment_method', 'payment_status', 'status',
        'payment_reference', 'payment_proof_path', 'payment_verified_at',
        'payment_verified_by', 'verification_rejection_reason',
        'shipping_name', 'shipping_phone', 'shipping_address',
        'shipping_province', 'shipping_city', 'shipping_barangay',
        'shipping_province_code', 'shipping_city_code', 'shipping_barangay_code', 'notes', 'completed_at',
        'store_voucher_id', 'store_voucher_discount', 'platform_voucher_id', 'platform_voucher_discount',
        'shipping_voucher_id', 'shipping_voucher_discount', 'promo_discount', 'total_weight_grams', 'chargeable_weight_kg',
        'shipping_route', 'payment_due_at', 'paid_at', 'cancel_reason', 'cancelled_by', 'cancelled_at', 'refund_status',
        'refund_amount', 'refunded_at',
    ];

    /** Paid through the sandbox e-wallet or card gateway: Loved-IT holds the money and pays the shop out. */
    public const GATEWAY_METHODS = ['e_wallet', 'card'];

    /** Prepaid: the buyer paid before delivery, so a cancellation or return is refunded. */
    public function isPrepaid(): bool
    {
        return in_array($this->payment_method, [...self::GATEWAY_METHODS, 'gcash'], true) && $this->payment_status === 'paid';
    }

    /** Waiting for an e-wallet or card payment ("To Pay"). */
    public function awaitingPayment(): bool
    {
        $status = $this->status instanceof OrderStatus ? $this->status->value : (string) $this->status;

        return in_array($this->payment_method, self::GATEWAY_METHODS, true)
            && in_array($this->payment_status, ['pending', 'failed'], true)
            && $status === OrderStatus::PLACED->value;
    }

    protected function casts(): array
    {
        return [
            'courier_fee' => 'decimal:2',
            'free_delivery' => 'boolean',
            'status'              => OrderStatus::class,
            'subtotal'            => 'decimal:2',
            'shipping_fee'        => 'decimal:2',
            'total'               => 'decimal:2',
            'payment_verified_at' => 'datetime',
            'completed_at'        => 'datetime',
            'store_voucher_discount'    => 'decimal:2',
            'platform_voucher_discount' => 'decimal:2',
            'shipping_voucher_discount' => 'decimal:2',
            'promo_discount'            => 'decimal:2',
            'refund_amount'             => 'decimal:2',
            'payment_due_at'            => 'datetime',
            'paid_at'                   => 'datetime',
            'cancelled_at'              => 'datetime',
            'refunded_at'               => 'datetime',
        ];
    }

    public function buyer(): BelongsTo           { return $this->belongsTo(User::class, 'buyer_id'); }
    public function verifiedBy(): BelongsTo      { return $this->belongsTo(User::class, 'payment_verified_by'); }
    /** Orders placed before direct payments: the platform held the money and paid the shop out. */
    public const SETTLEMENT_PLATFORM = 'platform';
    /** Buyers pay the shop's GCash or the rider; couriers and shops settle between themselves. */
    public const SETTLEMENT_DIRECT = 'direct';

    /** What the courier earns for this order: the flat fee, even when the shop gave free delivery. */
    public function courierFeeAmount(): string
    {
        return (string) ($this->courier_fee ?? $this->shipping_fee ?? '0.00');
    }

    public function seller(): HasOneThrough      { return $this->hasOneThrough(User::class, OrderItem::class, 'order_id', 'id', 'id', 'seller_id'); }
    public function items(): HasMany             { return $this->hasMany(OrderItem::class); }
    public function payment(): HasOne            { return $this->hasOne(Payment::class); }
    public function dispute(): HasOne            { return $this->hasOne(Dispute::class); }
    public function parcel(): HasOne             { return $this->hasOne(Parcel::class); }
    /** The courier assigned at checkout by CourierAssigner (null reads as the default courier). */
    public function logisticsCompany(): BelongsTo { return $this->belongsTo(LogisticsCompany::class); }
    public function statusHistories(): HasMany   { return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at', 'asc'); }
}
