<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN sex ENUM('male','female','prefer_not_to_say') NULL");
    }

    public function down(): void
    {
        // Revert rows that would be truncated before shrinking the enum
        DB::statement("UPDATE users SET sex = NULL WHERE sex = 'prefer_not_to_say'");
        DB::statement("ALTER TABLE users MODIFY COLUMN sex ENUM('male','female') NULL");
    }
};
