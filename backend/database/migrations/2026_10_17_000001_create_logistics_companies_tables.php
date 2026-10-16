<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Courier companies (like SPX Express, J&T): each runs its own hubs, and its riders deliver its parcels.
 *
 * The platform's own courier, "Loved-IT Express", is created here and every existing hub, order and parcel joins it,
 * so nothing that worked before changes. Anything that still has no company (rows created by older code paths) is
 * treated as the platform courier by the application.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('logistics_companies', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('code', 10)->unique();
            $table->string('slug', 140)->unique();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('description')->nullable();
            $table->string('contact_email', 150)->nullable();
            $table->string('contact_phone', 30)->nullable();
            $table->string('address_province', 100)->nullable();
            $table->string('address_city', 100)->nullable();
            $table->string('address_barangay', 100)->nullable();
            $table->string('address_street', 255)->nullable();
            $table->string('logo_path')->nullable();
            $table->string('business_permit_path')->nullable();
            $table->boolean('is_platform')->default(false);
            $table->string('status', 20)->default('PENDING')->index();
            $table->text('rejection_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        // The people who run a courier company's portal. One company per account.
        Schema::create('logistics_company_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('logistics_company_id')->constrained('logistics_companies')->cascadeOnDelete();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('role', 20)->default('owner');
            $table->timestamps();
        });

        foreach (['sorting_centers', 'orders', 'parcels'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreignId('logistics_company_id')->nullable()->after('id')->constrained('logistics_companies')->nullOnDelete();
                $table->index('logistics_company_id');
            });
        }

        // The platform courier, run by the platform admin.
        $owner = DB::table('users')->where('role', 'admin')->orderBy('id')->value('id');
        $now = now();
        $platformId = DB::table('logistics_companies')->insertGetId([
            'name' => 'Loved-IT Express',
            'code' => 'LEX',
            'slug' => 'loved-it-express',
            'owner_user_id' => $owner,
            'description' => 'The Loved-IT platform courier.',
            'is_platform' => true,
            'status' => 'APPROVED',
            'reviewed_at' => $now,
            'submitted_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        if ($owner) {
            DB::table('logistics_company_members')->insert([
                'logistics_company_id' => $platformId, 'user_id' => $owner, 'role' => 'owner', 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        foreach (['sorting_centers', 'orders', 'parcels'] as $tableName) {
            DB::table($tableName)->whereNull('logistics_company_id')->update(['logistics_company_id' => $platformId]);
        }
    }

    public function down(): void
    {
        foreach (['parcels', 'orders', 'sorting_centers'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropConstrainedForeignId('logistics_company_id');
            });
        }
        Schema::dropIfExists('logistics_company_members');
        Schema::dropIfExists('logistics_companies');
    }
};
