<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->timestamp('delivered_at')->nullable()->after('out_for_delivery_at');
            $table->string('delivery_proof_path')->nullable()->after('delivered_at');
            $table->string('received_by', 100)->nullable()->after('delivery_proof_path');
            $table->timestamp('cod_collected_at')->nullable()->after('received_by');
            $table->timestamp('failed_at')->nullable()->after('cod_collected_at');
            $table->string('failure_reason', 50)->nullable()->after('failed_at');
            $table->text('failure_note')->nullable()->after('failure_reason');
            $table->unsignedTinyInteger('delivery_attempts')->default(0)->after('failure_note');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropColumn([
                'delivered_at',
                'delivery_proof_path',
                'received_by',
                'cod_collected_at',
                'failed_at',
                'failure_reason',
                'failure_note',
                'delivery_attempts',
            ]);
        });
    }
};
