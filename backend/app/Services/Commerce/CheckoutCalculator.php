<?php

namespace App\Services\Commerce;

use App\Models\ProductVariant;
use App\Models\User;
use App\Models\Voucher;
use App\Services\CourierAssigner;
use App\Services\Pricing\PriceBook;
use App\Support\Validation;
use Illuminate\Support\Str;

/**
 * Prices a checkout exactly as Place Order will charge it (B6 to B8, worked example on the Test Data sheet):
 *
 *   per store: items at the price paid now (flash units on their own line, A5) − bundle and buy-X-get-Y discounts
 *              − the store voucher, + shipping for the store's chargeable weight on its route (A20);
 *   then:      − the platform voucher, split across the stores by merchandise (A8), − the shipping voucher, split
 *              across the stores by shipping fee; nothing goes below zero.
 *
 * The quote also lists every problem that blocks the order (an item sold out, deleted, over its stock or purchase
 * limit, a shop on vacation, an address no courier serves) and what each voucher in the buyer's wallet would do.
 */
class CheckoutCalculator
{
    public const NOTE_MAX = 200;

    public function __construct(
        private readonly ShippingCalculator $shipping,
        private readonly VoucherEngine $vouchers,
        private readonly PromotionApplier $promotions,
    ) {}

    /**
     * @param  array<int, array{variant_id: int|string, quantity: int|string}>  $requested
     * @param  array{region?: ?string, province?: ?string, city?: ?string, barangay?: ?string}|null  $destination
     * @param  array{store?: array<int|string, ?string>, platform?: ?string, shipping?: ?string}  $codes
     */
    public function quote(User $buyer, array $requested, ?array $destination, array $codes = [], bool $lock = false): array
    {
        // Every quote reads the rates and promotions as they are now.
        $this->shipping->reset();
        $this->promotions->reset();
        $problems = [];
        $wanted = [];
        foreach ($requested as $r) {
            $vid = (int) ($r['variant_id'] ?? 0);
            $raw = is_string($r['quantity'] ?? null) ? trim($r['quantity']) : ($r['quantity'] ?? null);
            if ($vid < 1) {
                continue;
            }
            if (! (is_int($raw) || (is_string($raw) && preg_match('/^\d+$/', $raw))) || (int) $raw < 1 || (int) $raw > Validation::STOCK_MAX) {
                $problems[] = ['type' => 'quantity', 'variant_id' => $vid, 'message' => 'Enter a whole-number quantity of at least 1.'];
                continue;
            }
            $wanted[$vid] = ($wanted[$vid] ?? 0) + (int) $raw;
        }

        $query = ProductVariant::withTrashed()
            ->with(['product' => fn ($q) => $q->withTrashed()->with(['images', 'category:id,slug', 'seller.sellerProfile'])])
            ->whereIn('id', array_keys($wanted));
        if ($lock) {
            $query->lockForUpdate();
        }
        $variants = $query->get()->keyBy('id');

        $productIds = $variants->pluck('product_id')->unique()->values()->all();
        $bought = PurchaseLimits::bought($buyer->id, $productIds);
        $book = PriceBook::for($productIds);
        $perProduct = [];
        foreach ($wanted as $vid => $qty) {
            if ($v = $variants[$vid] ?? null) {
                $perProduct[$v->product_id] = ($perProduct[$v->product_id] ?? 0) + $qty;
            }
        }

        // ── Lines ──────────────────────────────────────────────────────────
        $stores = [];
        foreach ($wanted as $vid => $qty) {
            $v = $variants[$vid] ?? null;
            if (! $v || ! $v->product) {
                $problems[] = ['type' => 'unavailable', 'variant_id' => $vid, 'message' => 'An item in your order no longer exists. Remove it to continue.'];
                continue;
            }
            $p = $v->product;
            $profile = $p->seller?->sellerProfile;
            [$status, $message] = $this->lineStatus($v, $qty, $bought[$p->id] ?? 0, $perProduct[$p->id] ?? $qty);
            if ($status !== 'available') {
                $problems[] = ['type' => $status, 'variant_id' => $vid, 'product_id' => $p->id, 'message' => "{$p->name}: {$message}"];
            }

            $sellerId = (int) $p->seller_id;
            $stores[$sellerId] ??= ['seller' => $p->seller, 'profile' => $profile, 'lines' => []];
            $grams = (int) round(((float) ($p->weight_kg ?? 0)) * 1000);
            $primary = $p->images->firstWhere('is_primary', true) ?? $p->images->first();
            $segments = $status === 'available' || $status === 'insufficient_stock' || $status === 'limit_exceeded'
                ? $book->lines($v, $qty)
                : [['quantity' => $qty, 'unit_price' => (float) $v->price, 'regular_price' => (float) $v->price, 'source' => 'regular', 'flash_sale_id' => null, 'sale_id' => null]];
            foreach ($segments as $i => $seg) {
                $stores[$sellerId]['lines'][] = [
                    'key'           => "v{$vid}-{$i}",
                    'variant_id'    => (int) $vid,
                    'product_id'    => (int) $p->id,
                    'name'          => $p->name,
                    'variant_label' => $v->label && ! in_array(strtolower($v->label), ['default', 'standard'], true) ? $v->label : null,
                    'image_url'     => $primary ? asset('storage/' . $primary->path) : null,
                    'category_slug' => $p->category?->slug,
                    'category_id'   => $p->category_id ? (int) $p->category_id : null,
                    'quantity'      => (int) $seg['quantity'],
                    'unit_price'    => (float) $seg['unit_price'],
                    'regular_price' => (float) $seg['regular_price'],
                    'price_source'  => $seg['source'],
                    'flash_sale_id' => $seg['flash_sale_id'],
                    'sale_id'       => $seg['sale_id'],
                    'subtotal'      => round($seg['quantity'] * $seg['unit_price'], 2),
                    'unit_grams'    => $grams,
                    'stock'         => (int) $v->stock_quantity,
                    'status'        => $status,
                    'message'       => $status === 'available' ? null : $message,
                    'promo_share'   => 0.0,
                    'free_quantity' => 0,
                    'store_voucher_share' => 0.0,
                ];
            }
        }

        // ── Stores ─────────────────────────────────────────────────────────
        $assigner = app(CourierAssigner::class);
        $out = [];
        foreach ($stores as $sellerId => $s) {
            $lines = $s['lines'];
            $promo = $this->promotions->apply($sellerId, array_map(fn ($l) => [
                'key' => $l['key'], 'product_id' => $l['product_id'], 'quantity' => $l['quantity'], 'unit_price' => $l['unit_price'], 'subtotal' => $l['subtotal'],
            ], $lines));
            foreach ($lines as &$l) {
                $l['promo_share'] = $promo['shares'][$l['key']] ?? 0.0;
                $l['free_quantity'] = $promo['free_units'][$l['key']] ?? 0;
            }
            unset($l);

            $merchandise = round(array_sum(array_column($lines, 'subtotal')), 2);
            $promoDiscount = round(array_sum(array_column($lines, 'promo_share')), 2);

            $storeVoucher = null;
            $code = $codes['store'][$sellerId] ?? $codes['store'][(string) $sellerId] ?? null;
            if ($code !== null && trim((string) $code) !== '') {
                $storeVoucher = $this->applyStoreVoucher($buyer, (int) $sellerId, (string) $code, $lines);
                if ($storeVoucher['applied']) {
                    foreach ($lines as &$l) {
                        $l['store_voucher_share'] = $storeVoucher['shares'][$l['key']] ?? 0.0;
                    }
                    unset($l);
                }
                unset($storeVoucher['shares']);
            }
            $storeDiscount = $storeVoucher['applied'] ?? false ? $storeVoucher['discount'] : 0.0;

            $grams = array_sum(array_map(fn ($l) => $l['unit_grams'] * $l['quantity'], $lines));
            $profile = $s['profile'];
            $shipping = $this->shippingFor($profile, $destination, $grams, $assigner, $merchandise - $promoDiscount);

            $out[$sellerId] = [
                'seller' => [
                    'id'            => (int) $sellerId,
                    'shop_name'     => $profile?->shop_name ?? trim(($s['seller']?->first_name ?? '') . ' ' . ($s['seller']?->last_name ?? '')),
                    'shop_slug'     => $profile?->shop_name ? Str::slug($profile->shop_name) : null,
                    'accepts_gcash' => (bool) ($profile?->gcash_number),
                    'on_vacation'   => (bool) ($profile?->on_vacation),
                ],
                'lines'             => $lines,
                'promotions'        => $promo['applied'],
                'merchandise'       => $merchandise,
                'promo_discount'    => $promoDiscount,
                'store_voucher'     => $storeVoucher,
                'store_discount'    => round($storeDiscount, 2),
                'net_merchandise'   => round(max(0, $merchandise - $promoDiscount - $storeDiscount), 2),
                'shipping'          => $shipping,
                'platform_discount' => 0.0,
                'shipping_discount' => 0.0,
                'total'             => 0.0,
            ];
            if ($destination && ! $shipping['serviceable']) {
                $problems[] = ['type' => 'unserviceable', 'seller_id' => (int) $sellerId, 'message' => $shipping['message']];
            }
        }

        // ── Platform and shipping vouchers ─────────────────────────────────
        $merchAll = round(array_sum(array_map(fn ($s) => $s['merchandise'] - $s['promo_discount'], $out)), 2);
        $netAll = round(array_sum(array_column($out, 'net_merchandise')), 2);
        $shipAll = round(array_sum(array_map(fn ($s) => $s['shipping']['fee'], $out)), 2);

        $platform = $this->applyPlatformVoucher($buyer, $codes['platform'] ?? null, $merchAll, $netAll);
        if ($platform && $platform['applied']) {
            $weights = array_map(fn ($s) => $s['merchandise'] - $s['promo_discount'], $out);
            foreach (PromotionApplier::split($platform['discount'], $weights) as $sid => $share) {
                $out[$sid]['platform_discount'] = round(min($share, $out[$sid]['net_merchandise']), 2);
            }
            $platform['discount'] = round(array_sum(array_column($out, 'platform_discount')), 2);
        }
        $shippingVoucher = $this->applyShippingVoucher($buyer, $codes['shipping'] ?? null, $merchAll, $shipAll);
        if ($shippingVoucher && $shippingVoucher['applied']) {
            $weights = array_map(fn ($s) => $s['shipping']['fee'], $out);
            foreach (PromotionApplier::split($shippingVoucher['discount'], $weights) as $sid => $share) {
                $out[$sid]['shipping_discount'] = round(min($share, $out[$sid]['shipping']['fee']), 2);
            }
            $shippingVoucher['discount'] = round(array_sum(array_column($out, 'shipping_discount')), 2);
        }

        foreach ($out as &$s) {
            $s['total'] = round(max(0, $s['net_merchandise'] - $s['platform_discount']) + max(0, $s['shipping']['fee'] - $s['shipping_discount']), 2);
        }
        unset($s);

        if ($wanted === [] && $problems === []) {
            $problems[] = ['type' => 'empty', 'message' => 'Choose at least one item to check out.'];
        }
        if (! $destination || empty($destination['barangay'] ?? null)) {
            $problems[] = ['type' => 'address', 'message' => 'Choose a delivery address.'];
        }

        $totals = [
            'items'             => array_sum(array_map(fn ($s) => array_sum(array_column($s['lines'], 'quantity')), $out)),
            'merchandise'       => round(array_sum(array_column($out, 'merchandise')), 2),
            'promo_discount'    => round(array_sum(array_column($out, 'promo_discount')), 2),
            'store_discount'    => round(array_sum(array_column($out, 'store_discount')), 2),
            'platform_discount' => round(array_sum(array_column($out, 'platform_discount')), 2),
            'shipping'          => $shipAll,
            'shipping_discount' => round(array_sum(array_column($out, 'shipping_discount')), 2),
            'total'             => round(array_sum(array_column($out, 'total')), 2),
        ];

        return [
            'stores'           => array_values($out),
            'platform_voucher' => $platform,
            'shipping_voucher' => $shippingVoucher,
            'totals'           => $totals,
            'problems'         => $problems,
            'can_place'        => $problems === [] && $out !== [],
            'wallet'           => $this->walletFor($buyer, $out, $merchAll, $netAll, $shipAll),
        ];
    }

