<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Order lines keep a copy of the product name, but not which product they were. Reviews need that link (a buyer
 * reviews the product of an order line they received), so lines now record the product and variant. Existing
 * lines are matched by shop and product name.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id')->nullable()->after('seller_id');
            $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
            $table->index('product_id');
        });

        DB::table('order_items')
            ->whereNull('product_id')
            ->orderBy('id')
            ->each(function ($item) {
                $productId = DB::table('products')
                    ->where('seller_id', $item->seller_id)
                    ->where('name', $item->product_name)
                    ->orderBy('id')
                    ->value('id');
                if ($productId) {
                    DB::table('order_items')->where('id', $item->id)->update(['product_id' => $productId]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex(['product_id']);
            $table->dropColumn(['product_id', 'product_variant_id']);
        });
    }
};
