<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            // seller side — one conversation per seller with admin
            $table->foreignId('seller_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->timestamp('last_message_at')->nullable()->index();
            $table->unsignedInteger('admin_unread')->default(0);
            $table->unsignedInteger('seller_unread')->default(0);
            $table->timestamps();

            $table->unique('seller_id'); // one thread per seller
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')
                  ->constrained()
                  ->onDelete('cascade');
            $table->foreignId('sender_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->text('body');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
    }
};
