<?php

namespace App\Models;

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
 * @property \Carbon\Carbon|null $scanned_in_at
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
        'pickup_barangay',
        'pickup_address_snapshot',
        'recipient_snapshot',
        'cod_amount',
        'ready_at',
        'scanned_in_at',
    ];

    protected function casts(): array
    {
        return [
            'scanned_in_at'           => 'datetime',
            'ready_at'                => 'datetime',
            'pickup_address_snapshot' => 'array',
            'recipient_snapshot'      => 'array',
            'cod_amount'              => 'decimal:2',
        ];
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
