<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
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
 * @property \Carbon\Carbon|null $assigned_at
 * @property \Carbon\Carbon|null $out_for_delivery_at
 * @property \Carbon\Carbon|null $delivered_at
 * @property string|null $delivery_proof_path
 * @property string|null $delivery_proof_path_2
 * @property string|null $received_by
 * @property \Carbon\Carbon|null $cod_collected_at
 * @property \Carbon\Carbon|null $failed_at
 * @property string|null $failure_reason
 * @property string|null $failure_note
 * @property int $delivery_attempts
 * @property \Carbon\Carbon|null $returned_at
 * @property string|null $return_note
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
    /** Failed for good (third attempt, or refused): on its way back to the seller (A13). */
    public const STATUS_RETURN_TO_SENDER = 'RETURN_TO_SENDER';
    /** Exceptions marked by the courier company, each with a reason (A35). */
    public const STATUS_LOST = 'LOST';
    public const STATUS_DAMAGED = 'DAMAGED';

    /** Dispatch states of a pickup job (A14). */
    public const DISPATCH_OFFERING = 'offering';
    public const DISPATCH_UNASSIGNED = 'unassigned';
    public const DISPATCH_ASSIGNED = 'assigned';

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
        self::STATUS_RETURN_TO_SENDER,
        self::STATUS_LOST,
        self::STATUS_DAMAGED,
    ];

    protected $fillable = [
        'logistics_company_id',
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
        'assigned_at',
        'out_for_delivery_at',
        'delivered_at',
        'delivery_proof_path',
        'delivery_proof_path_2',
        'received_by',
        'cod_collected_at',
        'failed_at',
        'failure_reason',
        'failure_note',
        'delivery_attempts',
        'returned_at',
        'return_note',
        'weight_kg',
        'shipping_zone',
        'dispatch_state',
        'dispatch_attempts',
        'delivery_otp',
        'delivery_otp_attempts',
        'delivery_otp_locked_until',
        'cod_collected_amount',
        'rts_rider_id',
        'rts_at',
        'rts_assigned_at',
        'seller_return_confirmed_at',
        'exception_type',
        'exception_reason',
        'exception_photo_path',
        'exception_at',
    ];

    /** The delivery OTP is shown only to the buyer; never in rider, hub or list payloads. */
    protected $hidden = ['delivery_otp'];

    protected function casts(): array
    {
        return [
            'scanned_in_at'           => 'datetime',
            'sorted_at'               => 'datetime',
            'assigned_at'             => 'datetime',
            'out_for_delivery_at'     => 'datetime',
            'delivered_at'            => 'datetime',
            'cod_collected_at'        => 'datetime',
            'failed_at'               => 'datetime',
            'delivery_attempts'       => 'integer',
            'returned_at'             => 'datetime',
            'ready_at'                => 'datetime',
            'pickup_accepted_at'      => 'datetime',
            'picked_up_at'            => 'datetime',
            'pickup_address_snapshot' => 'array',
            'recipient_snapshot'      => 'array',
            'cod_amount'              => 'decimal:2',
            'weight_kg'               => 'decimal:3',
            'dispatch_attempts'       => 'integer',
            'delivery_otp'            => 'encrypted',
            'delivery_otp_attempts'   => 'integer',
            'delivery_otp_locked_until' => 'datetime',
            'cod_collected_amount'    => 'decimal:2',
            'rts_at'                  => 'datetime',
            'rts_assigned_at'         => 'datetime',
            'seller_return_confirmed_at' => 'datetime',
            'exception_at'            => 'datetime',
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
            // A job being offered to one rider for 60 seconds is not open to the others (A14).
            ->where(fn ($q) => $q->whereNull('dispatch_state')->orWhere('dispatch_state', '!=', self::DISPATCH_OFFERING))
            ->whereIn('pickup_barangay_code', $activeBarangayCodes)
            ->forRiderCourier($rider)
            ->whereDoesntHave('declines', function ($sub) use ($rider) {
                $sub->where('rider_id', $rider->id);
            });
    }

    /**
     * Only parcels of the rider's courier company: the hub the rider works for decides which courier's pickups they
     * see (a parcel or hub without a company is the default courier's).
     */
    public function scopeForRiderCourier($query, Rider $rider)
    {
        $companyId = LogisticsCompany::effectiveId($rider->sortingCenter?->logistics_company_id);

        return $companyId === null ? $query : LogisticsCompany::constrain($query, $companyId);
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function sortingCenter(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id');
    }

    public function logisticsCompany(): BelongsTo
    {
        return $this->belongsTo(LogisticsCompany::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function assignedRider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'assigned_rider_id');
    }

    /** The first name of the rider bringing an order's parcel (riders are named by first name only), or null. */
    public static function deliveryRiderFirstName(?int $orderId): ?string
    {
        if ($orderId === null) {
            return null;
        }
        $name = trim((string) static::with('assignedRider.user:id,first_name')->where('order_id', $orderId)->first()?->assignedRider?->user?->first_name);

        return $name !== '' ? $name : null;
    }

    public function pickupRider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'pickup_rider_id');
    }

    public function rtsRider(): BelongsTo
    {
        return $this->belongsTo(Rider::class, 'rts_rider_id');
    }

    public function offers(): HasMany
    {
        return $this->hasMany(DispatchOffer::class, 'parcel_id');
    }

    public function deliveryLogs(): HasMany
    {
        return $this->hasMany(DeliveryLog::class, 'parcel_id');
    }

    public function earnings(): HasMany
    {
        return $this->hasMany(RiderEarning::class, 'parcel_id');
    }

    /** The single earnings row this parcel produced for its rider (Feature 2.9), if it was delivered. */
    public function earning(): HasOne
    {
        return $this->hasOne(RiderEarning::class, 'parcel_id');
    }
}
