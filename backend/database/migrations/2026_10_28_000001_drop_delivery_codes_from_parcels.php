<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The 6-digit delivery code (A32) is gone: the rider's proof photo, and for COD the exact cash collected, are the
 * proof of delivery. Rolling back brings the empty columns back.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropColumn(['delivery_otp', 'delivery_otp_attempts', 'delivery_otp_locked_until']);
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->text('delivery_otp')->nullable()->after('out_for_delivery_at');
            $table->unsignedTinyInteger('delivery_otp_attempts')->default(0)->after('delivery_otp');
            $table->timestamp('delivery_otp_locked_until')->nullable()->after('delivery_otp_attempts');
        });
    }
};
