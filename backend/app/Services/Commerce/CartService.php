<?php

namespace App\Services\Commerce;

use App\Models\CartItem;
use App\Models\ProductVariant;
use App\Models\User;
use App\Support\Validation;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The buyer's cart (B6), kept on the server so it is the same after logging out and on another device. Every view
 * reads live prices, stock and availability: a price change is shown with the old price, a sold-out, deleted or
 * deactivated item or a shop on vacation is marked and cannot be selected, and quantities stay within stock and the
 * per-buyer purchase limit. Only the buyer's own lines can be read or changed.
 */
class CartService
{
    public function __construct(private readonly CheckoutCalculator $calculator) {}

    public function view(User $user): array
    {
        $items = CartItem::where('user_id', $user->id)->orderBy('id')->get();
        $all = $this->calculator->quote($user, $items->map(fn ($i) => ['variant_id' => $i->product_variant_id, 'quantity' => $i->quantity])->all(), null);
        $selectedItems = $items->filter(fn ($i) => $i->selected);
        $picked = $this->calculator->quote($user, $selectedItems->map(fn ($i) => ['variant_id' => $i->product_variant_id, 'quantity' => $i->quantity])->all(), null);

        $segments = [];
        $storeOf = [];
        foreach ($all['stores'] as $store) {
            foreach ($store['lines'] as $line) {
                $segments[$line['variant_id']][] = $line;
                $storeOf[$line['variant_id']] = $store['seller'];
            }
        }
        $pickedLines = [];
        $pickedStores = [];
        foreach ($picked['stores'] as $store) {
            $pickedStores[$store['seller']['id']] = $store;
            foreach ($store['lines'] as $line) {
                $pickedLines[$line['variant_id']][] = $line;
            }
        }

        $productIds = ProductVariant::withTrashed()->whereIn('id', $items->pluck('product_variant_id'))->pluck('product_id', 'id');
        $bought = PurchaseLimits::bought($user->id, $productIds->values()->all());
        $limits = \App\Models\Product::withTrashed()->whereIn('id', $productIds->values())->pluck('purchase_limit', 'id');
        $inCart = [];
        foreach ($items as $i) {
            $pid = $productIds[$i->product_variant_id] ?? 0;
            $inCart[$pid] = ($inCart[$pid] ?? 0) + $i->quantity;
        }

        $stores = [];
        $priceUpdates = [];
        foreach ($items as $item) {
            $segs = $segments[$item->product_variant_id] ?? [];
            if ($segs === []) {
                continue;
            }
            $first = $segs[0];
            $seller = $storeOf[$item->product_variant_id];
            $pid = $first['product_id'];
            $limit = $limits[$pid] ?? null;
            $limitLeft = $limit ? max(0, $limit - ($bought[$pid] ?? 0) - (($inCart[$pid] ?? 0) - $item->quantity)) : null;
            $subtotal = round(array_sum(array_column($segs, 'subtotal')), 2);
            $current = (float) $first['unit_price'];
            $seen = $item->price_seen !== null ? (float) $item->price_seen : null;
            $changed = $seen !== null && abs($seen - $current) >= 0.005 ? ($current > $seen ? 'up' : 'down') : null;
            if ($seen === null || $changed) {
                $priceUpdates[$item->id] = $current;
            }
            $usedSegs = $pickedLines[$item->product_variant_id] ?? $segs;

            $stores[$seller['id']] ??= ['seller' => $seller, 'lines' => [], 'promotions' => [], 'selected_subtotal' => 0.0, 'promo_discount' => 0.0];
            $stores[$seller['id']]['lines'][] = [
                'id'             => $item->id,
                'variant_id'     => $item->product_variant_id,
                'product_id'     => $pid,
                'name'           => $first['name'],
                'variant_label'  => $first['variant_label'],
                'image_url'      => $first['image_url'],
                'quantity'       => $item->quantity,
                'selected'       => $item->selected && $first['status'] === 'available',
                'status'         => $first['status'],
                'message'        => $first['message'],
                'stock'          => $first['stock'],
                'max_quantity'   => max(0, min($first['stock'], $limitLeft ?? PHP_INT_MAX, Validation::STOCK_MAX)),
                'purchase_limit' => $limit,
                'unit_price'     => $current,
                'regular_price'  => (float) $first['regular_price'],
                'price_source'   => $first['price_source'],
                'subtotal'       => $subtotal,
                'segments'       => array_map(fn ($s) => ['quantity' => $s['quantity'], 'unit_price' => $s['unit_price'], 'price_source' => $s['price_source']], $segs),
                'price_seen'     => $seen,
                'price_changed'  => $changed,
                'promo_share'    => round(array_sum(array_column($usedSegs, 'promo_share')), 2),
                'free_quantity'  => (int) array_sum(array_column($usedSegs, 'free_quantity')),
            ];
        }
        foreach ($stores as $sid => &$s) {
            $p = $pickedStores[$sid] ?? null;
            $s['promotions'] = $p['promotions'] ?? [];
            $s['selected_subtotal'] = $p ? round($p['merchandise'], 2) : 0.0;
            $s['promo_discount'] = $p ? round($p['promo_discount'], 2) : 0.0;
        }
        unset($s);

        foreach ($priceUpdates as $id => $price) {
            CartItem::whereKey($id)->update(['price_seen' => $price]);
        }

        $lines = collect($stores)->flatMap(fn ($s) => $s['lines']);
        $selectedLines = $lines->where('selected', true);

        return [
            'stores'  => array_values($stores),
            'summary' => [
                'lines'            => $lines->count(),
                'units'            => (int) $lines->sum('quantity'),
                'selected_lines'   => $selectedLines->count(),
                'selected_units'   => (int) $selectedLines->sum('quantity'),
                'merchandise'      => round($selectedLines->sum('subtotal'), 2),
                'promo_discount'   => round(collect($stores)->sum('promo_discount'), 2),
                'total'            => round($selectedLines->sum('subtotal') - collect($stores)->sum('promo_discount'), 2),
                'has_unavailable'  => $lines->contains(fn ($l) => $l['status'] !== 'available'),
            ],
        ];
    }

