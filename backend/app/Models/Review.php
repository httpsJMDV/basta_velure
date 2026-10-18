<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Review extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'buyer_id', 'product_id', 'order_id', 'order_item_id', 'variant_label', 'rating', 'comment', 'edit_count',
        'verified_purchase', 'flagged', 'flag_reason', 'moderation_status',
        'seller_reply', 'seller_replied_at', 'seller_reply_edited_at',
    ];

    protected function casts(): array
    {
        return [
            'verified_purchase'      => 'boolean',
            'flagged'                => 'boolean',
            'edit_count'             => 'integer',
            'seller_replied_at'      => 'datetime',
            'seller_reply_edited_at' => 'datetime',
        ];
    }

    public function buyer(): BelongsTo { return $this->belongsTo(User::class, 'buyer_id'); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function images(): HasMany    { return $this->hasMany(ReviewImage::class)->orderBy('sort_order'); }

    /** Public URLs of the review's photos, in order. @return array<int, string> */
    public function imageUrls(): array
    {
        return $this->images->map(fn (ReviewImage $i) => asset('storage/' . $i->path))->values()->all();
    }
}
