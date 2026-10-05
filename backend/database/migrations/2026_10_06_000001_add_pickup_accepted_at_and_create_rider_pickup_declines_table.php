<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->timestamp('pickup_accepted_at')->nullable()->after('ready_at');
            $table->index(['status', 'pickup_barangay_code', 'pickup_rider_id'], 'parcels_pickup_matching_idx');
        });

        Schema::create('rider_pickup_declines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rider_id')->constrained('riders')->cascadeOnDelete();
            $table->foreignId('parcel_id')->constrained('parcels')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->unique(['rider_id', 'parcel_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rider_pickup_declines');

        Schema::table('parcels', function (Blueprint $table) {
            $table->dropIndex('parcels_pickup_matching_idx');
            $table->dropColumn('pickup_accepted_at');
        });
    }
};

