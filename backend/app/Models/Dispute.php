<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Dispute extends Model
{
    use SoftDeletes;

    /** A return request (A31): the shop answers within 3 days or it is approved; a rejection can be escalated once within 3 days. */
    public const RESPOND_DAYS = 3;
    public const ESCALATE_DAYS = 3;
    public const REASONS = ['Damaged item', 'Wrong item', 'Missing item or parts', 'Not as described', 'Defective or not working', 'Expired product'];

    protected $fillable = [
        'order_id', 'buyer_id', 'seller_id', 'reason', 'description',
        'status', 'resolution_note', 'resolved_by', 'resolved_at',
        'respond_by', 'seller_reason', 'seller_responded_at', 'escalate_by', 'escalated_at', 'auto_approved', 'refund_amount',
    ];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime', 'respond_by' => 'datetime', 'seller_responded_at' => 'datetime',
            'escalate_by' => 'datetime', 'escalated_at' => 'datetime', 'auto_approved' => 'boolean', 'refund_amount' => 'decimal:2',
        ];
    }

    public function photos(): \Illuminate\Database\Eloquent\Relations\HasMany { return $this->hasMany(DisputePhoto::class)->orderBy('sort_order'); }

    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }

    public function order(): BelongsTo    { return $this->belongsTo(Order::class); }
    public function buyer(): BelongsTo    { return $this->belongsTo(User::class, 'buyer_id'); }
    public function resolver(): BelongsTo { return $this->belongsTo(User::class, 'resolved_by'); }
}
