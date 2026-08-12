<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seller_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('shop_name')->unique();
            $table->date('date_of_birth');
            $table->enum('government_id_type', [
                'national_id', 'drivers_license', 'passport',
                'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id',
            ]);
            // Encrypted at rest — cannot be uniquely indexed
            $table->text('government_id_number');
            // SHA-256 hash for duplicate detection without indexing plaintext
            $table->string('government_id_number_hash', 64)->unique();
            $table->string('government_id_image_path');
            // Encrypted at rest
            $table->text('payout_gcash_number');
            $table->enum('application_status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('submitted_at')->useCurrent();
            $table->timestamps();
            $table->softDeletes();

            $table->index('application_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seller_profiles');
    }
};
