<?php

namespace App\Services;

use App\Models\ProductVariant;

/**
 * The seller's low-stock alert (A29): one notification when a variant drops to its product's level (5 unless the
 * shop or the product sets another). At level 0 it is the "sold out" alert. It goes to the bell and by email as the
 * seller's notification settings say (low_stock).
 */
class StockAlerts
{
    public function lowStock(ProductVariant $variant): void
    {
        $product = $variant->product()->withTrashed()->first();
        if (! $product) {
            return;
        }

        $label = $variant->label && ! in_array(strtolower($variant->label), ['default', 'standard'], true) ? " ({$variant->label})" : '';
        $soldOut = $variant->stock_quantity <= 0;
        $title = $soldOut ? 'Sold out' : 'Low stock';
        $body = $soldOut
            ? "{$product->name}{$label} is sold out. Buyers cannot order it until you add stock."
            : "{$product->name}{$label} has {$variant->stock_quantity} left. Restock it before it sells out.";

        app(Notifier::class)->toSeller(
            $product->seller_id,
            'low_stock',
            'stock.low',
            $title,
            $body,
            "/seller/products/{$product->id}/edit",
            ['product_id' => $product->id, 'variant_id' => $variant->id, 'stock' => $variant->stock_quantity],
        );
        app(MailNotifier::class)->lowStock($product, $title, $body);
    }
}
