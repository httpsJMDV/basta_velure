<?php

namespace App\Services\Commerce;

use App\Models\Promotion;
use App\Support\Money;
use Illuminate\Support\Collection;

/**
 * A shop's bundle and buy-X-get-Y offers on the lines of one store (S11). Both are seller-funded (A8).
 *
 * Bundle: when the units of the bundle's products reach the minimum (any mix of variants), each of those lines gets
 * the bundle's percentage off; below the minimum nothing applies. Buy X get Y: every full set of the "buy" product
 * makes up to the "get" quantity of the "get" product free, when that product is in the order.
 */
class PromotionApplier
{
    /** @var array<int, Collection<int, Promotion>> seller id => live promotions */
    private array $cache = [];

    /** Forgets the promotions read so far (a worker can live across requests). */
    public function reset(): void
    {
        $this->cache = [];
    }

    /**
     * @param  array<int, array{key: string, product_id: int, quantity: int, unit_price: float, subtotal: float}>  $lines
     * @return array{shares: array<string, float>, free_units: array<string, int>, applied: array<int, array{id: int, type: string, name: string, discount: float}>}
     */
    public function apply(int $sellerId, array $lines): array
    {
        $shares = [];
        $free = [];
        $applied = [];
        $promos = $this->live($sellerId);
        if ($promos->isEmpty() || $lines === []) {
            return ['shares' => $shares, 'free_units' => $free, 'applied' => $applied];
        }

        // Bundles: the biggest discount first; a line is in at most one bundle.
        $used = [];
        $bundles = $promos->where('type', Promotion::TYPE_BUNDLE)->map(function (Promotion $p) use ($lines) {
            $ids = $p->products->pluck('id')->map(fn ($id) => (int) $id)->all();
            $eligible = array_values(array_filter($lines, fn ($l) => in_array($l['product_id'], $ids, true)));
            $units = array_sum(array_column($eligible, 'quantity'));
            $base = array_sum(array_column($eligible, 'subtotal'));

            return ['promo' => $p, 'lines' => $eligible, 'units' => $units, 'discount' => $units >= $p->min_quantity ? round($base * $p->discount_percent / 100, 2) : 0.0];
        })->sortByDesc('discount');

        foreach ($bundles as $b) {
            $eligible = array_values(array_filter($b['lines'], fn ($l) => ! isset($used[$l['key']])));
            if (array_sum(array_column($eligible, 'quantity')) < $b['promo']->min_quantity) {
                continue;
            }
            $base = array_sum(array_column($eligible, 'subtotal'));
            $discount = round($base * $b['promo']->discount_percent / 100, 2);
            if ($discount <= 0) {
                continue;
            }
            foreach (self::split($discount, array_combine(array_column($eligible, 'key'), array_column($eligible, 'subtotal'))) as $key => $share) {
                $shares[$key] = round(($shares[$key] ?? 0) + $share, 2);
                $used[$key] = true;
            }
            $applied[] = ['id' => $b['promo']->id, 'type' => 'bundle', 'name' => $b['promo']->name, 'discount' => $discount];
        }

        // Buy X get Y: the cheapest units of the "get" product become free.
        foreach ($promos->where('type', Promotion::TYPE_BXGY) as $p) {
            $buyUnits = array_sum(array_map(fn ($l) => $l['product_id'] === (int) $p->buy_product_id ? $l['quantity'] : 0, $lines));
            $getLines = array_values(array_filter($lines, fn ($l) => $l['product_id'] === (int) $p->get_product_id && ! isset($used[$l['key']])));
            if ($getLines === [] || $p->buy_quantity < 1) {
                continue;
            }
            $sameProduct = (int) $p->buy_product_id === (int) $p->get_product_id;
            $freeUnits = $sameProduct
                ? intdiv($buyUnits, $p->buy_quantity + $p->get_quantity) * $p->get_quantity
                : min(intdiv($buyUnits, $p->buy_quantity) * $p->get_quantity, array_sum(array_column($getLines, 'quantity')));
            if ($freeUnits < 1) {
                continue;
            }
            usort($getLines, fn ($a, $b) => $a['unit_price'] <=> $b['unit_price']);
            $discount = 0.0;
            foreach ($getLines as $l) {
                if ($freeUnits < 1) {
                    break;
                }
                $n = min($freeUnits, $l['quantity']);
                $value = round($n * $l['unit_price'], 2);
                $shares[$l['key']] = round(($shares[$l['key']] ?? 0) + $value, 2);
                $free[$l['key']] = ($free[$l['key']] ?? 0) + $n;
                $used[$l['key']] = true;
                $discount += $value;
                $freeUnits -= $n;
            }
            $applied[] = ['id' => $p->id, 'type' => 'bxgy', 'name' => $p->name, 'discount' => round($discount, 2)];
        }

        return ['shares' => $shares, 'free_units' => $free, 'applied' => $applied];
    }

    /**
     * Splits an amount across weights in proportion, each part rounded to the centavo (half up), with any rounding
     * remainder on the largest weight (A8), so the parts always add up to the amount. PLAT100 on 699 + 399 is
     * 63.66 + 36.34.
     *
     * @param  array<string|int, float>  $weights
     * @return array<string|int, float>
     */
    public static function split(float $amount, array $weights): array
    {
        $total = array_sum($weights);
        if ($amount <= 0 || $total <= 0 || $weights === []) {
            return array_map(fn () => 0.0, $weights);
        }
        $cents = Money::toCents(number_format($amount, 2, '.', ''));
        $parts = [];
        $given = 0;
        foreach ($weights as $key => $w) {
            $parts[$key] = (int) round($cents * $w / $total, 0, PHP_ROUND_HALF_UP);
            $given += $parts[$key];
        }
        $largest = array_keys($weights, max($weights))[0];
        $parts[$largest] += $cents - $given;

        return array_map(fn ($c) => $c / 100, $parts);
    }

    /** @return Collection<int, Promotion> */
    private function live(int $sellerId): Collection
    {
        return $this->cache[$sellerId] ??= Promotion::with('products:id')->where('seller_id', $sellerId)->live()->orderBy('id')->get();
    }
}
