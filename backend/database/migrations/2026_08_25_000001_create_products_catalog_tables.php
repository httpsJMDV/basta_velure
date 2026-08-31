<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 100)->unique();
            $table->string('name', 100);
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->foreign('parent_id')->references('id')->on('categories')->restrictOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('parent_id');
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('categories')->restrictOnDelete();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->decimal('base_price', 10, 2);
            $table->enum('status', ['draft', 'pending_review', 'active', 'rejected', 'archived'])->default('draft');
            $table->text('rejection_reason')->nullable();
            $table->unsignedBigInteger('units_sold')->default(0);
            // Shipping
            $table->decimal('weight_kg', 8, 3)->nullable();
            $table->decimal('dimension_l_cm', 8, 2)->nullable();
            $table->decimal('dimension_w_cm', 8, 2)->nullable();
            $table->decimal('dimension_h_cm', 8, 2)->nullable();
            $table->string('sku', 100)->nullable();
            // FDA (food/grocery)
            $table->string('fda_lto_path')->nullable();
            $table->string('fda_cpr_path')->nullable();
            $table->string('net_weight_volume', 100)->nullable();
            $table->string('expiry_best_before', 100)->nullable();
            $table->text('ingredients')->nullable();
            $table->text('storage_instructions')->nullable();
            $table->text('allergen_info')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('seller_id');
            $table->index('category_id');
            $table->index('status');
        });

        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('label', 255);          // e.g. "Red / M"
            $table->string('sku', 100)->nullable();
            $table->decimal('price', 10, 2);
            $table->decimal('original_price', 10, 2)->nullable();
            $table->unsignedInteger('stock_quantity')->default(0);
            $table->timestamps();

            $table->index('product_id');
        });

        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->boolean('is_primary')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('product_id');
        });

        // Now that products table exists, add FK on reviews.product_id
        Schema::table('reviews', function (Blueprint $table) {
            $table->foreign('product_id')->references('id')->on('products')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropForeign(['product_id']);
        });
        Schema::dropIfExists('product_images');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
    }
};
