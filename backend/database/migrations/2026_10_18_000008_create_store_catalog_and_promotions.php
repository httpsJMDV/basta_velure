<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The seller's catalogue tools (Seller workbook S2 to S7, A5, A7, A17 to A19, A28, A29):
 *  - store categories: a store's own two-level menu, up to three per product, hidden or shown, ordered;
 *  - products: variation type names, a per-buyer purchase limit, the publish request key (a double click creates one
 *    product), and soft-deleted variants (an ordered variant keeps its history);
 *  - store sales with a start and an end, flash sales in fixed time slots with their own quantity, bundle deals and
 *    buy X get Y promotions;
 *  - the low-stock alert, once per crossing of the threshold;
 *  - the seller's one reply to a review, and how many times the buyer edited it.
 *
 * Variant prices become the regular price again: the old immediate discount moved prices down and kept the regular
 * price aside. Every product still discounted becomes a running store sale with the same percentage, so buyers see
 * the same prices as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('store_categories')->cascadeOnDelete();
            $table->string('name', 50);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_visible')->default(true);
            $table->timestamps();

            $table->index(['seller_id', 'parent_id', 'sort_order']);
        });

        Schema::create('product_store_category', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_category_id')->constrained()->cascadeOnDelete();
            $table->primary(['product_id', 'store_category_id']);
        });

        Schema::table('products', function (Blueprint $table) {
            // ["Color", "Size"]: the names of the (at most two) variation types, in order
            $table->json('variation_types')->nullable()->after('sku');
            $table->unsignedSmallInteger('purchase_limit')->nullable()->after('variation_types');
            $table->string('publish_key', 64)->nullable()->after('purchase_limit');
            $table->timestamp('published_at')->nullable()->after('publish_key');

            $table->unique(['seller_id', 'publish_key']);
        });

        Schema::table('product_variants', function (Blueprint $table) {
            $table->timestamp('low_stock_alerted_at')->nullable()->after('stock_quantity');
            $table->softDeletes();
        });

        Schema::create('store_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            // percent (1 to 99) or fixed (a sale price for a single-price product)
            $table->string('discount_type', 10);
            $table->unsignedTinyInteger('discount_percent')->nullable();
            $table->decimal('sale_price', 12, 2)->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'starts_at', 'ends_at']);
        });

        Schema::create('flash_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->timestamp('slot_start');
            $table->timestamp('slot_end');
            $table->decimal('flash_price', 12, 2);
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('sold')->default(0);
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'slot_start', 'slot_end']);
        });

        Schema::create('flash_sale_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('flash_sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->unique(['flash_sale_id', 'user_id']);
        });

        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            // bundle: any min_quantity items of the listed products for discount_percent off;
            // bxgy: buy buy_quantity of the buy product, get get_quantity of the get product free
            $table->string('type', 10);
            $table->string('name', 80);
            $table->unsignedSmallInteger('min_quantity')->nullable();
            $table->unsignedTinyInteger('discount_percent')->nullable();
            $table->foreignId('buy_product_id')->nullable()->constrained('products')->cascadeOnDelete();
            $table->unsignedSmallInteger('buy_quantity')->nullable();
            $table->foreignId('get_product_id')->nullable()->constrained('products')->cascadeOnDelete();
            $table->unsignedSmallInteger('get_quantity')->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['seller_id', 'type', 'starts_at', 'ends_at']);
        });

        Schema::create('promotion_products', function (Blueprint $table) {
            $table->foreignId('promotion_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->primary(['promotion_id', 'product_id']);
        });

        Schema::table('reviews', function (Blueprint $table) {
            $table->unsignedTinyInteger('edit_count')->default(0)->after('comment');
            $table->foreignId('order_item_id')->nullable()->after('order_id')->constrained('order_items')->nullOnDelete();
            $table->string('variant_label', 255)->nullable()->after('order_item_id');
            $table->text('seller_reply')->nullable()->after('moderation_status');
            $table->timestamp('seller_replied_at')->nullable()->after('seller_reply');
            $table->timestamp('seller_reply_edited_at')->nullable()->after('seller_replied_at');
        });

        // The old immediate discount becomes a running store sale; variant prices go back to the regular price.
        $now = now();
        foreach (DB::table('products')->where('discount_percent', '>', 0)->whereNull('deleted_at')->get(['id', 'seller_id', 'discount_percent']) as $p) {
            DB::table('store_sales')->insert([
                'seller_id' => $p->seller_id, 'product_id' => $p->id, 'discount_type' => 'percent',
                'discount_percent' => min(99, max(1, (int) $p->discount_percent)), 'sale_price' => null,
                'starts_at' => $now, 'ends_at' => $now->copy()->addYear(), 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        DB::table('product_variants')->whereNotNull('original_price')->update(['price' => DB::raw('original_price')]);
        DB::table('product_variants')->update(['original_price' => null]);
        foreach (DB::table('products')->get(['id']) as $p) {
            $min = DB::table('product_variants')->where('product_id', $p->id)->whereNull('deleted_at')->min('price');
            DB::table('products')->where('id', $p->id)->update([
                'base_price' => $min ?? DB::raw('base_price'), 'original_price' => null, 'discount_percent' => null,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropForeign(['order_item_id']);
            $table->dropColumn(['edit_count', 'order_item_id', 'variant_label', 'seller_reply', 'seller_replied_at', 'seller_reply_edited_at']);
        });
        Schema::dropIfExists('promotion_products');
        Schema::dropIfExists('promotions');
        Schema::dropIfExists('flash_sale_reminders');
        Schema::dropIfExists('flash_sales');
        Schema::dropIfExists('store_sales');
        Schema::table('product_variants', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn('low_stock_alerted_at');
        });
        Schema::table('products', function (Blueprint $table) {
            $table->dropUnique(['seller_id', 'publish_key']);
            $table->dropColumn(['variation_types', 'purchase_limit', 'publish_key', 'published_at']);
        });
        Schema::dropIfExists('product_store_category');
        Schema::dropIfExists('store_categories');
    }
};
