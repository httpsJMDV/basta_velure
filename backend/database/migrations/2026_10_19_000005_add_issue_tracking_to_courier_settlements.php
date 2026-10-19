<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a weekly courier ↔ shop payment goes wrong:
 *
 * - receipt_path: an optional screenshot of the GCash receipt, on the private `ids` disk.
 * - disputed_*: the receiving side reported the money did not arrive, with a reason.
 * - reopened_at / resolved_* / resolution*: what a Loved-IT admin decided. "received" closes the week as settled;
 *   "pay_again" voids the payment so the payer records a new one.
 * - attempts: the earlier, voided payments of the week (reference, receipt, report, decision), kept as history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courier_settlements', function (Blueprint $table) {
            $table->string('receipt_path')->nullable()->after('reference');
            $table->timestamp('disputed_at')->nullable()->after('confirmed_by');
            $table->foreignId('disputed_by')->nullable()->after('disputed_at')->constrained('users')->nullOnDelete();
            $table->string('dispute_reason', 500)->nullable()->after('disputed_by');
            $table->timestamp('reopened_at')->nullable()->after('dispute_reason');
            $table->timestamp('resolved_at')->nullable()->after('reopened_at');
            $table->foreignId('resolved_by')->nullable()->after('resolved_at')->constrained('users')->nullOnDelete();
            $table->string('resolution', 20)->nullable()->after('resolved_by');
            $table->string('resolution_note', 500)->nullable()->after('resolution');
            $table->timestamp('reminded_at')->nullable()->after('resolution_note');
            $table->json('attempts')->nullable()->after('reminded_at');
            $table->index(['confirmed_at', 'paid_at']);
        });
    }

    public function down(): void
    {
        Schema::table('courier_settlements', function (Blueprint $table) {
            $table->dropIndex(['confirmed_at', 'paid_at']);
            $table->dropConstrainedForeignId('disputed_by');
            $table->dropConstrainedForeignId('resolved_by');
            $table->dropColumn(['receipt_path', 'disputed_at', 'dispute_reason', 'reopened_at', 'resolved_at', 'resolution', 'resolution_note', 'reminded_at', 'attempts']);
        });
    }
};
