<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parcels', function (Blueprint $table) {
            $table->id();
            $table->string('tracking_number', 64)->unique();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('sorting_center_id')->nullable()->constrained('sorting_centers')->nullOnDelete();
            // TODO(2.1): Foreign key to riders table will be added when Rider model/table is created in Task 2.1
            $table->unsignedBigInteger('assigned_rider_id')->nullable()->index();
            $table->unsignedBigInteger('pickup_rider_id')->nullable()->index();
            $table->string('status', 50)->default('AT_SORTING_CENTER');
            $table->string('destination_barangay', 100)->nullable();
            $table->timestamp('scanned_in_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('tracking_number');
            $table->index('status');
            $table->index('destination_barangay');
            $table->index('sorting_center_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parcels');
    }
};
