<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id', 'seller_id', 'category_id', 'product_name', 'variant_label',
        'unit_price', 'quantity', 'subtotal', 'image_url',
        'commission_rate', 'commission_amount', 'seller_earnings',
        'payout_status', 'delivered_at',
    ];

    protected function casts(): array
    {
        return [
            'unit_price'        => 'decimal:2',
            'subtotal'          => 'decimal:2',
            'commission_rate'   => 'decimal:4',
            'commission_amount' => 'decimal:2',
            'seller_earnings'   => 'decimal:2',
            'delivered_at'      => 'datetime',
        ];
    }

    public function order(): BelongsTo  { return $this->belongsTo(Order::class); }
    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }
}
