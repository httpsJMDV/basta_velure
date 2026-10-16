<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Loved-IT does not run its own courier: every courier is a partner. The courier created by the previous migration
 * for the existing hubs, orders and parcels ("Loved-IT Express") becomes a neutral partner, "Demo Courier Co.", that
 * no admin owns (the demo seeder gives it a demo courier admin). is_platform becomes is_default: the courier that
 * stands in for rows without a company, nothing more.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->renameColumn('is_platform', 'is_default');
        });

        $default = DB::table('logistics_companies')->where('is_default', true)->orderBy('id')->first();
        if ($default) {
            $adminIds = DB::table('users')->where('role', 'admin')->pluck('id');
            DB::table('logistics_company_members')->where('logistics_company_id', $default->id)->whereIn('user_id', $adminIds)->delete();
            DB::table('logistics_companies')->where('id', $default->id)->update([
                'name'          => 'Demo Courier Co.',
                'code'          => DB::table('logistics_companies')->where('code', 'DCC')->where('id', '!=', $default->id)->exists() ? $default->code : 'DCC',
                'slug'          => 'demo-courier-co',
                'description'   => 'A partner courier for demos, and the courier of every hub and order created before couriers existed.',
                'owner_user_id' => in_array($default->owner_user_id, $adminIds->all(), true) ? null : $default->owner_user_id,
                'updated_at'    => now(),
            ]);
        }

        Cache::forget('logistics.platform_company_id');
        Cache::forget('logistics.default_company_id');
    }

    public function down(): void
    {
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->renameColumn('is_default', 'is_platform');
        });
        Cache::forget('logistics.default_company_id');
    }
};
