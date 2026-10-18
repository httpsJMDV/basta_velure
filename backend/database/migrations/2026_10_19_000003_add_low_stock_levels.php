<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The low-stock alert level (A29) becomes the shop's own setting, 5 unless the seller changes it, and each product can
 * follow the shop, use its own level (0: only when it sells out), or have no alert. Existing shops and products keep
 * today's behaviour: level 5, following the shop.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->unsignedSmallInteger('low_stock_threshold')->default(5);
        });
        Schema::table('products', function (Blueprint $table) {
            $table->string('low_stock_alert', 10)->default('shop'); // shop | custom | off
            $table->unsignedSmallInteger('low_stock_threshold')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['low_stock_alert', 'low_stock_threshold']);
        });
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->dropColumn('low_stock_threshold');
        });
    }
};
