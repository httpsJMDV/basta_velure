<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Very remote towns have no courier branch (PhPlaces::isRemoteTown). An order to one is either brought to the
 * barangay hall (barangay_hall) or waits at the nearest branch for the buyer (branch). Null: to the door, as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('orders', 'delivery_point')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('delivery_point', 20)->nullable()->after('shipping_route');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orders', 'delivery_point')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropColumn('delivery_point');
            });
        }
    }
};
