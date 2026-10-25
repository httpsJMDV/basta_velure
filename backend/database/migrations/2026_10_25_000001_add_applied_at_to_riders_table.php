<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            // When the rider applied on the public "Become a rider" form; null when the courier company added them.
            $table->timestamp('applied_at')->nullable()->after('submitted_at');
        });
    }

    public function down(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->dropColumn('applied_at');
        });
    }
};
