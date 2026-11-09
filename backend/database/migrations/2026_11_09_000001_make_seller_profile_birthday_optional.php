<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A visitor who opens a shop on the website gives no birthday (the seller form, like the courier form, does not ask:
 * BuyerRegisterRequest::accountRules(withDateOfBirth: false)), but seller_profiles.date_of_birth was required, so the
 * application failed with a database error. The birthday lives on the user; the shop copy is now optional.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seller_profiles', function (Blueprint $table) {
            $table->date('date_of_birth')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Back to required only when no shop is missing it.
        if (\Illuminate\Support\Facades\DB::table('seller_profiles')->whereNull('date_of_birth')->doesntExist()) {
            Schema::table('seller_profiles', function (Blueprint $table) {
                $table->date('date_of_birth')->nullable(false)->change();
            });
        }
    }
};
