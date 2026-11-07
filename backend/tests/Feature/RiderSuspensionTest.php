<?php

namespace Tests\Feature;

use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\RiderAreaCoverage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A rider stays Active on their own row when the admin suspends the account or the hub. Neither may get jobs, and a
 * suspended hub's rider cannot act (they still see their screens).
 */
class RiderSuspensionTest extends TestCase
{
    use DatabaseTransactions;

    private const AREA = '0403424001';

    private SortingCenter $hub;

    private Rider $rider;

    protected function setUp(): void
    {
        parent::setUp();
        $code = strtoupper(substr(uniqid(), -6));
        $company = LogisticsCompany::create(['name' => 'Sus ' . $code, 'code' => $code, 'slug' => strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now()]);
        $this->hub = SortingCenter::forceCreate([
            'user_id' => $this->user('hub')->id, 'hub_name' => 'Sus Hub ' . $code, 'address_province' => 'Laguna', 'address_city' => 'Santa Cruz',
            'address_barangay' => 'Real', 'address_street' => '1 St', 'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => [self::AREA],
            'logistics_company_id' => $company->id,
        ]);
        $this->rider = Rider::forceCreate([
            'user_id' => $this->user('rider', 'rider')->id, 'logistics_company_id' => $company->id, 'sorting_center_id' => $this->hub->id,
            'vehicle_type' => 'Motorcycle', 'plate_number' => 'SUS' . random_int(1000, 9999), 'status' => Rider::STATUS_ACTIVE, 'activated_at' => now(),
        ])->fresh(['user']);
        RiderAreaAssignment::forceCreate(['rider_id' => $this->rider->id, 'sorting_center_id' => $this->hub->id, 'area_label' => 'Real', 'coverage_barangays' => [self::AREA], 'is_active' => true]);
    }

    private function user(string $tag, string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => ucfirst($tag), 'last_name' => 'Cruz', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63918' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male', 'role' => $role, 'status' => 'active',
        ]);
    }

    private function eligible(): array
    {
        return app(RiderAreaCoverage::class)->eligibleByBarangayCode($this->hub)[self::AREA] ?? [];
    }

    public function test_a_rider_whose_account_the_admin_suspended_gets_no_jobs(): void
    {
        $this->assertArrayHasKey($this->rider->id, $this->eligible());

        $this->rider->user->forceFill(['status' => 'suspended'])->save();

        $this->assertArrayNotHasKey($this->rider->id, $this->eligible());
    }

    public function test_a_suspended_hubs_rider_gets_no_jobs_and_cannot_act(): void
    {
        $this->hub->forceFill(['status' => SortingCenter::STATUS_SUSPENDED])->save();

        $this->assertArrayNotHasKey($this->rider->id, $this->eligible());
        Sanctum::actingAs($this->rider->user->fresh());
        $this->getJson('/api/v1/rider/me')->assertOk();
        $this->postJson('/api/v1/rider/availability', ['online' => true])->assertForbidden();
    }
}
