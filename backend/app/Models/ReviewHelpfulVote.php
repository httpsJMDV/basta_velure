<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One account saying a product review helped them (one per account per review). */
class ReviewHelpfulVote extends Model
{
    protected $fillable = ['review_id', 'user_id'];

    public function review(): BelongsTo
    {
        return $this->belongsTo(Review::class);
    }
}
