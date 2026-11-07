<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A rider collecting a returned item from the buyer and taking it back to the shop (reverse logistics).
 *
 * @property int $id
 * @property string $code
 * @property int $order_id
 * @property int|null $dispute_id
 * @property int|null $parcel_id
 * @property int|null $logistics_company_id
 * @property int|null $sorting_center_id the hub whose riders collect it: the one that delivered the order
 * @property int|null $rider_id
 * @property string $status
 * @property array|null $buyer_snapshot
 * @property array|null $shop_snapshot
 * @property string|null $buyer_barangay_code
 * @property int $attempts
 * @property string|null $last_failure
 * @property \Carbon\Carbon|null $assigned_at
 * @property \Carbon\Carbon|null $collected_at
 * @property string|null $collect_photo_path
 * @property \Carbon\Carbon|null $delivered_at
 * @property \Carbon\Carbon|null $received_at
 * @property int|null $received_by
 * @property \Carbon\Carbon|null $cancelled_at
 * @property string|null $cancel_reason
 */
class ReturnPickup extends Model
{
    public const STATUS_REQUESTED = 'requested';
    public const STATUS_ASSIGNED = 'assigned';
    public const STATUS_COLLECTED = 'collected';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_RECEIVED = 'received';
    public const STATUS_CANCELLED = 'cancelled';

    /** Still moving: a rider is still to collect it or carry it. */
    public const OPEN = [self::STATUS_REQUESTED, self::STATUS_ASSIGNED, self::STATUS_COLLECTED];

    protected $fillable = [
        'code', 'order_id', 'dispute_id', 'parcel_id', 'logistics_company_id', 'sorting_center_id', 'rider_id', 'status',
        'buyer_snapshot', 'shop_snapshot', 'buyer_barangay_code', 'attempts', 'last_failure', 'assigned_at', 'collected_at',
        'collect_photo_path', 'delivered_at', 'received_at', 'received_by', 'cancelled_at', 'cancel_reason',
    ];

    protected $hidden = ['collect_photo_path'];

    protected function casts(): array
    {
        return [
            'buyer_snapshot' => 'array',
            'shop_snapshot'  => 'array',
            'attempts'       => 'integer',
            'assigned_at'    => 'datetime',
            'collected_at'   => 'datetime',
            'delivered_at'   => 'datetime',
            'received_at'    => 'datetime',
            'cancelled_at'   => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class);
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(Rider::class)->withTrashed();
    }

    public function hub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id')->withTrashed();
    }
}