    /** Adds units of a variant, keeping the line within stock and the purchase limit. */
    public function add(User $user, int $variantId, mixed $quantity): void
    {
        $qty = $this->quantity($quantity);
        DB::transaction(function () use ($user, $variantId, $qty) {
            $variant = ProductVariant::with(['product.seller.sellerProfile'])->find($variantId);
            $this->assertBuyable($variant);
            $line = CartItem::where('user_id', $user->id)->where('product_variant_id', $variantId)->lockForUpdate()->first();
            if (! $line && CartItem::where('user_id', $user->id)->count() >= CartItem::MAX_LINES) {
                $this->fail('quantity', 'Your cart is full (' . CartItem::MAX_LINES . ' items). Remove something first.');
            }
            $total = ($line?->quantity ?? 0) + $qty;
            $this->assertWithinLimits($user, $variant, $total, $line?->id);
            $price = \App\Services\Pricing\PriceBook::for([$variant->product_id])->unit($variant)['price'];
            if ($line) {
                $line->update(['quantity' => $total, 'selected' => true, 'price_seen' => $price]);
            } else {
                CartItem::create([
                    'user_id' => $user->id, 'product_id' => $variant->product_id, 'product_variant_id' => $variantId,
                    'quantity' => $qty, 'selected' => true, 'price_seen' => $price,
                ]);
            }
        });
    }

    public function update(User $user, int $lineId, array $data): void
    {
        DB::transaction(function () use ($user, $lineId, $data) {
            $line = CartItem::where('user_id', $user->id)->whereKey($lineId)->lockForUpdate()->first();
            if (! $line) {
                abort(404, 'This item is not in your cart.');
            }
            $variant = ProductVariant::withTrashed()->with(['product' => fn ($q) => $q->withTrashed()->with('seller.sellerProfile')])->find($line->product_variant_id);
            $changes = [];
            if (array_key_exists('quantity', $data)) {
                $raw = $data['quantity'];
                if ((is_int($raw) || (is_string($raw) && preg_match('/^\d+$/', trim($raw)))) && (int) $raw === 0) {
                    $this->fail('quantity', 'The quantity must be at least 1. Remove the item to take it out of your cart.');
                }
                $qty = $this->quantity($raw);
                $this->assertBuyable($variant);
                $this->assertWithinLimits($user, $variant, $qty, $line->id);
                $changes['quantity'] = $qty;
            }
            if (array_key_exists('selected', $data)) {
                $on = filter_var($data['selected'], FILTER_VALIDATE_BOOLEAN);
                if ($on) {
                    $this->assertBuyable($variant, 'selected');
                    $this->assertWithinLimits($user, $variant, $changes['quantity'] ?? $line->quantity, $line->id, 'selected');
                }
                $changes['selected'] = $on;
            }
            if ($changes) {
                $line->update($changes);
            }
        });
    }

