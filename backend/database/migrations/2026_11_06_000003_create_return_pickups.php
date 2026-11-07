<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Return pickups (reverse logistics): after a return is approved, a rider collects the item from the buyer and takes
 * it back to the shop. One row per order.
 *
 * requested → assigned (a rider of the buyer's hub) → collected (photo) → delivered (handed to the shop) → received
 * (the shop confirmed). Three failed visits cancel it. Refund timing does not depend on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('return_pickups', function (Blueprint $table) {
            $table->id();
            $table->string('code', 24)->unique();
            $table->foreignId('order_id')->unique()->constrained('orders')->cascadeOnDelete();
            $table->foreignId('dispute_id')->nullable()->constrained('disputes')->nullOnDelete();
            $table->foreignId('parcel_id')->nullable()->constrained('parcels')->nullOnDelete();
            $table->foreignId('logistics_company_id')->nullable()->constrained('logistics_companies')->nullOnDelete();
            $table->foreignId('sorting_center_id')->nullable()->constrained('sorting_centers')->nullOnDelete();
            $table->foreignId('rider_id')->nullable()->constrained('riders')->nullOnDelete();
            $table->string('status', 20);
            $table->json('buyer_snapshot')->nullable();
            $table->json('shop_snapshot')->nullable();
            $table->string('buyer_barangay_code', 12)->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->string('last_failure', 255)->nullable();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('collected_at')->nullable();
            $table->string('collect_photo_path')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 255)->nullable();
            $table->timestamps();

            $table->index(['sorting_center_id', 'status']);
            $table->index(['rider_id', 'status']);
            $table->index(['logistics_company_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('return_pickups');
    }
};
