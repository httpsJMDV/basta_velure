<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('buyer_id')->constrained('users')->restrictOnDelete();
            $table->string('order_number', 20)->unique();
            $table->decimal('subtotal', 12, 2);
            $table->decimal('shipping_fee', 10, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->enum('payment_method', ['gcash', 'cod']);
            $table->enum('payment_status', ['pending', 'paid', 'failed'])->default('pending');
            $table->enum('status', [
                'pending', 'confirmed', 'packed', 'shipped',
                'out_for_delivery', 'delivered', 'cancelled', 'returned',
            ])->default('pending');
            $table->timestamps();
            $table->softDeletes();

            $table->index('buyer_id');
            $table->index('status');
            $table->index('created_at');
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('seller_id')->constrained('users')->restrictOnDelete();
            // Snapshot — never join back to live product rows for history
            $table->string('product_name');
            $table->string('variant_label')->nullable();
            $table->decimal('unit_price', 10, 2);
            $table->unsignedInteger('quantity');
            $table->decimal('subtotal', 12, 2);
            $table->string('image_url')->nullable();
            $table->timestamps();

            $table->index('order_id');
            $table->index('seller_id');
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->enum('method', ['gcash', 'cod']);
            $table->string('reference_number')->nullable();
            $table->decimal('amount', 12, 2);
            $table->enum('status', ['pending', 'paid', 'failed'])->default('pending');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index('order_id');
            $table->index('status');
        });

        Schema::create('disputes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->foreignId('buyer_id')->constrained('users')->restrictOnDelete();
            $table->string('reason', 255);
            $table->text('description')->nullable();
            $table->enum('status', ['open', 'in_progress', 'resolved', 'closed'])->default('open');
            $table->text('resolution_note')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('order_id');
        });

        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('buyer_id')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('product_id'); // no FK yet — products table not built
            $table->foreignId('order_id')->nullable()->constrained()->restrictOnDelete();
            $table->tinyInteger('rating');            // 1-5
            $table->text('comment')->nullable();
            $table->boolean('verified_purchase')->default(false);
            $table->boolean('flagged')->default(false);
            $table->text('flag_reason')->nullable();
            $table->enum('moderation_status', ['visible', 'hidden', 'pending_review'])->default('visible');
            $table->timestamps();
            $table->softDeletes();

            $table->index('product_id');
            $table->index('buyer_id');
            $table->index('flagged');
            $table->index('moderation_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
        Schema::dropIfExists('disputes');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
