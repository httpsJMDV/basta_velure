<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The time the shop wants the rider: a day and a window (morning 9 to 12, afternoon 1 to 5). Empty means as soon as
 * possible, as before. Riders are offered a scheduled pickup only shortly before its window.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->date('pickup_date')->nullable()->after('ready_at');
            $table->string('pickup_window', 12)->nullable()->after('pickup_date');
            $table->index(['status', 'dispatch_state', 'pickup_date']);
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropIndex(['status', 'dispatch_state', 'pickup_date']);
            $table->dropColumn(['pickup_date', 'pickup_window']);
        });
    }
};
