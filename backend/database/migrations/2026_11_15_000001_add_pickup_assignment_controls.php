<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('logistics_companies', function (Blueprint $table) {
            $table->boolean('auto_seller_pickups')->default(true);
            $table->boolean('auto_return_pickups')->default(false);
        });
        Schema::table('sorting_centers', function (Blueprint $table) {
            $table->boolean('auto_seller_pickups')->nullable();
            $table->boolean('auto_return_pickups')->nullable();
        });
    }

    public function down(): void
    {
        foreach (['sorting_centers', 'logistics_companies'] as $table) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropColumn(['auto_seller_pickups', 'auto_return_pickups']));
        }
    }
};
