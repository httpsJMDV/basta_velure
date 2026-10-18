<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A photo the buyer attached to a return request as evidence (A31). */
class DisputePhoto extends Model
{
    protected $fillable = ['dispute_id', 'path', 'sort_order'];

    public function dispute(): BelongsTo { return $this->belongsTo(Dispute::class); }

    public function url(): string
    {
        return asset('storage/' . $this->path);
    }
}
