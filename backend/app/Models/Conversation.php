<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Conversation extends Model
{
    protected $fillable = [
        'buyer_id',
        'seller_id',
        'type',
        'status',
        'subject',
        'product_id',
        'order_id',
        'last_message_at',
        'buyer_unread',
        'seller_unread',
        'admin_unread',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
        ];
    }

    public function buyer(): BelongsTo    { return $this->belongsTo(User::class, 'buyer_id'); }
    public function seller(): BelongsTo   { return $this->belongsTo(User::class, 'seller_id'); }
    public function product(): BelongsTo  { return $this->belongsTo(Product::class, 'product_id'); }
    public function order(): BelongsTo    { return $this->belongsTo(Order::class, 'order_id'); }
    public function messages(): HasMany  { return $this->hasMany(Message::class); }
    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }
}

