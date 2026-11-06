<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Refunds a person sends, and two delivery safeguards.
 *
 * - refunds: the money of a GCash or cash-on-delivery order went straight to the shop, so the shop sends a refund to
 *   the buyer's GCash by hand. One row per order: the buyer's account, the shop's transfer and receipt, and the
 *   buyer's confirmation (or a "not received" report the admin settles). Sandbox e-wallet and card refunds stay
 *   instant and need no row.
 * - users.cod_refusals_reset_at: refused parcels before this time no longer count towards turning cash on delivery
 *   off (the admin's "Turn COD back on").
 * - parcels.buyer_contacted_at: the delivery rider called or messaged the buyer on this trip. "Recipient unavailable"
 *   and "Could not contact" need it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained('orders')->cascadeOnDelete();
            $table->foreignId('buyer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('seller_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('cause', 30);
            $table->string('status', 20);
            $table->string('gcash_number', 11)->nullable();
            $table->string('gcash_name', 120)->nullable();
            $table->timestamp('send_by')->nullable();
            $table->timestamp('overdue_notified_at')->nullable();
            $table->string('reference', 20)->nullable();
            $table->string('receipt_path')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('confirm_by')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->boolean('auto_confirmed')->default(false);
            $table->timestamp('reported_at')->nullable();
            $table->string('report_note', 500)->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->string('resolution_note', 1000)->nullable();
            // Earlier transfers an admin sent back to the shop ("send it again"), oldest first.
            $table->json('attempts')->nullable();
            $table->timestamps();

            $table->index(['status', 'send_by']);
            $table->index(['status', 'confirm_by']);
            $table->index(['seller_id', 'status']);
            $table->index(['buyer_id', 'status']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('cod_refusals_reset_at')->nullable();
        });

        Schema::table('parcels', function (Blueprint $table) {
            $table->timestamp('buyer_contacted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropColumn('buyer_contacted_at');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('cod_refusals_reset_at');
        });
        Schema::dropIfExists('refunds');
    }
};
