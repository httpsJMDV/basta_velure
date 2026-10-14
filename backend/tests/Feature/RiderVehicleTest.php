<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Feature 2.10: a rider edits their own vehicle type and plate number. The change is immediate: no new
 * OR/CR upload and no hub re-approval (a documented gap).
 */
class RiderVehicleTest extends TestCase
{
    use DatabaseTransactions;

    protected User $hubUser;
    protected SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();

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
            'phone'         => '0917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1995-06-15',
            'sex'           => 'male',
            'role'          => $role,
            'status'        => 'active',
        ]);
    }

    /** @return array{0: User, 1: Rider} */
    protected function makeRider(string $status = Rider::STATUS_ACTIVE): array
    {
        $user = $this->makeUser('rider', 'Juan');
        $rider = Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->hub->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => 'AB-1234',
            'or_cr_path'           => 'ids/or_cr_test.pdf',
            'drivers_license_path' => 'ids/license_test.pdf',
            'status'               => $status,
            'submitted_at'         => now(),
        ]);

        return [$user, $rider];
    }

    protected function update(User $user, array $payload)
    {
        return $this->actingAs($user, 'sanctum')->putJson('/api/v1/rider/vehicle', $payload);
    }

    public function test_the_update_persists_and_normalizes_the_type_and_plate(): void
    {
        [$user, $rider] = $this->makeRider();
        $this->assertNull($rider->vehicle_updated_at);

        $this->update($user, ['vehicle_type' => 'tricycle', 'plate_number' => '  xyz-9876 '])
            ->assertOk()
            ->assertJsonPath('message', 'Vehicle details updated.')
            ->assertJsonPath('data.vehicle_type', 'Tricycle')
            ->assertJsonPath('data.plate_number', 'XYZ-9876')
            ->assertJsonPath('data.hub.id', $this->hub->id);

        $fresh = $rider->fresh();
        $this->assertSame('Tricycle', $fresh->vehicle_type);
        $this->assertSame('XYZ-9876', $fresh->plate_number);
        $this->assertNotNull($fresh->vehicle_updated_at);

        // Approval state and documents are untouched: no re-approval, no new OR/CR.
        $this->assertSame(Rider::STATUS_ACTIVE, $fresh->status);
        $this->assertSame('ids/or_cr_test.pdf', $fresh->or_cr_path);

        // The rider's own profile endpoints reflect it straight away.
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/me')->assertOk()
            ->assertJsonPath('data.vehicle_type', 'Tricycle')
            ->assertJsonPath('data.plate_number', 'XYZ-9876')
            ->assertJsonPath('data.vehicle_updated_at', $fresh->vehicle_updated_at->toIso8601String());
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_each_fixed_vehicle_type_is_accepted_and_only_that_riders_row_changes(): void
    {
        [$user, $rider] = $this->makeRider();
        [, $other] = $this->makeRider();

        foreach (Rider::VEHICLE_TYPES as $type) {
            $this->update($user, ['vehicle_type' => $type, 'plate_number' => 'AB 123'])->assertOk()->assertJsonPath('data.vehicle_type', $type);
        }

        $this->assertSame('AB-1234', $other->fresh()->plate_number);
        $this->assertSame(Rider::VEHICLE_MOTORCYCLE, $other->fresh()->vehicle_type);
        $this->assertNull($other->fresh()->vehicle_updated_at);
        $this->assertNotNull($rider->fresh()->vehicle_updated_at);
    }

    /**
     * @param array<string, mixed> $payload
     */
    #[DataProvider('invalidPayloads')]
    public function test_an_invalid_type_or_plate_returns_422_and_changes_nothing(array $payload, string $field): void
    {
        [$user, $rider] = $this->makeRider();

        $this->update($user, $payload)->assertStatus(422)->assertJsonValidationErrors($field);

        $fresh = $rider->fresh();
        $this->assertSame(Rider::VEHICLE_MOTORCYCLE, $fresh->vehicle_type);
        $this->assertSame('AB-1234', $fresh->plate_number);
        $this->assertNull($fresh->vehicle_updated_at);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function invalidPayloads(): array
    {
        return [
            'unknown type'      => [['vehicle_type' => 'Bicycle', 'plate_number' => 'AB-1234'], 'vehicle_type'],
            'walking'           => [['vehicle_type' => 'On foot', 'plate_number' => 'AB-1234'], 'vehicle_type'],
            'missing type'      => [['plate_number' => 'AB-1234'], 'vehicle_type'],
            'missing plate'     => [['vehicle_type' => 'Car'], 'plate_number'],
            'blank plate'       => [['vehicle_type' => 'Car', 'plate_number' => '   '], 'plate_number'],
            'bad characters'    => [['vehicle_type' => 'Car', 'plate_number' => 'AB#1234!'], 'plate_number'],
            'too long'          => [['vehicle_type' => 'Car', 'plate_number' => str_repeat('A', 21)], 'plate_number'],
            'array plate'       => [['vehicle_type' => 'Car', 'plate_number' => ['AB-1234']], 'plate_number'],
        ];
    }

    public function test_validation_messages_match_registration(): void
    {
        [$user] = $this->makeRider();

        $this->update($user, ['vehicle_type' => 'Jet', 'plate_number' => '!!'])->assertStatus(422)
            ->assertJsonPath('errors.vehicle_type.0', 'Vehicle type must be Motorcycle, Tricycle, Car, or Van.')
            ->assertJsonPath('errors.plate_number.0', 'Plate number contains invalid characters.');
    }

    public function test_other_roles_are_refused_and_guests_get_401(): void
    {
        $payload = ['vehicle_type' => 'Car', 'plate_number' => 'ABC 123'];

        foreach (['buyer', 'seller', 'admin'] as $role) {
            $this->update($this->makeUser($role, ucfirst($role)), $payload)->assertForbidden();
        }
        $this->update($this->hubUser, $payload)->assertForbidden();
    }

    public function test_a_guest_gets_a_401(): void
    {
        $this->call('PUT', '/api/v1/rider/vehicle', ['vehicle_type' => 'Car', 'plate_number' => 'ABC 123'])->assertStatus(401);
    }

    public function test_the_hubs_rider_detail_and_list_show_the_new_values(): void
    {
        [$user, $rider] = $this->makeRider();

        $this->update($user, ['vehicle_type' => 'Van', 'plate_number' => 'nab 5555'])->assertOk();

        $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/riders/{$rider->id}")->assertOk()
            ->assertJsonPath('data.vehicle_type', 'Van')
            ->assertJsonPath('data.plate_number', 'NAB 5555')
            ->assertJsonPath('data.status', Rider::STATUS_ACTIVE);

        $list = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/riders?status=ACTIVE')->assertOk();
        $row = collect($list->json('data'))->firstWhere('id', $rider->id);
        $this->assertSame('Van', $row['vehicle_type']);
        $this->assertSame('NAB 5555', $row['plate_number']);
    }
}
