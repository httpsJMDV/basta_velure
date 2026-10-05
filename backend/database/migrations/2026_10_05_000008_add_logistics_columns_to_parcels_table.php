<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->foreignId('seller_id')->nullable()->after('order_id')->constrained('users')->restrictOnDelete();
            $table->string('pickup_barangay', 100)->nullable()->after('destination_barangay')->index();
            $table->json('pickup_address_snapshot')->nullable()->after('pickup_barangay');
            $table->json('recipient_snapshot')->nullable()->after('pickup_address_snapshot');
            $table->decimal('cod_amount', 10, 2)->nullable()->after('recipient_snapshot');
            $table->timestamp('ready_at')->nullable()->after('cod_amount');
            $table->unique('order_id');
        });
    }

    public function down(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->dropUnique(['order_id']);
            $table->dropForeign(['seller_id']);
            $table->dropColumn([
                'seller_id',
                'pickup_barangay',
                'pickup_address_snapshot',
                'recipient_snapshot',
                'cod_amount',
                'ready_at',
            ]);
        });
    }
};
