<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Commission overrides now live on the category itself (`categories.commission_rate`, a percent), the same field the
 * Categories page edits, and a sub-category without one uses its parent's. The old free-text list in
 * platform_settings matched category names by substring, so a key like "t" hit every category with a "t" in it. Keys
 * that are a real category's slug move to that category (unless it already has a rate); anything else is dropped.
 */
return new class extends Migration
{
    public function up(): void
    {
        $row = DB::table('platform_settings')->where('key', 'category_commission_overrides')->first();
        $map = $row ? json_decode((string) $row->value, true) : null;

        foreach (is_array($map) ? $map : [] as $slug => $rate) {
            if (! is_numeric($rate)) {
                continue;
            }
            DB::table('categories')->where('slug', strtolower(trim((string) $slug)))->whereNull('commission_rate')
                ->update(['commission_rate' => round((float) $rate * 100, 2), 'updated_at' => now()]);
        }

        if ($row) {
            DB::table('platform_settings')->where('key', 'category_commission_overrides')->update([
                'value' => '{}', 'description' => 'Replaced by categories.commission_rate', 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // The moved rates stay on their categories; the old list is not rebuilt.
    }
};
