<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Feature 2.10: rider delivery threads live in the existing conversations table.
     *
     * A rider thread belongs to one parcel and has two participants: the rider (rider_id, a user) and one
     * counterpart: the seller (seller_id), the buyer (buyer_id) or the hub (sorting_center_id). The
     * conversation "type" is rider_seller, rider_buyer or rider_hub. All columns are nullable, so existing
     * buyer-seller and support conversations are untouched.
     */
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('parcel_id')->nullable()->after('order_id')->constrained('parcels')->nullOnDelete();
            $table->foreignId('rider_id')->nullable()->after('parcel_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('sorting_center_id')->nullable()->after('rider_id')->constrained('sorting_centers')->nullOnDelete();
            $table->unsignedInteger('rider_unread')->default(0)->after('buyer_unread');
            $table->unsignedInteger('hub_unread')->default(0)->after('rider_unread');

            // One thread per parcel, rider and counterpart kind. NULLs never collide, so other types are unaffected.
            $table->unique(['parcel_id', 'rider_id', 'type'], 'conversations_parcel_rider_type_unique');
            $table->index(['rider_id', 'last_message_at'], 'conversations_rider_last_message_index');
            $table->index(['sorting_center_id', 'last_message_at'], 'conversations_hub_last_message_index');
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex('conversations_hub_last_message_index');
            $table->dropIndex('conversations_rider_last_message_index');
            $table->dropUnique('conversations_parcel_rider_type_unique');
            $table->dropForeign(['parcel_id']);
            $table->dropForeign(['rider_id']);
            $table->dropForeign(['sorting_center_id']);
            $table->dropColumn(['parcel_id', 'rider_id', 'sorting_center_id', 'rider_unread', 'hub_unread']);
        });
    }
};
