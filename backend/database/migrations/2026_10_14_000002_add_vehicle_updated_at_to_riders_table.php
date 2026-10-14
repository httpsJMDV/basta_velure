<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            // Set when a rider edits their own vehicle type or plate number after registration (feature 2.10).
            $table->timestamp('vehicle_updated_at')->nullable()->after('plate_number');
        });
    }

    public function down(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->dropColumn('vehicle_updated_at');
        });
    }
};
