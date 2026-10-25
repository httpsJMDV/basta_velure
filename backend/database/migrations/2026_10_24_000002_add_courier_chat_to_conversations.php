<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Courier company chat (Amaru task 2): a courier company talks with each of its hubs in a `courier_hub` thread, one
 * per company and hub. The hub's unread count reuses `hub_unread`; the company's is `courier_unread`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('logistics_company_id')->nullable()->after('sorting_center_id')->constrained('logistics_companies')->nullOnDelete();
            $table->unsignedInteger('courier_unread')->default(0)->after('hub_unread');
            $table->index(['logistics_company_id', 'type', 'last_message_at']);
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex(['logistics_company_id', 'type', 'last_message_at']);
            $table->dropConstrainedForeignId('logistics_company_id');
            $table->dropColumn('courier_unread');
        });
    }
};
