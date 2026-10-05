<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Convert orders.status to string column (VARCHAR 32)
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE `orders` MODIFY COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'PLACED'");
        } else {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('status', 32)->default('PLACED')->change();
            });
        }

        // 2. Map existing rows to new canonical statuses
        DB::table('orders')->where('status', 'pending')->update(['status' => 'PLACED']);
        DB::table('orders')->where('status', 'confirmed')->update(['status' => 'CONFIRMED']);
        DB::table('orders')->where('status', 'packed')->update(['status' => 'PREPARING']);
        DB::table('orders')->where('status', 'shipped')->update(['status' => 'READY_FOR_PICKUP']);
        DB::table('orders')->where('status', 'out_for_delivery')->update(['status' => 'OUT_FOR_DELIVERY']);
        DB::table('orders')->where('status', 'delivered')->update(['status' => 'DELIVERED']);
        DB::table('orders')->where('status', 'cancelled')->update(['status' => 'CANCELLED']);
        DB::table('orders')->where('status', 'returned')->update(['status' => 'RETURNED']);
        DB::table('orders')->where('status', 'return_requested')->update(['status' => 'DISPUTED']);

        // 3. Align parcels RTS to RETURNED if parcels table exists
        if (Schema::hasTable('parcels')) {
            DB::table('parcels')->where('status', 'RTS')->update(['status' => 'RETURNED']);
        }

        // 4. Align delivery_logs RTS to RETURNED if delivery_logs table exists
        if (Schema::hasTable('delivery_logs')) {
            DB::table('delivery_logs')->where('outcome', 'RTS')->update(['outcome' => 'RETURNED']);
        }
    }

    public function down(): void
    {
        // 1. Revert order statuses back to legacy lowercase values
        DB::table('orders')->where('status', 'PLACED')->update(['status' => 'pending']);
        DB::table('orders')->where('status', 'CONFIRMED')->update(['status' => 'confirmed']);
        DB::table('orders')->where('status', 'PREPARING')->update(['status' => 'packed']);
        DB::table('orders')->where('status', 'READY_FOR_PICKUP')->update(['status' => 'shipped']);
        DB::table('orders')->where('status', 'OUT_FOR_DELIVERY')->update(['status' => 'out_for_delivery']);
        DB::table('orders')->where('status', 'DELIVERED')->update(['status' => 'delivered']);
        DB::table('orders')->where('status', 'CANCELLED')->update(['status' => 'cancelled']);
        DB::table('orders')->where('status', 'RETURNED')->update(['status' => 'returned']);
        DB::table('orders')->where('status', 'DISPUTED')->update(['status' => 'returned']);

        // 2. Revert parcels and delivery_logs
        if (Schema::hasTable('parcels')) {
            DB::table('parcels')->where('status', 'RETURNED')->update(['status' => 'RTS']);
        }
        if (Schema::hasTable('delivery_logs')) {
            DB::table('delivery_logs')->where('outcome', 'RETURNED')->update(['outcome' => 'RTS']);
        }

        // 3. Revert column definition back to MySQL ENUM
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE `orders` MODIFY COLUMN `status` ENUM('pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned') NOT NULL DEFAULT 'pending'");
        }
    }
};
