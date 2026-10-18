<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\OrderItem;

/**
 * A product's per-buyer purchase limit counts every unit the buyer already ordered, in any order that was not
 * cancelled, plus what is in the current checkout (B4: the 3rd Power Bank is refused, also in a new cart).
 */
class PurchaseLimits
{
    /**
     * @param  array<int, int>  $productIds
     * @return array<int, int> product id => units already bought
     */
    public static function bought(int $buyerId, array $productIds): array
    {
        if ($productIds === []) {
            return [];
        }

        return OrderItem::query()
            ->whereIn('product_id', array_values(array_unique($productIds)))
            ->where('is_gift', false)
            ->whereHas('order', fn ($q) => $q->where('buyer_id', $buyerId)->where('status', '!=', OrderStatus::CANCELLED->value))
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(quantity) as units')
            ->pluck('units', 'product_id')
            ->map(fn ($v) => (int) $v)
            ->all();
    }

    /** The message for a quantity over the limit. */
    public static function message(int $limit, int $already): string
    {
        return $already > 0
            ? "You can buy up to {$limit} of this item in total. You already bought {$already}."
            : "You can buy up to {$limit} of this item in total.";
    }
}
