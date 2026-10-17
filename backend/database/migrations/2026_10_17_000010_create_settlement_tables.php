<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records of money settled outside the platform, so both sides can see what was paid:
 *
 * - courier_settlements: one week of a courier and a shop. The courier keeps the delivery fee of every parcel and
 *   owes the shop the cash it collected on delivery; the side that owes the difference pays it by GCash.
 * - commission_payments: one month of commission a shop pays Loved-IT on its completed direct orders.
 *
 * The amounts are a snapshot taken when the payment is recorded.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('courier_settlements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('logistics_company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->unsignedInteger('orders_count');
            $table->decimal('cod_collected', 12, 2);
            $table->decimal('courier_fees', 12, 2);
            $table->decimal('net_amount', 12, 2);              // positive: the courier paid the shop; negative: the shop paid the courier
            $table->string('reference', 40);
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at');
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['logistics_company_id', 'seller_id', 'period_start'], 'courier_settlements_period_unique');
        });

        Schema::create('commission_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->date('period');                            // the first day of the month
            $table->unsignedInteger('orders_count');
            $table->decimal('amount', 12, 2);
            $table->string('reference', 40);
            $table->timestamp('paid_at');
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['seller_id', 'period']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commission_payments');
        Schema::dropIfExists('courier_settlements');
    }
};
