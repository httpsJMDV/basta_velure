<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->json('collection_payee')->nullable();
            $t->decimal('seller_shipping_charge', 14, 2)->default(0);
        });
        Schema::table('payout_requests', function (Blueprint $t) {
            $t->boolean('manual_reference_required')->default(false);
            $t->string('transfer_reference', 32)->nullable();
            $t->string('receipt_path')->nullable();
            $t->timestamp('sent_at')->nullable();
        });
        Schema::table('refunds', function (Blueprint $t) {
            $t->string('payer', 16)->default('seller')->index();
        });
        Schema::create('platform_gcash_references', function (Blueprint $t) {
            $t->id();
            $t->string('direction', 8);
            $t->string('reference', 32);
            $t->string('subject_type', 32);
            $t->unsignedBigInteger('subject_id');
            $t->timestamp('created_at');
            $t->unique(['direction', 'reference']);
        });
        Schema::create('platform_courier_fundings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('logistics_company_id')->constrained('logistics_companies');
            $t->decimal('amount', 14, 2);
            $t->string('reference', 32);
            $t->string('receipt_path')->nullable();
            $t->foreignId('sent_by')->constrained('users');
            $t->timestamp('sent_at');
            $t->foreignId('confirmed_by')->nullable()->constrained('users');
            $t->timestamp('confirmed_at')->nullable();
            $t->timestamps();
        });
        Schema::create('platform_courier_funding_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('funding_id')->constrained('platform_courier_fundings');
            $t->foreignId('order_id')->unique()->constrained('orders');
            $t->decimal('amount', 14, 2);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_courier_funding_orders');
        Schema::dropIfExists('platform_courier_fundings');
        Schema::dropIfExists('platform_gcash_references');
        Schema::table('refunds', fn (Blueprint $t) => $t->dropColumn('payer'));
        Schema::table('payout_requests', fn (Blueprint $t) => $t->dropColumn(['manual_reference_required', 'transfer_reference', 'receipt_path', 'sent_at']));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['collection_payee', 'seller_shipping_charge']));
    }
};
