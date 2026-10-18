<?php

namespace App\Services;

use App\Models\ProductVariant;
use App\Models\User;

/** The seller's low-stock alert (A29): one in-app notification when a variant drops to 5 or fewer units. */
class StockAlerts
{
    public function lowStock(ProductVariant $variant): void
    {
        $product = $variant->product()->withTrashed()->first();
        if (! $product) {
            return;
        }

        $label = $variant->label && ! in_array(strtolower($variant->label), ['default', 'standard'], true) ? " ({$variant->label})" : '';
        app(Notifier::class)->send(
            User::find($product->seller_id),
            'stock.low',
            'Low stock',
            "{$product->name}{$label} has {$variant->stock_quantity} left. Restock it before it sells out.",
            "/seller/products/{$product->id}/edit",
            ['product_id' => $product->id, 'variant_id' => $variant->id, 'stock' => $variant->stock_quantity],
        );
    }
}