    /** Selects or clears every line that can be checked out, for one store or the whole cart. */
    public function select(User $user, bool $on, ?int $sellerId): void
    {
        $lines = CartItem::where('user_id', $user->id)
            ->when($sellerId, fn ($q) => $q->whereHas('product', fn ($p) => $p->where('seller_id', $sellerId)))
            ->get();
        if (! $on) {
            CartItem::whereIn('id', $lines->pluck('id'))->update(['selected' => false]);

            return;
        }
        $view = $this->view($user);
        $ok = collect($view['stores'])->flatMap(fn ($s) => $s['lines'])->where('status', 'available')->pluck('id');
        CartItem::whereIn('id', $lines->pluck('id')->intersect($ok))->update(['selected' => true]);
    }

    public function remove(User $user, int $lineId): void
    {
        $deleted = CartItem::where('user_id', $user->id)->whereKey($lineId)->delete();
        if (! $deleted) {
            abort(404, 'This item is not in your cart.');
        }
    }

    /**
     * Moves a guest cart into the account after login. Lines that cannot be added (sold out, over the limit) are
     * skipped and reported.
     *
     * @param  array<int, array{variant_id: int, quantity: int}>  $lines
     * @return array<int, array{variant_id: int, message: string}>
     */
    public function merge(User $user, array $lines): array
    {
        $skipped = [];
        foreach ($lines as $l) {
            try {
                $this->add($user, (int) ($l['variant_id'] ?? 0), $l['quantity'] ?? 1);
            } catch (ValidationException $e) {
                $skipped[] = ['variant_id' => (int) ($l['variant_id'] ?? 0), 'message' => collect($e->errors())->flatten()->first() ?? 'Could not be added.'];
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                $skipped[] = ['variant_id' => (int) ($l['variant_id'] ?? 0), 'message' => $e->getMessage()];
            }
        }

        return $skipped;
    }

    private function quantity(mixed $raw): int
    {
        $ok = is_int($raw) || (is_string($raw) && preg_match('/^\d+$/', trim($raw)));
        if (! $ok || (int) $raw < 1 || (int) $raw > Validation::STOCK_MAX) {
            $this->fail('quantity', 'Enter a whole-number quantity of at least 1.');
        }

        return (int) $raw;
    }

    private function assertBuyable(?ProductVariant $variant, string $field = 'variant_id'): void
    {
        $p = $variant?->product;
        $profile = $p?->seller?->sellerProfile;
        if (! $variant || ! $p || $variant->trashed() || $p->trashed() || $p->status !== 'active' || $p->seller?->status !== 'active' || $profile?->application_status !== 'approved') {
            $this->fail($field, 'This item is no longer available.');
        }
        if ($profile?->on_vacation) {
            $this->fail($field, 'This shop is on vacation, so its items cannot be added or checked out right now.');
        }
        if ($variant->stock_quantity <= 0) {
            $this->fail($field, 'This item is sold out.');
        }
    }

    private function assertWithinLimits(User $user, ProductVariant $variant, int $quantity, ?int $lineId, string $field = 'quantity'): void
    {
        if ($quantity > $variant->stock_quantity) {
            $this->fail($field, $variant->stock_quantity === 1 ? 'Only 1 is available.' : "Only {$variant->stock_quantity} are available.");
        }
        $limit = (int) ($variant->product->purchase_limit ?? 0);
        if ($limit > 0) {
            $already = PurchaseLimits::bought($user->id, [$variant->product_id])[$variant->product_id] ?? 0;
            $others = (int) CartItem::where('user_id', $user->id)->where('product_id', $variant->product_id)
                ->when($lineId, fn ($q) => $q->whereKeyNot($lineId))->sum('quantity');
            if ($already + $others + $quantity > $limit) {
                $this->fail($field, PurchaseLimits::message($limit, $already));
            }
        }
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
