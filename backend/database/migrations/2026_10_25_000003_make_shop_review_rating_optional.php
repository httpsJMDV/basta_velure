<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shop reviews are now comments about the shop, without stars (product reviews keep theirs). New comments store no
 * rating; ratings given before stay in the column but are no longer shown or asked for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shop_reviews', function (Blueprint $table) {
            $table->unsignedTinyInteger('rating')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Comments posted without a rating would block the NOT NULL column; give them the middle of the scale.
        \Illuminate\Support\Facades\DB::table('shop_reviews')->whereNull('rating')->update(['rating' => 3]);
        Schema::table('shop_reviews', function (Blueprint $table) {
            $table->unsignedTinyInteger('rating')->nullable(false)->change();
        });
    }
};
