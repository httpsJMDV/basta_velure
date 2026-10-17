<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Cash a rider hands to their courier company (A24). The rider submits it (Pending); only the company confirms it,
 * and only then does the rider's COD balance go down.
 *
 * @property int $id
 * @property int $rider_id
 * @property int|null $logistics_company_id
 * @property string $amount
 * @property string $balance_at_submission
 * @property string $status
 * @property string|null $reference
 * @property \Carbon\Carbon $submitted_at
 * @property int|null $confirmed_by
 * @property \Carbon\Carbon|null $confirmed_at
 */
class CodRemittance extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_CONFIRMED = 'confirmed';

    protected $fillable = [
        'rider_id', 'logistics_company_id', 'amount', 'balance_at_submission', 'status', 'reference', 'note',
        'submitted_at', 'confirmed_by', 'confirmed_at', 'idempotency_key',
    ];

    protected function casts(): array
    {
        return [
            'amount'                => 'decimal:2',
            'balance_at_submission' => 'decimal:2',
            'submitted_at'          => 'datetime',
            'confirmed_at'          => 'datetime',
        ];
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(Rider::class);
    }

    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }
}
