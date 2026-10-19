<?php

namespace Tests\Feature;

use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SortingCenterDashboardTest extends TestCase
{
    use DatabaseTransactions;

    private User $hubOwner;
    private SortingCenter $hub;
    private User $buyer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        // Create an approved hub owner and hub
        $this->hubOwner = User::forceCreate([
            'first_name' => 'Hub',
            'last_name'  => 'Operator',
            'email'      => 'hub.op.' . uniqid() . '@example.com',
            'phone'      => '+63917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->hub = SortingCenter::create([
            'user_id'            => $this->hubOwner->id,
            'hub_name'           => 'Valenzuela Central Logistics Hub',
            'address_province'   => 'Metro Manila',
            'address_city'       => 'Valenzuela City',
            'address_barangay'   => 'Karuhatan',
            'address_street'     => '123 Expressway Access Road',
            'dti_permit_path'    => 'dti_permits/fake_permit.jpg',
            'coverage_barangays' => ['Karuhatan', 'Gen. T. de Leon', 'Malanday'],
            'status'             => SortingCenter::STATUS_APPROVED,
        ]);

        $this->buyer = User::forceCreate([
            'first_name' => 'Regular',
            'last_name'  => 'Buyer',
            'email'      => 'buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Password123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);
    }

    public function test_the_hub_reads_its_own_details_and_its_courier_contact(): void
    {
        $company = LogisticsCompany::create([
            'name' => 'Bilis Hatid ' . uniqid(), 'code' => 'BH' . rand(100, 999), 'slug' => 'bilis-' . uniqid(), 'status' => LogisticsCompany::STATUS_APPROVED,
            'submitted_at' => now(), 'is_default' => false, 'contact_email' => 'ops@bilis.example', 'contact_phone' => '09171234567',
        ]);
        $this->hub->update(['logistics_company_id' => $company->id]);

        Sanctum::actingAs($this->hubOwner);
        $this->getJson('/api/v1/hub/profile')->assertOk()
            ->assertJsonPath('data.hub_name', 'Valenzuela Central Logistics Hub')
            ->assertJsonPath('data.coverage_barangays_count', 3)
            ->assertJsonPath('data.has_permit', true)
            ->assertJsonPath('data.courier.name', $company->name)
            ->assertJsonPath('data.courier.contact_email', 'ops@bilis.example')
            ->assertJsonMissingPath('data.dti_permit_path')
            ->assertJsonMissingPath('data.gcash_number');

        // Not for buyers or hubs that are not approved.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->buyer);
        $this->getJson('/api/v1/hub/profile')->assertStatus(403);
        $this->hub->update(['status' => SortingCenter::STATUS_SUSPENDED]);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->hubOwner->fresh());
        $this->getJson('/api/v1/hub/profile')->assertStatus(403);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/v1/hub/dashboard/metrics');
        $response->assertStatus(401);
    }

    public function test_user_without_hub_gets_forbidden(): void
    {
        Sanctum::actingAs($this->buyer);
        $response = $this->getJson('/api/v1/hub/dashboard/metrics');
        $response->assertStatus(403);
    }

    public function test_pending_hub_gets_forbidden(): void
    {
        $this->hub->update(['status' => SortingCenter::STATUS_PENDING]);
        Sanctum::actingAs($this->hubOwner);

        $response = $this->getJson('/api/v1/hub/dashboard/metrics');
        $response->assertStatus(403);
    }

    public function test_rejected_hub_gets_forbidden(): void
    {
        $this->hub->update(['status' => SortingCenter::STATUS_REJECTED]);
        Sanctum::actingAs($this->hubOwner);

        $response = $this->getJson('/api/v1/hub/dashboard/metrics');
        $response->assertStatus(403);
    }

    public function test_suspended_hub_gets_forbidden(): void
    {
        $this->hub->update(['status' => SortingCenter::STATUS_SUSPENDED]);
        Sanctum::actingAs($this->hubOwner);

        $response = $this->getJson('/api/v1/hub/dashboard/metrics');
        $response->assertStatus(403);
    }

    public function test_suspended_hub_is_gated_on_login(): void
    {
        $password = 'HubPassword123!';
        $user = User::forceCreate([
            'first_name' => 'Suspended',
            'last_name'  => 'HubOwner',
            'email'      => 'suspended.hub.' . uniqid() . '@example.com',
            'password'   => Hash::make($password),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        SortingCenter::create([
            'user_id'            => $user->id,
            'hub_name'           => 'Suspended Hub',
            'address_province'   => 'Metro Manila',
            'address_city'       => 'Manila',
            'address_barangay'   => 'Sampaloc',
            'address_street'     => '456 Street',
            'coverage_barangays' => ['Sampaloc'],
            'status'             => SortingCenter::STATUS_SUSPENDED,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $user->email,
            'password' => $password,
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'message' => 'Your sorting center hub account has been suspended. Please contact platform administration.',
        ]);
    }

    public function test_approved_hub_receives_live_metrics_with_manila_time_boundaries(): void
    {
        // Freeze time at 14:00 Philippine Time (UTC+8) on 2026-10-05
        $manilaNow = Carbon::parse('2026-10-05 14:00:00', 'Asia/Manila');
        Carbon::setTestNow($manilaNow);

        // 1. Scanned yesterday in Manila: 2026-10-04 23:59:59 Manila (= 15:59:59 UTC)
        Parcel::create([
            'tracking_number'   => 'TRK-YESTERDAY-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => Carbon::parse('2026-10-04 23:59:59', 'Asia/Manila')->utc(),
        ]);

        // 2. Scanned exactly at midnight today in Manila: 2026-10-05 00:00:00 Manila (= 2026-10-04 16:00:00 UTC)
        Parcel::create([
            'tracking_number'   => 'TRK-MIDNIGHT-START-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => Carbon::parse('2026-10-05 00:00:00', 'Asia/Manila')->utc(),
        ]);

        // 3. Scanned earlier today in Manila: 2026-10-05 10:30:00 Manila
        Parcel::create([
            'tracking_number'   => 'TRK-TODAY-1-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => Carbon::parse('2026-10-05 10:30:00', 'Asia/Manila')->utc(),
        ]);

        // 4. Scanned right at end of today in Manila: 2026-10-05 23:59:59 Manila
        Parcel::create([
            'tracking_number'   => 'TRK-MIDNIGHT-END-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'status'            => Parcel::STATUS_SORTED, // Sorted, but still scanned_in today
            'scanned_in_at'     => Carbon::parse('2026-10-05 23:59:59', 'Asia/Manila')->utc(),
        ]);

        // 5. Scanned tomorrow in Manila: 2026-10-06 00:00:00 Manila
        Parcel::create([
            'tracking_number'   => 'TRK-TOMORROW-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => Carbon::parse('2026-10-06 00:00:00', 'Asia/Manila')->utc(),
        ]);

        Sanctum::actingAs($this->hubOwner);

        $response = $this->getJson('/api/v1/hub/dashboard/metrics');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'data' => [
                'inbound_today',
                'in_sorting',
                'active_riders',
                'hub' => [
                    'id',
                    'hub_name',
                    'status',
                    'address_province',
                    'address_city',
                    'address_barangay',
                    'address_street',
                    'coverage_barangays_count',
                ],
            ],
        ]);

        // Inbound today: parcels #2, #3, and #4 => 3 parcels
        $this->assertEquals(3, $response->json('data.inbound_today'));

        // In sorting: parcels #1, #2, #3, #5 (all with AT_SORTING_CENTER) => 4 parcels
        $this->assertEquals(4, $response->json('data.in_sorting'));

        // Active riders returns 0 (Feature 2.1 dependency)
        $this->assertEquals(0, $response->json('data.active_riders'));

        $this->assertEquals($this->hub->id, $response->json('data.hub.id'));
        $this->assertEquals('Valenzuela Central Logistics Hub', $response->json('data.hub.hub_name'));
        $this->assertEquals(3, $response->json('data.hub.coverage_barangays_count'));

        Carbon::setTestNow(); // Reset mocked time
    }

    public function test_hub_isolation_does_not_leak_other_hub_metrics(): void
    {
        $manilaNow = Carbon::parse('2026-10-05 12:00:00', 'Asia/Manila');
        Carbon::setTestNow($manilaNow);

        // Create Hub B
        $hubBOwner = User::forceCreate([
            'first_name' => 'HubB',
            'last_name'  => 'Owner',
            'email'      => 'hub.b.' . uniqid() . '@example.com',
            'password'   => Hash::make('Pass123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $hubB = SortingCenter::create([
            'user_id'            => $hubBOwner->id,
            'hub_name'           => 'Quezon City North Hub',
            'address_province'   => 'Metro Manila',
            'address_city'       => 'Quezon City',
            'address_barangay'   => 'Novaliches',
            'address_street'     => '99 Quirino Highway',
            'coverage_barangays' => ['Novaliches', 'Gulod'],
            'status'             => SortingCenter::STATUS_APPROVED,
        ]);

        // Parcels for Hub A
        Parcel::create([
            'tracking_number'   => 'TRK-HUBA-1-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => $manilaNow->copy()->utc(),
        ]);

        // Parcels for Hub B
        Parcel::create([
            'tracking_number'   => 'TRK-HUBB-1-' . uniqid(),
            'sorting_center_id' => $hubB->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => $manilaNow->copy()->utc(),
        ]);
        Parcel::create([
            'tracking_number'   => 'TRK-HUBB-2-' . uniqid(),
            'sorting_center_id' => $hubB->id,
            'status'            => Parcel::STATUS_AT_SORTING_CENTER,
            'scanned_in_at'     => $manilaNow->copy()->utc(),
        ]);

        // Authenticate as Hub A
        Sanctum::actingAs($this->hubOwner);
        $responseA = $this->getJson('/api/v1/hub/dashboard/metrics');
        $responseA->assertStatus(200);
        $this->assertEquals(1, $responseA->json('data.inbound_today'));
        $this->assertEquals(1, $responseA->json('data.in_sorting'));

        // Authenticate as Hub B
        Sanctum::actingAs($hubBOwner);
        $responseB = $this->getJson('/api/v1/hub/dashboard/metrics');
        $responseB->assertStatus(200);
        $this->assertEquals(2, $responseB->json('data.inbound_today'));
        $this->assertEquals(2, $responseB->json('data.in_sorting'));

        Carbon::setTestNow();
    }

    public function test_active_riders_metric_calculates_assigned_active_riders_accurately(): void
    {
        // Hub B
        $hubBOwner = User::forceCreate([
            'first_name' => 'HubB',
            'last_name'  => 'Owner',
            'email'      => 'hub.b.' . uniqid() . '@example.com',
            'password'   => Hash::make('Pass123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);
        $hubB = \App\Models\SortingCenter::create([
            'user_id'          => $hubBOwner->id,
            'hub_name'         => 'Hub B',
            'address_province' => 'Rizal',
            'address_city'     => 'Antipolo',
            'status'           => \App\Models\SortingCenter::STATUS_APPROVED,
        ]);

        // Helper to create rider user & profile
        $createRider = function (string $status) {
            $user = User::forceCreate([
                'first_name' => 'Rider',
                'last_name'  => uniqid(),
                'email'      => 'rider.' . uniqid() . '@example.com',
                'password'   => Hash::make('Pass123!'),
                'role'       => 'rider',
                'status'     => 'active',
            ]);
            return \App\Models\Rider::create([
                'user_id'      => $user->id,
                'vehicle_type' => 'motorcycle',
                'status'       => $status,
            ]);
        };

        // Rider 1: ACTIVE, active assignment under Hub A -> COUNTED
        $rider1 = $createRider(\App\Models\Rider::STATUS_ACTIVE);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider1->id,
            'sorting_center_id' => $this->hub->id,
            'area_label'        => 'North Zone',
            'is_active'         => true,
        ]);

        // Rider 2: ACTIVE, 2 active assignments under Hub A -> COUNTED ONCE
        $rider2 = $createRider(\App\Models\Rider::STATUS_ACTIVE);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider2->id,
            'sorting_center_id' => $this->hub->id,
            'area_label'        => 'South Zone 1',
            'is_active'         => true,
        ]);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider2->id,
            'sorting_center_id' => $this->hub->id,
            'area_label'        => 'South Zone 2',
            'is_active'         => true,
        ]);

        // Rider 3: ACTIVE, but assignment is inactive -> NOT COUNTED
        $rider3 = $createRider(\App\Models\Rider::STATUS_ACTIVE);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider3->id,
            'sorting_center_id' => $this->hub->id,
            'area_label'        => 'East Zone',
            'is_active'         => false,
        ]);

        // Rider 4: PENDING, active assignment -> NOT COUNTED
        $rider4 = $createRider(\App\Models\Rider::STATUS_PENDING);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider4->id,
            'sorting_center_id' => $this->hub->id,
            'area_label'        => 'West Zone',
            'is_active'         => true,
        ]);

        // Rider 5: DISAPPROVED, active assignment -> NOT COUNTED
        $rider5 = $createRider(\App\Models\Rider::STATUS_DISAPPROVED);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider5->id,
            'sorting_center_id' => $this->hub->id,
            'area_label'        => 'Central Zone',
            'is_active'         => true,
        ]);

        // Rider 6: ACTIVE, active assignment under Hub B -> COUNTED FOR HUB B, NOT HUB A
        $rider6 = $createRider(\App\Models\Rider::STATUS_ACTIVE);
        \App\Models\RiderAreaAssignment::create([
            'rider_id'          => $rider6->id,
            'sorting_center_id' => $hubB->id,
            'area_label'        => 'Hub B Zone',
            'is_active'         => true,
        ]);

        // Test Hub A metrics
        Sanctum::actingAs($this->hubOwner);
        $resA = $this->getJson('/api/v1/hub/dashboard/metrics');
        $resA->assertStatus(200);
        $this->assertEquals(2, $resA->json('data.active_riders')); // rider1 and rider2 only

        // Test Hub B metrics
        Sanctum::actingAs($hubBOwner);
        $resB = $this->getJson('/api/v1/hub/dashboard/metrics');
        $resB->assertStatus(200);
        $this->assertEquals(1, $resB->json('data.active_riders')); // rider6 only
    }
}
