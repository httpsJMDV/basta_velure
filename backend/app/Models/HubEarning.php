<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * The logistics hub's share of the delivery fee for one delivered parcel (the rider's share is a RiderEarning).
 *
 * @property int $id
 * @property int $sorting_center_id
 * @property int|null $parcel_id
 * @property string $amount
 * @property \Carbon\Carbon $earned_at
 * @property string|null $notes
 */
class HubEarning extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'hub_earnings';

    protected $fillable = [
        'sorting_center_id',
        'parcel_id',
        'amount',
        'earned_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount'    => 'decimal:2',
            'earned_at' => 'datetime',
        ];
    }

    public function sortingCenter(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id');
    }

    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class, 'parcel_id');
    }
}