    /** The quote as the page sees it (internal fields dropped). */
    public static function present(array $quote): array
    {
        $quote['stores'] = array_map(function ($s) {
            $s['lines'] = array_map(fn ($l) => array_diff_key($l, array_flip(['category_slug', 'category_id', 'unit_grams', 'flash_sale_id', 'sale_id'])), $s['lines']);

            return $s;
        }, $quote['stores']);

        return $quote;
    }

    /** @return array{0: string, 1: ?string} the line's status and, when it blocks, why */
    private function lineStatus(ProductVariant $v, int $qty, int $alreadyBought, int $productQty): array
    {
        $p = $v->product;
        $profile = $p->seller?->sellerProfile;
        if ($p->trashed() || $v->trashed() || $p->status !== 'active' || $p->seller?->status !== 'active' || $profile?->application_status !== 'approved') {
            return ['unavailable', 'This item is no longer available.'];
        }
        if ($profile?->on_vacation) {
            return ['on_vacation', 'The shop is on vacation, so this item cannot be ordered right now.'];
        }
        if ($v->stock_quantity <= 0) {
            return ['sold_out', 'Sold out.'];
        }
        if ($qty > $v->stock_quantity) {
            return ['insufficient_stock', $v->stock_quantity === 1 ? 'Only 1 is left.' : "Only {$v->stock_quantity} are left."];
        }
        if ($p->purchase_limit && $alreadyBought + $productQty > $p->purchase_limit) {
            return ['limit_exceeded', PurchaseLimits::message((int) $p->purchase_limit, $alreadyBought)];
        }

        return ['available', null];
    }

