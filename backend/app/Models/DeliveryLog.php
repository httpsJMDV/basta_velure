<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * DeliveryLog Model
 *
 * Records operational milestone logs and outcomes for parcel delivery by couriers.
 *
 * @property int $id
 * @property int $parcel_id
 * @property int $rider_id
 * @property string $outcome
 * @property \Carbon\Carbon $logged_at
 * @property string|null $notes
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 *
 * @property-read \App\Models\Parcel $parcel
 * @property-read \App\Models\Rider $rider
 */
class DeliveryLog extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'delivery_logs';

    public const OUTCOME_PICKED_UP = 'PICKED_UP';
    public const OUTCOME_DELIVERED = 'DELIVERED';
    public const OUTCOME_DELIVERY_FAILED = 'DELIVERY_FAILED';
    public const OUTCOME_RETURNED = 'RETURNED'; // Canonical ERP flow outcome
    public const OUTCOME_RTS = 'RETURNED'; // Backward compatibility alias

    public const OUTCOMES = [
        self::OUTCOME_PICKED_UP,
        self::OUTCOME_DELIVERED,
        self::OUTCOME_DELIVERY_FAILED,
        self::OUTCOME_RETURNED,
    ];

    protected $fillable = [
        'parcel_id',
        'rider_id',
        'outcome',
        'logged_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'logged_at' => 'datetime',
        ];
    }

    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class, 'parcel_id');
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'rider_id');
    }
}
