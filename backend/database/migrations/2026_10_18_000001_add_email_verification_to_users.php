<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Email verification by a 6-digit code (A9/A12): a new account starts "unverified" and cannot be used until the code
 * from its email is entered; a rider added by a courier company starts "pending_activation" until they set a password
 * from the emailed link (A13). Consent to the Terms and Privacy Policy is recorded with its time. Existing accounts
 * keep their status (active or suspended), so nobody already signed up is locked out.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY status ENUM('active','suspended','unverified','pending_activation') NOT NULL DEFAULT 'active'");

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('terms_accepted_at')->nullable()->after('email_verified_at');
        });

        Schema::create('email_otps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // register, email_change or phone_change
            $table->string('purpose', 20);
            // The new email or phone a change is waiting to confirm (null for registration)
            $table->string('target', 150)->nullable();
            $table->string('code_hash');
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            // Set when a newer code for the same purpose replaced this one (a resend cancels the old code)
            $table->timestamp('superseded_at')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'purpose']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_otps');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('terms_accepted_at');
        });

        DB::table('users')->whereIn('status', ['unverified', 'pending_activation'])->update(['status' => 'suspended']);
        DB::statement("ALTER TABLE users MODIFY status ENUM('active','suspended') NOT NULL DEFAULT 'active'");
    }
};