    private function shippingFor($profile, ?array $destination, int $grams, CourierAssigner $assigner, float $merchandise): array
    {
        $kg = ShippingCalculator::chargeableKg($grams);
        if (! $destination || empty($destination['barangay'] ?? null)) {
            return ['fee' => 0.0, 'courier_fee' => 0.0, 'chargeable_kg' => $kg, 'weight_grams' => $grams, 'route' => null, 'serviceable' => true, 'message' => null, 'free_delivery' => false, 'company_id' => null];
        }
        $origin = $profile ? [
            'region' => $profile->address_region_code ?? null, 'province' => $profile->address_province_code ?? null, 'city' => $profile->address_city_code ?? null,
        ] : null;
        $preferred = $assigner->forRoute($profile?->address_barangay_code, $destination['barangay'] ?? null);
        $q = $this->shipping->quote($origin, $destination, $grams, $preferred);
        $freeFrom = $profile?->free_delivery_min;
        $free = $q['serviceable'] && $freeFrom !== null && $merchandise >= (float) $freeFrom;

        return [
            'fee'           => $free ? 0.0 : $q['fee'],
            'courier_fee'   => $q['fee'],
            'chargeable_kg' => $q['chargeable_kg'],
            'weight_grams'  => $grams,
            'route'         => $q['route'],
            'serviceable'   => $q['serviceable'],
            'message'       => $q['message'],
            'free_delivery' => $free,
            // The courier that serves the route takes the parcel; its rate table, or the default one, sets the fee.
            'company_id'    => $preferred ?? $q['company_id'],
        ];
    }

