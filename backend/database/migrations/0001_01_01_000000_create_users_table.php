<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('first_name', 50);
            $table->string('middle_name', 50)->nullable();
            $table->string('last_name', 50);
            $table->string('email', 100)->unique();
            $table->string('phone', 20)->unique();
            $table->string('password');
            $table->enum('role', ['admin', 'buyer', 'seller', 'rider'])->default('buyer');
            $table->enum('status', ['active', 'suspended'])->default('active');
            $table->timestamp('email_verified_at')->nullable();
            $table->string('verification_token', 100)->nullable();
            $table->timestamp('verification_token_expires_at')->nullable();
            $table->string('reset_token', 100)->nullable();
            $table->timestamp('reset_token_expires_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();

            $table->index('email');
            $table->index('phone');
            $table->index('role');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
