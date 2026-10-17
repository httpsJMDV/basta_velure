<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One month of commission a shop paid Loved-IT by GCash on its completed direct orders; an admin confirms it. */
class CommissionPayment extends Model
{
    protected $fillable = ['seller_id', 'period', 'orders_count', 'amount', 'reference', 'paid_at', 'confirmed_at', 'confirmed_by'];

    protected function casts(): array
    {
        return [
            'period'       => 'date',
            'amount'       => 'decimal:2',
            'paid_at'      => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }
}
