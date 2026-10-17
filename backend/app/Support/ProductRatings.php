<?php

namespace App\Support;

use App\Models\Product;
use App\Models\Review;

/**
 * Keeps a product's stored rating (products.avg_rating and products.review_count, used by product cards and the
 * Trending sort) in step with its visible reviews.
 */
class ProductRatings
{
    public static function refresh(int $productId): void
    {
        $visible = Review::where('product_id', $productId)->where('moderation_status', 'visible');
        $count = (clone $visible)->count();

        Product::whereKey($productId)->update([
            'review_count' => $count,
            'avg_rating'   => $count > 0 ? round((float) (clone $visible)->avg('rating'), 2) : null,
        ]);
    }
}
