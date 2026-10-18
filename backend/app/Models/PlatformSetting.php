<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlatformSetting extends Model
{
    protected $fillable = [
        'key',
        'value',
        'description',
    ];

    public static function get(string $key, mixed $default = null): mixed
    {
        $setting = static::where('key', $key)->first();
        if (!$setting || $setting->value === null) {
            return $default;
        }

        // Auto decode JSON if valid
        $decoded = json_decode($setting->value, true);
        if (json_last_error() === JSON_ERROR_NONE && (is_array($decoded) || is_object($decoded))) {
            return $decoded;
        }

        return $setting->value;
    }

    // ── Commission (A9) ──────────────────────────────────────────────────────

    /** The platform rate as a fraction (0.05 = 5%), set on Platform Settings. */
    public static function baseCommissionRate(): float
    {
        return (float) static::get('base_commission_rate', 0.05);
    }

    /**
     * The rate for a product's category, as a fraction. A category's own override (Platform Settings or the
     * Categories page, stored as a percent on the category) wins; a sub-category without one takes its parent's;
     * otherwise the platform rate applies. Matching is by category, never by name, so only real categories count.
     */
    public static function commissionRateForCategory(?int $categoryId): float
    {
        $base = static::baseCommissionRate();
        $category = $categoryId ? Category::find($categoryId, ['id', 'parent_id', 'commission_rate']) : null;
        if (! $category) {
            return $base;
        }
        if ($category->commission_rate !== null) {
            return round((float) $category->commission_rate / 100, 4);
        }
        $parentRate = $category->parent_id ? Category::whereKey($category->parent_id)->value('commission_rate') : null;

        return $parentRate !== null ? round((float) $parentRate / 100, 4) : $base;
    }

    // ── Returns (A31) ────────────────────────────────────────────────────────

    public const RETURN_DEFAULTS = [
        'return_window_days'   => 7,
        'seller_response_days' => 3,
        'escalation_days'      => 3,
        'summary'              => 'Return an item within 7 days of delivery with photos of the problem. The shop has 3 days to answer; a request it does not answer is approved and refunded.',
        'non_returnable_categories' => [
            'Food & Grocery' => 'Perishable food and grocery items cannot be returned once delivered for health and safety reasons, except for damaged, expired, or incorrect deliveries.',
            'Personalized & Custom Items' => 'Custom-made, engraved, or customized orders are non-returnable unless defective or incorrect.',
            'Personal Care & Undergarments' => 'Hygiene, cosmetics, intimate apparel, and personal care products with opened protective seals.',
        ],
        'mediation_terms'      => 'If the shop rejects your return, you can escalate it to Loved-IT within 3 days. Loved-IT then decides: a full refund, or the return is closed and the order completes.',
    ];

    /** The return policy, with every key present (a policy saved before a key existed gets its default). */
    public static function getReturnPolicy(): array
    {
        $saved = static::get('return_policy_config', []);
        $policy = array_merge(self::RETURN_DEFAULTS, is_array($saved) ? $saved : []);
        unset($policy['auto_escalation_hours']);

        return $policy;
    }

    /** Days after delivery a buyer can ask for a return. */
    public static function returnWindowDays(): int
    {
        return max(1, (int) static::getReturnPolicy()['return_window_days']);
    }

    /** Days the shop has to answer a return request before it is approved automatically. */
    public static function sellerResponseDays(): int
    {
        return max(1, (int) static::getReturnPolicy()['seller_response_days']);
    }

    /** Days the buyer has to escalate a rejected return to Loved-IT. */
    public static function escalationDays(): int
    {
        return max(1, (int) static::getReturnPolicy()['escalation_days']);
    }
}
