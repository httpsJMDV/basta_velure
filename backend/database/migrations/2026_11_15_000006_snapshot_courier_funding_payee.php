<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('platform_courier_fundings', fn (Blueprint $t) => $t->json('payee')->nullable());
    }

    public function down(): void
    {
        Schema::table('platform_courier_fundings', fn (Blueprint $t) => $t->dropColumn('payee'));
    }
};
