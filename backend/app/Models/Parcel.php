<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Parcel Model
 *
 * Represents an individual physical parcel tracked through the sorting center
 * and courier pickup/delivery lifecycle.
 *
 * @property int $id
 * @property string $tracking_number
 * @property int|null $order_id
 * @property int|null $sorting_center_id
 * @property int|null $assigned_rider_id
 * @property int|null $pickup_rider_id
 * @property string $status
 * @property string|null $destination_barangay
 * @property \Carbon\Carbon|null $picked_up_at
 * @property \Carbon\Carbon|null $scanned_in_at
 * @property \Carbon\Carbon|null $sorted_at
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 *
 * @property-read \App\Models\SortingCenter|null $sortingCenter
 * @property-read \App\Models\Order|null $order
 */
class Parcel extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUS_READY_FOR_PICKUP = 'READY_FOR_PICKUP';
    public const STATUS_PICKED_UP = 'PICKED_UP';
    public const STATUS_AT_SORTING_CENTER = 'AT_SORTING_CENTER';
    public const STATUS_SORTED = 'SORTED';
    public const STATUS_ASSIGNED_TO_RIDER = 'ASSIGNED_TO_RIDER';
    public const STATUS_OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY';
    public const STATUS_DELIVERED = 'DELIVERED';
    public const STATUS_DELIVERY_FAILED = 'DELIVERY_FAILED';
    public const STATUS_RETURNED = 'RETURNED';
    public const STATUS_RTS = 'RETURNED'; // Backward compatibility alias for RETURNED

    public const STATUSES = [
        self::STATUS_READY_FOR_PICKUP,
        self::STATUS_PICKED_UP,
        self::STATUS_AT_SORTING_CENTER,
        self::STATUS_SORTED,
        self::STATUS_ASSIGNED_TO_RIDER,
        self::STATUS_OUT_FOR_DELIVERY,
        self::STATUS_DELIVERED,
        self::STATUS_DELIVERY_FAILED,
        self::STATUS_RETURNED,
    ];

    protected $fillable = [
        'tracking_number',
        'order_id',
        'seller_id',
        'sorting_center_id',
        'assigned_rider_id',
        'pickup_rider_id',
        'status',
        'destination_barangay',
        'destination_barangay_code',
        'pickup_barangay',
        'pickup_barangay_code',
        'pickup_address_snapshot',
        'recipient_snapshot',
        'cod_amount',
        'ready_at',
        'pickup_accepted_at',
        'picked_up_at',
        'scanned_in_at',
        'sorted_at',
    ];

    protected function casts(): array
    {
        return [
            'scanned_in_at'           => 'datetime',
            'sorted_at'               => 'datetime',
            'ready_at'                => 'datetime',
            'pickup_accepted_at'      => 'datetime',
            'picked_up_at'            => 'datetime',
            'pickup_address_snapshot' => 'array',
            'recipient_snapshot'      => 'array',
            'cod_amount'              => 'decimal:2',
        ];
    }

    /**
     * Scope to parcels scanned in during the current Philippine calendar day (Asia/Manila),
     * compared against UTC-stored timestamps. Shared by the hub dashboard metrics and hub intake.
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     */
    public function scopeScannedInToday($query)
    {
        $startOfDayUtc = Carbon::now('Asia/Manila')->startOfDay()->utc();
        $endOfDayUtc = Carbon::now('Asia/Manila')->endOfDay()->utc();

        return $query->whereBetween('scanned_in_at', [$startOfDayUtc, $endOfDayUtc]);
    }

    public function declines(): HasMany
    {
        return $this->hasMany(RiderPickupDecline::class, 'parcel_id');
    }

    /**
     * Scope a query to only include parcels available for pickup by a specific rider.
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @param \App\Models\Rider $rider
     * @param array<string> $activeBarangayCodes
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeAvailableForRider($query, Rider $rider, array $activeBarangayCodes)
    {
        if (empty($activeBarangayCodes)) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where('status', self::STATUS_READY_FOR_PICKUP)
            ->whereNull('pickup_rider_id')
            ->whereIn('pickup_barangay_code', $activeBarangayCodes)
            ->whereDoesntHave('declines', function ($sub) use ($rider) {
                $sub->where('rider_id', $rider->id);
            });
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function sortingCenter(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function assignedRider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'assigned_rider_id');
    }

    public function pickupRider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'pickup_rider_id');
    }

    public function deliveryLogs(): HasMany
    {
        return $this->hasMany(DeliveryLog::class, 'parcel_id');
    }

    public function earnings(): HasMany
    {
        return $this->hasMany(RiderEarning::class, 'parcel_id');
    }
}
