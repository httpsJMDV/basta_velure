<?php

namespace App\Services\Commerce;

use App\Models\User;
use App\Models\Voucher;
use App\Models\VoucherClaim;
use Illuminate\Support\Collection;

/**
 * Checks and prices vouchers (B7, S9).
 *
 * A2: per order at most one store voucher per store, one platform voucher and one shipping voucher; choosing another
 * of the same kind replaces the first. A4: vouchers apply to items already on sale and the minimum spend is checked
 * against the price actually paid. A store voucher limited to some products counts only those products, both for
 * its minimum spend and for its discount. The merchandise total never goes below zero.
 */
class VoucherEngine
{
    private const TZ = 'Asia/Manila';

    public function find(?string $code): ?Voucher
    {
        $code = Voucher::normalizeCode($code);

        return $code === '' ? null : Voucher::with('products:id')->where('code', $code)->first();
    }

    /**
     * Why a voucher cannot be used by this buyer at all right now (before looking at the cart), or null.
     */
    public function unusableReason(Voucher $v, ?User $buyer): ?string
    {
        $now = now();
        if ($v->ended_at) {
            return 'This voucher is no longer available.';
        }
        if ($v->starts_at->gt($now)) {
            return 'This voucher starts on ' . $v->starts_at->setTimezone(self::TZ)->format('M j, Y g:i A') . '.';
        }
        if ($v->ends_at->lte($now)) {
            return 'This voucher expired on ' . $v->ends_at->setTimezone(self::TZ)->format('M j, Y') . '.';
        }
        if ($v->limitReached()) {
            return 'This voucher has been fully used.';
        }
        if ($buyer && $v->usesBy($buyer->id) >= max(1, $v->per_buyer_limit)) {
            return 'You already used this voucher.';
        }

        return null;
    }

    /**
     * A store voucher on one store's lines.
     *
     * @param  array<int, array{key: string, product_id: int, net: float}>  $lines  the store's lines after promotions
     * @return array{ok: bool, discount: float, message: ?string, shares: array<string, float>}
     */
    public function storeDiscount(Voucher $v, ?User $buyer, int $sellerId, array $lines): array
    {
        $fail = fn (string $m) => ['ok' => false, 'discount' => 0.0, 'message' => $m, 'shares' => []];
        if ($v->scope !== Voucher::SCOPE_STORE) {
            return $fail('This is not a store voucher.');
        }
        if ((int) $v->seller_id !== $sellerId) {
            return $fail('This voucher is for another shop.');
        }
        if ($reason = $this->unusableReason($v, $buyer)) {
            return $fail($reason);
        }
        $ids = $v->applies_to === 'products' ? $v->products->pluck('id')->map(fn ($id) => (int) $id)->all() : null;
        $eligible = array_values(array_filter($lines, fn ($l) => $ids === null || in_array($l['product_id'], $ids, true)));
        $base = round(array_sum(array_column($eligible, 'net')), 2);
        if ($eligible === [] || $base <= 0) {
            return $fail('This voucher does not apply to the items you are buying from this shop.');
        }
        if ($base < (float) $v->min_spend) {
            return $fail(self::spendMore((float) $v->min_spend - $base));
        }
        $discount = min($this->amountOff($v, $base), $base);
        $shares = PromotionApplier::split($discount, array_combine(array_column($eligible, 'key'), array_column($eligible, 'net')));

        return ['ok' => true, 'discount' => round($discount, 2), 'message' => null, 'shares' => $shares];
    }

    /**
     * A platform voucher on the whole checkout. Its minimum spend counts the merchandise of every store (A8 worked
     * example: 1,098 >= 1,000); the discount never exceeds what is left after the store vouchers.
     *
     * @return array{ok: bool, discount: float, message: ?string}
     */
    public function platformDiscount(Voucher $v, ?User $buyer, float $merchandise, float $afterStoreVouchers): array
    {
        if ($v->scope !== Voucher::SCOPE_PLATFORM) {
            return ['ok' => false, 'discount' => 0.0, 'message' => $v->scope === Voucher::SCOPE_SHIPPING ? 'This is a shipping voucher. Add it as the shipping voucher.' : 'This is a store voucher. Add it to its shop.'];
        }
        if ($reason = $this->unusableReason($v, $buyer)) {
            return ['ok' => false, 'discount' => 0.0, 'message' => $reason];
        }
        if ($merchandise < (float) $v->min_spend) {
            return ['ok' => false, 'discount' => 0.0, 'message' => self::spendMore((float) $v->min_spend - $merchandise)];
        }

        return ['ok' => true, 'discount' => round(min($this->amountOff($v, $merchandise), max(0, $afterStoreVouchers)), 2), 'message' => null];
    }

