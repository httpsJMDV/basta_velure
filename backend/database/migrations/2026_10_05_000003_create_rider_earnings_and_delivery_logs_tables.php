<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rider_earnings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rider_id')->constrained('riders')->cascadeOnDelete();
            $table->foreignId('parcel_id')->nullable()->constrained('parcels')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->timestamp('earned_at')->useCurrent();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['rider_id', 'earned_at']);
            $table->index('earned_at');
        });

        Schema::create('delivery_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parcel_id')->constrained('parcels')->cascadeOnDelete();
            $table->foreignId('rider_id')->constrained('riders')->cascadeOnDelete();
            $table->string('outcome', 50);
            $table->timestamp('logged_at')->useCurrent();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['parcel_id', 'logged_at']);
            $table->index(['rider_id', 'logged_at']);
            $table->index('outcome');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_logs');
        Schema::dropIfExists('rider_earnings');
    }
};
