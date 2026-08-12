<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->restrictOnDelete();
            // The type of action: approve_seller, reject_seller, suspend_user,
            // reactivate_user, takedown_product, delete_review, etc.
            $table->string('action', 60);
            // Polymorphic-style target: what entity was acted on
            $table->string('target_type', 60);   // e.g. 'seller_profile', 'user', 'product'
            $table->unsignedBigInteger('target_id');
            // Human-readable summary + optional structured diff
            $table->text('description');
            $table->json('meta')->nullable(); // e.g. rejection reason, old/new status
            $table->timestamp('created_at')->useCurrent();

            $table->index('admin_id');
            $table->index(['target_type', 'target_id']);
            $table->index('action');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_activity_logs');
    }
};
