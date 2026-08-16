<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Review extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'buyer_id', 'product_id', 'order_id', 'rating', 'comment',
        'verified_purchase', 'flagged', 'flag_reason', 'moderation_status',
    ];

    protected function casts(): array
    {
        return [
            'verified_purchase' => 'boolean',
            'flagged'           => 'boolean',
        ];
    }

    public function buyer(): BelongsTo { return $this->belongsTo(User::class, 'buyer_id'); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}
