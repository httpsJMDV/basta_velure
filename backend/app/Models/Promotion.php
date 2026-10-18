<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A seller-funded promotion counted on a store's cart (A8):
 *  - bundle: any min_quantity units of the listed products together get discount_percent off those units;
 *  - bxgy: every buy_quantity units of the buy product make get_quantity units of the get product free.
 *
 * @property int $id
 * @property int $seller_id
 * @property string $type
 * @property string $name
 * @property int|null $min_quantity
 * @property int|null $discount_percent
 * @property int|null $buy_product_id
 * @property int|null $buy_quantity
 * @property int|null $get_product_id
 * @property int|null $get_quantity
 * @property \Carbon\Carbon $starts_at
 * @property \Carbon\Carbon $ends_at
 * @property \Carbon\Carbon|null $ended_at
 */
class Promotion extends Model
{
    public const TYPE_BUNDLE = 'bundle';
    public const TYPE_BXGY = 'bxgy';

    protected $fillable = [
        'seller_id', 'type', 'name', 'min_quantity', 'discount_percent', 'buy_product_id', 'buy_quantity',
        'get_product_id', 'get_quantity', 'starts_at', 'ends_at', 'ended_at',
    ];

    protected function casts(): array
    {
        return [
            'min_quantity'     => 'integer',
            'discount_percent' => 'integer',
            'buy_quantity'     => 'integer',
            'get_quantity'     => 'integer',
            'starts_at'        => 'datetime',
            'ends_at'          => 'datetime',
            'ended_at'         => 'datetime',
        ];
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'promotion_products');
    }

    public function buyProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'buy_product_id');
    }

    public function getProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'get_product_id');
    }

    public function scopeLive($query, ?\Carbon\CarbonInterface $at = null)
    {
        $at ??= now();

        return $query->whereNull('ended_at')->where('starts_at', '<=', $at)->where('ends_at', '>', $at);
    }

    public function statusAt(?\Carbon\CarbonInterface $at = null): string
    {
        $at ??= now();
        if ($this->ended_at || $this->ends_at->lte($at)) {
            return 'ended';
        }

        return $this->starts_at->gt($at) ? 'upcoming' : 'ongoing';
    }
}
