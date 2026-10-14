<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Feature 2.8: escrow now releases some days after the order is COMPLETED instead of at DELIVERED.
     *  - orders.completed_at: when the order reached COMPLETED.
     *  - order_items.escrow_release_at: when the item's payout becomes available (set at COMPLETED).
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('completed_at')->nullable()->after('payment_verified_at');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->timestamp('escrow_release_at')->nullable()->after('delivered_at');
            $table->index(['payout_status', 'escrow_release_at'], 'order_items_escrow_due_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex('order_items_escrow_due_idx');
            $table->dropColumn('escrow_release_at');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('completed_at');
        });
    }
};
