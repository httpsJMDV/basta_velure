<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One settled week between a courier and a shop. The courier keeps the delivery fee of each parcel and owes the
 * shop the cash it collected on delivery; net_amount is what changed hands (positive: courier paid the shop;
 * negative: the shop paid the courier). The amounts are a snapshot taken when the payment was recorded.
 */
class CourierSettlement extends Model
{
    protected $fillable = [
        'logistics_company_id', 'seller_id', 'period_start', 'period_end', 'orders_count',
        'cod_collected', 'courier_fees', 'net_amount', 'reference', 'paid_by', 'paid_at', 'confirmed_at', 'confirmed_by',
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
        ];
    }

    public function company(): BelongsTo { return $this->belongsTo(LogisticsCompany::class, 'logistics_company_id'); }
    public function seller(): BelongsTo  { return $this->belongsTo(User::class, 'seller_id'); }
}
