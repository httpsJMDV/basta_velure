<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        'order_id', 'method', 'reference_number', 'amount', 'status', 'paid_at',
        'payment_session_id', 'gateway_reference', 'refund_amount', 'refunded_at',
    ];

    protected function casts(): array
    {
        return [
            'amount'        => 'decimal:2',
            'paid_at'       => 'datetime',
            'refund_amount' => 'decimal:2',
            'refunded_at'   => 'datetime',
        ];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}
