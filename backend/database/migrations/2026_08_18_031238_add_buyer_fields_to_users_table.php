<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('sex', ['male', 'female'])->nullable()->after('gender');
            $table->string('government_id_type', 50)->nullable()->after('sex');
            $table->string('government_id_image_path')->nullable()->after('government_id_type');
            // pending = awaiting admin review, approved = can buy, rejected = denied
            $table->enum('buyer_application_status', ['pending', 'approved', 'rejected'])
                  ->nullable()->after('government_id_image_path');
            $table->string('buyer_rejection_reason')->nullable()->after('buyer_application_status');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'sex', 'government_id_type', 'government_id_image_path',
                'buyer_application_status', 'buyer_rejection_reason',
            ]);
        });
    }
};
