<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One pickup job offered to one rider (A14): it lasts 60 seconds; the rider accepts or declines it, or it expires and
 * the job is offered to the next nearest eligible rider.
 *
 * @property int $id
 * @property int $parcel_id
 * @property int $rider_id
 * @property string $status
 * @property float|null $distance_km
 * @property \Carbon\Carbon $offered_at
 * @property \Carbon\Carbon $expires_at
 * @property \Carbon\Carbon|null $responded_at
 */
class DispatchOffer extends Model
{
    public const STATUS_OFFERED = 'offered';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_DECLINED = 'declined';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    /** Seconds an offer stays open. */
    public const TTL_SECONDS = 60;

    /** Declined or expired offers before the job goes to the Unassigned queue. */
    public const MAX_ATTEMPTS = 3;

    protected $fillable = ['parcel_id', 'rider_id', 'status', 'distance_km', 'offered_at', 'expires_at', 'responded_at'];

    protected function casts(): array
    {
        return [
            'distance_km'  => 'float',
            'offered_at'   => 'datetime',
            'expires_at'   => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class);
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(Rider::class);
    }
}
