<?php

namespace App\Support;

use App\Models\Product;

/**
 * A seller's discount: a percentage off every variant of a product (sellers set their own discounts; there are no
 * platform vouchers). Each variant keeps its regular price in original_price and sells at price; the product's
 * base_price and original_price follow its cheapest variant, so cards and filters show the real selling price.
 */
final class ProductDiscount
{
    public const MAX_PERCENT = 90;

    /**
     * Applies $percent to the product's variants, whose price must hold the REGULAR price (as the seller's form sends
     * it). Null or 0 removes the discount.
     */
    public static function apply(Product $product, ?int $percent): void
    {
        $percent = max(0, min(self::MAX_PERCENT, (int) $percent));
        $product->load('variants');

        foreach ($product->variants as $variant) {
            $regularCents = Money::toCents((string) $variant->price);
            $variant->update($percent > 0 ? [
                'original_price' => Money::fromCents($regularCents),
                'price'          => Money::fromCents(intdiv($regularCents * (100 - $percent) + 50, 100)),
            ] : ['original_price' => null]);
        }

        $cheapest = $product->variants->sortBy(fn ($v) => (float) $v->price)->first();
        $product->update([
            'discount_percent' => $percent > 0 ? $percent : null,
            'base_price'       => $cheapest ? $cheapest->price : $product->base_price,
            'original_price'   => $percent > 0 && $cheapest ? $cheapest->original_price : null,
        ]);
    }

    /** Puts every variant back on its regular price (before the discount is applied again). */
    public static function restoreRegularPrices(Product $product): void
    {
        foreach ($product->variants()->whereNotNull('original_price')->get() as $variant) {
            $variant->update(['price' => $variant->original_price, 'original_price' => null]);
        }
    }

    /** The regular (undiscounted) price of a variant. */
    public static function regularPrice(object $variant): float
    {
        return (float) ($variant->original_price ?? $variant->price);
    }
}
