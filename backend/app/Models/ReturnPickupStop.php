<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One hub on a returned item's way back to the shop. The first stop is the hub its rider dropped it at (the one that
 * delivered the order); the last is the hub whose rider hands it to the shop.
 *
 * @property int $id
 * @property int $return_pickup_id
 * @property int $position
 * @property int $sorting_center_id
 * @property int|null $truck_trip_id the truck, ship or plane carrying it to this stop
 * @property string $mode how it travels to this stop: truck, sea or air
 * @property \Carbon\Carbon|null $arrived_at
 * @property \Carbon\Carbon|null $departed_at
 */
class ReturnPickupStop extends Model
{
    protected $fillable = ['return_pickup_id', 'position', 'sorting_center_id', 'truck_trip_id', 'mode', 'arrived_at', 'departed_at'];

    protected function casts(): array
    {
        return ['position' => 'integer', 'arrived_at' => 'datetime', 'departed_at' => 'datetime'];
    }

    public function returnPickup(): BelongsTo
    {
        return $this->belongsTo(ReturnPickup::class);
    }

    public function hub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id')->withTrashed();
    }

    public function truckTrip(): BelongsTo
    {
        return $this->belongsTo(TruckTrip::class);
    }
}
