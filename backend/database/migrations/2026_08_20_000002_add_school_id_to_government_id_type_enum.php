<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN government_id_type ENUM('national_id','drivers_license','passport','umid','sss_id','philhealth_id','voters_id','postal_id','school_id') NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN government_id_type ENUM('national_id','drivers_license','passport','umid','sss_id','philhealth_id','voters_id','postal_id') NULL");
    }
};
