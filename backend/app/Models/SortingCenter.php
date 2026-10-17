<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * SortingCenter Model
 *
 * Represents a logistics/sorting hub responsible for parcel intake,
 * geographic destination sorting, and area-based rider delivery dispatch.
 *
 * @property int $id
 * @property int|null $user_id
 * @property string $hub_name
 * @property string|null $address_province
 * @property string|null $address_city
 * @property string|null $address_barangay
 * @property string|null $address_street
 * @property string|null $dti_permit_path
 * @property array|null $coverage_barangays
 * @property string $status
 * @property string|null $rejection_reason
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 *
 * @property-read \App\Models\User|null $user
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Parcel> $parcels
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\RiderAreaAssignment> $riderAreaAssignments
 */
class SortingCenter extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUS_PENDING = 'PENDING';
    public const STATUS_APPROVED = 'APPROVED';
    public const STATUS_REJECTED = 'REJECTED';
    public const STATUS_SUSPENDED = 'SUSPENDED';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
        self::STATUS_SUSPENDED,
    ];

    /** GCash numbers are only sent where a screen needs them. */
    protected $hidden = ['gcash_number'];

    protected $fillable = [
        'gcash_number',
        'gcash_name',
        'logistics_company_id',
        'user_id',
        'hub_name',
        'name',
        'address_province',
        'address_city',
        'address_barangay',
        'address_street',
        'dti_permit_path',
        'coverage_barangays',
        'status',
        'rejection_reason',
        'reviewed_by',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'gcash_number' => 'encrypted',
            'coverage_barangays' => 'array',
            'reviewed_at'        => 'datetime',
        ];
    }

    public function getNameAttribute(): ?string
    {
        return $this->attributes['hub_name'] ?? null;
    }

    public function setNameAttribute($value): void
    {
        $this->attributes['hub_name'] = $value;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /** The courier company this hub belongs to (null reads as the default courier). */
    public function logisticsCompany(): BelongsTo
    {
        return $this->belongsTo(LogisticsCompany::class);
    }

    public function parcels(): HasMany
    {
        return $this->hasMany(Parcel::class, 'sorting_center_id');
    }

    /**
     * Name and address of this hub as shown to riders (where to drop off or collect parcels).
     *
     * @return array<string, string>
     */
    public function riderFacingPayload(): array
    {
        return [
            'hub_name'     => (string) $this->hub_name,
            'street'       => (string) ($this->address_street ?? ''),
            'barangay'     => (string) ($this->address_barangay ?? ''),
            'city'         => (string) ($this->address_city ?? ''),
            'province'     => (string) ($this->address_province ?? ''),
            'full_address' => implode(', ', array_filter([
                $this->address_street,
                $this->address_barangay,
                $this->address_city,
                $this->address_province,
            ])),
        ];
    }

    public function riderAreaAssignments(): HasMany
    {
        return $this->hasMany(RiderAreaAssignment::class, 'sorting_center_id');
    }

    public function riders(): HasMany
    {
        return $this->hasMany(Rider::class, 'sorting_center_id');
    }
}
