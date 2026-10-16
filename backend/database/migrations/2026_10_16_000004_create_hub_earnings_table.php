<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hub_earnings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sorting_center_id')->constrained('sorting_centers')->cascadeOnDelete();
            // One row per delivered parcel: the hub's share of the delivery fee. The unique index keeps it to one.
            $table->foreignId('parcel_id')->nullable()->unique()->constrained('parcels')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->timestamp('earned_at')->useCurrent();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['sorting_center_id', 'earned_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hub_earnings');
    }
};
