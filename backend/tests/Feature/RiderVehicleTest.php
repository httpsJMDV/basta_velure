<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The rider edits their own vehicle (RID-PROF-002/003) and license (RID-PROF-004/005): a new OR/CR comes with every
 * vehicle change, a plate already used by another rider is refused in any case or spacing, the old plate is replaced
 * at once and the courier company is asked to re-verify.
 */
class RiderVehicleTest extends TestCase
{
    use DatabaseTransactions;

    protected User $hubUser;
    protected SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('ids');

        $this->hubUser = $this->makeUser('buyer', 'Hub');
        $this->hub = SortingCenter::create([
            'user_id'            => $this->hubUser->id,
            'hub_name'           => 'Central Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043405001'],
        ]);
    }

    protected function makeUser(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name'    => $first,
            'last_name'     => 'Tester',
            'email'         => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1995-06-15',
            'sex'           => 'male',
            'role'          => $role,
            'status'        => 'active',
        ]);
    }

    /** @return array{0: User, 1: Rider} */
    protected function makeRider(string $plate = 'AB1234'): array
    {
        $user = $this->makeUser('rider', 'Juan');
        $rider = Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->hub->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => $plate,
            'license_number'       => 'N01-23-' . rand(100000, 999999),
            'license_expiry'       => now()->addYears(3)->toDateString(),
            'or_cr_path'           => 'rider_or_cr/old.pdf',
            'drivers_license_path' => 'rider_licenses/old.pdf',
            'status'               => Rider::STATUS_ACTIVE,
            'submitted_at'         => now(),
        ]);
        Storage::disk('ids')->put('rider_or_cr/old.pdf', 'x');
        Storage::disk('ids')->put('rider_licenses/old.pdf', 'x');

        return [$user, $rider];
    }

    protected function update(User $user, array $payload)
    {
        return $this->actingAs($user, 'sanctum')->post('/api/v1/rider/vehicle', $payload + [
            'or_cr_image' => UploadedFile::fake()->create('or_cr.pdf', 900, 'application/pdf'),
        ], ['Accept' => 'application/json']);
    }

    public function test_the_update_saves_the_new_or_cr_and_flags_the_rider_for_re_verification(): void
    {
        [$user, $rider] = $this->makeRider();

        $this->update($user, ['vehicle_type' => 'tricycle', 'plate_number' => '  xyz-9876 '])
            ->assertOk()
            ->assertJsonPath('data.vehicle_type', 'Tricycle')
            ->assertJsonPath('data.plate_number', 'XYZ9876')
            ->assertJsonPath('data.needs_reverification', true);

        $fresh = $rider->fresh();
        $this->assertSame('XYZ9876', $fresh->plate_number);
        $this->assertTrue($fresh->needs_reverification);
        $this->assertNotSame('rider_or_cr/old.pdf', $fresh->or_cr_path);
        Storage::disk('ids')->assertMissing('rider_or_cr/old.pdf');
        $this->assertSame(Rider::STATUS_ACTIVE, $fresh->status);
        $this->assertTrue(AuditLog::where('subject_type', 'Rider')->where('subject_id', $rider->id)->where('action', 'rider.vehicle_changed')->exists());
    }

    public function test_a_vehicle_change_needs_a_new_or_cr(): void
    {
        [$user, $rider] = $this->makeRider();

        $this->actingAs($user, 'sanctum')->putJson('/api/v1/rider/vehicle', ['vehicle_type' => 'Car', 'plate_number' => 'ABC123'])
            ->assertStatus(422)->assertJsonValidationErrors('or_cr_image');
        $this->assertSame('AB1234', $rider->fresh()->plate_number);
    }

    public function test_another_riders_plate_is_refused_in_any_case_or_spacing(): void
    {
        [$user, $rider] = $this->makeRider('123ABC');
        $this->makeRider('NBC1234');

        foreach (['NBC1234', 'nbc1234', 'nbc 1234', 'NBC-1234'] as $plate) {
            $this->update($user, ['vehicle_type' => 'Van', 'plate_number' => $plate])
                ->assertStatus(422)->assertJsonPath('errors.plate_number.0', 'This plate number is already registered to another rider.');
        }
        $this->assertSame('123ABC', $rider->fresh()->plate_number);
    }

    /** @param array<string, mixed> $payload */
    #[DataProvider('invalidPayloads')]
    public function test_an_invalid_type_or_plate_returns_422_and_changes_nothing(array $payload, string $field): void
    {
        [$user, $rider] = $this->makeRider();

        $this->update($user, $payload)->assertStatus(422)->assertJsonValidationErrors($field);

        $fresh = $rider->fresh();
        $this->assertSame(Rider::VEHICLE_MOTORCYCLE, $fresh->vehicle_type);
        $this->assertSame('AB1234', $fresh->plate_number);
        $this->assertNull($fresh->vehicle_updated_at);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function invalidPayloads(): array
    {
        return [
            'unknown type'   => [['vehicle_type' => 'Bicycle', 'plate_number' => 'AB1234'], 'vehicle_type'],
            'missing type'   => [['plate_number' => 'AB1234'], 'vehicle_type'],
            'missing plate'  => [['vehicle_type' => 'Car'], 'plate_number'],
            'blank plate'    => [['vehicle_type' => 'Car', 'plate_number' => '   '], 'plate_number'],
            'bad characters' => [['vehicle_type' => 'Car', 'plate_number' => 'AB#1234!'], 'plate_number'],
            'too long'       => [['vehicle_type' => 'Car', 'plate_number' => str_repeat('A', 21)], 'plate_number'],
        ];
    }

    public function test_the_license_expiry_must_be_today_or_later(): void
    {
        [$user, $rider] = $this->makeRider();
        $today = \Carbon\CarbonImmutable::now('Asia/Manila');

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/license', ['license_expiry' => $today->subDay()->toDateString()])
            ->assertStatus(422)->assertJsonValidationErrors('license_expiry');
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/license', ['license_expiry' => $today->toDateString()])
            ->assertOk()->assertJsonPath('data.license_expiry', $today->toDateString());
        $this->assertFalse($rider->fresh()->needs_reverification);
    }

    public function test_a_rejected_license_file_keeps_the_previous_document(): void
    {
        [$user, $rider] = $this->makeRider();
        $expiry = now()->addYear()->toDateString();

        $this->actingAs($user, 'sanctum')->post('/api/v1/rider/license', [
            'license_expiry' => $expiry,
            'drivers_license_image' => UploadedFile::fake()->create('price_list.docx', 320, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('drivers_license_image');

        $this->actingAs($user, 'sanctum')->post('/api/v1/rider/license', [
            'license_expiry' => $expiry,
            'drivers_license_image' => UploadedFile::fake()->create('size_5.1MB.jpg', 5222, 'image/jpeg'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('drivers_license_image');

        $this->assertSame('rider_licenses/old.pdf', $rider->fresh()->drivers_license_path);

        $this->actingAs($user, 'sanctum')->post('/api/v1/rider/license', [
            'license_expiry' => $expiry,
            'drivers_license_image' => UploadedFile::fake()->create('size_5.0MB.jpg', 5120, 'image/jpeg'),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.needs_reverification', true);
    }

    public function test_other_roles_are_refused_and_guests_get_401(): void
    {
        foreach (['buyer', 'seller', 'admin'] as $role) {
            $this->update($this->makeUser($role, ucfirst($role)), ['vehicle_type' => 'Car', 'plate_number' => 'ABC123'])->assertForbidden();
        }
        app('auth')->forgetGuards();
        $this->call('PUT', '/api/v1/rider/vehicle', ['vehicle_type' => 'Car', 'plate_number' => 'ABC123'])->assertStatus(401);
    }

    public function test_the_rider_profile_shows_license_vehicle_company_and_documents(): void
    {
        [$user, $rider] = $this->makeRider();

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/me')->assertOk()
            ->assertJsonPath('data.license_number', $rider->license_number)
            ->assertJsonPath('data.license_expiry', $rider->license_expiry->toDateString())
            ->assertJsonPath('data.plate_number', 'AB1234')
            ->assertJsonPath('data.status', Rider::STATUS_ACTIVE)
            ->assertJsonCount(2, 'data.documents');

        $this->actingAs($user, 'sanctum')->get('/api/v1/rider/documents/license')->assertOk();
        $this->actingAs($user, 'sanctum')->get('/api/v1/rider/documents/or-cr')->assertOk();
    }
}
