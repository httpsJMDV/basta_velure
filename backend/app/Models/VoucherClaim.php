<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A voucher a buyer saved to their wallet. */
class VoucherClaim extends Model
{
    public $timestamps = false;

    protected $fillable = ['voucher_id', 'user_id', 'claimed_at'];

    protected function casts(): array
    {
        return ['claimed_at' => 'datetime'];
    }

    public function voucher(): BelongsTo { return $this->belongsTo(Voucher::class); }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
