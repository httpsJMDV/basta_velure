<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Feature 1.10 hub reports: every throughput query filters one hub and one timestamp range
     * (sorting_center_id = ? AND <timestamp> in [from, to)), and the failed-attempt query filters delivery_logs by
     * outcome and logged_at. The existing single-column parcels.sorting_center_id index would have to scan every
     * parcel the hub ever handled for each report.
     */
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->index(['sorting_center_id', 'scanned_in_at'], 'parcels_hub_scanned_in_idx');
            $table->index(['sorting_center_id', 'sorted_at'], 'parcels_hub_sorted_idx');
            $table->index(['sorting_center_id', 'assigned_at'], 'parcels_hub_assigned_idx');
            $table->index(['sorting_center_id', 'out_for_delivery_at'], 'parcels_hub_out_for_delivery_idx');
            $table->index(['sorting_center_id', 'delivered_at'], 'parcels_hub_delivered_idx');
            $table->index(['sorting_center_id', 'returned_at'], 'parcels_hub_returned_idx');
        });

        Schema::table('delivery_logs', function (Blueprint $table) {
            $table->index(['outcome', 'logged_at'], 'delivery_logs_outcome_logged_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('delivery_logs', function (Blueprint $table) {
            $table->dropIndex('delivery_logs_outcome_logged_at_idx');
        });

        Schema::table('parcels', function (Blueprint $table) {
            $table->dropIndex('parcels_hub_returned_idx');
            $table->dropIndex('parcels_hub_delivered_idx');
            $table->dropIndex('parcels_hub_out_for_delivery_idx');
            $table->dropIndex('parcels_hub_assigned_idx');
            $table->dropIndex('parcels_hub_sorted_idx');
            $table->dropIndex('parcels_hub_scanned_in_idx');
        });
    }
};
