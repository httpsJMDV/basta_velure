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
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropForeign(['seller_id']);
            $table->dropUnique(['seller_id']);
            $table->foreignId('seller_id')->nullable()->change()->constrained('users')->onDelete('cascade');

            $table->foreignId('buyer_id')->nullable()->after('id')->constrained('users')->onDelete('cascade');
            $table->string('type', 32)->default('buyer_seller')->after('seller_id')->index();
            $table->string('status', 32)->default('open')->after('type')->index();
            $table->string('subject')->nullable()->after('status');
            $table->foreignId('product_id')->nullable()->after('subject')->constrained('products')->nullOnDelete();
            $table->foreignId('order_id')->nullable()->after('product_id')->constrained('orders')->nullOnDelete();
            $table->unsignedInteger('buyer_unread')->default(0)->after('last_message_at');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->string('attachment_type', 32)->nullable()->after('body');
            $table->json('attachment_data')->nullable()->after('attachment_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn(['attachment_type', 'attachment_data']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropForeign(['buyer_id']);
            $table->dropForeign(['product_id']);
            $table->dropForeign(['order_id']);
            $table->dropColumn([
                'buyer_id',
                'type',
                'status',
                'subject',
                'product_id',
                'order_id',
                'buyer_unread',
            ]);
        });
    }
};

