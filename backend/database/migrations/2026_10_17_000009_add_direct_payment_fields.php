<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Direct payments: buyers pay the shop's own GCash (or the rider in cash), couriers settle COD money and delivery
 * fees with shops, couriers pay their riders and hubs, and shops pay Loved-IT its commission.
 *
 * - seller_profiles: the GCash a shop receives payments on, an optional QR, and a shop-funded free delivery threshold
 * - orders: how the order is settled ("platform" for orders placed before this change, "direct" after), what the
 *   courier earns for it (courier_fee, which stays the flat fee even when the shop gives free delivery)
 * - riders, sorting_centers, logistics_companies: the GCash each is paid on
 * - rider_earnings, hub_earnings: when the courier paid the share, and the GCash reference
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->text('gcash_number')->nullable();            // encrypted
            $table->string('gcash_account_name', 120)->nullable();
            $table->string('gcash_qr_path')->nullable();
            $table->decimal('free_delivery_min', 10, 2)->nullable();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('settlement', 16)->default('platform')->after('payment_status');
            $table->decimal('courier_fee', 10, 2)->nullable()->after('shipping_fee');
            $table->boolean('free_delivery')->default(false)->after('courier_fee');
        });

        foreach (['riders', 'sorting_centers', 'logistics_companies'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->text('gcash_number')->nullable();        // encrypted
                $table->string('gcash_name', 120)->nullable();
            });
        }

        foreach (['rider_earnings', 'hub_earnings'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->timestamp('paid_at')->nullable()->index();
                $table->string('paid_reference', 40)->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['rider_earnings', 'hub_earnings'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropIndex(['paid_at']);
                $table->dropColumn(['paid_at', 'paid_reference']);
            });
        }
        foreach (['riders', 'sorting_centers', 'logistics_companies'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropColumn(['gcash_number', 'gcash_name']));
        }
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['settlement', 'courier_fee', 'free_delivery']));
        Schema::table('seller_profiles', fn (Blueprint $table) => $table->dropColumn(['gcash_number', 'gcash_account_name', 'gcash_qr_path', 'free_delivery_min']));
    }
};
