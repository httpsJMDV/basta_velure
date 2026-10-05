<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * RiderPickupDecline Model
 *
 * Records a courier's individual decline of an available parcel pickup request,
 * hiding the parcel from their view without affecting other couriers.
 *
 * @property int $id
 * @property int $rider_id
 * @property int $parcel_id
 * @property \Carbon\Carbon|null $created_at
 *
 * @property-read \App\Models\Rider $rider
 * @property-read \App\Models\Parcel $parcel
 */
class RiderPickupDecline extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $table = 'rider_pickup_declines';

    protected $fillable = [
        'rider_id',
        'parcel_id',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'rider_id');
    }

    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class, 'parcel_id');
    }
}

