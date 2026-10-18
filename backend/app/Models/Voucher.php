<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A voucher (B7, S9). A store voucher is the shop's and funded by it; platform and shipping vouchers are Loved-IT's
 * (A8). Codes are 4 to 12 letters and digits, saved in uppercase and unique across the platform (A26).
 */
class Voucher extends Model
{
    public const SCOPE_STORE = 'store';
    public const SCOPE_PLATFORM = 'platform';
    public const SCOPE_SHIPPING = 'shipping';

    public const CODE_REGEX = '/^[A-Z0-9]{4,12}$/';

    protected $fillable = [
        'seller_id', 'code', 'name', 'scope', 'discount_type', 'amount', 'max_discount', 'min_spend', 'total_limit',
        'per_buyer_limit', 'claimable', 'applies_to', 'starts_at', 'ends_at', 'ended_at', 'used_count', 'claimed_count',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2', 'max_discount' => 'decimal:2', 'min_spend' => 'decimal:2',
            'claimable' => 'boolean', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'ended_at' => 'datetime',
            'total_limit' => 'integer', 'per_buyer_limit' => 'integer', 'used_count' => 'integer', 'claimed_count' => 'integer',
        ];
    }

    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }

    public function products(): BelongsToMany { return $this->belongsToMany(Product::class, 'voucher_products'); }

    public function claims(): HasMany { return $this->hasMany(VoucherClaim::class); }

    public function usages(): HasMany { return $this->hasMany(VoucherUsage::class); }

    /** Trimmed and in uppercase; a space inside is kept, so "MCH 50" is refused rather than read as MCH50 (A26). */
    public static function normalizeCode(?string $code): string
    {
        return strtoupper(trim((string) $code));
    }

    /** upcoming, ongoing or ended (ended early or past its end). */
    public function statusAt(?CarbonInterface $at = null): string
    {
        $at ??= now();
        if ($this->ended_at || $this->ends_at->lte($at)) {
            return 'ended';
        }

        return $this->starts_at->gt($at) ? 'upcoming' : 'ongoing';
    }

    public function scopeRunning(Builder $q, ?CarbonInterface $at = null): Builder
    {
        $at ??= now();

        return $q->whereNull('ended_at')->where('starts_at', '<=', $at)->where('ends_at', '>', $at);
    }

    public function limitReached(): bool
    {
        return $this->total_limit !== null && $this->used_count >= $this->total_limit;
    }

    /**
     * Checkouts in which this buyer used the voucher and that still count (a cancelled order's use was returned). A
     * platform voucher split over several store orders is one use.
     */
    public function usesBy(int $userId): int
    {
        return $this->usages()->where('user_id', $userId)->whereNull('returned_at')->distinct()->count('checkout_group_id');
    }

    /** "₱50 off", "10% off up to ₱100", "Shipping up to ₱50 off". */
    public function label(): string
    {
        $peso = fn ($v) => '₱' . rtrim(rtrim(number_format((float) $v, 2), '0'), '.');
        if ($this->scope === self::SCOPE_SHIPPING) {
            return $this->discount_type === 'percent'
                ? rtrim(rtrim((string) $this->amount, '0'), '.') . '% off shipping' . ($this->max_discount ? ' up to ' . $peso($this->max_discount) : '')
                : 'Shipping up to ' . $peso($this->amount) . ' off';
        }
        if ($this->discount_type === 'percent') {
            return rtrim(rtrim((string) $this->amount, '0'), '.') . '% off' . ($this->max_discount ? ' up to ' . $peso($this->max_discount) : '');
        }

        return $peso($this->amount) . ' off';
    }
}
