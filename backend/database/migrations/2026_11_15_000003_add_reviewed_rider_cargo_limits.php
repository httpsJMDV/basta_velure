<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->json('cargo_configuration')->nullable();
            $table->string('cargo_vehicle_signature', 64)->nullable();
            $table->unsignedBigInteger('cargo_verified_by')->nullable();
            $table->timestamp('cargo_verified_at')->nullable();
        });
        foreach (['parcels', 'return_pickups'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->json('load_measurements')->nullable();
                $table->unsignedBigInteger('load_measured_by')->nullable();
                $table->timestamp('load_measured_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::table('riders', fn (Blueprint $table) => $table->dropColumn(['cargo_configuration', 'cargo_vehicle_signature', 'cargo_verified_by', 'cargo_verified_at']));
        foreach (['parcels', 'return_pickups'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropColumn(['load_measurements', 'load_measured_by', 'load_measured_at']));
        }
    }
};
