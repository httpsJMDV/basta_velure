<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            // A delivery now needs two different photos. Older deliveries only have the first.
            $table->string('delivery_proof_path_2')->nullable()->after('delivery_proof_path');
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropColumn('delivery_proof_path_2');
        });
    }
};
