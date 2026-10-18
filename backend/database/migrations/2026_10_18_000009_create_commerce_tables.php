<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Commerce (Buyer B6 to B12, Seller S9 and S12, Logistics L8): a cart kept on the server, store, platform and shipping
 * vouchers with a wallet, shipping zones and rate tables per courier, idempotent checkout, the sandbox e-wallet and
 * card gateway, the money columns an order needs to show its vouchers and split them (A8, A9), cancellation and
 * refunds, return evidence (A31) and the region on saved addresses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cart_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->boolean('selected')->default(true);
            // The unit price the buyer last saw, so a change since then can be pointed out.
            $table->decimal('price_seen', 12, 2)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'product_variant_id']);
        });

        Schema::create('vouchers', function (Blueprint $table) {
            $table->id();
            // A store voucher belongs to its shop; a platform or shipping voucher has no seller (Loved-IT funds it).
            $table->foreignId('seller_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('code', 12)->unique();
            $table->string('name', 80);
            $table->enum('scope', ['store', 'platform', 'shipping']);
            $table->enum('discount_type', ['fixed', 'percent']);
            $table->decimal('amount', 12, 2);
            $table->decimal('max_discount', 12, 2)->nullable();
            $table->decimal('min_spend', 12, 2)->default(0);
            $table->unsignedInteger('total_limit')->nullable();
            $table->unsignedInteger('per_buyer_limit')->default(1);
            $table->boolean('claimable')->default(true);
            $table->enum('applies_to', ['all', 'products'])->default('all');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->unsignedInteger('claimed_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['seller_id', 'scope']);
        });

        Schema::create('voucher_products', function (Blueprint $table) {
            $table->foreignId('voucher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->primary(['voucher_id', 'product_id']);
        });

        Schema::create('voucher_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('voucher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('claimed_at');
            $table->unique(['voucher_id', 'user_id']);
        });

        Schema::create('voucher_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('voucher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('checkout_group_id', 36)->nullable()->index();
            $table->decimal('amount', 12, 2);
            // Set when the order is cancelled and the voucher goes back to the wallet (A21).
            $table->timestamp('returned_at')->nullable();
            $table->timestamps();
            $table->index(['voucher_id', 'user_id']);
        });

        Schema::create('shipping_zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('logistics_company_id')->constrained('logistics_companies')->cascadeOnDelete();
            $table->string('name', 60);
            $table->timestamps();
            $table->unique(['logistics_company_id', 'name']);
        });

        Schema::create('shipping_zone_areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipping_zone_id')->constrained()->cascadeOnDelete();
            $table->enum('level', ['region', 'province', 'city']);
            $table->string('psgc_code', 10);
            $table->string('name', 120);
            // An excluded area is carved out of a wider one (Batanes out of Luzon).
            $table->boolean('excluded')->default(false);
            $table->timestamps();
            $table->unique(['shipping_zone_id', 'level', 'psgc_code']);
        });

        Schema::create('shipping_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('logistics_company_id')->constrained('logistics_companies')->cascadeOnDelete();
            $table->foreignId('origin_zone_id')->constrained('shipping_zones')->cascadeOnDelete();
            $table->foreignId('destination_zone_id')->constrained('shipping_zones')->cascadeOnDelete();
            $table->decimal('first_kg', 10, 2);
            $table->decimal('additional_kg', 10, 2);
            $table->timestamps();
            $table->unique(['origin_zone_id', 'destination_zone_id']);
        });

        // One row per Place Order key: the unique index is what stops a second order from a double click (A37).
        Schema::create('checkout_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('buyer_id')->constrained('users')->cascadeOnDelete();
            $table->string('idempotency_key', 80);
            $table->string('checkout_group_id', 36)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->unique(['buyer_id', 'idempotency_key']);
        });

        Schema::create('payment_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('buyer_id')->constrained('users')->cascadeOnDelete();
            $table->string('checkout_group_id', 36)->index();
            $table->string('token', 64)->unique();
            $table->enum('method', ['e_wallet', 'card']);
            $table->decimal('amount', 12, 2);
            $table->enum('status', ['pending', 'paid', 'failed', 'cancelled', 'expired'])->default('pending');
            $table->string('gateway_reference', 40)->nullable();
            $table->string('failure_reason', 200)->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        DB::statement("ALTER TABLE orders MODIFY payment_method ENUM('gcash','cod','e_wallet','card') NOT NULL");
        DB::statement("ALTER TABLE orders MODIFY payment_status ENUM('pending','pending_verification','paid','failed','verification_failed','refunded') NOT NULL DEFAULT 'pending'");
        DB::statement("ALTER TABLE payments MODIFY method ENUM('gcash','cod','e_wallet','card') NOT NULL");
        DB::statement("ALTER TABLE payments MODIFY status ENUM('pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'pending'");

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('store_voucher_id')->nullable()->after('total');
            $table->decimal('store_voucher_discount', 12, 2)->default(0)->after('store_voucher_id');
            $table->unsignedBigInteger('platform_voucher_id')->nullable()->after('store_voucher_discount');
            $table->decimal('platform_voucher_discount', 12, 2)->default(0)->after('platform_voucher_id');
            $table->unsignedBigInteger('shipping_voucher_id')->nullable()->after('platform_voucher_discount');
            $table->decimal('shipping_voucher_discount', 12, 2)->default(0)->after('shipping_voucher_id');
            $table->decimal('promo_discount', 12, 2)->default(0)->after('shipping_voucher_discount');
            $table->unsignedInteger('total_weight_grams')->nullable()->after('promo_discount');
            $table->unsignedSmallInteger('chargeable_weight_kg')->nullable()->after('total_weight_grams');
            $table->string('shipping_route', 80)->nullable()->after('chargeable_weight_kg');
            $table->timestamp('payment_due_at')->nullable()->after('payment_status');
            $table->timestamp('paid_at')->nullable()->after('payment_due_at');
            $table->string('cancel_reason', 300)->nullable()->after('notes');
            $table->string('cancelled_by', 20)->nullable()->after('cancel_reason');
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by');
            $table->string('refund_status', 20)->nullable()->after('cancelled_at');
            $table->decimal('refund_amount', 12, 2)->nullable()->after('refund_status');
            $table->timestamp('refunded_at')->nullable()->after('refund_amount');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->decimal('regular_unit_price', 12, 2)->nullable()->after('unit_price');
            $table->string('price_source', 10)->nullable()->after('regular_unit_price');
            $table->unsignedBigInteger('flash_sale_id')->nullable()->after('price_source');
            $table->unsignedBigInteger('store_sale_id')->nullable()->after('flash_sale_id');
            $table->unsignedBigInteger('promotion_id')->nullable()->after('store_sale_id');
            $table->boolean('is_gift')->default(false)->after('promotion_id');
            $table->decimal('store_voucher_share', 12, 2)->default(0)->after('subtotal');
            $table->decimal('promo_share', 12, 2)->default(0)->after('store_voucher_share');
            $table->unsignedInteger('weight_grams')->nullable()->after('promo_share');
            $table->timestamp('stock_restored_at')->nullable()->after('escrow_release_at');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedBigInteger('payment_session_id')->nullable()->after('order_id');
            $table->string('gateway_reference', 40)->nullable()->after('reference_number');
            $table->decimal('refund_amount', 12, 2)->nullable()->after('status');
            $table->timestamp('refunded_at')->nullable()->after('refund_amount');
        });

        DB::statement("ALTER TABLE disputes MODIFY status ENUM('open','in_progress','resolved','closed','pending','approved','rejected','escalated') NOT NULL DEFAULT 'open'");
        Schema::table('disputes', function (Blueprint $table) {
            $table->foreignId('seller_id')->nullable()->after('buyer_id')->constrained('users')->nullOnDelete();
            $table->timestamp('respond_by')->nullable()->after('status');
            $table->string('seller_reason', 300)->nullable()->after('respond_by');
            $table->timestamp('seller_responded_at')->nullable()->after('seller_reason');
            $table->timestamp('escalate_by')->nullable()->after('seller_responded_at');
            $table->timestamp('escalated_at')->nullable()->after('escalate_by');
            $table->boolean('auto_approved')->default(false)->after('escalated_at');
            $table->decimal('refund_amount', 12, 2)->nullable()->after('auto_approved');
        });

        Schema::create('dispute_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispute_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('addresses', function (Blueprint $table) {
            $table->string('region', 100)->nullable()->after('ward');
            $table->string('region_code', 20)->nullable()->after('region');
        });

        // A9: Loved-IT's commission is 5% of the item subtotal after the shop's own discounts, for every category.
        $this->setting('base_commission_rate', 0.05);
        $this->setting('category_commission_overrides', new \stdClass());

        $this->seedDefaultRates();
    }

    public function down(): void
    {
        Schema::table('addresses', fn (Blueprint $t) => $t->dropColumn(['region', 'region_code']));
        Schema::dropIfExists('dispute_photos');
        Schema::table('disputes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('seller_id');
            $table->dropColumn(['respond_by', 'seller_reason', 'seller_responded_at', 'escalate_by', 'escalated_at', 'auto_approved', 'refund_amount']);
        });
        DB::table('disputes')->whereIn('status', ['pending', 'escalated'])->update(['status' => 'open']);
        DB::table('disputes')->where('status', 'approved')->update(['status' => 'resolved']);
        DB::table('disputes')->where('status', 'rejected')->update(['status' => 'closed']);
        DB::statement("ALTER TABLE disputes MODIFY status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open'");

        Schema::table('payments', fn (Blueprint $t) => $t->dropColumn(['payment_session_id', 'gateway_reference', 'refund_amount', 'refunded_at']));
        Schema::table('order_items', fn (Blueprint $t) => $t->dropColumn([
            'regular_unit_price', 'price_source', 'flash_sale_id', 'store_sale_id', 'promotion_id', 'is_gift',
            'store_voucher_share', 'promo_share', 'weight_grams', 'stock_restored_at',
        ]));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn([
            'store_voucher_id', 'store_voucher_discount', 'platform_voucher_id', 'platform_voucher_discount',
            'shipping_voucher_id', 'shipping_voucher_discount', 'promo_discount', 'total_weight_grams',
            'chargeable_weight_kg', 'shipping_route', 'payment_due_at', 'paid_at', 'cancel_reason', 'cancelled_by',
            'cancelled_at', 'refund_status', 'refund_amount', 'refunded_at',
        ]));
        DB::table('payments')->whereIn('method', ['e_wallet', 'card'])->update(['method' => 'cod']);
        DB::table('payments')->whereIn('status', ['cancelled', 'refunded'])->update(['status' => 'failed']);
        DB::statement("ALTER TABLE payments MODIFY status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending'");
        DB::statement("ALTER TABLE payments MODIFY method ENUM('gcash','cod') NOT NULL");
        DB::table('orders')->whereIn('payment_method', ['e_wallet', 'card'])->update(['payment_method' => 'cod']);
        DB::table('orders')->where('payment_status', 'refunded')->update(['payment_status' => 'paid']);
        DB::statement("ALTER TABLE orders MODIFY payment_status ENUM('pending','pending_verification','paid','failed','verification_failed') NOT NULL DEFAULT 'pending'");
        DB::statement("ALTER TABLE orders MODIFY payment_method ENUM('gcash','cod') NOT NULL");

        Schema::dropIfExists('payment_sessions');
        Schema::dropIfExists('checkout_requests');
        Schema::dropIfExists('shipping_rates');
        Schema::dropIfExists('shipping_zone_areas');
        Schema::dropIfExists('shipping_zones');
        Schema::dropIfExists('voucher_usages');
        Schema::dropIfExists('voucher_claims');
        Schema::dropIfExists('voucher_products');
        Schema::dropIfExists('vouchers');
        Schema::dropIfExists('cart_items');
    }

    private function setting(string $key, mixed $value): void
    {
        if (! Schema::hasTable('platform_settings')) {
            return;
        }
        $json = json_encode($value);
        if (DB::table('platform_settings')->where('key', $key)->exists()) {
            DB::table('platform_settings')->where('key', $key)->update(['value' => $json, 'updated_at' => now()]);
        } else {
            DB::table('platform_settings')->insert(['key' => $key, 'value' => $json, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /**
     * The default courier's zones and the workbook's test rates (Test Data sheet), plus the routes it leaves open.
     * Batanes is carved out of Luzon, so an Itbayat address is not serviceable until a zone covers it (L8).
     */
    private function seedDefaultRates(): void
    {
        $companyId = DB::table('logistics_companies')->where('is_default', true)->orderBy('id')->value('id');
        if (! $companyId) {
            return;
        }
        $now = now();
        $zones = [
            'NCR'      => [['region', '130000000', 'National Capital Region (NCR)']],
            'Luzon'    => [
                ['region', '140000000', 'Cordillera Administrative Region (CAR)'], ['region', '010000000', 'Region I (Ilocos Region)'],
                ['region', '020000000', 'Region II (Cagayan Valley)'], ['region', '030000000', 'Region III (Central Luzon)'],
                ['region', '040000000', 'Region IV-A (CALABARZON)'], ['region', '170000000', 'MIMAROPA Region'],
                ['region', '050000000', 'Region V (Bicol Region)'],
            ],
            'Visayas'  => [
                ['region', '060000000', 'Region VI (Western Visayas)'], ['region', '070000000', 'Region VII (Central Visayas)'],
                ['region', '080000000', 'Region VIII (Eastern Visayas)'],
            ],
            'Mindanao' => [
                ['region', '090000000', 'Region IX (Zamboanga Peninsula)'], ['region', '100000000', 'Region X (Northern Mindanao)'],
                ['region', '110000000', 'Region XI (Davao Region)'], ['region', '120000000', 'Region XII (SOCCSKSARGEN)'],
                ['region', '160000000', 'Region XIII (Caraga)'], ['region', '150000000', 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)'],
            ],
        ];
        $ids = [];
        foreach ($zones as $name => $areas) {
            $ids[$name] = DB::table('shipping_zones')->insertGetId(['logistics_company_id' => $companyId, 'name' => $name, 'created_at' => $now, 'updated_at' => $now]);
            foreach ($areas as [$level, $code, $label]) {
                DB::table('shipping_zone_areas')->insert(['shipping_zone_id' => $ids[$name], 'level' => $level, 'psgc_code' => $code, 'name' => $label, 'excluded' => false, 'created_at' => $now, 'updated_at' => $now]);
            }
        }
        DB::table('shipping_zone_areas')->insert(['shipping_zone_id' => $ids['Luzon'], 'level' => 'province', 'psgc_code' => '020900000', 'name' => 'Batanes', 'excluded' => true, 'created_at' => $now, 'updated_at' => $now]);

        // [origin, destination, first kg, each additional kg]; the four workbook routes come first.
        $rates = [
            ['NCR', 'NCR', 50, 15], ['Visayas', 'NCR', 120, 40], ['NCR', 'Visayas', 120, 40], ['Visayas', 'Visayas', 60, 20],
            ['Luzon', 'Luzon', 60, 20], ['NCR', 'Luzon', 80, 20], ['Luzon', 'NCR', 80, 20],
            ['Luzon', 'Visayas', 120, 40], ['Visayas', 'Luzon', 120, 40],
            ['Mindanao', 'Mindanao', 60, 20], ['NCR', 'Mindanao', 150, 50], ['Mindanao', 'NCR', 150, 50],
            ['Luzon', 'Mindanao', 150, 50], ['Mindanao', 'Luzon', 150, 50], ['Visayas', 'Mindanao', 120, 40], ['Mindanao', 'Visayas', 120, 40],
        ];
        foreach ($rates as [$from, $to, $first, $extra]) {
            DB::table('shipping_rates')->insert([
                'logistics_company_id' => $companyId, 'origin_zone_id' => $ids[$from], 'destination_zone_id' => $ids[$to],
                'first_kg' => $first, 'additional_kg' => $extra, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }
};
