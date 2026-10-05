<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Rider Model
 *
 * Represents an express courier / delivery rider registered under a sorting center hub.
 *
 * @property int $id
 * @property int $user_id
 * @property int|null $sorting_center_id
 * @property string $vehicle_type
 * @property string|null $plate_number
 * @property string|null $or_cr_path
 * @property string|null $drivers_license_path
 * @property string $status
 * @property string|null $rejection_reason
 * @property int|null $reviewed_by
 * @property \Carbon\Carbon|null $reviewed_at
 * @property \Carbon\Carbon|null $submitted_at
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 *
 * @property-read \App\Models\User $user
 * @property-read \App\Models\SortingCenter|null $sortingCenter
 * @property-read \App\Models\User|null $reviewer
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\RiderAreaAssignment> $areas
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\RiderAreaAssignment> $areaAssignments
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Parcel> $parcels
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Parcel> $pickupParcels
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\RiderEarning> $earnings
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\DeliveryLog> $deliveryLogs
 */
class Rider extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUS_PENDING = 'PENDING';
    public const STATUS_ACTIVE = 'ACTIVE';
    public const STATUS_DISAPPROVED = 'DISAPPROVED';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_ACTIVE,
        self::STATUS_DISAPPROVED,
    ];

    public const VEHICLE_MOTORCYCLE = 'Motorcycle';
    public const VEHICLE_TRICYCLE   = 'Tricycle';
    public const VEHICLE_CAR        = 'Car';
    public const VEHICLE_VAN        = 'Van';

    public const VEHICLE_TYPES = [
        self::VEHICLE_MOTORCYCLE,
        self::VEHICLE_TRICYCLE,
        self::VEHICLE_CAR,
        self::VEHICLE_VAN,
    ];

    protected $fillable = [
        'user_id',
        'sorting_center_id',
        'vehicle_type',
        'plate_number',
        'or_cr_path',
        'drivers_license_path',
        'status',
        'rejection_reason',
        'reviewed_by',
        'reviewed_at',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at'  => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sortingCenter(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function areas(): HasMany
    {
        return $this->hasMany(RiderAreaAssignment::class, 'rider_id');
    }

    public function areaAssignments(): HasMany
    {
        return $this->hasMany(RiderAreaAssignment::class, 'rider_id');
    }

    public function parcels(): HasMany
    {
        return $this->hasMany(Parcel::class, 'assigned_rider_id');
    }

    public function pickupParcels(): HasMany
    {
        return $this->hasMany(Parcel::class, 'pickup_rider_id');
    }

    public function earnings(): HasMany
    {
        return $this->hasMany(RiderEarning::class, 'rider_id');
    }

    public function deliveryLogs(): HasMany
    {
        return $this->hasMany(DeliveryLog::class, 'rider_id');
    }

    public function pickupDeclines(): HasMany
    {
        return $this->hasMany(RiderPickupDecline::class, 'rider_id');
    }
}
