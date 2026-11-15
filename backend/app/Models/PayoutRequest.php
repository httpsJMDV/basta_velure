<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayoutRequest extends Model
{
    protected $fillable = [
        'seller_id',
        'reference_code',
        'amount',
        'gcash_number',
        'gcash_name',
        'status',
        'rejection_reason',
        'processed_by',
        'processed_at',
        'admin_notes', 'manual_reference_required', 'transfer_reference', 'receipt_path', 'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'amount'       => 'decimal:2',
            'processed_at' => 'datetime', 'sent_at' => 'datetime', 'manual_reference_required' => 'boolean',
        ];
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function processedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }
}

