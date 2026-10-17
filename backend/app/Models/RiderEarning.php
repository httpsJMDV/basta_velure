<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * RiderEarning Model
 *
 * Tracks individual delivery fee earnings earned by couriers.
 *
 * @property int $id
 * @property int $rider_id
 * @property int|null $parcel_id
 * @property string $kind  pickup (seller to hub) or delivery (hub to buyer)
 * @property string $amount
 * @property \Carbon\Carbon $earned_at
 * @property string|null $notes
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 *
 * @property-read \App\Models\Rider $rider
 * @property-read \App\Models\Parcel|null $parcel
 */
class RiderEarning extends Model
{
    use HasFactory, SoftDeletes;

    /** Collected the parcel from the seller and brought it to the hub. */
    public const KIND_PICKUP = 'pickup';
    /** Delivered the parcel from the hub to the buyer. */
    public const KIND_DELIVERY = 'delivery';

    protected $table = 'rider_earnings';

    protected $fillable = [
        'paid_at',
        'paid_reference',
        'rider_id',
        'parcel_id',
        'kind',
        'amount',
        'earned_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'amount'    => 'decimal:2',
            'earned_at' => 'datetime',
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
