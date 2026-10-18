<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One sellable combination of a product ("Red / M"), with its regular price and stock. A removed variant is soft
 * deleted, so orders and carts that point at it still know what it was.
 *
 * @property int $id
 * @property int $product_id
 * @property string|null $label
 * @property string|null $sku
 * @property float $price
 * @property float|null $original_price
 * @property int $stock_quantity
 * @property \Carbon\Carbon|null $low_stock_alerted_at
 */
class ProductVariant extends Model
{
    use SoftDeletes;

    /** A29: stock at or below this is low; the seller is alerted once per crossing. */
    public const LOW_STOCK_THRESHOLD = 5;

    protected $fillable = ['product_id', 'label', 'sku', 'price', 'original_price', 'stock_quantity', 'low_stock_alerted_at'];

    protected $casts = [
        'price'          => 'float',
        'original_price' => 'float',
        'stock_quantity' => 'integer',
        'low_stock_alerted_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        // The seller's edits save the model and land here. Checkout and cancellations change stock with one atomic
        // query, which fires no model event, so they call afterStockQuery() themselves.
        static::updated(function (ProductVariant $variant) {
            if ($variant->wasChanged('stock_quantity')) {
                self::stockChanged($variant, (int) $variant->getOriginal('stock_quantity'), (int) $variant->stock_quantity);
            }
        });
    }

    /** A29: the alert fires once when stock drops to the threshold or below, and re-arms when stock goes back above it. */
    public static function stockChanged(ProductVariant $variant, int $old, int $new): void
    {
        $limit = self::LOW_STOCK_THRESHOLD;

        if ($new <= $limit && $old > $limit && ! $variant->low_stock_alerted_at) {
            static::withoutEvents(fn () => $variant->forceFill(['low_stock_alerted_at' => now()])->saveQuietly());
            app(\App\Services\StockAlerts::class)->lowStock($variant);
        } elseif ($new > $limit && $variant->low_stock_alerted_at) {
            static::withoutEvents(fn () => $variant->forceFill(['low_stock_alerted_at' => null])->saveQuietly());
        }
    }

    /** After stock was moved by $delta units with a query (checkout takes, a cancellation or return gives back). */
    public static function afterStockQuery(int $variantId, int $delta): void
    {
        $variant = static::withTrashed()->find($variantId);
        if ($variant) {
            self::stockChanged($variant, $variant->stock_quantity - $delta, $variant->stock_quantity);
        }
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
