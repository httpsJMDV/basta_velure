<?php

namespace App\Services\Commerce;

use App\Models\Product;
use App\Models\Voucher;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Creating and editing vouchers (S9, A26, A27).
 *
 * Codes: 4 to 12 letters and digits, no spaces or symbols, saved in uppercase, unique across the platform. A fixed
 * amount cannot exceed the minimum spend; a percentage is 1% to 99% with an optional cap above ₱0; usage limits are
 * at least 1 and the per-buyer limit cannot exceed the total; the end is after the start. Once any buyer has claimed
 * a voucher only its end date (later) and total usage limit (higher) can change.
 */
class VoucherForm
{
    private const TZ = 'Asia/Manila';

    /** @return array<string, mixed> attributes to save */
    public function validated(Request $request, string $scope, ?int $sellerId, ?Voucher $editing = null): array
    {
        if ($editing && ($editing->claimed_count > 0 || $editing->claims()->exists())) {
            return $this->claimedChanges($request, $editing);
        }

        $request->merge(['code' => Voucher::normalizeCode($request->input('code', $editing?->code))]);
        $data = $request->validate([
            'code'            => ['required', 'string', 'regex:' . Voucher::CODE_REGEX],
            'name'            => \App\Support\Validation::displayName(3, 80),
            'discount_type'   => ['required', 'in:fixed,percent'],
            'amount'          => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'max_discount'    => ['nullable', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'min_spend'       => ['nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:1000000'],
            'total_limit'     => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'per_buyer_limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'claimable'       => ['nullable', 'boolean'],
            'applies_to'      => ['nullable', 'in:all,products'],
            'product_ids'     => ['nullable', 'array', 'max:100'],
            'product_ids.*'   => ['integer', 'distinct'],
            'starts_at'       => ['required', 'date'],
            'ends_at'         => ['required', 'date'],
        ], [
            'code.required'      => 'Enter a voucher code.',
            'code.regex'         => 'The code must be 4 to 12 letters and digits, with no spaces or symbols.',
            'name.required'      => 'Give the voucher a name buyers will see.',
            'name.min'           => 'The voucher name must be 3 to 80 characters.',
            'name.max'           => 'The voucher name must be 3 to 80 characters.',
            'name.regex'         => 'The voucher name needs at least two letters.',
            'amount.gt'          => 'The discount must be more than ₱0.',
            'amount.decimal'     => 'The discount can have at most 2 decimal places.',
            'max_discount.gt'    => 'The cap must be more than ₱0.',
            'total_limit.min'    => 'The total usage limit must be at least 1.',
            'per_buyer_limit.min' => 'The per-buyer limit must be at least 1.',
        ]);

        $errors = [];
        $clash = Voucher::where('code', $data['code'])->when($editing, fn ($q) => $q->whereKeyNot($editing->id))->exists();
        if ($clash) {
            $errors['code'] = 'This code is already used by another voucher. Choose a different code.';
        }
        $amount = (float) $data['amount'];
        $min = (float) ($data['min_spend'] ?? 0);
        if ($data['discount_type'] === 'percent') {
            if (! ctype_digit((string) $data['amount']) && fmod($amount, 1.0) !== 0.0) {
                $errors['amount'] = 'Use a whole percentage from 1% to 99%.';
            } elseif ($amount < 1 || $amount > 99) {
                $errors['amount'] = 'The percentage must be from 1% to 99%.';
            }
        } else {
            $data['max_discount'] = null;
            if ($scope !== Voucher::SCOPE_SHIPPING && $amount > $min) {
                $errors['amount'] = 'The discount cannot be more than the minimum spend (₱' . number_format($min, 2) . ').';
            }
        }
        $total = $data['total_limit'] ?? null;
        $perBuyer = (int) ($data['per_buyer_limit'] ?? 1);
        if ($total !== null && $perBuyer > (int) $total) {
            $errors['per_buyer_limit'] = 'The per-buyer limit cannot be more than the total usage limit.';
        }
        $start = $this->manila($data['starts_at']);
        $end = $this->manila($data['ends_at']);
        if ($end->lte($start)) {
            $errors['ends_at'] = 'The end must be after the start.';
        }
        if ((! $editing || $editing->statusAt() === 'upcoming') && $start->lt(now()->subMinutes(5))) {
            $errors['starts_at'] = 'The start cannot be in the past.';
        }
        $appliesTo = $scope === Voucher::SCOPE_STORE ? ($data['applies_to'] ?? 'all') : 'all';
        $productIds = [];
        if ($appliesTo === 'products') {
            $productIds = array_map('intval', $data['product_ids'] ?? []);
            if ($productIds === []) {
                $errors['product_ids'] = 'Choose at least one product, or apply the voucher to all products.';
            } elseif (Product::whereIn('id', $productIds)->where('seller_id', $sellerId)->count() !== count($productIds)) {
                $errors['product_ids'] = 'Choose products from your own store.';
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return [
            'code' => $data['code'], 'name' => trim(strip_tags($data['name'])), 'scope' => $scope, 'seller_id' => $sellerId,
            'discount_type' => $data['discount_type'], 'amount' => $amount, 'max_discount' => $data['max_discount'] ?? null,
            'min_spend' => $min, 'total_limit' => $total, 'per_buyer_limit' => $perBuyer,
            'claimable' => (bool) ($data['claimable'] ?? true), 'applies_to' => $appliesTo,
            'starts_at' => $start->utc(), 'ends_at' => $end->utc(), '_product_ids' => $productIds,
        ];
    }

    /** A27: after a claim, only a later end date and a higher total usage limit. */
    private function claimedChanges(Request $request, Voucher $v): array
    {
        $locked = ['code', 'name', 'discount_type', 'amount', 'max_discount', 'min_spend', 'per_buyer_limit', 'claimable', 'applies_to', 'product_ids', 'starts_at'];
        $errors = [];
        foreach ($locked as $field) {
            if (! $request->has($field)) {
                continue;
            }
            $sent = $request->input($field);
            $now = match ($field) {
                'starts_at' => $v->starts_at->setTimezone(self::TZ)->format('Y-m-d H:i'),
                'product_ids' => $v->products()->pluck('products.id')->sort()->values()->all(),
                default => $v->{$field},
            };
            $same = match ($field) {
                'starts_at' => $this->manila((string) $sent)->format('Y-m-d H:i') === $now,
                'product_ids' => collect((array) $sent)->map(fn ($x) => (int) $x)->sort()->values()->all() === $now,
                'amount', 'max_discount', 'min_spend' => ($sent === null && $now === null) || abs((float) $sent - (float) $now) < 0.005,
                'claimable' => (bool) $sent === (bool) $now,
                'code' => Voucher::normalizeCode((string) $sent) === $now,
                default => (string) $sent === (string) $now,
            };
            if (! $same) {
                $errors[$field] = 'Buyers have already claimed this voucher, so this field is locked. You can extend the end date or raise the usage limit.';
            }
        }
        $data = $request->validate([
            'ends_at'     => ['nullable', 'date'],
            'total_limit' => ['nullable', 'integer', 'min:1', 'max:1000000'],
        ]);
        $changes = [];
        if (! empty($data['ends_at'])) {
            $end = $this->manila($data['ends_at']);
            if ($end->lt($v->ends_at)) {
                $errors['ends_at'] = 'Buyers have claimed this voucher: you can only extend the end date.';
            } else {
                $changes['ends_at'] = $end->utc();
            }
        }
        if (array_key_exists('total_limit', $data) && $data['total_limit'] !== null) {
            if ($v->total_limit !== null && (int) $data['total_limit'] < $v->total_limit) {
                $errors['total_limit'] = 'Buyers have claimed this voucher: you can only raise the usage limit.';
            } elseif ((int) $data['total_limit'] < max(1, $v->used_count)) {
                $errors['total_limit'] = "The limit cannot be below the {$v->used_count} uses so far.";
            } else {
                $changes['total_limit'] = (int) $data['total_limit'];
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return $changes;
    }

    public function save(array $attrs, ?Voucher $editing, int $createdBy): Voucher
    {
        $productIds = $attrs['_product_ids'] ?? null;
        unset($attrs['_product_ids']);
        $voucher = $editing ? tap($editing)->update($attrs) : Voucher::create($attrs + ['created_by' => $createdBy]);
        if ($productIds !== null) {
            $voucher->products()->sync($productIds);
        }

        return $voucher->fresh('products');
    }

    /** What the owner sees: usage counters included (S9-011). */
    public static function present(Voucher $v): array
    {
        return [
            'id' => $v->id, 'code' => $v->code, 'name' => $v->name, 'scope' => $v->scope, 'label' => $v->label(),
            'discount_type' => $v->discount_type, 'amount' => (float) $v->amount,
            'max_discount' => $v->max_discount !== null ? (float) $v->max_discount : null, 'min_spend' => (float) $v->min_spend,
            'total_limit' => $v->total_limit, 'per_buyer_limit' => $v->per_buyer_limit, 'claimable' => (bool) $v->claimable,
            'applies_to' => $v->applies_to, 'product_ids' => $v->relationLoaded('products') ? $v->products->pluck('id')->values() : $v->products()->pluck('products.id'),
            'starts_at' => $v->starts_at->toIso8601String(), 'ends_at' => $v->ends_at->toIso8601String(),
            'ended_at' => $v->ended_at?->toIso8601String(), 'status' => $v->statusAt(),
            'used_count' => $v->used_count, 'claimed_count' => $v->claimed_count,
            'locked' => $v->claimed_count > 0,
        ];
    }

    private function manila(string $value): CarbonImmutable
    {
        return preg_match('/(Z|[+-]\d{2}:?\d{2})$/', $value)
            ? CarbonImmutable::parse($value)->setTimezone(self::TZ)
            : CarbonImmutable::parse($value, self::TZ);
    }
}
