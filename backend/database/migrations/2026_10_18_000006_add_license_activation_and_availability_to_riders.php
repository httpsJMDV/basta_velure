<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Riders added by their courier company (A13, A15): the LTO license number and expiry, the company that added them,
 * the one-time activation link (stored hashed, valid 24 hours), and the work state the dispatcher reads: Online or
 * Offline, suspension with its reason, and a flag when changed vehicle documents wait for the company to re-verify.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->foreignId('logistics_company_id')->nullable()->after('sorting_center_id')->constrained('logistics_companies')->nullOnDelete();
            $table->string('license_number', 20)->nullable()->after('plate_number');
            $table->date('license_expiry')->nullable()->after('license_number');
            $table->string('activation_token_hash', 64)->nullable()->after('drivers_license_path');
            $table->timestamp('activation_sent_at')->nullable()->after('activation_token_hash');
            $table->timestamp('activation_expires_at')->nullable()->after('activation_sent_at');
            $table->timestamp('activated_at')->nullable()->after('activation_expires_at');
            $table->boolean('is_online')->default(false)->after('activated_at');
            $table->timestamp('online_at')->nullable()->after('is_online');
            $table->timestamp('last_seen_at')->nullable()->after('online_at');
            $table->boolean('needs_reverification')->default(false)->after('last_seen_at');
            $table->timestamp('suspended_at')->nullable()->after('needs_reverification');
            $table->text('suspension_reason')->nullable()->after('suspended_at');

            $table->index('license_number');
            $table->index('activation_token_hash');
            $table->index(['logistics_company_id', 'status', 'is_online']);
        });
    }

    public function down(): void
    {
        Schema::table('riders', function (Blueprint $table) {
            $table->dropForeign(['logistics_company_id']);
            $table->dropIndex(['license_number']);
            $table->dropIndex(['activation_token_hash']);
            $table->dropIndex(['logistics_company_id', 'status', 'is_online']);
            $table->dropColumn([
                'logistics_company_id', 'license_number', 'license_expiry', 'activation_token_hash', 'activation_sent_at',
                'activation_expires_at', 'activated_at', 'is_online', 'online_at', 'last_seen_at', 'needs_reverification',
                'suspended_at', 'suspension_reason',
            ]);
        });
    }
};
