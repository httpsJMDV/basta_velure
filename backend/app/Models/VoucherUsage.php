<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One use of a voucher on one order; returned_at is set when the order is cancelled (A21). */
class VoucherUsage extends Model
{
    protected $fillable = ['voucher_id', 'user_id', 'order_id', 'checkout_group_id', 'amount', 'returned_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'returned_at' => 'datetime'];
    }

    public function voucher(): BelongsTo { return $this->belongsTo(Voucher::class); }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}
