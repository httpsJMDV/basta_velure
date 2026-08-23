<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->string('dti_sec_registration_path', 500)->nullable()->after('business_permit_path');
            $table->string('fda_lto_path', 500)->nullable()->after('dti_sec_registration_path');
        });
    }

    public function down(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropColumn(['dti_sec_registration_path', 'fda_lto_path']);
        });
    }
};
