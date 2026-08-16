<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id', 'seller_id', 'product_name', 'variant_label',
        'unit_price', 'quantity', 'subtotal', 'image_url',
    ];

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2',
            'subtotal'   => 'decimal:2',
        ];
    }

    public function order(): BelongsTo  { return $this->belongsTo(Order::class); }
    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }
}
