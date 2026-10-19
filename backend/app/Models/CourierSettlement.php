<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One settled week between a courier and a shop. The courier keeps the delivery fee of each parcel and owes the
 * shop the cash it collected on delivery; net_amount is what changed hands (positive: courier paid the shop;
 * negative: the shop paid the courier). The amounts are a snapshot taken when the payment was recorded.
 *
 * The payer records the GCash reference (and may attach the receipt); the other side confirms it, or reports that
 * the money did not arrive. A reported or long-unconfirmed payment goes to Loved-IT, whose admin either marks it
 * received or voids it so the payer sends it again (the voided payment is kept in `attempts`).
 */
class CourierSettlement extends Model
{
    public const STATE_SENT = 'sent';            // recorded by the payer, waiting for the other side
    public const STATE_DISPUTED = 'disputed';    // the other side says it did not arrive
    public const STATE_PAY_AGAIN = 'pay_again';  // an admin voided the payment: the payer sends it again
    public const STATE_SETTLED = 'settled';

    public const RESOLUTION_RECEIVED = 'received';
    public const RESOLUTION_PAY_AGAIN = 'pay_again';

    protected $fillable = [
        'logistics_company_id', 'seller_id', 'period_start', 'period_end', 'orders_count',
        'cod_collected', 'courier_fees', 'net_amount', 'reference', 'receipt_path', 'paid_by', 'paid_at', 'confirmed_at', 'confirmed_by',
        'disputed_at', 'disputed_by', 'dispute_reason', 'reopened_at', 'resolved_at', 'resolved_by', 'resolution', 'resolution_note',
        'reminded_at', 'attempts',
    ];

    protected function casts(): array
    {
        return [
            'period_start'  => 'date',
            'period_end'    => 'date',
            'cod_collected' => 'decimal:2',
            'courier_fees'  => 'decimal:2',
            'net_amount'    => 'decimal:2',
            'paid_at'       => 'datetime',
            'confirmed_at'  => 'datetime',
            'disputed_at'   => 'datetime',
            'reopened_at'   => 'datetime',
            'resolved_at'   => 'datetime',
            'reminded_at'   => 'datetime',
            'attempts'      => 'array',
        ];
    }

    public function company(): BelongsTo { return $this->belongsTo(LogisticsCompany::class, 'logistics_company_id'); }
    public function seller(): BelongsTo  { return $this->belongsTo(User::class, 'seller_id'); }

    /** Days the receiving side has to confirm before Loved-IT counts the payment as overdue. */
    public static function confirmDays(): int
    {
        return max(1, (int) config('payments.settlement_confirm_days', 3));
    }

    public function state(): string
    {
        return match (true) {
            $this->confirmed_at !== null => self::STATE_SETTLED,
            $this->reopened_at !== null  => self::STATE_PAY_AGAIN,
            $this->disputed_at !== null  => self::STATE_DISPUTED,
            default                      => self::STATE_SENT,
        };
    }

    /** Sent, and the other side has neither confirmed nor reported it within the confirmation window. */
    public function isOverdue(): bool
    {
        return $this->state() === self::STATE_SENT && $this->paid_at !== null && $this->paid_at->lte(now()->subDays(self::confirmDays()));
    }

    /** 'courier' or 'seller': who sends the money this week. */
    public function payerSide(): string
    {
        return (float) $this->net_amount > 0 ? 'courier' : 'seller';
    }

    public function receiverSide(): string
    {
        return $this->payerSide() === 'courier' ? 'seller' : 'courier';
    }

    /** 'seller', 'courier' (a member of the approved courier company) or null when $user is on neither side. */
    public function sideOf(User $user): ?string
    {
        if ((int) $this->seller_id === (int) $user->id) {
            return 'seller';
        }
        $member = LogisticsCompanyMember::where('logistics_company_id', $this->logistics_company_id)->where('user_id', $user->id)->exists();

        return $member && $this->company?->isApproved() ? 'courier' : null;
    }
}
