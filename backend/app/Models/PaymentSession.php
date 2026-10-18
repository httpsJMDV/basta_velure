<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One visit to the sandbox e-wallet or card gateway for the unpaid orders of a checkout. No real money moves: the
 * page offers success, decline and cancel, and the gateway calls back once per session.
 */
class PaymentSession extends Model
{
    /** Unpaid e-wallet and card orders are cancelled this long after they were placed (A6). */
    public const PAY_WITHIN_MINUTES = 60;

    protected $fillable = [
        'buyer_id', 'checkout_group_id', 'token', 'method', 'amount', 'status', 'gateway_reference', 'failure_reason',
        'expires_at', 'paid_at',
    ];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'expires_at' => 'datetime', 'paid_at' => 'datetime'];
    }

    public function buyer(): BelongsTo { return $this->belongsTo(User::class, 'buyer_id'); }

    public function orders(): HasMany { return $this->hasMany(Order::class, 'checkout_group_id', 'checkout_group_id'); }
}
