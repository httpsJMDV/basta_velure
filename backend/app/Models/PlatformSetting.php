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

    public static function getCommissionRateForCategory(?string $categoryId): float
    {
        $baseRate = (float) static::get('base_commission_rate', 0.10);
        if (!$categoryId) {
            return $baseRate;
        }

        $overrides = static::get('category_commission_overrides', [
            'food-beverage'    => 0.08,
            'food-grocery'     => 0.08,
            'food_and_grocery' => 0.08,
            'groceries'        => 0.08,
        ]);

        if (is_array($overrides)) {
            $catLower = strtolower(trim($categoryId));
            foreach ($overrides as $pattern => $rate) {
                if (stripos($catLower, $pattern) !== false || $catLower === strtolower($pattern)) {
                    return (float) $rate;
                }
            }
        }

        return $baseRate;
    }

    public static function getReturnPolicy(): array
    {
        return static::get('return_policy_config', [
            'return_window_days'    => 7,
            'auto_escalation_hours' => 48,
            'summary'               => '7-day standard return window upon delivery for eligible items in original, unused condition with complete packaging and tags.',
            'non_returnable_categories' => [
                'Food & Grocery' => 'Perishable food and grocery items cannot be returned once delivered for health and safety reasons, except for damaged, expired, or incorrect deliveries.',
                'Personalized & Custom Items' => 'Custom-made, engraved, or customized orders are non-returnable unless defective or incorrect.',
                'Personal Care & Undergarments' => 'Hygiene, cosmetics, intimate apparel, and personal care products with opened protective seals.',
            ],
            'mediation_terms'       => 'If the seller rejects your return or does not respond within 48 hours, your request is automatically escalated to Loved-IT Platform Mediation for binding review.',
        ]);
    }
}

