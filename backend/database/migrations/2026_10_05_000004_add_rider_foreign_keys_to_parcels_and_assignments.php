<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->foreign('assigned_rider_id')
                ->references('id')
                ->on('riders')
                ->nullOnDelete();

            $table->foreign('pickup_rider_id')
                ->references('id')
                ->on('riders')
                ->nullOnDelete();
        });

        Schema::table('rider_area_assignments', function (Blueprint $table) {
            $table->foreign('rider_id')
                ->references('id')
                ->on('riders')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('rider_area_assignments', function (Blueprint $table) {
            $table->dropForeign(['rider_id']);
        });

        Schema::table('parcels', function (Blueprint $table) {
            $table->dropForeign(['assigned_rider_id']);
            $table->dropForeign(['pickup_rider_id']);
        });
    }
};
