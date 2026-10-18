<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The seller application's business details (A1, A7, A8, A11): seller type, TIN, region and postal code of the pickup
 * address, and BIR Form 2303. The shop description column was 200 characters although the form allows 500, so a valid
 * 500-character description failed with a database error; it is widened to 500. Vacation mode (A18) lives here too.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->string('shop_description', 500)->nullable()->change();
            // individual, sole_proprietorship or corporation
            $table->string('seller_type', 30)->nullable()->after('shop_category');
            $table->string('tin', 15)->nullable()->after('seller_type');
            $table->string('address_region', 100)->nullable()->after('address_street');
            $table->string('address_region_code', 20)->nullable()->after('address_region');
            $table->string('address_postal_code', 4)->nullable()->after('address_region_code');
            $table->string('bir_2303_path', 500)->nullable()->after('dti_sec_registration_path');
            $table->boolean('on_vacation')->default(false)->after('response_time');
            $table->timestamp('vacation_started_at')->nullable()->after('on_vacation');

            $table->index('tin');
        });
    }

    public function down(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropIndex(['tin']);
            $table->dropColumn([
                'seller_type', 'tin', 'address_region', 'address_region_code', 'address_postal_code', 'bir_2303_path',
                'on_vacation', 'vacation_started_at',
            ]);
        });
    }
};
