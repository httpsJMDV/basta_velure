<?php

namespace App\Services\Pricing;

use App\Models\FlashSale;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StoreSale;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * What a variant costs right now (A4, A5, A28). A variant's own price is the regular price. A running store sale takes
 * a percentage off (or sets a fixed sale price); a live flash sale with units left sets the flash price and beats the
 * store sale. Units beyond the remaining flash quantity cost the sale (or regular) price, on their own line.
 *
 * Load the sales once for the products in view (for()) so a page of products costs two queries.
 */
class PriceBook
{
    /** @var array<int, StoreSale> product id => live store sale */
    private array $sales = [];

    /** @var array<int, Collection<int, FlashSale>> product id => live flash sales */
    private array $flash = [];

    private CarbonInterface $at;

    /** @param  iterable<int>|Collection<int, int>  $productIds */
    public static function for(iterable $productIds, ?CarbonInterface $at = null): self
    {
        $book = new self();
        $book->at = $at ?? now();
        $ids = collect($productIds)->map(fn ($id) => (int) $id)->unique()->values();
        if ($ids->isEmpty()) {
            return $book;
        }

        foreach (StoreSale::whereIn('product_id', $ids)->live($book->at)->orderByDesc('id')->get() as $sale) {
            $book->sales[$sale->product_id] ??= $sale;
        }
        foreach (FlashSale::whereIn('product_id', $ids)->live($book->at)->orderBy('id')->get() as $fs) {
            $book->flash[$fs->product_id] = ($book->flash[$fs->product_id] ?? collect())->push($fs);
        }

        return $book;
    }

    public function saleFor(int $productId): ?StoreSale
    {
        return $this->sales[$productId] ?? null;
    }

    public function flashFor(int $productId, ?int $variantId = null): ?FlashSale
    {
        $list = $this->flash[$productId] ?? null;
        if (! $list) {
            return null;
        }

        return $list->first(fn (FlashSale $f) => $f->product_variant_id === null || $f->product_variant_id === $variantId);
    }

    /** The store-sale price of a variant (the regular price without a sale), in pesos with 2 decimals. */
    public function salePrice(ProductVariant $variant): float
    {
        $regular = (float) $variant->price;
        $sale = $this->saleFor((int) $variant->product_id);
        if (! $sale) {
            return $regular;
        }
        if ($sale->discount_type === StoreSale::TYPE_FIXED && $sale->sale_price !== null) {
            return min($regular, (float) $sale->sale_price);
        }

        return self::percentOff($regular, (int) $sale->discount_percent);
    }

    /**
     * The price of one unit now and where it comes from.
     *
     * @return array{price: float, regular: float, source: string, sale_id: ?int, flash_sale_id: ?int}
     */
    public function unit(ProductVariant $variant): array
    {
        $regular = (float) $variant->price;
        $flash = $this->flashFor((int) $variant->product_id, (int) $variant->id);
        if ($flash && $flash->remaining() > 0 && (float) $flash->flash_price < $regular) {
            return ['price' => (float) $flash->flash_price, 'regular' => $regular, 'source' => 'flash', 'sale_id' => $this->saleFor((int) $variant->product_id)?->id, 'flash_sale_id' => $flash->id];
        }
        $sale = $this->saleFor((int) $variant->product_id);
        $price = $this->salePrice($variant);

        return ['price' => $price, 'regular' => $regular, 'source' => $sale && $price < $regular ? 'sale' : 'regular', 'sale_id' => $sale?->id, 'flash_sale_id' => null];
    }

    /**
     * The lines a quantity of one variant is charged as: up to the remaining flash units at the flash price, the rest
     * at the store-sale (or regular) price.
     *
     * @return array<int, array{quantity: int, unit_price: float, regular_price: float, source: string, flash_sale_id: ?int, sale_id: ?int}>
     */
    public function lines(ProductVariant $variant, int $quantity): array
    {
        $regular = (float) $variant->price;
        $sale = $this->saleFor((int) $variant->product_id);
        $salePrice = $this->salePrice($variant);
        $flash = $this->flashFor((int) $variant->product_id, (int) $variant->id);
        $lines = [];

        if ($flash && $quantity > 0 && (float) $flash->flash_price < $regular) {
            $flashQty = min($quantity, $flash->remaining());
            if ($flashQty > 0) {
                $lines[] = ['quantity' => $flashQty, 'unit_price' => (float) $flash->flash_price, 'regular_price' => $regular, 'source' => 'flash', 'flash_sale_id' => $flash->id, 'sale_id' => null];
                $quantity -= $flashQty;
            }
        }
        if ($quantity > 0) {
            $lines[] = [
                'quantity' => $quantity, 'unit_price' => $salePrice, 'regular_price' => $regular,
                'source' => $sale && $salePrice < $regular ? 'sale' : 'regular', 'flash_sale_id' => null, 'sale_id' => $sale?->id,
            ];
        }

        return $lines;
    }

    /**
     * The price range of a product now, and its regular range, across its variants.
     *
     * @return array{min: float, max: float, regular_min: float, regular_max: float}
     */
    public function range(Product $product): array
    {
        $variants = $product->relationLoaded('variants') ? $product->variants : $product->variants()->get();
        if ($variants->isEmpty()) {
            $base = (float) $product->base_price;

            return ['min' => $base, 'max' => $base, 'regular_min' => $base, 'regular_max' => $base];
        }
        $now = $variants->map(fn (ProductVariant $v) => $this->unit($v)['price']);
        $regular = $variants->map(fn (ProductVariant $v) => (float) $v->price);

        return ['min' => (float) $now->min(), 'max' => (float) $now->max(), 'regular_min' => (float) $regular->min(), 'regular_max' => (float) $regular->max()];
    }

    /** A percentage off a price, rounded half up to the centavo (A9). */
    public static function percentOff(float $price, int $percent): float
    {
        $cents = Money::toCents((string) $price);

        return (float) Money::fromCents(intdiv($cents * (100 - $percent) + 50, 100));
    }
}
