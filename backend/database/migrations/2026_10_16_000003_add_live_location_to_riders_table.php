<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            // Only the latest point is kept, never a trail: it is overwritten by every ping, and the tracking
            // endpoint only shows it while the rider is carrying a parcel.
            $table->decimal('last_latitude', 10, 7)->nullable()->after('vehicle_updated_at');
            $table->decimal('last_longitude', 10, 7)->nullable()->after('last_latitude');
            $table->unsignedSmallInteger('last_heading')->nullable()->after('last_longitude');
            $table->unsignedInteger('last_accuracy_m')->nullable()->after('last_heading');
            $table->timestamp('last_located_at')->nullable()->after('last_accuracy_m');
        });
    }

    public function down(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->dropColumn(['last_latitude', 'last_longitude', 'last_heading', 'last_accuracy_m', 'last_located_at']);
        });
    }
};
