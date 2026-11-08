<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One hub on a parcel's way to the buyer. The first stop is the hub that first received it. The last is the hub that
 * delivers to the buyer's barangay.
 *
 * @property int $id
 * @property int $parcel_id
 * @property int $position
 * @property int $sorting_center_id
 * @property int|null $truck_trip_id the truck carrying the parcel to this stop
 * @property \Carbon\Carbon|null $arrived_at
 * @property \Carbon\Carbon|null $departed_at
 */
class ParcelHubStop extends Model
{
    public const DIRECTION_FORWARD = 'forward';
    public const DIRECTION_RETURN = 'return';

    protected $fillable = ['parcel_id', 'position', 'sorting_center_id', 'truck_trip_id', 'mode', 'direction', 'arrived_at', 'departed_at'];

    protected function casts(): array
    {
        return [
            'position'    => 'integer',
            'arrived_at'  => 'datetime',
            'departed_at' => 'datetime',
        ];
    }

    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class);
    }

    public function truckTrip(): BelongsTo
    {
        return $this->belongsTo(TruckTrip::class);
    }

    public function hub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id')->withTrashed();
    }
}
