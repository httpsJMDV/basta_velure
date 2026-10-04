<?php

namespace Tests\Feature;

use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SortingCenterRegistrationTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        // Define a test route to verify that unapproved hub accounts cannot reach hub routes
        Route::middleware(['auth:sanctum', 'approved_sorting_center'])->get('/test-hub-protected-route', function () {
            return response()->json(['message' => 'Welcome to Hub Dashboard']);
        });
    }

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'first_name'                 => 'Ramon',
            'middle_name'                => 'Santos',
            'last_name'                  => 'Magsaysay',
            'sex'                        => 'male',
            'email'                      => 'ramon.hub.' . uniqid() . '@example.com',
            'phone'                      => '+63917' . rand(1000000, 9999999),
            'date_of_birth'              => '1990-01-01',
            'password'                   => 'Password123!',
            'password_confirmation'      => 'Password123!',
            'government_id_type'         => 'national_id',
            'government_id_image'        => UploadedFile::fake()->create('gov_id.jpg', 500, 'image/jpeg'),
            'hub_name'                   => 'Central Laguna Sorting Hub',
            'address_province'           => 'Laguna',
            'address_city'               => 'Santa Cruz',
            'address_barangay'           => 'Poblacion I',
            'address_street'             => '456 Hub Logistics Blvd',
            'dti_permit'                 => UploadedFile::fake()->create('dti_permit.pdf', 1024, 'application/pdf'),
            'coverage_barangays'         => ['043404001', '043404002', '043404003'],
        ], $overrides);
    }

    /**
     * 1. Valid payload creates a user and a sorting_centers row with status PENDING, and stores the permit.
     */
    public function test_valid_payload_creates_user_and_sorting_center_with_pending_status_and_stores_permit(): void
    {
        $payload = $this->validPayload();

        $response = $this->postJson('/api/v1/auth/register-sorting-center', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.sorting_center.status', 'PENDING')
            ->assertJsonPath('data.hub_status', 'PENDING')
            ->assertJsonMissing(['token']);

        $this->assertDatabaseHas('users', [
            'email'      => $payload['email'],
            'first_name' => 'Ramon',
            'last_name'  => 'Magsaysay',
        ]);

        $user = User::where('email', $payload['email'])->first();
        $this->assertNotNull($user);

        $this->assertDatabaseHas('sorting_centers', [
            'user_id'  => $user->id,
            'hub_name' => 'Central Laguna Sorting Hub',
            'status'   => 'PENDING',
        ]);

        $hub = SortingCenter::where('user_id', $user->id)->first();
        $this->assertNotNull($hub);
        $this->assertNotNull($hub->dti_permit_path);
        Storage::disk('ids')->assertExists($hub->dti_permit_path);
    }

    /**
     * 2. Each failure case returns 422 with field-level errors:
     *    missing address, invalid PSGC code, wrong permit file type, oversized permit, empty coverage barangay list, duplicate email.
     */
    public function test_failure_cases_return_422_with_field_level_errors(): void
    {
        // 2a. Missing address fields
        $payloadNoAddress = $this->validPayload([
            'address_province' => '',
            'address_city'     => '',
            'address_barangay' => '',
            'address_street'   => '',
        ]);
        $resNoAddress = $this->postJson('/api/v1/auth/register-sorting-center', $payloadNoAddress);
        $resNoAddress->assertStatus(422)
            ->assertJsonValidationErrors(['address_province', 'address_city', 'address_barangay', 'address_street']);

        // 2b. Invalid PSGC code
        $payloadInvalidPsgc = $this->validPayload([
            'coverage_barangays' => ['invalid-psgc-code'],
        ]);
        $resInvalidPsgc = $this->postJson('/api/v1/auth/register-sorting-center', $payloadInvalidPsgc);
        $resInvalidPsgc->assertStatus(422)
            ->assertJsonValidationErrors(['coverage_barangays.0']);

        // 2c. Wrong permit file type (e.g. .txt / text/plain)
        $payloadWrongPermit = $this->validPayload([
            'dti_permit' => UploadedFile::fake()->create('permit.txt', 100, 'text/plain'),
        ]);
        $resWrongPermit = $this->postJson('/api/v1/auth/register-sorting-center', $payloadWrongPermit);
        $resWrongPermit->assertStatus(422)
            ->assertJsonValidationErrors(['dti_permit']);

        // 2d. Oversized permit (> 5MB = 5120KB)
        $payloadOversizedPermit = $this->validPayload([
            'dti_permit' => UploadedFile::fake()->create('large_permit.pdf', 6000, 'application/pdf'),
        ]);
        $resOversizedPermit = $this->postJson('/api/v1/auth/register-sorting-center', $payloadOversizedPermit);
        $resOversizedPermit->assertStatus(422)
            ->assertJsonValidationErrors(['dti_permit']);

        // 2e. Empty coverage barangay list
        $payloadEmptyCoverage = $this->validPayload([
            'coverage_barangays' => [],
        ]);
        $resEmptyCoverage = $this->postJson('/api/v1/auth/register-sorting-center', $payloadEmptyCoverage);
        $resEmptyCoverage->assertStatus(422)
            ->assertJsonValidationErrors(['coverage_barangays']);

        // 2f. Duplicate email
        $firstPayload = $this->validPayload();
        $this->postJson('/api/v1/auth/register-sorting-center', $firstPayload)->assertStatus(201);

        $secondPayloadSameEmail = $this->validPayload([
            'email' => $firstPayload['email'],
            'phone' => '+63918' . rand(1000000, 9999999),
        ]);
        $resDuplicateEmail = $this->postJson('/api/v1/auth/register-sorting-center', $secondPayloadSameEmail);
        $resDuplicateEmail->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    /**
     * 3. A failure mid-transaction leaves no orphan user or hub rows.
     */
    public function test_mid_transaction_failure_leaves_no_orphan_records(): void
    {
        $failEmail = 'transaction.fail.' . uniqid() . '@example.com';
        $payload = $this->validPayload(['email' => $failEmail]);

        // Temporarily hook into SortingCenter model event to simulate failure during hub creation
        SortingCenter::saving(function () {
            throw new \RuntimeException('Simulated catastrophic database failure during hub creation');
        });

        try {
            $this->postJson('/api/v1/auth/register-sorting-center', $payload);
        } catch (\RuntimeException $e) {
            $this->assertEquals('Simulated catastrophic database failure during hub creation', $e->getMessage());
        }

        // Verify that user was rolled back and no orphan user or hub exists
        $this->assertDatabaseMissing('users', ['email' => $failEmail]);
        $this->assertDatabaseMissing('sorting_centers', ['hub_name' => $payload['hub_name']]);
    }

    /**
     * 4. A newly registered hub cannot authenticate or reach hub routes.
     */
    public function test_newly_registered_hub_cannot_reach_hub_routes(): void
    {
        $payload = $this->validPayload();
        $response = $this->postJson('/api/v1/auth/register-sorting-center', $payload);
        $response->assertStatus(201);

        // 4a. Registration does not issue an auth token
        $this->assertNull($response->json('token'));

        // 4b. Unauthenticated request to hub route is blocked (401)
        $unauthResponse = $this->getJson('/test-hub-protected-route');
        $unauthResponse->assertStatus(401);

        // 4c. Even if the pending user authenticates, hub route is blocked because hub status is PENDING (403)
        $user = User::where('email', $payload['email'])->first();
        $authResponse = $this->actingAs($user)->getJson('/test-hub-protected-route');
        $authResponse->assertStatus(403);
    }
}
