<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A photo attached to a review (stored on the public disk under review_images/). */
class ReviewImage extends Model
{
    protected $fillable = ['review_id', 'path', 'sort_order'];

    public function review(): BelongsTo
    {
        return $this->belongsTo(Review::class);
    }
}
