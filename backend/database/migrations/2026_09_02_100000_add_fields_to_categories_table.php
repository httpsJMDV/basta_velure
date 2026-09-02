<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            if (!Schema::hasColumn('categories', 'is_active')) {
                $table->boolean('is_active')->default(true)->after('sort_order');
            }
            if (!Schema::hasColumn('categories', 'requires_fda')) {
                $table->boolean('requires_fda')->default(false)->after('is_active');
            }
            if (!Schema::hasColumn('categories', 'commission_rate')) {
                $table->decimal('commission_rate', 5, 2)->nullable()->after('requires_fda');
            }
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn(['is_active', 'requires_fda', 'commission_rate']);
        });
    }
};
