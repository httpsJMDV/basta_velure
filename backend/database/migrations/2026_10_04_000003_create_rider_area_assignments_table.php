<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rider_area_assignments', function (Blueprint $table) {
            $table->id();
            // TODO(2.1): Foreign key to riders table will be added when Rider model/table is created in Task 2.1
            $table->unsignedBigInteger('rider_id')->nullable()->index();
            $table->foreignId('sorting_center_id')->constrained('sorting_centers')->cascadeOnDelete();
            $table->string('area_label', 100);
            $table->json('coverage_barangays')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['sorting_center_id', 'is_active']);
            $table->index(['rider_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rider_area_assignments');
    }
};
