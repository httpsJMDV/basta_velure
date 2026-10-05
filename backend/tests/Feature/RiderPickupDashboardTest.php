<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\RiderPickupDecline;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderPickupDashboardTest extends TestCase
{
    use DatabaseTransactions;

    protected SortingCenter $hub;
    protected User $hubUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->hubUser = User::forceCreate([
            'first_name'    => 'Hub',
            'last_name'     => 'Manager',
            'email'         => 'hub.mgr.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-05-10',
            'sex'           => 'male',
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        $this->hub = SortingCenter::create([
            'user_id'            => $this->hubUser->id,
            'hub_name'           => 'Central Sorting Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043405001', '043405002', '0403428001'],
        ]);
    }

    protected function createRider(string $status = Rider::STATUS_ACTIVE): array
    {
        $user = User::forceCreate([
            'first_name'    => 'Courier',
            'last_name'     => 'Tester ' . uniqid(),
            'email'         => 'courier.' . uniqid() . '@example.com',
            'phone'         => '+63918' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1995-06-15',
            'sex'           => 'male',
            'role'          => 'rider',
            'status'        => 'active',
        ]);

        $rider = Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->hub->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => 'AB-' . rand(1000, 9999),
            'or_cr_path'           => 'ids/or_cr_test.pdf',
            'drivers_license_path' => 'ids/license_test.pdf',
            'status'               => $status,
            'submitted_at'         => now(),
        ]);

        return [$user, $rider];
    }

    protected function createSeller(string $name, string $barangayCode = '043405001'): User
    {
        return User::forceCreate([
            'first_name' => $name,
            'last_name'  => 'Merchant',
            'email'      => 'seller.' . uniqid() . '@example.com',
            'phone'      => '0917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);
    }

    protected function createParcel(
        User $seller,
        string $status = Parcel::STATUS_READY_FOR_PICKUP,
        string $pickupBarangayCode = '043405001',
        ?int $pickupRiderId = null,
        ?Carbon $readyAt = null
    ): Parcel {
        $order = Order::forceCreate([
            'order_number'            => 'VEL-' . strtoupper(uniqid()),
            'buyer_id'                => $this->hubUser->id,
            'status'                  => OrderStatus::READY_FOR_PICKUP->value,
            'subtotal'                => 1500.00,
            'shipping_fee'            => 99.00,
            'total'                   => 1599.00,
            'payment_method'          => 'cod',
            'shipping_name'           => 'Secret Buyer Name',
            'shipping_phone'          => '09998887777',
            'shipping_address'        => 'Secret Buyer Address',
            'shipping_province'       => 'Secret Province',
            'shipping_city'           => 'Secret City',
            'shipping_barangay'       => 'Secret Barangay',
            'shipping_province_code'  => '130000000',
            'shipping_city_code'      => '137602000',
            'shipping_barangay_code'  => '137602015',
        ]);

        return Parcel::create([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $seller->id,
            'status'                    => $status,
            'destination_barangay'      => 'Secret Barangay',
            'destination_barangay_code' => '137602015',
            'pickup_barangay'           => 'Barangay ' . $pickupBarangayCode,
            'pickup_barangay_code'      => $pickupBarangayCode,
            'pickup_address_snapshot'   => [
                'shop_name'     => $seller->first_name . "'s Shop",
                'contact_phone' => $seller->phone,
                'street'        => '123 Market St',
                'barangay'      => 'Barangay ' . $pickupBarangayCode,
                'city'          => 'Calamba',
                'province'      => 'Laguna',
                'barangay_code' => $pickupBarangayCode,
                'full_address'  => "123 Market St, Barangay {$pickupBarangayCode}, Calamba, Laguna",
            ],
            'recipient_snapshot'        => [
                'name'         => 'Secret Buyer Name',
                'phone'        => '09998887777',
                'street'       => 'Secret Buyer Address',
                'barangay'     => 'Secret Barangay',
                'full_address' => 'Secret Buyer Address, Secret Barangay, Secret City, Secret Province',
            ],
            'cod_amount'                => 1599.00,
            'ready_at'                  => $readyAt ?? now()->subMinutes(15),
            'pickup_rider_id'           => $pickupRiderId,
        ]);
    }

    public function test_available_pickups_list_returns_only_ready_for_pickup_unclaimed_undeclined_in_active_areas(): void
    {
        [$user, $rider] = $this->createRider();

        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Area Alpha',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $seller1 = $this->createSeller('SellerOne', '043405001');
        $seller2 = $this->createSeller('SellerTwo', '043405001');

        // Available parcels
        $p1 = $this->createParcel($seller1, Parcel::STATUS_READY_FOR_PICKUP, '043405001', null, now()->subMinutes(30));
        $p2 = $this->createParcel($seller1, Parcel::STATUS_READY_FOR_PICKUP, '043405001', null, now()->subMinutes(20));
        $p3 = $this->createParcel($seller2, Parcel::STATUS_READY_FOR_PICKUP, '043405001', null, now()->subMinutes(10));

        // Excluded: status is already PICKED_UP
        $this->createParcel($seller1, Parcel::STATUS_PICKED_UP, '043405001', null);

        // Excluded: already claimed by another courier
        [, $otherRider] = $this->createRider();
        $this->createParcel($seller1, Parcel::STATUS_READY_FOR_PICKUP, '043405001', $otherRider->id);

        // Excluded: in another barangay outside rider's area
        $this->createParcel($seller1, Parcel::STATUS_READY_FOR_PICKUP, '043405002', null);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups?view=available');

        $response->assertOk()
            ->assertJsonPath('meta.available_count', 2)
            ->assertJsonPath('meta.mine_count', 0)
            ->assertJsonPath('meta.has_areas', true)
            ->assertJsonCount(2, 'data');

        $data = $response->json('data');

        // Check Seller 1 group
        $group1 = collect($data)->firstWhere('seller_id', $seller1->id);
        $this->assertNotNull($group1);
        $this->assertEquals(2, $group1['parcel_count']);
        $this->assertEquals("SellerOne's Shop", $group1['shop_name']);
        $this->assertEquals('Area Alpha', $group1['matched_area_label']);
        $this->assertArrayHasKey('pickup_address', $group1);
        $this->assertArrayHasKey('shop_phone', $group1);
        $this->assertArrayHasKey('ready_since', $group1);

        // Strict security & privacy: Ensure no buyer/recipient data or COD amounts are exposed
        $rawJson = $response->getContent();
        $this->assertStringNotContainsString('Secret Buyer Name', $rawJson);
        $this->assertStringNotContainsString('09998887777', $rawJson);
        $this->assertStringNotContainsString('Secret Buyer Address', $rawJson);
        $this->assertStringNotContainsString('cod_amount', $rawJson);
        $this->assertStringNotContainsString('1599.00', $rawJson);
    }

    public function test_area_isolation_rider_a_and_rider_b_see_only_their_own_areas(): void
    {
        [$userA, $riderA] = $this->createRider();
        [$userB, $riderB] = $this->createRider();

        RiderAreaAssignment::create([
            'rider_id'           => $riderA->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Zone A',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        RiderAreaAssignment::create([
            'rider_id'           => $riderB->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Zone B',
            'coverage_barangays' => ['043405002'],
            'is_active'          => true,
        ]);

        $sellerA = $this->createSeller('SellerA', '043405001');
        $sellerB = $this->createSeller('SellerB', '043405002');

        $this->createParcel($sellerA, Parcel::STATUS_READY_FOR_PICKUP, '043405001');
        $this->createParcel($sellerB, Parcel::STATUS_READY_FOR_PICKUP, '043405002');

        // Rider A only sees Seller A
        $resA = $this->actingAs($userA, 'sanctum')->getJson('/api/v1/rider/pickups');
        $resA->assertOk();
        $this->assertEquals([$sellerA->id], collect($resA->json('data'))->pluck('seller_id')->all());

        // Rider B only sees Seller B
        $resB = $this->actingAs($userB, 'sanctum')->getJson('/api/v1/rider/pickups');
        $resB->assertOk();
        $this->assertEquals([$sellerB->id], collect($resB->json('data'))->pluck('seller_id')->all());

        // Rider A cannot accept Seller B (returns 404)
        $acceptFail = $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$sellerB->id}/accept");
        $acceptFail->assertStatus(404);

        // Rider B cannot accept Seller A (returns 404)
        $acceptFailB = $this->actingAs($userB, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$sellerA->id}/accept");
        $acceptFailB->assertStatus(404);
    }

    public function test_inactive_area_assignment_is_excluded_and_rider_without_areas_gets_empty_list(): void
    {
        [$user, $rider] = $this->createRider();

        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Deactivated Zone',
            'coverage_barangays' => ['043405001'],
            'is_active'          => false,
        ]);

        $seller = $this->createSeller('SellerOne', '043405001');
        $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, '043405001');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups');

        $response->assertOk()
            ->assertJsonPath('meta.available_count', 0)
            ->assertJsonPath('meta.has_areas', false)
            ->assertJsonPath('data', []);
    }

    public function test_accept_claims_parcels_without_changing_order_or_parcel_status(): void
    {
        [$user, $rider] = $this->createRider();

        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Zone Alpha',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $seller = $this->createSeller('SellerOne', '043405001');
        $p1 = $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, '043405001');
        $p2 = $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, '043405001');

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept");

        $response->assertOk()
            ->assertJsonPath('claimed_count', 2)
            ->assertJsonStructure(['message', 'claimed_count', 'tracking_numbers']);

        // Check DB updates
        $p1Fresh = $p1->fresh();
        $p2Fresh = $p2->fresh();

        $this->assertEquals($rider->id, $p1Fresh->pickup_rider_id);
        $this->assertEquals($this->hub->id, $p1Fresh->sorting_center_id);
        $this->assertNotNull($p1Fresh->pickup_accepted_at);

        // Status remains READY_FOR_PICKUP (no status change)
        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $p1Fresh->status);
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP, $p1Fresh->order->status);

        // Appears in view=mine
        $mineResponse = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups?view=mine');
        $mineResponse->assertOk()
            ->assertJsonPath('meta.mine_count', 1)
            ->assertJsonPath('meta.available_count', 0)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.parcel_count', 2)
            ->assertJsonPath('data.0.tracking_numbers.0', $p1->tracking_number);

        // Does NOT appear in view=available
        $availResponse = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups?view=available');
        $availResponse->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.available_count', 0);
    }

    public function test_two_riders_concurrent_accept_first_wins_second_gets_409(): void
    {
        [$userA, $riderA] = $this->createRider();
        [$userB, $riderB] = $this->createRider();

        // Both couriers cover the same barangay
        RiderAreaAssignment::create([
            'rider_id'           => $riderA->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Shared Zone A',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);
        RiderAreaAssignment::create([
            'rider_id'           => $riderB->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Shared Zone B',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $seller = $this->createSeller('SellerShared', '043405001');
        $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, '043405001');

        // Courier A accepts first
        $resA = $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept");
        $resA->assertOk();

        // Courier B tries to accept the same pickup
        $resB = $this->actingAs($userB, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept");
        $resB->assertStatus(409)
            ->assertJson(['message' => 'This pickup request has already been accepted by another courier.']);
    }

    public function test_decline_hides_pickup_for_that_rider_only_while_other_rider_still_sees_it(): void
    {
        [$userA, $riderA] = $this->createRider();
        [$userB, $riderB] = $this->createRider();

        RiderAreaAssignment::create([
            'rider_id'           => $riderA->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Alpha Zone',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);
        RiderAreaAssignment::create([
            'rider_id'           => $riderB->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Alpha Zone',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $seller = $this->createSeller('SellerDecline', '043405001');
        $parcel = $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, '043405001');

        // Courier A declines
        $declineRes = $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/decline");
        $declineRes->assertOk()
            ->assertJsonPath('declined_count', 1);

        $this->assertDatabaseHas('rider_pickup_declines', [
            'rider_id'  => $riderA->id,
            'parcel_id' => $parcel->id,
        ]);

        // Courier A no longer sees it in available list
        $resA = $this->actingAs($userA, 'sanctum')->getJson('/api/v1/rider/pickups');
        $resA->assertOk()->assertJsonCount(0, 'data');

        // Courier B still sees it in available list
        $resB = $this->actingAs($userB, 'sanctum')->getJson('/api/v1/rider/pickups');
        $resB->assertOk()->assertJsonCount(1, 'data');

        // Courier A declining again gets 404 (nothing visible to decline)
        $declineAgain = $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/decline");
        $declineAgain->assertStatus(404);
    }

    public function test_release_returns_parcels_to_pool_and_other_rider_can_accept(): void
    {
        [$userA, $riderA] = $this->createRider();
        [$userB, $riderB] = $this->createRider();

        RiderAreaAssignment::create([
            'rider_id'           => $riderA->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Hub Area',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);
        RiderAreaAssignment::create([
            'rider_id'           => $riderB->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Hub Area',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $seller = $this->createSeller('SellerRelease', '043405001');
        $parcel = $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, '043405001');

        // Courier A accepts
        $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")->assertOk();

        // Courier A releases
        $releaseRes = $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/release");
        $releaseRes->assertOk()->assertJsonPath('released_count', 1);

        $parcelFresh = $parcel->fresh();
        $this->assertNull($parcelFresh->pickup_rider_id);
        $this->assertNull($parcelFresh->sorting_center_id);
        $this->assertNull($parcelFresh->pickup_accepted_at);

        // Courier B can now accept
        $acceptB = $this->actingAs($userB, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept");
        $acceptB->assertOk()->assertJsonPath('claimed_count', 1);

        // Releasing when nothing is accepted yields 409
        $releaseFail = $this->actingAs($userA, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/release");
        $releaseFail->assertStatus(409);
    }

    public function test_unauthenticated_and_non_active_riders_are_forbidden(): void
    {
        // Unauthenticated
        $this->getJson('/api/v1/rider/pickups')->assertStatus(401);

        // PENDING rider
        [$userPending] = $this->createRider(Rider::STATUS_PENDING);
        $this->actingAs($userPending, 'sanctum')->getJson('/api/v1/rider/pickups')->assertStatus(403);

        // DISAPPROVED rider
        [$userDisapproved] = $this->createRider(Rider::STATUS_DISAPPROVED);
        $this->actingAs($userDisapproved, 'sanctum')->getJson('/api/v1/rider/pickups')->assertStatus(403);
    }

    public function test_codes_with_leading_zeros_match_correctly(): void
    {
        [$user, $rider] = $this->createRider();

        $leadingZeroCode = '0403428001';

        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Special Zero Area',
            'coverage_barangays' => [$leadingZeroCode],
            'is_active'          => true,
        ]);

        $seller = $this->createSeller('SellerZero', $leadingZeroCode);
        $parcel = $this->createParcel($seller, Parcel::STATUS_READY_FOR_PICKUP, $leadingZeroCode);

        // Visible in available list
        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups');
        $response->assertOk()
            ->assertJsonPath('meta.available_count', 1)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.matched_area_label', 'Special Zero Area');

        // Accept works
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")
            ->assertOk()
            ->assertJsonPath('claimed_count', 1);

        // Release works
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/release")
            ->assertOk();
    }
}
