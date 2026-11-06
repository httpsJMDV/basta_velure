<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A refund the shop sends by hand, because the buyer's money went straight to the shop (a GCash payment, or the cash
 * a rider collected and the courier settled with the shop). See App\Services\Commerce\ManualRefunds for the steps.
 */
class Refund extends Model
{
    /** The buyer has to say which GCash account gets the money. */
    public const STATUS_AWAITING_ACCOUNT = 'awaiting_account';
    /** The shop has to send it. */
    public const STATUS_AWAITING_SHOP = 'awaiting_shop';
    /** The shop recorded the transfer; the buyer confirms it arrived. */
    public const STATUS_SENT = 'sent';
    /** The buyer says nothing arrived; Loved-IT decides. */
    public const STATUS_NOT_RECEIVED = 'not_received';
    /** Done. */
    public const STATUS_RECEIVED = 'received';

    public const OPEN = [self::STATUS_AWAITING_ACCOUNT, self::STATUS_AWAITING_SHOP, self::STATUS_SENT, self::STATUS_NOT_RECEIVED];

    public const CAUSE_RETURN = 'return';
    public const CAUSE_CANCELLED = 'cancelled';

    public const RECEIPT_DISK = 'ids';
    public const RECEIPT_DIR = 'refund-receipts';

    protected $fillable = [
        'order_id', 'buyer_id', 'seller_id', 'amount', 'cause', 'status', 'gcash_number', 'gcash_name', 'send_by',
        'overdue_notified_at', 'reference', 'receipt_path', 'sent_at', 'confirm_by', 'received_at', 'auto_confirmed',
        'reported_at', 'report_note', 'resolved_by', 'resolved_at', 'resolution_note', 'attempts',
    ];

    protected $hidden = ['receipt_path'];

    protected function casts(): array
    {
        return [
            'amount'              => 'decimal:2',
            'send_by'             => 'datetime',
            'overdue_notified_at' => 'datetime',
            'sent_at'             => 'datetime',
            'confirm_by'          => 'datetime',
            'received_at'         => 'datetime',
            'auto_confirmed'      => 'boolean',
            'reported_at'         => 'datetime',
            'resolved_at'         => 'datetime',
            'attempts'            => 'array',
        ];
    }

    public function order(): BelongsTo  { return $this->belongsTo(Order::class); }
    public function buyer(): BelongsTo  { return $this->belongsTo(User::class, 'buyer_id'); }
    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN, true);
    }

    /** The shop is late sending it. */
    public function overdue(): bool
    {
        return $this->status === self::STATUS_AWAITING_SHOP && $this->send_by !== null && $this->send_by->lt(now());
    }
}
