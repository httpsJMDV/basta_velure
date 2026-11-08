<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The nationwide courier network (docs/api/courier-network.md).
 *
 * - Hubs know their place (PSGC city, province, region, island group) and which of them are gateways: one per region
 *   for the courier's trucks, and one per island group (Manila, Cebu, Davao) where parcels go on a ship or a plane.
 * - hub_coverage lists every barangay each hub covers, one row each, so finding "the hub for this barangay" is one
 *   indexed query instead of reading every hub's list (there are thousands of hubs now).
 * - A leg between hubs travels by truck, ship or plane, and can be part of the way back to the shop (direction).
 * - Line-haul trips can be ships and planes, which have a carrier and a reference instead of a driver.
 * - The courier tells the truck planner how much a truck carries and how long a driver's shift is.
 * - Orders keep the delivery estimate they were sold with.
 * - Buyer returns can go back through the hubs when the shop is far: return_pickup_stops is their way.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sorting_centers', function (Blueprint $table) {
            $table->string('city_code', 20)->nullable()->after('address_street');
            $table->string('province_code', 20)->nullable()->after('city_code');
            $table->string('region_code', 20)->nullable()->after('province_code');
            $table->string('island_group', 10)->nullable()->after('region_code');
            // The region whose parcels this hub gathers for the trucks between regions (one hub per region and courier).
            $table->string('gateway_region_code', 20)->nullable()->after('island_group');
            // Ships and planes leave from and arrive at this hub (one per island group and courier).
            $table->boolean('is_island_gateway')->default(false)->after('gateway_region_code');

            $table->index('city_code');
            $table->index(['logistics_company_id', 'gateway_region_code']);
            $table->index(['logistics_company_id', 'island_group', 'is_island_gateway'], 'sorting_centers_island_gateway_index');
        });

        Schema::create('hub_coverage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sorting_center_id')->constrained('sorting_centers')->cascadeOnDelete();
            $table->string('barangay_code', 20);
            $table->string('city_code', 20);

            $table->unique(['sorting_center_id', 'barangay_code']);
            $table->index('barangay_code');
            $table->index('city_code');
        });

        Schema::table('parcel_hub_stops', function (Blueprint $table) {
            // How the parcel travels to this stop from the one before: truck, sea or air.
            $table->string('mode', 10)->default('truck')->after('truck_trip_id');
            // forward: on the way to the buyer; return: on the way back to the shop.
            $table->string('direction', 10)->default('forward')->after('mode');
        });

        Schema::table('truck_trips', function (Blueprint $table) {
            $table->string('mode', 10)->default('truck')->after('code');
            $table->string('carrier_name', 80)->nullable()->after('plate_number');
            $table->string('carrier_reference', 40)->nullable()->after('carrier_name');
            $table->timestamp('eta_at')->nullable()->after('departed_at');
            $table->index(['logistics_company_id', 'mode', 'status']);
        });
        // A ship or a plane has no driver of the courier's.
        Schema::table('truck_trips', function (Blueprint $table) {
            $table->unsignedBigInteger('driver_id')->nullable()->change();
        });

        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->unsignedInteger('truck_capacity')->nullable()->after('truck_trip_rate');
            $table->unsignedTinyInteger('truck_shift_hours')->nullable()->after('truck_capacity');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedTinyInteger('eta_min_days')->nullable()->after('shipping_route');
            $table->unsignedTinyInteger('eta_max_days')->nullable()->after('eta_min_days');
        });

        Schema::table('return_pickups', function (Blueprint $table) {
            // The hub that will hand the item to the shop, when it is not the hub that collected it.
            $table->foreignId('destination_hub_id')->nullable()->after('sorting_center_id')->constrained('sorting_centers')->nullOnDelete();
            // The hub that has the item now (null before the collecting rider drops it at a hub).
            $table->foreignId('current_hub_id')->nullable()->after('destination_hub_id')->constrained('sorting_centers')->nullOnDelete();
            $table->timestamp('transit_since')->nullable()->after('collected_at');
            $table->timestamp('dropped_at')->nullable()->after('transit_since');
            // The rider of the shop's hub who brings the item to the shop.
            $table->foreignId('shop_rider_id')->nullable()->after('rider_id')->constrained('riders')->nullOnDelete();
            $table->timestamp('shop_assigned_at')->nullable()->after('dropped_at');

            $table->index(['current_hub_id', 'status']);
            $table->index(['shop_rider_id', 'status']);
        });

        Schema::create('return_pickup_stops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('return_pickup_id')->constrained('return_pickups')->cascadeOnDelete();
            $table->unsignedSmallInteger('position');
            $table->foreignId('sorting_center_id')->constrained('sorting_centers')->restrictOnDelete();
            $table->foreignId('truck_trip_id')->nullable()->constrained('truck_trips')->nullOnDelete();
            $table->string('mode', 10)->default('truck');
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('departed_at')->nullable();
            $table->timestamps();

            $table->unique(['return_pickup_id', 'position']);
            $table->index(['sorting_center_id', 'arrived_at']);
            $table->index('truck_trip_id');
        });

        // The hubs that exist already: one coverage row per barangay they cover.
        DB::table('sorting_centers')->orderBy('id')->select(['id', 'coverage_barangays'])->chunk(200, function ($hubs) {
            $rows = [];
            foreach ($hubs as $hub) {
                foreach (array_unique(array_map('strval', (array) json_decode((string) $hub->coverage_barangays, true))) as $code) {
                    $code = trim($code);
                    if (preg_match('/^\d{9,10}$/', $code)) {
                        $rows[] = ['sorting_center_id' => $hub->id, 'barangay_code' => $code, 'city_code' => \App\Models\HubCoverage::cityOf($code)];
                    }
                }
            }
            foreach (array_chunk($rows, 1000) as $chunk) {
                DB::table('hub_coverage')->insertOrIgnore($chunk);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('return_pickup_stops');
        Schema::table('return_pickups', function (Blueprint $table) {
            $table->dropIndex(['current_hub_id', 'status']);
            $table->dropIndex(['shop_rider_id', 'status']);
            $table->dropConstrainedForeignId('shop_rider_id');
            $table->dropConstrainedForeignId('current_hub_id');
            $table->dropConstrainedForeignId('destination_hub_id');
            $table->dropColumn(['transit_since', 'dropped_at', 'shop_assigned_at']);
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['eta_min_days', 'eta_max_days']);
        });
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->dropColumn(['truck_capacity', 'truck_shift_hours']);
        });
        Schema::table('truck_trips', function (Blueprint $table) {
            $table->dropIndex(['logistics_company_id', 'mode', 'status']);
            $table->dropColumn(['mode', 'carrier_name', 'carrier_reference', 'eta_at']);
        });
        Schema::table('parcel_hub_stops', function (Blueprint $table) {
            $table->dropColumn(['mode', 'direction']);
        });
        Schema::dropIfExists('hub_coverage');
        Schema::table('sorting_centers', function (Blueprint $table) {
            $table->dropIndex(['city_code']);
            $table->dropIndex(['logistics_company_id', 'gateway_region_code']);
            $table->dropIndex('sorting_centers_island_gateway_index');
            $table->dropColumn(['city_code', 'province_code', 'region_code', 'island_group', 'gateway_region_code', 'is_island_gateway']);
        });
    }
};
