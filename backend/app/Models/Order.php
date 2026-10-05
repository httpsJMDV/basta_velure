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
        'buyer_id', 'checkout_group_id', 'order_number', 'subtotal', 'shipping_fee',
        'total', 'payment_method', 'payment_status', 'status',
        'payment_reference', 'payment_proof_path', 'payment_verified_at',
        'payment_verified_by', 'verification_rejection_reason',
        'shipping_name', 'shipping_phone', 'shipping_address',
        'shipping_province', 'shipping_city', 'shipping_barangay',
        'shipping_province_code', 'shipping_city_code', 'shipping_barangay_code', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'status'              => OrderStatus::class,
            'subtotal'            => 'decimal:2',
            'shipping_fee'        => 'decimal:2',
            'total'               => 'decimal:2',
            'payment_verified_at' => 'datetime',
        ];
    }

    public function buyer(): BelongsTo           { return $this->belongsTo(User::class, 'buyer_id'); }
    public function verifiedBy(): BelongsTo      { return $this->belongsTo(User::class, 'payment_verified_by'); }
    public function seller(): HasOneThrough      { return $this->hasOneThrough(User::class, OrderItem::class, 'order_id', 'id', 'id', 'seller_id'); }
    public function items(): HasMany             { return $this->hasMany(OrderItem::class); }
    public function payment(): HasOne            { return $this->hasOne(Payment::class); }
    public function dispute(): HasOne            { return $this->hasOne(Dispute::class); }
    public function parcel(): HasOne             { return $this->hasOne(Parcel::class); }
    public function statusHistories(): HasMany   { return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at', 'asc'); }
}
