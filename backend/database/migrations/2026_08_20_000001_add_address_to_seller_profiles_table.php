<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->string('address_province', 100)->nullable()->after('business_permit_path');
            $table->string('address_city', 100)->nullable()->after('address_province');
            $table->string('address_barangay', 100)->nullable()->after('address_city');
            $table->string('address_street', 255)->nullable()->after('address_barangay');
        });
    }

    public function down(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropColumn(['address_province', 'address_city', 'address_barangay', 'address_street']);
        });
    }
};
