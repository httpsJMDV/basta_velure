<?php

namespace Tests\Feature;

use App\Mail\SortingCenterApplicationMail;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminSortingCenterApprovalTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private User $nonAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        $this->admin = User::forceCreate([
            'first_name' => 'Super',
            'last_name'  => 'Admin',
            'email'      => 'admin.' . uniqid() . '@example.com',
            'password'   => Hash::make('AdminPass123!'),
            'role'       => 'admin',
            'status'     => 'active',
        ]);

        $this->nonAdmin = User::forceCreate([
            'first_name' => 'Regular',
            'last_name'  => 'Buyer',
            'email'      => 'buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('BuyerPass123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);
    }

    private function createHub(string $status = SortingCenter::STATUS_PENDING, array $hubOverrides = []): array
    {
        $password = 'Secret123!';
        $email = 'hub.applicant.' . uniqid() . '@example.com';

        $user = User::forceCreate([
            'first_name'                => 'Ramon',
            'last_name'                 => 'Magsaysay',
            'email'                     => $email,
            'phone'                     => '+63917' . rand(1000000, 9999999),
            'password'                  => Hash::make($password),
            'role'                      => 'buyer',
            'status'                    => 'active',
            'government_id_type'        => 'national_id',
            'government_id_image_path'  => 'hub_owner_ids/id_front.jpg',
        ]);

        $hub = SortingCenter::create(array_merge([
            'user_id'            => $user->id,
            'hub_name'           => 'Laguna Central Logistics Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Santa Cruz',
            'address_barangay'   => 'Poblacion I',
            'address_street'     => '123 Logistics Highway',
            'dti_permit_path'    => 'dti_permits/dti_sample.pdf',
            'coverage_barangays' => ['043404001', '043404002'],
            'status'             => $status,
        ], $hubOverrides));

        return [$user, $hub, $password];
    }

    /**
     * 1. Admin approves a pending hub: status becomes APPROVED, the owner can now log in,
     *    and the approval email goes to the right recipient (Mail::fake).
     */
    public function test_admin_approves_pending_hub_activates_account_allows_login_and_sends_email(): void
    {
        Mail::fake();

        [$user, $hub, $password] = $this->createHub(SortingCenter::STATUS_PENDING);

        // Verify login is blocked while PENDING
        $preLogin = $this->postJson('/api/v1/auth/login', [
            'email'    => $user->email,
            'password' => $password,
        ]);
        $preLogin->assertStatus(403)
            ->assertJsonPath('message', 'Your sorting center application is currently pending administrative approval. You will receive an email notification once reviewed.');

        // Admin approves
        Sanctum::actingAs($this->admin);
        $res = $this->postJson("/api/v1/admin/sorting-center-applications/{$hub->id}/approve");
        $res->assertStatus(200)
            ->assertJson(['message' => 'Sorting center application approved successfully.']);

        // Check database status & reviewer records
        $hub->refresh();
        $this->assertEquals(SortingCenter::STATUS_APPROVED, $hub->status);
        $this->assertEquals($this->admin->id, $hub->reviewed_by);
        $this->assertNotNull($hub->reviewed_at);

        // Owner can now log in successfully
        $postLogin = $this->postJson('/api/v1/auth/login', [
            'email'    => $user->email,
            'password' => $password,
        ]);
        $postLogin->assertStatus(200)
            ->assertJsonStructure(['token', 'data']);

        // Approval email was dispatched to applicant
        Mail::assertQueued(SortingCenterApplicationMail::class, function ($mail) use ($user, $hub) {
            return $mail->hasTo($user->email)
                && $mail->decision === 'approved'
                && $mail->sortingCenter->id === $hub->id;
        });
    }

    /**
     * 2. Admin rejects with a reason: status becomes REJECTED, the reason is stored
     *    and appears in the email, and login stays blocked.
     */
    public function test_admin_rejects_with_reason_stores_reason_blocks_login_and_sends_rejection_email(): void
    {
        Mail::fake();

        [$user, $hub, $password] = $this->createHub(SortingCenter::STATUS_PENDING);

        Sanctum::actingAs($this->admin);
        $reasonText = 'The submitted DTI Business Registration certificate has expired.';
        $res = $this->postJson("/api/v1/admin/sorting-center-applications/{$hub->id}/reject", [
            'reason' => $reasonText,
        ]);
        $res->assertStatus(200)
            ->assertJson(['message' => 'Sorting center application rejected successfully.']);

        $hub->refresh();
        $this->assertEquals(SortingCenter::STATUS_REJECTED, $hub->status);
        $this->assertEquals($reasonText, $hub->rejection_reason);
        $this->assertEquals($this->admin->id, $hub->reviewed_by);

        // Login remains blocked with rejected message (without leaking internal details)
        $loginRes = $this->postJson('/api/v1/auth/login', [
            'email'    => $user->email,
            'password' => $password,
        ]);
        $loginRes->assertStatus(403)
            ->assertJsonPath('message', 'Your sorting center application was not approved. Please check your email for details or contact support.');

        // Rejection email dispatched with reason
        Mail::assertQueued(SortingCenterApplicationMail::class, function ($mail) use ($user, $reasonText) {
            return $mail->hasTo($user->email)
                && $mail->decision === 'rejected'
                && $mail->reason === $reasonText;
        });
    }

    /**
     * 3. Reject without a reason returns 422 with a field-level error.
     */
    public function test_reject_without_reason_returns_422_with_field_error(): void
    {
        Mail::fake();

        [, $hub] = $this->createHub(SortingCenter::STATUS_PENDING);

        Sanctum::actingAs($this->admin);

        // Empty reason
        $resEmpty = $this->postJson("/api/v1/admin/sorting-center-applications/{$hub->id}/reject", [
            'reason' => '',
        ]);
        $resEmpty->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);

        // Missing reason parameter
        $resMissing = $this->postJson("/api/v1/admin/sorting-center-applications/{$hub->id}/reject", []);
        $resMissing->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);

        Mail::assertNothingQueued();
    }

    /**
     * 4. Approving or rejecting an already-processed application returns the conflict response and sends no email.
     */
    public function test_approving_or_rejecting_non_pending_application_returns_conflict_and_no_email(): void
    {
        Mail::fake();

        // 4a. Already approved
        [, $approvedHub] = $this->createHub(SortingCenter::STATUS_APPROVED);

        Sanctum::actingAs($this->admin);
        $resApproveAgain = $this->postJson("/api/v1/admin/sorting-center-applications/{$approvedHub->id}/approve");
        $resApproveAgain->assertStatus(422);

        $resRejectApproved = $this->postJson("/api/v1/admin/sorting-center-applications/{$approvedHub->id}/reject", [
            'reason' => 'Too late to reject',
        ]);
        $resRejectApproved->assertStatus(422);

        // 4b. Already rejected
        [, $rejectedHub] = $this->createHub(SortingCenter::STATUS_REJECTED, [
            'rejection_reason' => 'Initial rejection reason',
        ]);
        $resApproveRejected = $this->postJson("/api/v1/admin/sorting-center-applications/{$rejectedHub->id}/approve");
        $resApproveRejected->assertStatus(422);

        Mail::assertNothingQueued();
    }

    /**
     * 5. Non-admin gets 403 and unauthenticated gets 401 on every endpoint.
     */
    public function test_authorization_checks_non_admin_403_and_unauthenticated_401(): void
    {
        [, $hub] = $this->createHub(SortingCenter::STATUS_PENDING);

        $endpoints = [
            ['GET',  '/api/v1/admin/sorting-center-applications'],
            ['GET',  "/api/v1/admin/sorting-center-applications/{$hub->id}"],
            ['POST', "/api/v1/admin/sorting-center-applications/{$hub->id}/approve"],
            ['POST', "/api/v1/admin/sorting-center-applications/{$hub->id}/reject"],
            ['GET',  "/api/v1/admin/sorting-center-applications/{$hub->id}/dti-permit"],
            ['GET',  "/api/v1/admin/sorting-center-applications/{$hub->id}/id-image"],
        ];

        // 5a. Unauthenticated -> 401
        foreach ($endpoints as [$method, $uri]) {
            $res = $this->json($method, $uri);
            $res->assertStatus(401);
        }

        // 5b. Authenticated as non-admin -> 403
        Sanctum::actingAs($this->nonAdmin);
        foreach ($endpoints as [$method, $uri]) {
            $res = $this->json($method, $uri);
            $res->assertStatus(403);
        }
    }

    /**
     * 6. List filters by status and search correctly. Detail returns the permit access method and never a public URL.
     */
    public function test_list_filters_by_status_and_search_and_detail_provides_secure_permit_route(): void
    {
        // Hub A: Pending in Laguna
        $hubA = SortingCenter::create([
            'user_id'            => $this->nonAdmin->id,
            'hub_name'           => 'Alpha Calamba Express Hub',
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => 'Km 54 National Road',
            'dti_permit_path'    => 'dti_permits/alpha_permit.pdf',
            'coverage_barangays' => ['043405001'],
            'status'             => SortingCenter::STATUS_PENDING,
        ]);

        // Hub B: Approved in Cavite
        $hubB = SortingCenter::create([
            'user_id'            => $this->nonAdmin->id,
            'hub_name'           => 'Beta Dasmarinas Sorting Center',
            'address_province'   => 'Cavite',
            'address_city'       => 'Dasmarinas',
            'address_barangay'   => 'Salitran',
            'address_street'     => 'Salitran Road',
            'dti_permit_path'    => 'dti_permits/beta_permit.pdf',
            'coverage_barangays' => ['042106001'],
            'status'             => SortingCenter::STATUS_APPROVED,
        ]);

        Sanctum::actingAs($this->admin);

        // 6a. Default listing returns PENDING only
        $resDefault = $this->getJson('/api/v1/admin/sorting-center-applications');
        $resDefault->assertStatus(200);
        $dataDefault = $resDefault->json('data');
        $this->assertTrue(collect($dataDefault)->contains('id', $hubA->id));
        $this->assertFalse(collect($dataDefault)->contains('id', $hubB->id));

        // 6b. Filter status = APPROVED
        $resApproved = $this->getJson('/api/v1/admin/sorting-center-applications?status=APPROVED');
        $resApproved->assertStatus(200);
        $dataApproved = $resApproved->json('data');
        $this->assertTrue(collect($dataApproved)->contains('id', $hubB->id));
        $this->assertFalse(collect($dataApproved)->contains('id', $hubA->id));

        // 6c. Search by hub name
        $resSearch = $this->getJson('/api/v1/admin/sorting-center-applications?status=all&search=Calamba');
        $resSearch->assertStatus(200);
        $dataSearch = $resSearch->json('data');
        $this->assertTrue(collect($dataSearch)->contains('id', $hubA->id));
        $this->assertFalse(collect($dataSearch)->contains('id', $hubB->id));

        // 6d. Detail returns authorized route for DTI permit and never a public storage URL
        $resDetail = $this->getJson("/api/v1/admin/sorting-center-applications/{$hubA->id}");
        $resDetail->assertStatus(200)
            ->assertJsonPath('data.hub_name', 'Alpha Calamba Express Hub')
            ->assertJsonPath('data.coverage_count', 1);

        $permitUrl = $resDetail->json('data.dti_permit_url');
        $this->assertNotNull($permitUrl);
        $this->assertStringContainsString("/api/v1/admin/sorting-center-applications/{$hubA->id}/dti-permit", $permitUrl);
        $this->assertStringNotContainsString('storage/dti_permits', $permitUrl);
        $this->assertStringNotContainsString('storage/app', $permitUrl);
    }

    /**
     * 7. A mail failure does not undo the status change.
     */
    public function test_mail_failure_does_not_rollback_status_change(): void
    {
        // Mock Mail facade to throw an unexpected exception
        Mail::shouldReceive('to->queue')
            ->andThrow(new \RuntimeException('SMTP Connection timed out.'));

        [$user, $hub] = $this->createHub(SortingCenter::STATUS_PENDING);

        Sanctum::actingAs($this->admin);
        $res = $this->postJson("/api/v1/admin/sorting-center-applications/{$hub->id}/approve");

        // The endpoint must still succeed with 200
        $res->assertStatus(200)
            ->assertJson(['message' => 'Sorting center application approved successfully.']);

        // The hub status must remain APPROVED in the database
        $hub->refresh();
        $this->assertEquals(SortingCenter::STATUS_APPROVED, $hub->status);
        $this->assertEquals($this->admin->id, $hub->reviewed_by);
    }
}
