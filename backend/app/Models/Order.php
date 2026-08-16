<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'buyer_id', 'order_number', 'subtotal', 'shipping_fee',
        'total', 'payment_method', 'payment_status', 'status',
    ];

    protected function casts(): array
    {
        return [
            'subtotal'     => 'decimal:2',
            'shipping_fee' => 'decimal:2',
            'total'        => 'decimal:2',
        ];
    }

    public function buyer(): BelongsTo   { return $this->belongsTo(User::class, 'buyer_id'); }
    public function items(): HasMany     { return $this->hasMany(OrderItem::class); }
    public function payment(): HasOne    { return $this->hasOne(Payment::class); }
    public function dispute(): HasOne    { return $this->hasOne(Dispute::class); }
}
