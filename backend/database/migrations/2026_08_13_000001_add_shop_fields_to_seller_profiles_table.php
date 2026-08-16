<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->string('shop_category')->nullable()->after('shop_name');
            $table->string('shop_description', 200)->nullable()->after('shop_category');
            $table->string('government_id_image_back_path')->nullable()->after('government_id_image_path');
        });
    }

    public function down(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropColumn(['shop_category', 'shop_description', 'government_id_image_back_path']);
        });
    }
};
