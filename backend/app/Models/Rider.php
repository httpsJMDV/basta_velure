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
 * @property \Carbon\Carbon|null $vehicle_updated_at
 * @property string|null $or_cr_path
 * @property string|null $drivers_license_path
 * @property string $status
 * @property string|null $rejection_reason
 * @property int|null $reviewed_by
 * @property \Carbon\Carbon|null $reviewed_at
 * @property \Carbon\Carbon|null $submitted_at
 * @property \Carbon\Carbon|null $applied_at
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
    /** Added by the courier company; the rider has not set a password from the activation email yet (A13). */
    public const STATUS_PENDING_ACTIVATION = 'PENDING_ACTIVATION';
    /** Suspended by the courier company: cannot go Online or receive jobs (A34). */
    public const STATUS_SUSPENDED = 'SUSPENDED';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_ACTIVE,
        self::STATUS_DISAPPROVED,
        self::STATUS_PENDING_ACTIVATION,
        self::STATUS_SUSPENDED,
    ];

    /** A rider holds at most this many active jobs (pickups and deliveries not yet finished, A14). */
    public const MAX_ACTIVE_JOBS = 3;

    /** An Online rider whose app has not been heard from for this long counts as Offline (session timeout, A22). */
    public const PRESENCE_TIMEOUT_MINUTES = 30;

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

    /** GCash numbers are only sent where a screen needs them. */
    protected $hidden = ['gcash_number'];

    protected $fillable = [
        'gcash_number',
        'gcash_name',
        'user_id',
        'sorting_center_id',
        'vehicle_type',
        'plate_number',
        'vehicle_updated_at',
        'last_latitude',
        'last_longitude',
        'last_heading',
        'last_accuracy_m',
        'last_located_at',
        'or_cr_path',
        'drivers_license_path',
        'status',
        'rejection_reason',
        'reviewed_by',
        'reviewed_at',
        'submitted_at',
        'applied_at',
        'logistics_company_id',
        'license_number',
        'license_expiry',
        'activation_token_hash',
        'activation_sent_at',
        'activation_expires_at',
        'activated_at',
        'is_online',
        'online_at',
        'last_seen_at',
        'needs_reverification',
        'suspended_at',
        'suspension_reason',
    ];

    protected function casts(): array
    {
        return [
            'gcash_number' => 'encrypted',
            'reviewed_at'  => 'datetime',
            'vehicle_updated_at' => 'datetime',
            'last_located_at'    => 'datetime',
            'submitted_at' => 'datetime',
            'applied_at' => 'datetime',
            'license_expiry' => 'date',
            'activation_sent_at' => 'datetime',
            'activation_expires_at' => 'datetime',
            'activated_at' => 'datetime',
            'is_online' => 'boolean',
            'online_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'needs_reverification' => 'boolean',
            'suspended_at' => 'datetime',
        ];
    }

    /** The courier company the rider works for: the one that added them, else their hub's company. */
    public function company(): BelongsTo
    {
        return $this->belongsTo(LogisticsCompany::class, 'logistics_company_id');
    }

    public function companyId(): ?int
    {
        return $this->logistics_company_id
            ?? LogisticsCompany::effectiveId($this->sortingCenter?->logistics_company_id);
    }

    /**
     * Applied on the public form and not decided yet: Pending, with no password until the hub or the courier approves
     * them and they set one from the activation email.
     */
    public function isApplicant(): bool
    {
        return $this->applied_at !== null && $this->activated_at === null && $this->status === self::STATUS_PENDING;
    }

    /** Online now: switched Online, Active, and heard from within the presence timeout. */
    public function isAvailable(): bool
    {
        return $this->status === self::STATUS_ACTIVE
            && $this->is_online
            && $this->last_seen_at !== null
            && $this->last_seen_at->greaterThan(now()->subMinutes(self::PRESENCE_TIMEOUT_MINUTES));
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
