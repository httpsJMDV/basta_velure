<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('original_price', 10, 2)->nullable()->after('base_price');
            $table->decimal('avg_rating', 3, 2)->nullable()->after('units_sold');
            $table->unsignedInteger('review_count')->default(0)->after('avg_rating');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['original_price', 'avg_rating', 'review_count']);
        });
    }
};
