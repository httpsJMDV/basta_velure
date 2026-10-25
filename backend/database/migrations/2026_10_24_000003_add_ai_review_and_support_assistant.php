<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Claude features (Amaru tasks 7 and 8).
 *
 * - products: what the AI check decided when the seller published (`ai_review_status` checking / approved / flagged /
 *   unavailable, the verdict it gave, its reason for the admin and the seller, and when).
 * - conversations: whether a Loved-IT Support chat is answered by the assistant or was handed to a person.
 * - messages: the assistant's messages have no sender account, so `sender_id` may be empty; `sender_kind` says "ai".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('ai_review_status', 20)->nullable()->after('rejection_reason');
            $table->string('ai_review_verdict', 20)->nullable()->after('ai_review_status');
            $table->string('ai_review_reason', 500)->nullable()->after('ai_review_verdict');
            $table->timestamp('ai_reviewed_at')->nullable()->after('ai_review_reason');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->string('support_mode', 10)->nullable()->after('status');
            $table->timestamp('support_handoff_at')->nullable()->after('support_mode');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->foreignId('sender_id')->nullable()->change();
            $table->string('sender_kind', 10)->nullable()->after('sender_id');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn('sender_kind');
        });
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropColumn(['support_mode', 'support_handoff_at']);
        });
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['ai_review_status', 'ai_review_verdict', 'ai_review_reason', 'ai_reviewed_at']);
        });
    }
};
