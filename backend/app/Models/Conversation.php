<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Conversation extends Model
{
    // Feature 2.10 rider delivery threads: one parcel, the rider and one counterpart.
    public const TYPE_RIDER_SELLER = 'rider_seller';
    public const TYPE_RIDER_BUYER = 'rider_buyer';
    public const TYPE_RIDER_HUB = 'rider_hub';

    public const RIDER_TYPES = [
        self::TYPE_RIDER_SELLER,
        self::TYPE_RIDER_BUYER,
        self::TYPE_RIDER_HUB,
    ];

    protected $fillable = [
        'buyer_id',
        'seller_id',
        'type',
        'status',
        'subject',
        'product_id',
        'order_id',
        'parcel_id',
        'rider_id',
        'sorting_center_id',
        'last_message_at',
        'buyer_unread',
        'seller_unread',
        'admin_unread',
        'rider_unread',
        'hub_unread',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
        ];
    }

    public function isRiderThread(): bool
    {
        return in_array($this->type, self::RIDER_TYPES, true);
    }

    public function buyer(): BelongsTo    { return $this->belongsTo(User::class, 'buyer_id'); }
    public function seller(): BelongsTo   { return $this->belongsTo(User::class, 'seller_id'); }
    public function product(): BelongsTo  { return $this->belongsTo(Product::class, 'product_id'); }
    public function order(): BelongsTo    { return $this->belongsTo(Order::class, 'order_id'); }
    public function parcel(): BelongsTo   { return $this->belongsTo(Parcel::class, 'parcel_id'); }
    public function rider(): BelongsTo    { return $this->belongsTo(User::class, 'rider_id'); }
    public function sortingCenter(): BelongsTo { return $this->belongsTo(SortingCenter::class, 'sorting_center_id'); }
    public function messages(): HasMany  { return $this->hasMany(Message::class); }
    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }
}
