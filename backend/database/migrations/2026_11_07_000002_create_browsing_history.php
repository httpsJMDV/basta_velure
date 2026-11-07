<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a signed-in shopper looked at and searched for, newest first: "Recently viewed" on Home and recent searches in
 * the search box. One row per product and per search, refreshed on repeat; old ones are trimmed (BrowsingHistory).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->timestamp('viewed_at');
            $table->unique(['user_id', 'product_id']);
            $table->index(['user_id', 'viewed_at']);
        });

        Schema::create('search_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('query', 100);
            $table->timestamp('searched_at');
            $table->unique(['user_id', 'query']);
            $table->index(['user_id', 'searched_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('search_histories');
        Schema::dropIfExists('product_views');
    }
};
