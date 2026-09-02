<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Update orders table with payment verification & shipping details
        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'payment_reference')) {
                $table->string('payment_reference', 100)->nullable()->after('payment_method');
            }
            if (!Schema::hasColumn('orders', 'payment_proof_path')) {
                $table->string('payment_proof_path', 255)->nullable()->after('payment_reference');
            }
            if (!Schema::hasColumn('orders', 'payment_verified_at')) {
                $table->timestamp('payment_verified_at')->nullable()->after('payment_proof_path');
            }
            if (!Schema::hasColumn('orders', 'payment_verified_by')) {
                $table->foreignId('payment_verified_by')->nullable()->constrained('users')->nullOnDelete()->after('payment_verified_at');
            }
            if (!Schema::hasColumn('orders', 'verification_rejection_reason')) {
                $table->text('verification_rejection_reason')->nullable()->after('payment_verified_by');
            }
            if (!Schema::hasColumn('orders', 'shipping_name')) {
                $table->string('shipping_name', 150)->nullable()->after('total');
            }
            if (!Schema::hasColumn('orders', 'shipping_phone')) {
                $table->string('shipping_phone', 30)->nullable()->after('shipping_name');
            }
            if (!Schema::hasColumn('orders', 'shipping_address')) {
                $table->text('shipping_address')->nullable()->after('shipping_phone');
            }
            if (!Schema::hasColumn('orders', 'shipping_province')) {
                $table->string('shipping_province', 100)->nullable()->after('shipping_address');
            }
            if (!Schema::hasColumn('orders', 'shipping_city')) {
                $table->string('shipping_city', 100)->nullable()->after('shipping_province');
            }
            if (!Schema::hasColumn('orders', 'shipping_barangay')) {
                $table->string('shipping_barangay', 100)->nullable()->after('shipping_city');
            }
            if (!Schema::hasColumn('orders', 'notes')) {
                $table->text('notes')->nullable()->after('shipping_barangay');
            }
        });

        // 2. Update order_items with commission & earnings tracking
        Schema::table('order_items', function (Blueprint $table) {
            if (!Schema::hasColumn('order_items', 'category_id')) {
                $table->string('category_id', 50)->nullable()->after('seller_id');
            }
            if (!Schema::hasColumn('order_items', 'commission_rate')) {
                $table->decimal('commission_rate', 5, 4)->default(0.1000)->after('subtotal');
            }
            if (!Schema::hasColumn('order_items', 'commission_amount')) {
                $table->decimal('commission_amount', 12, 2)->default(0.00)->after('commission_rate');
            }
            if (!Schema::hasColumn('order_items', 'seller_earnings')) {
                $table->decimal('seller_earnings', 12, 2)->default(0.00)->after('commission_amount');
            }
            if (!Schema::hasColumn('order_items', 'payout_status')) {
                $table->string('payout_status', 30)->default('pending_release')->after('seller_earnings');
            }
            if (!Schema::hasColumn('order_items', 'delivered_at')) {
                $table->timestamp('delivered_at')->nullable()->after('payout_status');
            }
        });

        // 3. Create payout_requests table
        if (!Schema::hasTable('payout_requests')) {
            Schema::create('payout_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
                $table->string('reference_code', 50)->unique();
                $table->decimal('amount', 12, 2);
                $table->string('gcash_number', 30);
                $table->string('gcash_name', 150);
                $table->enum('status', ['pending', 'processing', 'completed', 'rejected'])->default('pending');
                $table->text('rejection_reason')->nullable();
                $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('processed_at')->nullable();
                $table->text('admin_notes')->nullable();
                $table->timestamps();

                $table->index('seller_id');
                $table->index('status');
                $table->index('created_at');
            });
        }

        // 4. Create platform_settings table for commission rates & platform config
        if (!Schema::hasTable('platform_settings')) {
            Schema::create('platform_settings', function (Blueprint $table) {
                $table->id();
                $table->string('key', 100)->unique();
                $table->text('value')->nullable();
                $table->string('description')->nullable();
                $table->timestamps();
            });

            // Seed default commission settings
            \Illuminate\Support\Facades\DB::table('platform_settings')->insert([
                [
                    'key'         => 'base_commission_rate',
                    'value'       => '0.10',
                    'description' => 'Default platform commission rate (10%)',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ],
                [
                    'key'         => 'category_commission_overrides',
                    'value'       => json_encode([
                        'food-beverage'     => 0.08,
                        'food-grocery'      => 0.08,
                        'food_and_grocery'  => 0.08,
                        'groceries'         => 0.08,
                    ]),
                    'description' => 'Category-specific commission overrides (Food & Grocery = 8%)',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ],
                [
                    'key'         => 'gcash_merchant_name',
                    'value'       => 'VELURE OFFICIAL',
                    'description' => 'Official GCash Merchant Name',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ],
                [
                    'key'         => 'gcash_merchant_number',
                    'value'       => '0917-835-8731',
                    'description' => 'Official GCash Merchant Mobile Number',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ],
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('payout_requests');

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn([
                'category_id',
                'commission_rate',
                'commission_amount',
                'seller_earnings',
                'payout_status',
                'delivered_at',
            ]);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['payment_verified_by']);
            $table->dropColumn([
                'payment_reference',
                'payment_proof_path',
                'payment_verified_at',
                'payment_verified_by',
                'verification_rejection_reason',
                'shipping_name',
                'shipping_phone',
                'shipping_address',
                'shipping_province',
                'shipping_city',
                'shipping_barangay',
                'notes',
            ]);
        });
    }
};

