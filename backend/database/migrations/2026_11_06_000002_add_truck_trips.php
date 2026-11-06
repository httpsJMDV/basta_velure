<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Truck drivers and their trips between hubs (the courier's line-haul).
 *
 * - riders.duty: "delivery" (picks up and delivers parcels, as before) or "truck" (drives parcels from one hub to
 *   another and never gets pickup or delivery jobs).
 * - logistics_companies.truck_trip_rate: what the courier pays its driver for one trip; null uses the default in
 *   config/logistics.php. The courier pays it from its own money: the shipping fee split does not change.
 * - truck_trips: one truck going from one hub to another with the parcels the sending hub loaded.
 * - parcel_hub_stops.truck_trip_id: on the stop a parcel is going to, the trip that carries it there.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->string('duty', 20)->default('delivery')->after('vehicle_type');
            $table->index('duty');
        });

        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->decimal('truck_trip_rate', 10, 2)->nullable();
        });

        Schema::create('truck_trips', function (Blueprint $table) {
            $table->id();
            $table->string('code', 24)->unique();
            $table->foreignId('logistics_company_id')->nullable()->constrained('logistics_companies')->nullOnDelete();
            $table->foreignId('from_hub_id')->constrained('sorting_centers')->restrictOnDelete();
            $table->foreignId('to_hub_id')->constrained('sorting_centers')->restrictOnDelete();
            $table->foreignId('driver_id')->constrained('riders')->restrictOnDelete();
            $table->string('plate_number', 50)->nullable();
            $table->string('status', 20);
            $table->unsignedInteger('parcel_count')->default(0);
            $table->unsignedInteger('received_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('departed_at')->nullable();
            $table->timestamp('driver_arrived_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('close_reason', 500)->nullable();
            $table->decimal('pay_amount', 10, 2)->default(0);
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('paid_reference', 40)->nullable();
            $table->timestamps();

            $table->index(['driver_id', 'status']);
            $table->index(['from_hub_id', 'departed_at']);
            $table->index(['to_hub_id', 'status']);
            $table->index(['logistics_company_id', 'departed_at']);
        });

        Schema::table('parcel_hub_stops', function (Blueprint $table) {
            $table->foreignId('truck_trip_id')->nullable()->after('sorting_center_id')->constrained('truck_trips')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('parcel_hub_stops', function (Blueprint $table) {
            $table->dropConstrainedForeignId('truck_trip_id');
        });
        Schema::dropIfExists('truck_trips');
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->dropColumn('truck_trip_rate');
        });
        Schema::table('riders', function (Blueprint $table) {
            $table->dropIndex(['duty']);
            $table->dropColumn('duty');
        });
    }
};
