<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RiderRegistrationTest extends TestCase
{
    use DatabaseTransactions;

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

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'first_name'            => 'Danilo',
            'middle_name'           => 'Santos',
            'last_name'             => 'Reyes',
            'sex'                   => 'male',
            'email'                 => 'danilo.rider.' . uniqid() . '@example.com',
            'phone'                 => '+63918' . rand(1000000, 9999999),
            'date_of_birth'         => '1995-03-20',
            'password'              => 'Password123!',
            'password_confirmation' => 'Password123!',
            'address_province'      => 'Laguna',
            'address_city'          => 'Calamba',
            'address_barangay'      => 'Real',
            'address_street'        => '789 Rider St',
            'sorting_center_id'     => $this->approvedHub->id,
            'vehicle_type'          => 'Motorcycle',
            'plate_number'          => 'ND 1234',
            'or_cr_image'           => UploadedFile::fake()->create('or_cr.jpg', 500, 'image/jpeg'),
            'drivers_license_image' => UploadedFile::fake()->create('drivers_license.pdf', 1024, 'application/pdf'),
        ], $overrides);
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

    public function test_valid_registration_creates_rider_and_user_and_stores_files(): void
    {
        $payload = $this->validPayload();

        $response = $this->postJson('/api/v1/auth/register-rider', $payload);

        $response->assertStatus(201);
        $response->assertJsonStructure([
            'message',
            'data' => [
                'user'  => ['id', 'first_name', 'last_name', 'email', 'role'],
                'rider' => ['id', 'status', 'vehicle_type', 'plate_number', 'sorting_center_id', 'hub_name', 'submitted_at'],
            ],
        ]);

        // Assert NO token returned
        $this->assertArrayNotHasKey('token', $response->json());

        // Assert User created
        $userId = $response->json('data.user.id');
        $user = User::find($userId);
        $this->assertNotNull($user);
        $this->assertEquals('rider', $user->role);
        $this->assertEquals($payload['email'], $user->email);

        // Assert Rider profile created with PENDING
        $rider = Rider::where('user_id', $userId)->first();
        $this->assertNotNull($rider);
        $this->assertEquals(Rider::STATUS_PENDING, $rider->status);
        $this->assertEquals($this->approvedHub->id, $rider->sorting_center_id);
        $this->assertEquals('Motorcycle', $rider->vehicle_type);
        $this->assertEquals('ND 1234', $rider->plate_number);

        // Assert files stored on 'ids' disk
        $this->assertTrue(Storage::disk('ids')->exists($rider->or_cr_path));
        $this->assertTrue(Storage::disk('ids')->exists($rider->drivers_license_path));

        // Assert default address was created
        $this->assertDatabaseHas('addresses', [
            'user_id'  => $userId,
            'province' => 'Laguna',
            'district' => 'Calamba',
            'ward'     => 'Real',
            'address'  => '789 Rider St',
        ]);
    }

    public function test_registration_fails_if_age_is_under_18(): void
    {
        $payload = $this->validPayload([
            'date_of_birth' => now()->subYears(17)->format('Y-m-d'),
        ]);

        $response = $this->postJson('/api/v1/auth/register-rider', $payload);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['date_of_birth']);
    }

    public function test_registration_fails_if_hub_is_not_approved(): void
    {
        $payload = $this->validPayload([
            'sorting_center_id' => $this->pendingHub->id,
        ]);

        $response = $this->postJson('/api/v1/auth/register-rider', $payload);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sorting_center_id']);
    }

    public function test_registration_fails_if_vehicle_type_is_invalid(): void
    {
        $payload = $this->validPayload([
            'vehicle_type' => 'Bicycle',
        ]);

        $response = $this->postJson('/api/v1/auth/register-rider', $payload);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['vehicle_type']);
    }

    public function test_registration_fails_if_files_missing(): void
    {
        $payload = $this->validPayload();
        unset($payload['or_cr_image'], $payload['drivers_license_image']);

        $response = $this->postJson('/api/v1/auth/register-rider', $payload);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['or_cr_image', 'drivers_license_image']);
    }

    public function test_login_gating_blocks_pending_rider(): void
    {
        $email = 'pending.rider.' . uniqid() . '@example.com';
        $password = 'Secret123!';

        $user = User::create([
            'first_name'    => 'Pedro',
            'last_name'     => 'Penduko',
            'email'         => $email,
            'phone'         => '+63919' . rand(1000000, 9999999),
            'password'      => Hash::make($password),
            'date_of_birth' => '1992-04-10',
            'sex'           => 'male',
            'role'          => 'rider',
            'status'        => 'active',
        ]);

        Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->approvedHub->id,
            'vehicle_type'         => 'Motorcycle',
            'plate_number'         => 'XYZ 999',
            'or_cr_path'           => 'rider_or_cr/sample.jpg',
            'drivers_license_path' => 'rider_licenses/sample.jpg',
            'status'               => Rider::STATUS_PENDING,
            'submitted_at'         => now(),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $email,
            'password' => $password,
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'message' => 'Your rider application is currently pending hub approval. You will receive an email notification once reviewed.',
        ]);
    }

    public function test_login_gating_blocks_disapproved_rider(): void
    {
        $email = 'disapproved.rider.' . uniqid() . '@example.com';
        $password = 'Secret123!';

        $user = User::create([
            'first_name'    => 'Juan',
            'last_name'     => 'Tamad',
            'email'         => $email,
            'phone'         => '+63919' . rand(1000000, 9999999),
            'password'      => Hash::make($password),
            'date_of_birth' => '1992-04-10',
            'sex'           => 'male',
            'role'          => 'rider',
            'status'        => 'active',
        ]);

        Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->approvedHub->id,
            'vehicle_type'         => 'Motorcycle',
            'plate_number'         => 'XYZ 888',
            'or_cr_path'           => 'rider_or_cr/sample.jpg',
            'drivers_license_path' => 'rider_licenses/sample.jpg',
            'status'               => Rider::STATUS_DISAPPROVED,
            'submitted_at'         => now(),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $email,
            'password' => $password,
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'message' => 'Your rider application was not approved. Please check your email for details or contact support.',
        ]);
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

        Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->approvedHub->id,
            'vehicle_type'         => 'Motorcycle',
            'plate_number'         => 'XYZ 777',
            'or_cr_path'           => 'rider_or_cr/sample.jpg',
            'drivers_license_path' => 'rider_licenses/sample.jpg',
            'status'               => Rider::STATUS_ACTIVE,
            'submitted_at'         => now(),
        ]);

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
