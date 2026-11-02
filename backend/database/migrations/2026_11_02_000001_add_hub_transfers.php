<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hub-to-hub transfers: when the hub that received a parcel does not cover the buyer's barangay, it goes on to the
 * courier's hub that does. A parcel keeps its AT_SORTING_CENTER status on the way; these say where it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parcel_hub_stops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parcel_id')->constrained('parcels')->cascadeOnDelete();
            $table->unsignedSmallInteger('position');
            $table->foreignId('sorting_center_id')->constrained('sorting_centers')->restrictOnDelete();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('departed_at')->nullable();
            $table->timestamps();

            $table->unique(['parcel_id', 'position']);
            $table->index(['sorting_center_id', 'departed_at']);
        });

        Schema::table('parcels', function (Blueprint $table) {
            // The hub that delivers to the buyer, when it is not the hub that first received the parcel.
            $table->foreignId('destination_hub_id')->nullable()->after('sorting_center_id')->constrained('sorting_centers')->nullOnDelete();
            // Set while the parcel is on its way to sorting_center_id, and cleared when that hub scans it in.
            $table->timestamp('transit_since')->nullable()->after('scanned_in_at');

            $table->index(['sorting_center_id', 'transit_since']);
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropIndex(['sorting_center_id', 'transit_since']);
            $table->dropConstrainedForeignId('destination_hub_id');
            $table->dropColumn('transit_since');
        });

        Schema::dropIfExists('parcel_hub_stops');
    }
};
