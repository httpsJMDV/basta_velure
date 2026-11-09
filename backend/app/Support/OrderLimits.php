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

    /**
     * What to tell a buyer the moment an add to cart makes it a big purchase (the website and the app show it in a
     * dialog): the agreement checkout will ask for at ORDER_HIGH_VALUE_MIN, and no cash on delivery above
     * ORDER_COD_MAX for one shop. It appears when the add crosses a limit, or when the item alone is over it, not on
     * every later add. Null when neither applies.
     *
     * @param  float  $cartTotal  the selected cart total after the add
     * @param  float  $shopTotal  the selected total of the added item's shop, after the add
     * @param  float  $added  what the add put in (unit price × quantity)
     * @return array{kind: string, title: string, points: list<string>, cart_total: float, shop_total: float, agreement_min: float, cod_max: float, agreement: bool, no_cod: bool}|null
     */
    public static function cartNotice(float $cartTotal, float $shopTotal, float $added, string $shopName): ?array
    {
        $min = self::highValueMin();
        $codMax = self::codMax();
        $agreement = $cartTotal >= $min && ($cartTotal - $added < $min || $added >= $min);
        $noCod = $shopTotal > $codMax && ($shopTotal - $added <= $codMax || $added > $codMax);
        if (! $agreement && ! $noCod) {
            return null;
        }

        $points = [];
        if ($agreement) {
            $points[] = 'Your cart is now ' . self::peso($cartTotal) . '. For orders of ' . self::peso($min) . ' or more, you confirm at checkout that you checked the items, the shop and the total. Your agreement is saved with the order.';
        }
        if ($noCod) {
            $points[] = 'Cash on delivery is only for up to ' . self::peso($codMax) . ' per shop, so a rider never carries that much cash. Pay ' . $shopName . "'s order of " . self::peso($shopTotal) . ' by GCash.';
        }
        $points[] = 'You can still ask for a return within 7 days of delivery if something is wrong.';

        return [
            'kind'          => 'big_purchase',
            'title'         => 'This is a big purchase',
            'points'        => $points,
            'cart_total'    => round($cartTotal, 2),
            'shop_total'    => round($shopTotal, 2),
            'agreement_min' => $min,
            'cod_max'       => $codMax,
            'agreement'     => $agreement,
            'no_cod'        => $noCod,
        ];
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
