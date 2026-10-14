<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Feature 2.9: a parcel earns its rider at most once. NULL parcel ids (manual adjustments) are still
     * allowed any number of times, because a unique index ignores NULLs.
     */
    public function up(): void
    {
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->unique('parcel_id', 'rider_earnings_parcel_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->dropUnique('rider_earnings_parcel_unique');
        });
    }
};
