<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Category;
use App\Models\PlatformSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Platform Settings: the commission engine (A9) and the return policy (A31).
 *
 * A category override is the category's own rate (the same field the Categories page edits). Only real categories can
 * have one; a sub-category without its own rate uses its parent's, and everything else the platform rate. The return
 * policy's numbers are the ones the return flow uses: the window after delivery, the shop's days to answer, and the
 * buyer's days to escalate.
 */
class AdminPlatformSettingController extends Controller
{
    private const RATE_RULES = ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:100'];

    /** GET /api/v1/admin/settings/commission */
    public function getCommissionSettings(): JsonResponse
    {
        return response()->json(['data' => $this->commissionPayload()]);
    }

    /**
     * POST /api/v1/admin/settings/commission {base_rate_percent, overrides: [{category_id, rate_percent}]}
     *
     * The list is the whole set: a category left out loses its override.
     */
    public function updateCommissionSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'base_rate_percent'        => self::RATE_RULES,
            'overrides'                => ['present', 'array', 'max:500'],
            'overrides.*.category_id'  => ['required', 'integer', 'distinct', 'exists:categories,id'],
            'overrides.*.rate_percent' => self::RATE_RULES,
        ], [
            'base_rate_percent.required' => 'Enter the platform commission rate.',
            'base_rate_percent.numeric'  => 'The platform rate must be a number.',
            'base_rate_percent.decimal'  => 'The platform rate can have at most 2 decimal places.',
            'base_rate_percent.min'      => 'The platform rate cannot be below 0%.',
            'base_rate_percent.max'      => 'The platform rate cannot be above 100%.',
            'overrides.*.category_id.required' => 'Choose a category for each override.',
            'overrides.*.category_id.exists'   => 'Choose a category from the list.',
            'overrides.*.category_id.distinct' => 'A category can have only one override.',
            'overrides.*.rate_percent.required' => 'Enter a rate for each override.',
            'overrides.*.rate_percent.numeric'  => 'Each override rate must be a number.',
            'overrides.*.rate_percent.decimal'  => 'Override rates can have at most 2 decimal places.',
            'overrides.*.rate_percent.min'      => 'Override rates cannot be below 0%.',
            'overrides.*.rate_percent.max'      => 'Override rates cannot be above 100%.',
        ]);

        $before = $this->commissionPayload();
        DB::transaction(function () use ($data) {
            PlatformSetting::updateOrCreate(['key' => 'base_commission_rate'], [
                'value' => (string) round($data['base_rate_percent'] / 100, 4),
                'description' => 'Default platform commission rate applied to orders',
            ]);

            $rates = collect($data['overrides'])->mapWithKeys(fn ($o) => [(int) $o['category_id'] => round((float) $o['rate_percent'], 2)]);
            Category::whereNotNull('commission_rate')->whereNotIn('id', $rates->keys())->update(['commission_rate' => null]);
            foreach ($rates as $id => $rate) {
                Category::whereKey($id)->update(['commission_rate' => $rate]);
            }
        });

        $after = $this->commissionPayload();
        AdminActivityLog::log($request->user()->id, 'update_commission',
            "Commission settings saved: platform rate {$after['base_rate_percent']}%, " . count($after['overrides']) . ' category override(s).',
            'platform_setting', (int) PlatformSetting::where('key', 'base_commission_rate')->value('id'),
            ['before' => array_diff_key($before, ['categories' => 1]), 'after' => array_diff_key($after, ['categories' => 1])]);

        return response()->json(['message' => 'Commission settings saved. New orders use them from now on; placed orders keep their commission.', 'data' => $after]);
    }

    /** @return array{base_rate_percent: float, overrides: list<array<string, mixed>>, categories: list<array<string, mixed>>} */
    private function commissionPayload(): array
    {
        $categories = Category::orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'parent_id', 'commission_rate', 'is_active']);
        $byId = $categories->keyBy('id');
        $roots = $categories->whereNull('parent_id');

        $options = [];
        foreach ($roots as $root) {
            $children = $categories->where('parent_id', $root->id);
            $options[] = ['id' => $root->id, 'name' => $root->name, 'parent_name' => null, 'is_parent' => true, 'is_active' => (bool) $root->is_active, 'sub_categories' => $children->count()];
            foreach ($children as $child) {
                $options[] = ['id' => $child->id, 'name' => $child->name, 'parent_name' => $root->name, 'is_parent' => false, 'is_active' => (bool) $child->is_active, 'sub_categories' => 0];
            }
        }

        $overrides = collect($options)->filter(fn ($o) => $byId[$o['id']]->commission_rate !== null)->map(fn ($o) => [
            'category_id'   => $o['id'],
            'category_name' => $o['name'],
            'parent_name'   => $o['parent_name'],
            'is_parent'     => $o['is_parent'],
            'sub_categories' => $o['sub_categories'],
            'rate_percent'  => (float) $byId[$o['id']]->commission_rate,
        ])->values()->all();

        return [
            'base_rate_percent' => round(PlatformSetting::baseCommissionRate() * 100, 2),
            'overrides'         => $overrides,
            'categories'        => $options,
        ];
    }

    /** GET /api/v1/platform/policies (public) */
    public function getPublicPlatformPolicies(): JsonResponse
    {
        return response()->json(['data' => ['return_policy' => PlatformSetting::getReturnPolicy()]]);
    }

    /** GET /api/v1/admin/settings/return-policy */
    public function getReturnPolicySettings(): JsonResponse
    {
        return response()->json(['data' => PlatformSetting::getReturnPolicy()]);
    }

    /** POST /api/v1/admin/settings/return-policy */
    public function updateReturnPolicySettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'return_window_days'   => ['required', 'integer', 'min:1', 'max:90'],
            'seller_response_days' => ['required', 'integer', 'min:1', 'max:14'],
            'escalation_days'      => ['required', 'integer', 'min:1', 'max:14'],
            'summary'              => ['required', 'string', 'min:10', 'max:1000'],
            'mediation_terms'      => ['required', 'string', 'min:10', 'max:1000'],
            'non_returnable_categories'   => ['nullable', 'array', 'max:20'],
            'non_returnable_categories.*' => ['string', 'min:5', 'max:500'],
        ], [
            'return_window_days.*'   => 'The return window must be a whole number of days from 1 to 90.',
            'seller_response_days.*' => 'The shop\'s time to answer must be a whole number of days from 1 to 14.',
            'escalation_days.*'      => 'The time to escalate must be a whole number of days from 1 to 14.',
            'summary.min'            => 'Write a buyer protection summary of at least 10 characters.',
            'mediation_terms.min'    => 'Write the mediation terms in at least 10 characters.',
        ]);
        foreach (array_keys($data['non_returnable_categories'] ?? []) as $name) {
            if (! is_string($name) || trim($name) === '' || mb_strlen($name) > 80) {
                throw ValidationException::withMessages(['non_returnable_categories' => 'Each exemption needs a name of up to 80 characters.']);
            }
        }

        $before = PlatformSetting::getReturnPolicy();
        $policy = array_merge($before, $data);
        unset($policy['auto_escalation_hours']);
        $row = PlatformSetting::updateOrCreate(['key' => 'return_policy_config'], [
            'value' => json_encode($policy),
            'description' => 'Platform-wide baseline return and refund policy configuration',
        ]);
        AdminActivityLog::log($request->user()->id, 'update_return_policy',
            "Return policy saved: {$policy['return_window_days']}-day window, {$policy['seller_response_days']} day(s) for the shop to answer, {$policy['escalation_days']} day(s) to escalate.",
            'platform_setting', $row->id, ['before' => $before, 'after' => $policy]);

        return response()->json([
            'message' => 'Return policy saved. New return requests follow it; requests already open keep their deadlines.',
            'data'    => PlatformSetting::getReturnPolicy(),
        ]);
    }
}
