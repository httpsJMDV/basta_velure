<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->uuid('checkout_group_id')->nullable()->after('buyer_id')->index();
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE `orders` MODIFY COLUMN `order_number` VARCHAR(32) NOT NULL");
        } else {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('order_number', 32)->change();
            });
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE `orders` MODIFY COLUMN `order_number` VARCHAR(20) NOT NULL");
        } else {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('order_number', 20)->change();
            });
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['checkout_group_id']);
            $table->dropColumn('checkout_group_id');
        });
    }
};
