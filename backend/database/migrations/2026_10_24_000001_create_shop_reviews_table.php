<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shop reviews (Amaru task 6): one review per buyer per shop, about the shop itself (shipping, packaging, how the
 * seller answers), apart from the product reviews. The edit limit (2 a day) is counted on the row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('buyer_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->string('comment', 500)->nullable();
            $table->json('tags')->nullable();
            $table->unsignedInteger('edit_count')->default(0);
            $table->date('edit_day')->nullable();
            $table->unsignedTinyInteger('edits_on_day')->default(0);
            $table->string('seller_reply', 500)->nullable();
            $table->timestamp('seller_replied_at')->nullable();
            $table->timestamp('seller_reply_edited_at')->nullable();
            $table->timestamps();

            $table->unique(['seller_id', 'buyer_id']);
            $table->index(['seller_id', 'created_at']);
            $table->index(['seller_id', 'rating']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_reviews');
    }
};