    private function applyStoreVoucher(User $buyer, int $sellerId, string $code, array $lines): array
    {
        $v = $this->vouchers->find($code);
        if (! $v) {
            return ['code' => Voucher::normalizeCode($code), 'applied' => false, 'discount' => 0.0, 'message' => 'No voucher matches this code.', 'shares' => []];
        }
        $usable = array_values(array_filter($lines, fn ($l) => $l['status'] === 'available'));
        $res = $this->vouchers->storeDiscount($v, $buyer, $sellerId, array_map(fn ($l) => [
            'key' => $l['key'], 'product_id' => $l['product_id'], 'net' => round($l['subtotal'] - $l['promo_share'], 2),
        ], $usable));

        return [
            'id' => $v->id, 'code' => $v->code, 'name' => $v->name, 'label' => $v->label(),
            'applied' => $res['ok'], 'discount' => $res['discount'], 'message' => $res['message'], 'shares' => $res['shares'],
        ];
    }

    private function applyPlatformVoucher(User $buyer, ?string $code, float $merch, float $net): ?array
    {
        if ($code === null || trim($code) === '') {
            return null;
        }
        $v = $this->vouchers->find($code);
        if (! $v) {
            return ['code' => Voucher::normalizeCode($code), 'applied' => false, 'discount' => 0.0, 'message' => 'No voucher matches this code.'];
        }
        $res = $this->vouchers->platformDiscount($v, $buyer, $merch, $net);

        return ['id' => $v->id, 'code' => $v->code, 'name' => $v->name, 'label' => $v->label(), 'applied' => $res['ok'], 'discount' => $res['discount'], 'message' => $res['message']];
    }