    /**
     * A shipping voucher: off the shipping fees, never below zero (B7: ₱50 off ₱65 leaves ₱15; ₱50 off ₱50 is ₱0).
     *
     * @return array{ok: bool, discount: float, message: ?string}
     */
    public function shippingDiscount(Voucher $v, ?User $buyer, float $merchandise, float $shipping): array
    {
        if ($v->scope !== Voucher::SCOPE_SHIPPING) {
            return ['ok' => false, 'discount' => 0.0, 'message' => 'This is not a shipping voucher.'];
        }
        if ($reason = $this->unusableReason($v, $buyer)) {
            return ['ok' => false, 'discount' => 0.0, 'message' => $reason];
        }
        if ($merchandise < (float) $v->min_spend) {
            return ['ok' => false, 'discount' => 0.0, 'message' => self::spendMore((float) $v->min_spend - $merchandise)];
        }
        if ($shipping <= 0) {
            return ['ok' => false, 'discount' => 0.0, 'message' => 'This order already has free shipping.'];
        }

        return ['ok' => true, 'discount' => round(min($this->amountOff($v, $shipping), $shipping), 2), 'message' => null];
    }

    /** The amount a voucher takes off a base, with its cap. */
    public function amountOff(Voucher $v, float $base): float
    {
        if ($v->discount_type === 'percent') {
            $off = round($base * (float) $v->amount / 100, 2, PHP_ROUND_HALF_UP);
            if ($v->max_discount !== null) {
                $off = min($off, (float) $v->max_discount);
            }

            return $off;
        }

        return (float) $v->amount;
    }

    public static function spendMore(float $short): string
    {
        return 'Spend ₱' . number_format(max(0.01, round($short, 2)), 2) . ' more to use this voucher.';
    }

    /**
     * The vouchers in a buyer's wallet that can still be used (claimed, running or starting later, not used up by them).
     *
     * @return Collection<int, Voucher>
     */
    public function wallet(User $buyer): Collection
    {
        $ids = VoucherClaim::where('user_id', $buyer->id)->pluck('voucher_id');

        return Voucher::with(['products:id', 'seller.sellerProfile'])
            ->whereIn('id', $ids)
            ->whereNull('ended_at')
            ->where('ends_at', '>', now())
            ->orderBy('ends_at')
            ->get()
            ->filter(fn (Voucher $v) => $v->usesBy($buyer->id) < max(1, $v->per_buyer_limit))
            ->values();
    }

    /** What a buyer sees about a voucher. */
    public function present(Voucher $v, ?User $buyer = null): array
    {
        $profile = $v->seller?->sellerProfile;

        return [
            'id'            => $v->id,
            'code'          => $v->code,
            'name'          => $v->name,
            'scope'         => $v->scope,
            'label'         => $v->label(),
            'discount_type' => $v->discount_type,
            'amount'        => (float) $v->amount,
            'max_discount'  => $v->max_discount !== null ? (float) $v->max_discount : null,
            'min_spend'     => (float) $v->min_spend,
            'applies_to'    => $v->applies_to,
            'product_ids'   => $v->applies_to === 'products' ? $v->products->pluck('id')->values() : [],
            'starts_at'     => $v->starts_at->toIso8601String(),
            'ends_at'       => $v->ends_at->toIso8601String(),
            'status'        => $v->statusAt(),
            'seller'        => $v->seller_id ? ['id' => $v->seller_id, 'shop_name' => $profile?->shop_name, 'shop_slug' => $profile?->shop_name ? \Illuminate\Support\Str::slug($profile->shop_name) : null] : null,
            'claimed'       => $buyer ? VoucherClaim::where('voucher_id', $v->id)->where('user_id', $buyer->id)->exists() : false,
            'fully_used'    => $v->limitReached(),
        ];
    }
}
