<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A store sale on one product (A28): a percentage off every variant, or a fixed sale price for a single-price product,
 * between a start and an end. A product has at most one sale at a time. "End now" sets ended_at.
 *
 * @property int $id
 * @property int $seller_id
 * @property int $product_id
 * @property string $discount_type
 * @property int|null $discount_percent
 * @property string|null $sale_price
 * @property \Carbon\Carbon $starts_at
 * @property \Carbon\Carbon $ends_at
 * @property \Carbon\Carbon|null $ended_at
 */
class StoreSale extends Model
{
    public const TYPE_PERCENT = 'percent';
    public const TYPE_FIXED = 'fixed';

    protected $fillable = ['seller_id', 'product_id', 'discount_type', 'discount_percent', 'sale_price', 'starts_at', 'ends_at', 'ended_at'];

    protected function casts(): array
    {
        return [
            'discount_percent' => 'integer',
            'sale_price'       => 'decimal:2',
            'starts_at'        => 'datetime',
            'ends_at'          => 'datetime',
            'ended_at'         => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** upcoming, ongoing or ended at the given moment (now by default). */
    public function statusAt(?\Carbon\CarbonInterface $at = null): string
    {
        $at ??= now();
        if ($this->ended_at || $this->ends_at->lte($at)) {
            return 'ended';
        }

        return $this->starts_at->gt($at) ? 'upcoming' : 'ongoing';
    }

    /** Sales whose window has not closed yet (upcoming or ongoing). */
    public function scopeOpen($query)
    {
        return $query->whereNull('ended_at')->where('ends_at', '>', now());
    }

    public function scopeLive($query, ?\Carbon\CarbonInterface $at = null)
    {
        $at ??= now();

        return $query->whereNull('ended_at')->where('starts_at', '<=', $at)->where('ends_at', '>', $at);
    }
}
