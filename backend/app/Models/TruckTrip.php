<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One truck going from one hub to another with the parcels the sending hub loaded (the courier's line-haul).
 *
 * on_the_way → completed (the next hub scanned in every parcel) or closed (the courier closed it with parcels still
 * missing). The driver is owed pay_amount once the trip is completed or closed; the courier pays it and marks it paid.
 *
 * @property int $id
 * @property string $code
 * @property int|null $logistics_company_id
 * @property int $from_hub_id
 * @property int $to_hub_id
 * @property int $driver_id
 * @property string|null $plate_number
 * @property string $status
 * @property int $parcel_count
 * @property int $received_count
 * @property int|null $created_by
 * @property \Carbon\Carbon|null $departed_at
 * @property \Carbon\Carbon|null $driver_arrived_at
 * @property \Carbon\Carbon|null $completed_at
 * @property string|null $close_reason
 * @property string $pay_amount
 * @property \Carbon\Carbon|null $paid_at
 * @property int|null $paid_by
 * @property string|null $paid_reference
 */
class TruckTrip extends Model
{
    public const STATUS_ON_THE_WAY = 'on_the_way';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_CLOSED = 'closed';

    protected $fillable = [
        'code', 'logistics_company_id', 'from_hub_id', 'to_hub_id', 'driver_id', 'plate_number', 'status',
        'parcel_count', 'received_count', 'created_by', 'departed_at', 'driver_arrived_at', 'completed_at',
        'close_reason', 'pay_amount', 'paid_at', 'paid_by', 'paid_reference',
    ];

    protected function casts(): array
    {
        return [
            'parcel_count'      => 'integer',
            'received_count'    => 'integer',
            'departed_at'       => 'datetime',
            'driver_arrived_at' => 'datetime',
            'completed_at'      => 'datetime',
            'paid_at'           => 'datetime',
            'pay_amount'        => 'decimal:2',
        ];
    }

    public function fromHub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'from_hub_id')->withTrashed();
    }

    public function toHub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'to_hub_id')->withTrashed();
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'driver_id')->withTrashed();
    }

    public function stops(): HasMany
    {
        return $this->hasMany(ParcelHubStop::class);
    }

    public function isFinished(): bool
    {
        return in_array($this->status, [self::STATUS_COMPLETED, self::STATUS_CLOSED], true);
    }

    /** Finished and not yet paid: the courier owes the driver for it. */
    public function scopeUnpaid(Builder $query): Builder
    {
        return $query->whereIn('status', [self::STATUS_COMPLETED, self::STATUS_CLOSED])->whereNull('paid_at');
    }
}
