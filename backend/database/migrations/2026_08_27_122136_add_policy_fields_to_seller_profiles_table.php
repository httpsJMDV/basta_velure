<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->text('return_policy')->nullable()->after('shop_contact_number');
            $table->text('shipping_policy')->nullable()->after('return_policy');
            $table->string('business_hours', 100)->nullable()->after('shipping_policy');
            $table->string('response_time', 50)->nullable()->after('business_hours');
        });
    }

    public function down(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropColumn(['return_policy', 'shipping_policy', 'business_hours', 'response_time']);
        });
    }
};
