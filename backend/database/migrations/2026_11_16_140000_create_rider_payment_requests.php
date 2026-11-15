<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rider_payment_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rider_id')->constrained()->restrictOnDelete();
            $table->foreignId('sorting_center_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('logistics_company_id')->nullable()->index();
            $table->string('reference_code', 40)->unique();
            $table->decimal('amount', 14, 2);
            $table->json('breakdown');
            $table->string('gcash_number', 20);
            $table->string('gcash_name');
            $table->string('status', 20)->default('pending');
            $table->string('transfer_reference', 13)->nullable();
            $table->string('receipt_path')->nullable();
            $table->text('note')->nullable();
            $table->text('report_note')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['rider_id', 'status']);
            $table->unique(['logistics_company_id', 'transfer_reference'], 'rider_payment_transfer_unique');
        });
        foreach (['rider_earnings', 'truck_trips'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->foreignId('rider_payment_request_id')->nullable()
                ->constrained('rider_payment_requests')->restrictOnDelete());
        }
    }

    public function down(): void
    {
        foreach (['rider_earnings', 'truck_trips'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropConstrainedForeignId('rider_payment_request_id'));
        }
        Schema::dropIfExists('rider_payment_requests');
    }
};
