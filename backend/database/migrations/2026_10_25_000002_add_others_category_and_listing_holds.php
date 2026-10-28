<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - "Others" (with "Other items"): the catch-all category for products that fit no other, always listed last.
 * - Loved-IT sells no medicine or vitamins: the Supplements sub-category closes to new listings, and Medical Supplies
 *   is renamed to say what it is for (first aid and medical devices).
 * - products.hold_reason: why a listing waits for a person before it goes live (filed under Others, or it mentions
 *   medicine), shown to the admin in the review queue.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('hold_reason', 500)->nullable()->after('rejection_reason');
        });

        $now = now();
        $others = DB::table('categories')->where('slug', 'others')->value('id');
        if (! $others) {
            $others = DB::table('categories')->insertGetId([
                'slug' => 'others', 'name' => 'Others', 'parent_id' => null, 'sort_order' => 9999, 'is_active' => true,
                'requires_fda' => false, 'commission_rate' => null, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        if (! DB::table('categories')->where('slug', 'other-items')->exists()) {
            DB::table('categories')->insert([
                'slug' => 'other-items', 'name' => 'Other items', 'parent_id' => $others, 'sort_order' => 1, 'is_active' => true,
                'requires_fda' => false, 'commission_rate' => null, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        DB::table('categories')->where('slug', 'supplements')->update(['is_active' => false, 'updated_at' => $now]);
        DB::table('categories')->where('slug', 'medical-supplies')->where('name', 'Medical Supplies')
            ->update(['name' => 'First Aid & Medical Supplies', 'updated_at' => $now]);

        Cache::forget('storefront.categories');
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('hold_reason');
        });
        DB::table('categories')->where('slug', 'medical-supplies')->update(['name' => 'Medical Supplies']);
        DB::table('categories')->where('slug', 'supplements')->update(['is_active' => true]);
        // "Others" stays if products were filed under it; otherwise it goes.
        $others = DB::table('categories')->where('slug', 'others')->value('id');
        $leaf = DB::table('categories')->where('slug', 'other-items')->value('id');
        if ($others && ! DB::table('products')->whereIn('category_id', array_filter([$others, $leaf]))->exists()) {
            DB::table('categories')->where('parent_id', $others)->delete();
            DB::table('categories')->where('id', $others)->delete();
        }
        Cache::forget('storefront.categories');
    }
};
