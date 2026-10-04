<?php

namespace Tests\Feature;

use App\Mail\RiderApplicationMail;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class HubRiderVettingTest extends TestCase
{
    use DatabaseTransactions;

    protected User $hubUserA;
    protected SortingCenter $hubA;
    protected User $hubUserB;
    protected SortingCenter $hubB;
    protected User $pendingHubUser;
    protected SortingCenter $pendingHub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        // Hub A (Approved)
        $this->hubUserA = User::create([
            'first_name'    => 'Manager',
            'last_name'     => 'Hub A',
            'email'         => 'manager.a.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-01-01',
            'sex'           => 'male',
            'role'          => 'admin',
            'status'        => 'active',
        ]);
        $this->hubA = SortingCenter::create([
            'user_id'            => $this->hubUserA->id,
            'hub_name'           => 'Hub A ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'dti_permit_path'    => 'permits/a.pdf',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043405001', '043405002', '043405003'],
        ]);

        // Hub B (Approved)
        $this->hubUserB = User::create([
            'first_name'    => 'Manager',
            'last_name'     => 'Hub B',
            'email'         => 'manager.b.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-02-02',
            'sex'           => 'female',
            'role'          => 'admin',
            'status'        => 'active',
        ]);
        $this->hubB = SortingCenter::create([
            'user_id'            => $this->hubUserB->id,
            'hub_name'           => 'Hub B ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'San Pedro',
            'address_barangay'   => 'San Antonio',
            'address_street'     => '456 Hub St',
            'dti_permit_path'    => 'permits/b.pdf',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043406001'],
        ]);

        // Pending Hub
        $this->pendingHubUser = User::create([
            'first_name'    => 'Manager',
            'last_name'     => 'Pending Hub',
            'email'         => 'manager.pending.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-03-03',
            'sex'           => 'male',
            'role'          => 'admin',
            'status'        => 'active',
        ]);
        $this->pendingHub = SortingCenter::create([
            'user_id'            => $this->pendingHubUser->id,
            'hub_name'           => 'Pending Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Biñan',
            'address_barangay'   => 'Canlalay',
            'address_street'     => '789 Hub St',
            'dti_permit_path'    => 'permits/pending.pdf',
            'status'             => SortingCenter::STATUS_PENDING,
            'coverage_barangays' => ['043407001'],
        ]);
    }

    private function createRiderForHub(SortingCenter $hub, string $status = Rider::STATUS_PENDING): array
    {
        $password = 'Secret123!';
        $user = User::create([
            'first_name'    => 'Courier',
            'last_name'     => 'Rider ' . uniqid(),
            'email'         => 'courier.' . uniqid() . '@example.com',
            'phone'         => '+63918' . rand(1000000, 9999999),
            'password'      => Hash::make($password),
            'date_of_birth' => '1995-05-20',
            'sex'           => 'male',
            'role'          => 'rider',
            'status'        => 'active',
        ]);

        // Place mock files in ids disk
        $orCrPath = 'rider_or_cr/' . uniqid() . '.jpg';
        $licensePath = 'rider_licenses/' . uniqid() . '.pdf';
        Storage::disk('ids')->put($orCrPath, 'OR/CR content');
        Storage::disk('ids')->put($licensePath, 'Driver license content');

        $rider = Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $hub->id,
            'vehicle_type'         => 'Motorcycle',
            'plate_number'         => 'ND ' . rand(1000, 9999),
            'or_cr_path'           => $orCrPath,
            'drivers_license_path' => $licensePath,
            'status'               => $status,
            'submitted_at'         => now(),
        ]);

        return [$user, $rider, $password];
    }

    public function test_approving_a_pending_rider_sets_active_and_records_reviewer_and_rider_can_log_in(): void
    {
        Mail::fake();

        [$riderUser, $rider, $password] = $this->createRiderForHub($this->hubA, Rider::STATUS_PENDING);

        $response = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$rider->id}/approve", [
                'area_label'         => 'Area A - Calamba Central',
                'coverage_barangays' => ['043405001', '043405002'],
            ]);

        $response->assertStatus(200);
        $response->assertJson([
            'message' => 'Courier application approved successfully.',
            'data'    => [
                'id'            => $rider->id,
                'status'        => 'ACTIVE',
                'reviewed_by'   => $this->hubUserA->id,
                'reviewer_name' => "{$this->hubUserA->first_name} {$this->hubUserA->last_name}",
            ],
        ]);

        // Assert DB state
        $rider->refresh();
        $this->assertEquals(Rider::STATUS_ACTIVE, $rider->status);
        $this->assertEquals($this->hubUserA->id, $rider->reviewed_by);
        $this->assertNotNull($rider->reviewed_at);

        // Assert initial area assignment created
        $this->assertDatabaseHas('rider_area_assignments', [
            'rider_id'          => $rider->id,
            'sorting_center_id' => $this->hubA->id,
            'area_label'        => 'Area A - Calamba Central',
            'is_active'         => true,
        ]);

        // Assert rider can now log in
        $loginRes = $this->postJson('/api/v1/auth/login', [
            'email'    => $riderUser->email,
            'password' => $password,
        ]);
        $loginRes->assertStatus(200);
        $this->assertEquals('ACTIVE', $loginRes->json('data.rider.status'));

        // Assert mail was queued and rendered correctly
        Mail::assertQueued(RiderApplicationMail::class, function ($mail) use ($riderUser) {
            $this->assertEquals($riderUser->email, $mail->to[0]['address']);
            $this->assertEquals('approved', $mail->decision);
            $this->assertStringContainsString('approved', strtolower($mail->envelope()->subject));
            $rendered = $mail->render();
            $this->assertStringContainsString($riderUser->first_name, $rendered);
            $this->assertStringContainsString($this->hubA->hub_name, $rendered);
            $this->assertStringContainsString('/login', $rendered);
            return true;
        });
    }

    public function test_disapproving_requires_reason_and_rider_still_cannot_log_in(): void
    {
        Mail::fake();

        [$riderUser, $rider, $password] = $this->createRiderForHub($this->hubA, Rider::STATUS_PENDING);

        // Fails without reason
        $failRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$rider->id}/disapprove", []);
        $failRes->assertStatus(422);
        $failRes->assertJsonValidationErrors(['reason']);

        // Succeeds with reason
        $reason = 'LTO OR/CR photo was blurry and illegible.';
        $successRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$rider->id}/disapprove", [
                'reason' => $reason,
            ]);

        $successRes->assertStatus(200);
        $successRes->assertJson([
            'message' => 'Courier application disapproved successfully.',
            'data'    => [
                'id'               => $rider->id,
                'status'           => 'DISAPPROVED',
                'rejection_reason' => $reason,
            ],
        ]);

        $rider->refresh();
        $this->assertEquals(Rider::STATUS_DISAPPROVED, $rider->status);
        $this->assertEquals($reason, $rider->rejection_reason);

        // Assert rider gets 403 on login
        $loginRes = $this->postJson('/api/v1/auth/login', [
            'email'    => $riderUser->email,
            'password' => $password,
        ]);
        $loginRes->assertStatus(403);
        $this->assertStringContainsString('not approved', $loginRes->json('message'));

        // Assert disapproval email was queued
        Mail::assertQueued(RiderApplicationMail::class, function ($mail) use ($riderUser, $reason) {
            $this->assertEquals('disapproved', $mail->decision);
            $rendered = $mail->render();
            $this->assertStringContainsString($riderUser->first_name, $rendered);
            $this->assertStringContainsString($reason, $rendered);
            return true;
        });
    }

    public function test_non_pending_rider_returns_conflict_response_and_sends_no_email(): void
    {
        Mail::fake();

        [, $rider] = $this->createRiderForHub($this->hubA, Rider::STATUS_ACTIVE);

        $response = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$rider->id}/approve");

        $response->assertStatus(422);
        $response->assertJson([
            'message' => 'Only pending rider applications can be approved.',
        ]);

        Mail::assertNothingQueued();
    }

    public function test_hub_a_cannot_access_or_manage_hub_b_rider_returning_404(): void
    {
        [, $riderB] = $this->createRiderForHub($this->hubB, Rider::STATUS_PENDING);

        // Show
        $this->actingAs($this->hubUserA)
            ->getJson("/api/v1/hub/riders/{$riderB->id}")
            ->assertStatus(404);

        // Approve
        $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$riderB->id}/approve")
            ->assertStatus(404);

        // Disapprove
        $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$riderB->id}/disapprove", ['reason' => 'Some reason'])
            ->assertStatus(404);

        // Document routes
        $this->actingAs($this->hubUserA)
            ->get("/api/v1/hub/riders/{$riderB->id}/or-cr")
            ->assertStatus(404);

        $this->actingAs($this->hubUserA)
            ->get("/api/v1/hub/riders/{$riderB->id}/license")
            ->assertStatus(404);

        // Area assignment
        $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$riderB->id}/areas", [
                'area_label'         => 'Area X',
                'coverage_barangays' => ['043405001'],
            ])
            ->assertStatus(404);
    }

    public function test_unapproved_hubs_get_403_and_unauthenticated_gets_401(): void
    {
        [, $riderA] = $this->createRiderForHub($this->hubA, Rider::STATUS_PENDING);

        // Unauthenticated -> 401
        $this->getJson('/api/v1/hub/riders')->assertStatus(401);
        $this->getJson("/api/v1/hub/riders/{$riderA->id}/or-cr")->assertStatus(401);

        // Pending Hub -> 403
        $this->actingAs($this->pendingHubUser)
            ->getJson('/api/v1/hub/riders')
            ->assertStatus(403);

        $this->actingAs($this->pendingHubUser)
            ->getJson("/api/v1/hub/riders/{$riderA->id}/or-cr")
            ->assertStatus(403);
    }

    public function test_area_with_barangay_outside_hub_coverage_returns_422_and_duplicates_rejected(): void
    {
        // Hub A coverage: 043405001, 043405002, 043405003
        [, $activeRider] = $this->createRiderForHub($this->hubA, Rider::STATUS_ACTIVE);
        [, $pendingRider] = $this->createRiderForHub($this->hubA, Rider::STATUS_PENDING);

        // 1. Pending rider cannot be assigned areas
        $pendingRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$pendingRider->id}/areas", [
                'area_label'         => 'Area 1',
                'coverage_barangays' => ['043405001'],
            ]);
        $pendingRes->assertStatus(422);
        $pendingRes->assertJson([
            'message' => 'Areas can only be assigned to active approved couriers.',
        ]);

        // 2. Outside coverage returns 422
        $outsideRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$activeRider->id}/areas", [
                'area_label'         => 'Area 1',
                'coverage_barangays' => ['999999999'], // not in hub A
            ]);
        $outsideRes->assertStatus(422);
        $outsideRes->assertJsonValidationErrors(['coverage_barangays']);

        // 3. Duplicates within assignment rejected
        $dupRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$activeRider->id}/areas", [
                'area_label'         => 'Area 1',
                'coverage_barangays' => ['043405001', '043405001'],
            ]);
        $dupRes->assertStatus(422);
        $dupRes->assertJsonValidationErrors(['coverage_barangays']);

        // 4. Valid assignment succeeds
        $validRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$activeRider->id}/areas", [
                'area_label'         => 'Area 1',
                'coverage_barangays' => ['043405001', '043405002'],
            ]);
        $validRes->assertStatus(201);
        $areaId = $validRes->json('data.id');

        // 5. Duplicate area label for the same rider rejected
        $dupLabelRes = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$activeRider->id}/areas", [
                'area_label'         => 'Area 1',
                'coverage_barangays' => ['043405003'],
            ]);
        $dupLabelRes->assertStatus(422);
        $dupLabelRes->assertJsonValidationErrors(['area_label']);

        // 6. Deactivate area
        $delRes = $this->actingAs($this->hubUserA)
            ->deleteJson("/api/v1/hub/riders/{$activeRider->id}/areas/{$areaId}");
        $delRes->assertStatus(200);
        $this->assertFalse($delRes->json('data.is_active'));
    }

    public function test_active_riders_metric_rises_after_rider_is_approved_and_assigned_area(): void
    {
        // Check baseline metric
        $baselineRes = $this->actingAs($this->hubUserA)
            ->getJson('/api/v1/hub/dashboard/metrics');
        $baselineRes->assertStatus(200);
        $initialActiveRiders = $baselineRes->json('data.active_riders');

        // Create pending rider
        [, $rider] = $this->createRiderForHub($this->hubA, Rider::STATUS_PENDING);

        // Approve rider WITH an initial area assignment
        $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$rider->id}/approve", [
                'area_label'         => 'Area Poblacion',
                'coverage_barangays' => ['043405001'],
            ])
            ->assertStatus(200);

        // Fetch metrics again
        $updatedRes = $this->actingAs($this->hubUserA)
            ->getJson('/api/v1/hub/dashboard/metrics');
        $updatedRes->assertStatus(200);
        $this->assertEquals($initialActiveRiders + 1, $updatedRes->json('data.active_riders'));
    }

    public function test_mail_failure_does_not_undo_status_change(): void
    {
        // Mock Mail facade to throw an exception
        Mail::shouldReceive('to->queue')
            ->andThrow(new \Exception('SMTP connection timeout'));

        [, $rider] = $this->createRiderForHub($this->hubA, Rider::STATUS_PENDING);

        $response = $this->actingAs($this->hubUserA)
            ->postJson("/api/v1/hub/riders/{$rider->id}/approve");

        $response->assertStatus(200);

        $rider->refresh();
        $this->assertEquals(Rider::STATUS_ACTIVE, $rider->status);
    }
}
