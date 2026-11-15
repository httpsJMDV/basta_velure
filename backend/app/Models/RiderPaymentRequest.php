<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RiderPaymentRequest extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['receipt_path'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'sent_at' => 'datetime', 'completed_at' => 'datetime', 'breakdown' => 'array'];
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(Rider::class)->withTrashed();
    }

    public function hub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id')->withTrashed();
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by')->withTrashed();
    }
}
