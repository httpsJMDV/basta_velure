<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A signed-in buyer applies to deliver for a hub from their own account (POST /auth/apply-rider), like applying as a
 * seller. The account keeps its buyer role; the riders row is what makes it a courier.
 */
class RiderRegistrationTest extends TestCase
{
    use DatabaseTransactions;

    private const URL = '/api/v1/auth/apply-rider';

    protected SortingCenter $approvedHub;
    protected SortingCenter $pendingHub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        $hubUser1 = User::create([
            'first_name'    => 'Hub',
            'last_name'     => 'Owner 1',
            'email'         => 'hub1.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-05-15',
            'sex'           => 'male',
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        $this->approvedHub = SortingCenter::create([
            'user_id'            => $hubUser1->id,
            'hub_name'           => 'Approved Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'dti_permit_path'    => 'permits/sample.pdf',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043405001'],
        ]);

        $hubUser2 = User::create([
            'first_name'    => 'Hub',
            'last_name'     => 'Owner 2',
            'email'         => 'hub2.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-05-15',
            'sex'           => 'male',
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        $this->pendingHub = SortingCenter::create([
            'user_id'            => $hubUser2->id,
            'hub_name'           => 'Pending Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'San Pedro',
            'address_barangay'   => 'San Antonio',
            'address_street'     => '456 Hub St',
            'dti_permit_path'    => 'permits/sample2.pdf',
            'status'             => SortingCenter::STATUS_PENDING,
            'coverage_barangays' => ['043405002'],
        ]);
    }

    private function buyer(array $overrides = []): User
    {
        return User::forceCreate(array_merge([
            'first_name'    => 'Danilo',
            'last_name'     => 'Reyes',
            'email'         => 'danilo.buyer.' . uniqid() . '@example.com',
            'phone'         => '+63918' . rand(1000000, 9999999),
            'password'      => Hash::make('Secret123!'),
            'date_of_birth' => '1995-03-20',
            'sex'           => 'male',
            'role'          => 'buyer',
            'status'        => 'active',
        ], $overrides));
    }

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'sorting_center_id'     => $this->approvedHub->id,
            'vehicle_type'          => 'Motorcycle',
            'plate_number'          => 'ND 1234',
            'or_cr_image'           => UploadedFile::fake()->create('or_cr.jpg', 500, 'image/jpeg'),
            'drivers_license_image' => UploadedFile::fake()->create('drivers_license.pdf', 1024, 'application/pdf'),
        ], $overrides);
    }

    private function riderFor(User $user, string $status, string $plate = 'XYZ 999'): Rider
    {
        return Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->approvedHub->id,
            'vehicle_type'         => 'Motorcycle',
            'plate_number'         => $plate,
            'or_cr_path'           => 'rider_or_cr/sample.jpg',
            'drivers_license_path' => 'rider_licenses/sample.jpg',
            'status'               => $status,
            'submitted_at'         => now(),
        ]);
    }

    public function test_public_hubs_endpoint_returns_only_approved_hubs_without_sensitive_fields(): void
    {
        $response = $this->getJson('/api/v1/logistics/hubs');

        $response->assertStatus(200);
        $data = $response->json('data');

        $hubIds = collect($data)->pluck('id');
        $this->assertTrue($hubIds->contains($this->approvedHub->id));
        $this->assertFalse($hubIds->contains($this->pendingHub->id));

        // Check fields are sanitized
        $approvedItem = collect($data)->firstWhere('id', $this->approvedHub->id);
        $this->assertArrayHasKey('id', $approvedItem);
        $this->assertArrayHasKey('hub_name', $approvedItem);
        $this->assertArrayHasKey('address_city', $approvedItem);
        $this->assertArrayHasKey('address_province', $approvedItem);
        $this->assertArrayNotHasKey('dti_permit_path', $approvedItem);
        $this->assertArrayNotHasKey('coverage_barangays', $approvedItem);
        $this->assertArrayNotHasKey('user_id', $approvedItem);
    }

    public function test_public_hubs_search_filters_results(): void
    {
        $response = $this->getJson('/api/v1/logistics/hubs?search=' . urlencode($this->approvedHub->hub_name));

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertNotEmpty($data);
        $this->assertEquals($this->approvedHub->id, $data[0]['id']);
    }

    public function test_signed_in_buyer_applies_with_their_own_account_and_keeps_the_buyer_role(): void
    {
        $buyer = $this->buyer();
        $usersBefore = User::count();
        Sanctum::actingAs($buyer);

        $response = $this->postJson(self::URL, $this->validPayload())->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'data' => [
                    'user'  => ['id', 'email', 'role', 'rider'],
                    'rider' => ['id', 'status', 'vehicle_type', 'plate_number', 'sorting_center_id', 'hub_name', 'submitted_at'],
                ],
            ])
            ->assertJsonPath('data.user.id', $buyer->id)
            ->assertJsonPath('data.user.role', 'buyer')
            ->assertJsonPath('data.user.rider.status', Rider::STATUS_PENDING);
        $this->assertArrayNotHasKey('token', $response->json());

        $this->assertSame($usersBefore, User::count());
        $this->assertSame('buyer', $buyer->fresh()->role);

        $rider = Rider::where('user_id', $buyer->id)->firstOrFail();
        $this->assertEquals(Rider::STATUS_PENDING, $rider->status);
        $this->assertEquals($this->approvedHub->id, $rider->sorting_center_id);
        $this->assertEquals('Motorcycle', $rider->vehicle_type);
        $this->assertEquals('ND 1234', $rider->plate_number);
        $this->assertTrue(Storage::disk('ids')->exists($rider->or_cr_path));
        $this->assertTrue(Storage::disk('ids')->exists($rider->drivers_license_path));
    }

    public function test_guests_cannot_apply_and_the_old_guest_endpoint_is_gone(): void
    {
        $this->postJson(self::URL, $this->validPayload())->assertStatus(401);
        $this->postJson('/api/v1/auth/register-rider', $this->validPayload())->assertStatus(404);
    }

    public function test_application_fails_for_an_account_under_18_or_without_a_birthday(): void
    {
        Sanctum::actingAs($this->buyer(['date_of_birth' => now()->subYears(17)->format('Y-m-d')]));
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);

        Sanctum::actingAs($this->buyer(['date_of_birth' => null]));
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);
    }

    public function test_application_fails_if_hub_is_not_approved(): void
    {
        Sanctum::actingAs($this->buyer());
        $this->postJson(self::URL, $this->validPayload(['sorting_center_id' => $this->pendingHub->id]))
            ->assertStatus(422)->assertJsonValidationErrors(['sorting_center_id']);
    }

    public function test_application_fails_if_vehicle_type_is_invalid(): void
    {
        Sanctum::actingAs($this->buyer());
        $this->postJson(self::URL, $this->validPayload(['vehicle_type' => 'Bicycle']))
            ->assertStatus(422)->assertJsonValidationErrors(['vehicle_type']);
    }

    public function test_application_fails_if_files_missing(): void
    {
        Sanctum::actingAs($this->buyer());
        $payload = $this->validPayload();
        unset($payload['or_cr_image'], $payload['drivers_license_image']);

        $this->postJson(self::URL, $payload)->assertStatus(422)->assertJsonValidationErrors(['or_cr_image', 'drivers_license_image']);
    }

    public function test_account_rules_block_a_second_application_and_a_hub_owner(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(201);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);
        $this->assertSame(1, Rider::where('user_id', $buyer->id)->count());

        $hubOwner = $this->buyer();
        SortingCenter::create([
            'user_id' => $hubOwner->id, 'hub_name' => 'Owner Hub', 'address_province' => 'Laguna', 'address_city' => 'Calamba',
            'address_barangay' => 'Real', 'address_street' => '1 St', 'dti_permit_path' => 'p.pdf',
            'status' => SortingCenter::STATUS_PENDING, 'coverage_barangays' => ['043405003'],
        ]);
        Sanctum::actingAs($hubOwner);
        $this->postJson(self::URL, $this->validPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);
    }

    public function test_a_disapproved_courier_reapplies_on_the_same_rider_row(): void
    {
        $buyer = $this->buyer();
        $rider = $this->riderFor($buyer, Rider::STATUS_DISAPPROVED);
        $rider->forceFill(['rejection_reason' => 'Blurry license'])->save();
        Sanctum::actingAs($buyer);

        $this->postJson(self::URL, $this->validPayload(['plate_number' => 'NEW 4321']))->assertStatus(201)
            ->assertJsonPath('data.rider.id', $rider->id);

        $rider->refresh();
        $this->assertSame(1, Rider::where('user_id', $buyer->id)->count());
        $this->assertSame(Rider::STATUS_PENDING, $rider->status);
        $this->assertSame('NEW 4321', $rider->plate_number);
        $this->assertNull($rider->rejection_reason);
    }

    public function test_pending_and_disapproved_couriers_can_sign_in_but_not_reach_rider_routes(): void
    {
        foreach ([Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED] as $status) {
            $buyer = $this->buyer();
            $this->riderFor($buyer, $status, 'P ' . rand(100, 999));

            $this->app['auth']->forgetGuards();
            $this->postJson('/api/v1/auth/login', ['email' => $buyer->email, 'password' => 'Secret123!'])
                ->assertOk()->assertJsonPath('data.rider.status', $status);

            Sanctum::actingAs($buyer->fresh());
            $this->getJson('/api/v1/rider/me')->assertStatus(403);
        }
    }

    public function test_an_approved_courier_who_is_a_buyer_reaches_rider_routes(): void
    {
        $buyer = $this->buyer();
        $this->riderFor($buyer, Rider::STATUS_ACTIVE, 'OK 777');

        $this->postJson('/api/v1/auth/login', ['email' => $buyer->email, 'password' => 'Secret123!'])
            ->assertOk()->assertJsonPath('data.role', 'buyer')->assertJsonPath('data.rider.status', 'ACTIVE');

        Sanctum::actingAs($buyer->fresh());
        $this->getJson('/api/v1/rider/me')->assertOk();
    }

    public function test_login_allows_active_rider(): void
    {
        $email = 'active.rider.' . uniqid() . '@example.com';
        $password = 'Secret123!';

        $user = User::create([
            'first_name'    => 'Flash',
            'last_name'     => 'Gordon',
            'email'         => $email,
            'phone'         => '+63919' . rand(1000000, 9999999),
            'password'      => Hash::make($password),
            'date_of_birth' => '1992-04-10',
            'sex'           => 'male',
            'role'          => 'rider',
            'status'        => 'active',
        ]);
        $this->riderFor($user, Rider::STATUS_ACTIVE, 'XYZ 777');

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $email,
            'password' => $password,
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'token',
            'data' => [
                'id',
                'first_name',
                'last_name',
                'email',
                'role',
                'rider' => [
                    'id',
                    'status',
                    'vehicle_type',
                    'plate_number',
                    'sorting_center_id',
                ],
            ],
        ]);
        $this->assertEquals('ACTIVE', $response->json('data.rider.status'));
    }
}