    private function applyShippingVoucher(User $buyer, ?string $code, float $merch, float $shipping): ?array
    {
        if ($code === null || trim($code) === '') {
            return null;
        }
        $v = $this->vouchers->find($code);
        if (! $v) {
            return ['code' => Voucher::normalizeCode($code), 'applied' => false, 'discount' => 0.0, 'message' => 'No voucher matches this code.'];
        }
        $res = $this->vouchers->shippingDiscount($v, $buyer, $merch, $shipping);

        return ['id' => $v->id, 'code' => $v->code, 'name' => $v->name, 'label' => $v->label(), 'applied' => $res['ok'], 'discount' => $res['discount'], 'message' => $res['message']];
    }

    /** What each voucher in the wallet would do for this checkout, for the voucher pickers. */
    private function walletFor(User $buyer, array $stores, float $merch, float $net, float $shipping): array
    {
        $rows = [];
        foreach ($this->vouchers->wallet($buyer) as $v) {
            if ($v->scope === Voucher::SCOPE_STORE && ! isset($stores[(int) $v->seller_id])) {
                continue;
            }
            $res = match ($v->scope) {
                Voucher::SCOPE_STORE => $this->vouchers->storeDiscount($v, $buyer, (int) $v->seller_id, array_map(fn ($l) => [
                    'key' => $l['key'], 'product_id' => $l['product_id'], 'net' => round($l['subtotal'] - $l['promo_share'], 2),
                ], array_values(array_filter($stores[(int) $v->seller_id]['lines'], fn ($l) => $l['status'] === 'available')))),
                Voucher::SCOPE_PLATFORM => $this->vouchers->platformDiscount($v, $buyer, $merch, $net),
                default => $this->vouchers->shippingDiscount($v, $buyer, $merch, $shipping),
            };
            $rows[] = $this->vouchers->present($v, null) + ['applicable' => $res['ok'], 'discount' => $res['discount'], 'message' => $res['message']];
        }

        return $rows;
    }
}
