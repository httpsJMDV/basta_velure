<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPlatformSettingController extends Controller
{
    /**
     * GET /api/v1/admin/settings/commission
     */
    public function getCommissionSettings(): JsonResponse
    {
        $baseRate = (float) PlatformSetting::get('base_commission_rate', 0.10);
        $overrides = PlatformSetting::get('category_commission_overrides', [
            'food-beverage'    => 0.08,
            'food-grocery'     => 0.08,
            'food_and_grocery' => 0.08,
            'groceries'        => 0.08,
        ]);

        $formattedOverrides = [];
        if (is_array($overrides)) {
            foreach ($overrides as $catKey => $rate) {
                $formattedOverrides[] = [
                    'category_key'  => $catKey,
                    'category_name' => ucwords(str_replace(['-', '_'], ' ', $catKey)),
                    'rate_percent'  => round(((float) $rate) * 100, 2),
                ];
            }
        }

        return response()->json([
            'data' => [
                'base_rate_percent' => round($baseRate * 100, 2),
                'overrides'         => $formattedOverrides,
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/settings/commission
     */
    public function updateCommissionSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'base_rate_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'overrides'         => ['nullable', 'array'],
            'overrides.*.category_key' => ['required', 'string', 'max:100'],
            'overrides.*.rate_percent' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);

        $baseRateDecimal = (float) ($data['base_rate_percent'] / 100);

        PlatformSetting::updateOrCreate(
            ['key' => 'base_commission_rate'],
            [
                'value'       => (string) $baseRateDecimal,
                'description' => 'Default platform commission rate applied to orders',
            ]
        );

        $overridesMap = [];
        if (!empty($data['overrides'])) {
            foreach ($data['overrides'] as $override) {
                $key = strtolower(trim($override['category_key']));
                $rate = (float) ($override['rate_percent'] / 100);
                $overridesMap[$key] = $rate;
            }
        }

        PlatformSetting::updateOrCreate(
            ['key' => 'category_commission_overrides'],
            [
                'value'       => json_encode($overridesMap),
                'description' => 'Category-level commission override percentages',
            ]
        );

        return response()->json([
            'message' => 'Commission settings saved successfully.',
            'data' => [
                'base_rate_percent' => (float) $data['base_rate_percent'],
                'overrides'         => $data['overrides'] ?? [],
            ],
        ]);
    }

    /**
     * GET /api/v1/platform/policies (Public)
     */
    public function getPublicPlatformPolicies(): JsonResponse
    {
        return response()->json([
            'data' => [
                'return_policy' => PlatformSetting::getReturnPolicy(),
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/settings/return-policy
     */
    public function getReturnPolicySettings(): JsonResponse
    {
        return response()->json([
            'data' => PlatformSetting::getReturnPolicy(),
        ]);
    }

    /**
     * POST /api/v1/admin/settings/return-policy
     */
    public function updateReturnPolicySettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'return_window_days'    => ['required', 'integer', 'min:1', 'max:90'],
            'auto_escalation_hours' => ['required', 'integer', 'min:1', 'max:168'],
            'summary'               => ['required', 'string', 'max:1000'],
            'non_returnable_categories' => ['nullable', 'array'],
            'mediation_terms'       => ['required', 'string', 'max:1000'],
        ]);

        PlatformSetting::updateOrCreate(
            ['key' => 'return_policy_config'],
            [
                'value'       => json_encode($data),
                'description' => 'Platform-wide baseline return and refund policy configuration',
            ]
        );

        return response()->json([
            'message' => 'Platform Return Policy updated successfully.',
            'data'    => $data,
        ]);
    }
}

