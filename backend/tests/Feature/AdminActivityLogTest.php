<?php

namespace Tests\Feature;

use App\Models\AdminActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The admin activity log: filters by area, admin, period and words, with figures for the whole log. */
class AdminActivityLogTest extends TestCase
{
    use DatabaseTransactions;

    private function admin(string $first): User
    {
        return User::forceCreate(['first_name' => $first, 'last_name' => 'Admin', 'email' => Str::random(10) . '@example.com', 'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']);
    }

    public function test_the_log_filters_by_area_admin_period_and_words_and_counts_the_whole_log(): void
    {
        AdminActivityLog::query()->delete();
        $ana = $this->admin('Ana');
        $ben = $this->admin('Ben');
        AdminActivityLog::log($ana->id, 'approve_seller', 'Approved seller "Kape Shop".', 'seller_profile', 1);
        AdminActivityLog::log($ana->id, 'reject_buyer', 'Rejected buyer application of Juan.', 'user', 2);
        AdminActivityLog::log($ben->id, 'update_category', 'Renamed category "Snacks".', 'category', 3);
        $old = AdminActivityLog::log($ben->id, 'suspend_user', 'Suspended a buyer.', 'user', 4);
        $old->forceFill(['created_at' => now()->subDays(20)])->save();

        Sanctum::actingAs($ana);
        $all = $this->getJson('/api/v1/admin/activity-log')->assertOk();
        $this->assertSame(4, $all->json('meta.total'));
        $this->assertSame(['total' => 4, 'today' => 3, 'week' => 3], array_intersect_key($all->json('summary'), array_flip(['total', 'today', 'week'])));
        $this->assertSame(2, $all->json('summary.areas.applications'));
        $this->assertSame(1, $all->json('summary.areas.catalog'));
        $this->assertSame(1, $all->json('summary.areas.accounts'));
        $this->assertEqualsCanonicalizing(['Ana Admin', 'Ben Admin'], $all->json('summary.admins.*.name'));
        // Newest first: the suspension was logged last but happened 20 days ago.
        $this->assertSame(['update_category', 'reject_buyer', 'approve_seller', 'suspend_user'], $all->json('data.*.action'));

        $this->assertSame(2, $this->getJson('/api/v1/admin/activity-log?area=applications')->json('meta.total'));
        $this->assertSame(2, $this->getJson("/api/v1/admin/activity-log?admin_id={$ben->id}")->json('meta.total'));
        $this->assertSame(3, $this->getJson('/api/v1/admin/activity-log?period=7d')->json('meta.total'));
        $this->assertSame(['Renamed category "Snacks".'], $this->getJson('/api/v1/admin/activity-log?search=snacks')->json('data.*.description'));
        $this->assertSame(1, $this->getJson('/api/v1/admin/activity-log?action=reject_buyer')->json('meta.total'));
    }
}
