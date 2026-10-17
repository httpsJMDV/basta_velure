<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Feedback about the Loved-IT site itself, sent from the storefront's Feedback button and read by the admin
 * (Reviews & Feedback page). Not product reviews: those stay in `reviews`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('message');
            $table->string('page_url', 500)->nullable();
            $table->string('status', 20)->default('new'); // new | read
            $table->timestamp('read_at')->nullable();
            $table->foreignId('read_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_feedback');
    }
};
