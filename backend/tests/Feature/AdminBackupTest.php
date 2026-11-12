<?php

namespace Tests\Feature;

use App\Models\AdminActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The admin Backups page: a backup is made in short steps, can be downloaded as one .sql.gz, the newest finished one
 * is always kept, and only admins reach any of it.
 */
class AdminBackupTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('local');
        $this->admin = User::forceCreate([
            'first_name' => 'Ada', 'last_name' => 'Admin', 'email' => 'admin.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('Admin@2026'), 'role' => 'admin', 'status' => 'active',
        ]);
    }

    /** Starts a backup and keeps calling continue until it is done, as the page does. */
    private function backUp(): array
    {
        $b = $this->postJson('/api/v1/admin/backups')->assertCreated()->json('data');
        for ($i = 0; $b['status'] === 'running' && $i < 50; $i++) {
            $b = $this->postJson("/api/v1/admin/backups/{$b['id']}/continue")->assertOk()->json('data');
        }
        $this->assertSame('completed', $b['status']);

        return $b;
    }

    public function test_an_admin_backs_up_downloads_and_the_file_is_a_restorable_dump(): void
    {
        Sanctum::actingAs($this->admin);
        $b = $this->backUp();
        $this->assertSame(100, $b['progress']);
        $this->assertGreaterThan(0, $b['bytes']);
        $this->assertSame('Ada Admin', $b['created_by']);

        $list = $this->getJson('/api/v1/admin/backups')->assertOk();
        $list->assertJsonPath('data.0.id', $b['id'])->assertJsonPath('meta.storage.count', 1)->assertJsonPath('meta.schedule.time', '02:00');
        $this->assertContains('sessions', $list->json('meta.skipped_tables'));

        $response = $this->get("/api/v1/admin/backups/{$b['id']}/download")->assertOk();
        $sql = gzdecode($response->streamedContent());
        $this->assertNotFalse($sql);
        $this->assertStringContainsString('SET FOREIGN_KEY_CHECKS=0;', $sql);
        $this->assertStringContainsString('CREATE TABLE `users`', $sql);
        $this->assertStringContainsString('INSERT INTO `users`', $sql);
        $this->assertStringContainsString($this->admin->email, $sql);
        $this->assertStringNotContainsString('CREATE TABLE `sessions`', $sql);
        // One statement per line: no value carries a raw line break.
        foreach (explode("\n", $sql) as $line) {
            if (str_starts_with($line, 'INSERT')) {
                $this->assertStringEndsWith(';', $line);
            }
        }

        $this->assertTrue(AdminActivityLog::where('action', 'create_backup')->exists());
        $this->assertTrue(AdminActivityLog::where('action', 'download_backup')->exists());
    }

    public function test_the_newest_backup_is_kept_and_a_second_backup_waits_for_the_first(): void
    {
        Sanctum::actingAs($this->admin);
        $first = $this->backUp();
        $this->deleteJson("/api/v1/admin/backups/{$first['id']}")->assertStatus(422);

        $this->travel(2)->seconds();
        $second = $this->backUp();
        $this->deleteJson("/api/v1/admin/backups/{$first['id']}")->assertOk();
        $this->getJson('/api/v1/admin/backups')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $second['id']);

        // While one is being made, "Back up now" shows that one instead of starting another.
        $this->travel(2)->seconds();
        $running = app(\App\Services\Backups\DatabaseBackups::class)->start($this->admin, 'manual');
        $this->postJson('/api/v1/admin/backups')->assertStatus(409)->assertJsonPath('data.id', $running['id']);
        $this->get("/api/v1/admin/backups/{$running['id']}/download")->assertStatus(409);
    }

    public function test_only_admins_and_only_real_ids(): void
    {
        $buyer = User::forceCreate([
            'first_name' => 'Bea', 'last_name' => 'Buyer', 'email' => 'buyer.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('Buyer@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
        Sanctum::actingAs($buyer);
        $this->getJson('/api/v1/admin/backups')->assertForbidden();
        $this->postJson('/api/v1/admin/backups')->assertForbidden();

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/v1/admin/backups/20990101-000000-zzzz/download')->assertNotFound();
        $this->getJson('/api/v1/admin/backups/..%2F..%2Fenv/download')->assertNotFound();
        $this->postJson('/api/v1/admin/backups/20990101-000000-zzzz/continue')->assertNotFound();
    }
}
