<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sellers set their own discounts (there are no platform vouchers): a percentage off every variant of the product.
 * The variants keep the regular price in original_price and sell at price; this column remembers the percentage so
 * the seller's form shows it. Products already on sale get the percentage their prices imply.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedTinyInteger('discount_percent')->nullable()->after('original_price');
        });

        DB::table('products')
            ->whereNotNull('original_price')
            ->whereColumn('base_price', '<', 'original_price')
            ->where('original_price', '>', 0)
            ->update(['discount_percent' => DB::raw('ROUND((1 - base_price / original_price) * 100)')]);
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('discount_percent');
        });
    }
};
