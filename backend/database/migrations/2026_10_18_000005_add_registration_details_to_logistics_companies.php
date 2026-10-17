<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The courier (logistics) company application's details (A1, A7, A8, A14): SEC registration number, TIN, the full
 * address with region and postal code, the contact person and their position, the regions it serves, and the SEC
 * certificate, BIR Form 2303 and the authorized representative's ID next to the existing business permit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->string('sec_registration_no', 11)->nullable()->after('code');
            $table->string('tin', 15)->nullable()->after('sec_registration_no');
            $table->string('address_region', 100)->nullable()->after('address_street');
            $table->string('address_region_code', 20)->nullable()->after('address_region');
            $table->string('address_province_code', 20)->nullable()->after('address_region_code');
            $table->string('address_city_code', 20)->nullable()->after('address_province_code');
            $table->string('address_barangay_code', 20)->nullable()->after('address_city_code');
            $table->string('address_postal_code', 4)->nullable()->after('address_barangay_code');
            $table->string('contact_first_name', 50)->nullable()->after('contact_phone');
            $table->string('contact_last_name', 50)->nullable()->after('contact_first_name');
            $table->string('contact_position', 80)->nullable()->after('contact_last_name');
            // PSGC region codes the company delivers in
            $table->json('service_regions')->nullable()->after('contact_position');
            $table->string('sec_certificate_path', 255)->nullable()->after('business_permit_path');
            $table->string('bir_2303_path', 255)->nullable()->after('sec_certificate_path');
            $table->string('representative_id_path', 255)->nullable()->after('bir_2303_path');

            $table->index('sec_registration_no');
            $table->index('tin');
        });
    }

    public function down(): void
    {
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->dropIndex(['sec_registration_no']);
            $table->dropIndex(['tin']);
            $table->dropColumn([
                'sec_registration_no', 'tin', 'address_region', 'address_region_code', 'address_province_code',
                'address_city_code', 'address_barangay_code', 'address_postal_code', 'contact_first_name',
                'contact_last_name', 'contact_position', 'service_regions', 'sec_certificate_path', 'bir_2303_path',
                'representative_id_path',
            ]);
        });
    }
};
