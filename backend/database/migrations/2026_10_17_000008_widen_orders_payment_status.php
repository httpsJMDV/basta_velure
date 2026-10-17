<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * GCash orders start as "pending_verification" (the shop checks the buyer's receipt) and can end as
 * "verification_failed", but the column only allowed pending, paid and failed, so placing a GCash order failed on
 * save. This widens the list; no existing value changes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE orders MODIFY payment_status ENUM('pending','pending_verification','paid','failed','verification_failed') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        // Narrowing would fail on rows that use the new values, so put them back to the closest old value first.
        DB::table('orders')->where('payment_status', 'pending_verification')->update(['payment_status' => 'pending']);
        DB::table('orders')->where('payment_status', 'verification_failed')->update(['payment_status' => 'failed']);
        DB::statement("ALTER TABLE orders MODIFY payment_status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending'");
    }
};
