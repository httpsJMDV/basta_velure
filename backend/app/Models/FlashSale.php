<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A flash sale (A5): a flash price for a set number of units, in one fixed time slot. While units remain it beats a
 * store sale; units beyond the remaining flash quantity are charged at the sale or regular price on their own line.
 *
 * @property int $id
 * @property int $seller_id
 * @property int $product_id
 * @property int|null $product_variant_id
 * @property \Carbon\Carbon $slot_start
 * @property \Carbon\Carbon $slot_end
 * @property string $flash_price
 * @property int $quantity
 * @property int $sold
 * @property \Carbon\Carbon|null $ended_at
 */
class FlashSale extends Model
{
    /** Slots are two hours long and start on even hours, Manila time (00:00 to 02:00 … 22:00 to 24:00). */
    public const SLOT_HOURS = 2;

    protected $fillable = ['seller_id', 'product_id', 'product_variant_id', 'slot_start', 'slot_end', 'flash_price', 'quantity', 'sold', 'ended_at'];

    protected function casts(): array
    {
        return [
            'slot_start'  => 'datetime',
            'slot_end'    => 'datetime',
            'flash_price' => 'decimal:2',
            'quantity'    => 'integer',
            'sold'        => 'integer',
            'ended_at'    => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(FlashSaleReminder::class);
    }

    public function remaining(): int
    {
        return max(0, $this->quantity - $this->sold);
    }

    /** upcoming, live, sold_out or ended. */
    public function statusAt(?\Carbon\CarbonInterface $at = null): string
    {
        $at ??= now();
        if ($this->ended_at || $this->slot_end->lte($at)) {
            return 'ended';
        }
        if ($this->slot_start->gt($at)) {
            return 'upcoming';
        }

        return $this->remaining() > 0 ? 'live' : 'sold_out';
    }

    public function scopeLive($query, ?\Carbon\CarbonInterface $at = null)
    {
        $at ??= now();

        return $query->whereNull('ended_at')->where('slot_start', '<=', $at)->where('slot_end', '>', $at)->whereColumn('sold', '<', 'quantity');
    }
}
