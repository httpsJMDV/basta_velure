<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A signed-in buyer applies to run a logistics hub from their own account (POST /auth/apply-hub), like applying as a
 * seller: no second account, no second email, and the ID already on the account is reused.
 */
class SortingCenterRegistrationTest extends TestCase
{
    use DatabaseTransactions;

    private const URL = '/api/v1/auth/apply-hub';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        // A test route to verify that an unapproved hub cannot reach hub routes
        Route::middleware(['auth:sanctum', 'approved_sorting_center'])->get('/test-hub-protected-route', function () {
            return response()->json(['message' => 'Welcome to Hub Dashboard']);
        });
    }

    private function buyer(array $overrides = []): User
    {
        return User::forceCreate(array_merge([
            'first_name'               => 'Ramon',
            'last_name'                => 'Magsaysay',
            'email'                    => 'ramon.buyer.' . uniqid() . '@example.com',
            'phone'                    => '+63917' . rand(1000000, 9999999),
            'password'                 => Hash::make('Password123!'),
            'date_of_birth'            => '1990-01-01',
            'role'                     => 'buyer',
            'status'                   => 'active',
            'government_id_type'       => 'national_id',
            'government_id_image_path' => 'buyer_ids/front.jpg',
        ], $overrides));
    }

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'hub_name'           => 'Central Laguna Sorting Hub',
            'address_province'   => 'Laguna',
            'address_city'       => 'Santa Cruz',
            'address_barangay'   => 'Poblacion I',
            'address_street'     => '456 Hub Logistics Blvd',
            'dti_permit'         => UploadedFile::fake()->create('dti_permit.pdf', 1024, 'application/pdf'),
            'coverage_barangays' => ['043404001', '043404002', '043404003'],
        ], $overrides);
    }

    public function test_signed_in_buyer_applies_with_their_own_account_and_keeps_the_buyer_role(): void
    {
        $buyer = $this->buyer();
        $usersBefore = User::count();
        Sanctum::actingAs($buyer);

        $response = $this->postJson(self::URL, $this->validPayload())
            ->assertStatus(201)
            ->assertJsonPath('data.sorting_center.status', 'PENDING')
            ->assertJsonPath('data.hub_status', 'PENDING')
            ->assertJsonPath('data.user.id', $buyer->id)
            ->assertJsonPath('data.user.sorting_center.status', 'PENDING');
        $this->assertNull($response->json('token'));

        // No second account: same user, same email, still a buyer
        $this->assertSame($usersBefore, User::count());
        $this->assertSame('buyer', $buyer->fresh()->role);

        $hub = SortingCenter::where('user_id', $buyer->id)->firstOrFail();
        $this->assertSame('PENDING', $hub->status);
        $this->assertSame(['043404001', '043404002', '043404003'], $hub->coverage_barangays);
        Storage::disk('ids')->assertExists($hub->dti_permit_path);
    }

    public function test_guests_cannot_apply_and_the_old_guest_endpoints_are_gone(): void
    {
        $this->postJson(self::URL, $this->validPayload())->assertStatus(401);
        $this->postJson('/api/v1/auth/register-sorting-center', $this->validPayload())->assertStatus(404);
        $this->postJson('/api/v1/auth/logistics/register', $this->validPayload())->assertStatus(404);
    }

    public function test_failure_cases_return_422_with_field_level_errors(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);

        $this->postJson(self::URL, $this->validPayload([
            'address_province' => '', 'address_city' => '', 'address_barangay' => '', 'address_street' => '',
        ]))->assertStatus(422)->assertJsonValidationErrors(['address_province', 'address_city', 'address_barangay', 'address_street']);

        $this->postJson(self::URL, $this->validPayload(['coverage_barangays' => ['invalid-psgc-code']]))
            ->assertStatus(422)->assertJsonValidationErrors(['coverage_barangays.0']);

        $this->postJson(self::URL, $this->validPayload(['dti_permit' => UploadedFile::fake()->create('permit.txt', 100, 'text/plain')]))
            ->assertStatus(422)->assertJsonValidationErrors(['dti_permit']);

        $this->postJson(self::URL, $this->validPayload(['dti_permit' => UploadedFile::fake()->create('large.pdf', 6000, 'application/pdf')]))
            ->assertStatus(422)->assertJsonValidationErrors(['dti_permit']);

        $this->postJson(self::URL, $this->validPayload(['coverage_barangays' => []]))
            ->assertStatus(422)->assertJsonValidationErrors(['coverage_barangays']);

        $this->assertDatabaseMissing('sorting_centers', ['user_id' => $buyer->id]);
    }

    public function test_account_rules_block_a_second_application_a_missing_id_and_a_courier(): void
    {
        // A buyer without an ID on file
        Sanctum::actingAs($this->buyer(['government_id_image_path' => null]));
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);

        // A pending application cannot be submitted twice
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(201);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);
        $this->assertSame(1, SortingCenter::where('user_id', $buyer->id)->count());

        // A courier cannot also run a hub
        $courier = $this->buyer();
        $hub = SortingCenter::create([
            'user_id' => null, 'hub_name' => 'Other Hub', 'address_province' => 'Laguna', 'address_city' => 'Calamba',
            'address_barangay' => 'Real', 'address_street' => '1 St', 'dti_permit_path' => 'p.pdf',
            'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => ['043405001'],
        ]);
        Rider::create([
            'user_id' => $courier->id, 'sorting_center_id' => $hub->id, 'vehicle_type' => 'Motorcycle', 'plate_number' => 'ABC 123',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        Sanctum::actingAs($courier);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);

        // Admins and other roles cannot apply
        Sanctum::actingAs($this->buyer(['role' => 'admin']));
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);
    }

    public function test_a_rejected_applicant_reapplies_on_the_same_hub_row_and_the_old_permit_is_removed(): void
    {
        $buyer = $this->buyer();
        Storage::disk('ids')->put('dti_permits/old.pdf', 'old');
        $hub = SortingCenter::create([
            'user_id' => $buyer->id, 'hub_name' => 'First Try Hub', 'address_province' => 'Laguna', 'address_city' => 'Calamba',
            'address_barangay' => 'Real', 'address_street' => '1 St', 'dti_permit_path' => 'dti_permits/old.pdf',
            'status' => SortingCenter::STATUS_REJECTED, 'rejection_reason' => 'Blurry permit', 'coverage_barangays' => ['043405001'],
        ]);
        Sanctum::actingAs($buyer);

        $this->postJson(self::URL, $this->validPayload(['hub_name' => 'Second Try Hub']))->assertStatus(201)
            ->assertJsonPath('data.sorting_center.id', $hub->id);

        $hub->refresh();
        $this->assertSame(1, SortingCenter::where('user_id', $buyer->id)->count());
        $this->assertSame('PENDING', $hub->status);
        $this->assertSame('Second Try Hub', $hub->hub_name);
        $this->assertNull($hub->rejection_reason);
        Storage::disk('ids')->assertMissing('dti_permits/old.pdf');
        Storage::disk('ids')->assertExists($hub->dti_permit_path);
    }

    public function test_a_failure_mid_transaction_leaves_no_hub_and_no_stored_permit(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);
        SortingCenter::saving(function () {
            throw new \RuntimeException('Simulated failure during hub creation');
        });

        try {
            $this->withoutExceptionHandling()->postJson(self::URL, $this->validPayload());
            $this->fail('The simulated failure should surface.');
        } catch (\RuntimeException $e) {
            $this->assertSame('Simulated failure during hub creation', $e->getMessage());
        }

        $this->assertDatabaseMissing('sorting_centers', ['user_id' => $buyer->id]);
        $this->assertSame([], Storage::disk('ids')->allFiles('dti_permits'));
    }

    public function test_a_pending_applicant_can_sign_in_but_cannot_reach_hub_routes(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(201);

        // Sign-in works (they keep shopping); the hub routes stay closed until an admin approves
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $buyer->email, 'password' => 'Password123!'])
            ->assertOk()->assertJsonPath('data.sorting_center.status', 'PENDING');

        $this->actingAs($buyer->fresh())->getJson('/test-hub-protected-route')->assertStatus(403);
    }
}
