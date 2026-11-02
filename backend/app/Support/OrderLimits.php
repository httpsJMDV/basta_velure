<?php

namespace App\Support;

/** The limits on one order, in one place, so the cart, checkout and product pages all say the same thing. */
final class OrderLimits
{
    public static function maxParcelKg(): float
    {
        return (float) config('shipping.max_parcel_kg');
    }

    public static function codMax(): float
    {
        return (float) config('orders.cod_max');
    }

    public static function highValueMin(): float
    {
        return (float) config('orders.high_value_min');
    }

    public static function peso(float $amount): string
    {
        return '₱' . number_format($amount, floor($amount) === $amount ? 0 : 2);
    }

    public static function kg(float $kg): string
    {
        return rtrim(rtrim(number_format($kg, 2, '.', ''), '0'), '.') . ' kg';
    }

    /** How many of an item fit in one parcel. Zero when one is already too heavy. */
    public static function maxPerParcel(float $unitKg): int
    {
        return $unitKg > 0 ? (int) floor(self::maxParcelKg() / $unitKg + 1e-9) : PHP_INT_MAX;
    }

    /** Why this quantity of an item cannot go in one parcel, or null when it can. */
    public static function tooHeavyMessage(float $unitKg, int $quantity): ?string
    {
        if ($unitKg <= 0 || $unitKg * $quantity <= self::maxParcelKg() + 1e-9) {
            return null;
        }
        $each = self::kg($unitKg);
        $limit = self::kg(self::maxParcelKg());
        $fit = self::maxPerParcel($unitKg);

        return match (true) {
            $fit < 1  => "This item weighs {$each}, which is too heavy for a rider to deliver. One parcel can weigh at most {$limit}.",
            $fit === 1 => "This item weighs {$each}, and one parcel can weigh at most {$limit}, so you can buy only 1 in one order.",
            default   => "This item weighs {$each} each, and one parcel can weigh at most {$limit}, so you can buy at most {$fit} in one order.",
        };
    }

    /** For the product page: what a buyer should know about a heavy item before adding it. Null for a normal item. */
    public static function bulkyInfo(?float $unitKg): ?array
    {
        if (! $unitKg || $unitKg < (float) config('shipping.heavy_item_kg')) {
            return null;
        }

        return [
            'weight_kg'     => round($unitKg, 2),
            'max_per_order' => self::maxPerParcel($unitKg),
            'max_parcel_kg' => self::maxParcelKg(),
        ];
    }
}
