<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Seller pickup address PSGC codes
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->string('address_province_code', 20)->nullable()->after('address_street');
            $table->string('address_city_code', 20)->nullable()->after('address_province_code');
            $table->string('address_barangay_code', 20)->nullable()->after('address_city_code')->index();
        });

        // 2. Buyer saved addresses PSGC codes
        Schema::table('addresses', function (Blueprint $table) {
            $table->string('province_code', 20)->nullable()->after('ward');
            $table->string('city_code', 20)->nullable()->after('province_code');
            $table->string('barangay_code', 20)->nullable()->after('city_code')->index();
        });

        // 3. Orders shipping address snapshot PSGC codes
        Schema::table('orders', function (Blueprint $table) {
            $table->string('shipping_province_code', 20)->nullable()->after('shipping_barangay');
            $table->string('shipping_city_code', 20)->nullable()->after('shipping_province_code');
            $table->string('shipping_barangay_code', 20)->nullable()->after('shipping_city_code')->index();
        });

        // 4. Parcels pickup & destination barangay PSGC codes
        Schema::table('parcels', function (Blueprint $table) {
            $table->string('pickup_barangay_code', 20)->nullable()->after('pickup_barangay')->index();
            $table->string('destination_barangay_code', 20)->nullable()->after('destination_barangay')->index();
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropIndex(['pickup_barangay_code']);
            $table->dropIndex(['destination_barangay_code']);
            $table->dropColumn(['pickup_barangay_code', 'destination_barangay_code']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['shipping_barangay_code']);
            $table->dropColumn([
                'shipping_province_code',
                'shipping_city_code',
                'shipping_barangay_code',
            ]);
        });

        Schema::table('addresses', function (Blueprint $table) {
            $table->dropIndex(['barangay_code']);
            $table->dropColumn([
                'province_code',
                'city_code',
                'barangay_code',
            ]);
        });

        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropIndex(['address_barangay_code']);
            $table->dropColumn([
                'address_province_code',
                'address_city_code',
                'address_barangay_code',
            ]);
        });
    }
};
