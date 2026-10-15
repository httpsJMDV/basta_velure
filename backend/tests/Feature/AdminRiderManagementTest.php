<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A rider is approved by the logistics hub they chose, never by the admin. The admin keeps the Riders page as plain
 * account management (list, view, suspend, reactivate through users.status), and still approves hubs.
 */
class AdminRiderManagementTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private User $hubOwner;
    private SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        $this->admin = $this->makeUser('admin');
        $this->hubOwner = $this->makeUser('buyer');
        $this->hub = $this->makeHub($this->hubOwner, SortingCenter::STATUS_APPROVED);
    }

    private function makeUser(string $role, array $attributes = []): User
    {
        $user = new User(array_merge([
            'first_name'    => ucfirst($role),
            'last_name'     => 'Tester',
            'email'         => $role . '.' . uniqid() . '@example.com',
            'phone'         => '+63917' . random_int(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1990-01-01',
            'sex'           => 'male',
        ], $attributes));
        $user->role = $role;
        $user->status = 'active';
        $user->save();

        return $user;
    }

    private function makeHub(User $owner, string $status): SortingCenter
    {
        return SortingCenter::create([
            'user_id'            => $owner->id,
            'hub_name'           => 'Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '1 Hub St',
            'dti_permit_path'    => 'dti_permits/x.pdf',
            'status'             => $status,
            'coverage_barangays' => ['043405001'],
        ]);
    }

    private function makeRider(string $status = Rider::STATUS_PENDING, ?SortingCenter $hub = null): Rider
    {
        $user = $this->makeUser('rider');

        return Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => ($hub ?? $this->hub)->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => 'AB-' . random_int(1000, 9999),
            'or_cr_path'           => 'rider_or_cr/x.pdf',
            'drivers_license_path' => 'rider_licenses/x.pdf',
            'status'               => $status,
            'submitted_at'         => now(),
        ]);
    }

    // ── The admin cannot approve riders ─────────────────────────────────────

    public function test_there_is_no_admin_route_to_approve_or_disapprove_a_rider(): void
    {
        $rider = $this->makeRider();
        Sanctum::actingAs($this->admin);

        $paths = [
            ['getJson',  '/api/v1/admin/rider-applications'],
            ['getJson',  "/api/v1/admin/rider-applications/{$rider->id}"],
            ['postJson', "/api/v1/admin/rider-applications/{$rider->id}/approve"],
            ['postJson', "/api/v1/admin/rider-applications/{$rider->id}/reject"],
            ['postJson', "/api/v1/admin/rider-applications/{$rider->id}/disapprove"],
            ['postJson', "/api/v1/admin/riders/{$rider->id}/approve"],
            ['postJson', "/api/v1/admin/riders/{$rider->id}/disapprove"],
            ['patchJson', "/api/v1/admin/riders/{$rider->id}/status"],
        ];
        foreach ($paths as [$method, $path]) {
            $this->{$method}($path, ['reason' => 'x'])->assertNotFound();
        }

        $this->assertSame(Rider::STATUS_PENDING, $rider->fresh()->status);
    }

    public function test_an_admin_token_cannot_use_the_hub_endpoints_to_approve_a_rider(): void
    {
        $rider = $this->makeRider();
        Sanctum::actingAs($this->admin);

        $this->postJson("/api/v1/hub/riders/{$rider->id}/approve")->assertForbidden();
        $this->postJson("/api/v1/hub/riders/{$rider->id}/disapprove", ['reason' => 'No'])->assertForbidden();
        $this->assertSame(Rider::STATUS_PENDING, $rider->fresh()->status);
        $this->assertNull($rider->fresh()->reviewed_by);
    }

    public function test_only_the_riders_own_hub_can_approve_the_rider(): void
    {
        Mail::fake();
        $rider = $this->makeRider();
        $otherOwner = $this->makeUser('buyer');
        $this->makeHub($otherOwner, SortingCenter::STATUS_APPROVED);

        // Another approved hub gets a 404, never a 403: it must not learn the rider exists.
        Sanctum::actingAs($otherOwner);
        $this->postJson("/api/v1/hub/riders/{$rider->id}/approve")->assertNotFound();
        $this->assertSame(Rider::STATUS_PENDING, $rider->fresh()->status);

        // The rider's own hub approves (feature 1.5 is untouched).
        Sanctum::actingAs($this->hubOwner);
        $this->postJson("/api/v1/hub/riders/{$rider->id}/approve", ['area_label' => 'Area A', 'coverage_barangays' => ['043405001']])
            ->assertOk();
        $fresh = $rider->fresh();
        $this->assertSame(Rider::STATUS_ACTIVE, $fresh->status);
        $this->assertSame($this->hubOwner->id, $fresh->reviewed_by);
    }

    public function test_the_admin_still_approves_hubs(): void
    {
        Mail::fake();
        $owner = $this->makeUser('buyer');
        $pendingHub = $this->makeHub($owner, SortingCenter::STATUS_PENDING);

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/admin/sorting-center-applications/{$pendingHub->id}/approve")->assertOk();
        $this->assertSame(SortingCenter::STATUS_APPROVED, $pendingHub->fresh()->status);
        $this->assertSame($this->admin->id, $pendingHub->fresh()->reviewed_by);
    }

    // ── The Riders page: account management only ────────────────────────────

    public function test_the_riders_page_lists_riders_with_their_hub_and_status(): void
    {
        $active = $this->makeRider(Rider::STATUS_ACTIVE);
        $pending = $this->makeRider(Rider::STATUS_PENDING);
        $buyer = $this->makeUser('buyer');

        Sanctum::actingAs($this->admin);
        $response = $this->getJson('/api/v1/admin/users?role=rider')->assertOk();

        $rows = collect($response->json('data'))->keyBy('id');
        $this->assertTrue($rows->has($active->user_id));
        $this->assertTrue($rows->has($pending->user_id));
        $this->assertFalse($rows->has($buyer->id), 'only riders are listed');
        $this->assertFalse($rows->has($this->admin->id));

        $this->assertSame('ACTIVE', $rows[$active->user_id]['rider']['status']);
        $this->assertSame('PENDING', $rows[$pending->user_id]['rider']['status']);
        $this->assertSame($this->hub->id, $rows[$active->user_id]['rider']['sorting_center_id']);
        $this->assertSame($this->hub->hub_name, $rows[$active->user_id]['rider']['hub_name']);
        $this->assertSame('Motorcycle', $rows[$active->user_id]['rider']['vehicle_type']);
        $this->assertSame('active', $rows[$active->user_id]['status']);

        // Other roles keep their old payload shape (no rider block).
        $buyers = $this->getJson('/api/v1/admin/users?role=buyer')->assertOk();
        $this->assertArrayNotHasKey('rider', $buyers->json('data.0'));

        // A non-admin cannot list users.
        Sanctum::actingAs($this->hubOwner);
        $this->getJson('/api/v1/admin/users?role=rider')->assertForbidden();
    }

    public function test_the_admin_suspends_and_reactivates_a_rider_through_the_account_status_only(): void
    {
        $rider = $this->makeRider(Rider::STATUS_ACTIVE);
        $user = $rider->user;
        $user->createToken('device');

        Sanctum::actingAs($this->admin);
        $suspended = $this->patchJson("/api/v1/admin/users/{$user->id}/suspend")->assertOk();
        $suspended->assertJsonPath('data.status', 'suspended');
        // The response keeps the rider block, so the page does not lose the hub column after the action.
        $suspended->assertJsonPath('data.rider.status', 'ACTIVE')->assertJsonPath('data.rider.hub_name', $this->hub->hub_name);

        // The application status is not a suspension flag: it is untouched, and no new status exists.
        $this->assertSame(Rider::STATUS_ACTIVE, $rider->fresh()->status);
        $this->assertSame(0, $user->tokens()->count(), 'active sessions are revoked');
        $this->postJson('/api/v1/auth/login', ['identifier' => $user->email, 'password' => 'Password123!'])->assertForbidden();

        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/v1/admin/users/{$user->id}/reactivate")->assertOk()->assertJsonPath('data.status', 'active');
        $this->postJson('/api/v1/auth/login', ['identifier' => $user->email, 'password' => 'Password123!'])->assertOk();

        // The admin account itself cannot be suspended.
        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/v1/admin/users/{$this->admin->id}/suspend")->assertForbidden();
    }
}
