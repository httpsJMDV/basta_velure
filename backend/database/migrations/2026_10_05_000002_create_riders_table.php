<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('riders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('sorting_center_id')->nullable()->constrained('sorting_centers')->nullOnDelete();
            $table->string('vehicle_type', 50);
            $table->string('plate_number', 50)->nullable()->index();
            $table->string('or_cr_path')->nullable();
            $table->string('drivers_license_path')->nullable();
            $table->string('status', 30)->default('PENDING');
            $table->text('rejection_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('sorting_center_id');
            $table->index(['sorting_center_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('riders');
    }
};
