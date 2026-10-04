<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sorting_centers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('hub_name', 150);
            $table->string('address_province', 100)->nullable();
            $table->string('address_city', 100)->nullable();
            $table->string('address_barangay', 100)->nullable();
            $table->string('address_street', 255)->nullable();
            $table->string('dti_permit_path', 255)->nullable();
            $table->json('coverage_barangays')->nullable();
            $table->string('status', 30)->default('PENDING');
            $table->text('rejection_reason')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sorting_centers');
    }
};
