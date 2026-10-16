<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The pickup rider (seller to hub) and the delivery rider (hub to buyer) each earn a share of a parcel's delivery fee,
 * so a parcel can now have two rider earnings rows: one of each kind. Every existing row is a delivery.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->string('kind', 20)->default('delivery')->after('parcel_id');
        });

        // The new index (parcel_id first) is added before the old one goes, so the parcel foreign key always has one.
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->unique(['parcel_id', 'kind'], 'rider_earnings_parcel_kind_unique');
        });
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->dropUnique('rider_earnings_parcel_unique');
        });
    }

    public function down(): void
    {
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->unique('parcel_id', 'rider_earnings_parcel_unique');
        });
        Schema::table('rider_earnings', function (Blueprint $table) {
            $table->dropUnique('rider_earnings_parcel_kind_unique');
            $table->dropColumn('kind');
        });
    }
};
