<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\DeliveryLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderPickupExecutionTest extends TestCase
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
            'coverage_barangays' => ['043405001'],
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

    protected function createSeller(string $name = 'Seller'): User
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
        ?int $pickupRiderId,
        string $status = Parcel::STATUS_READY_FOR_PICKUP,
        OrderStatus $orderStatus = OrderStatus::READY_FOR_PICKUP
    ): Parcel {
        $order = Order::forceCreate([
            'order_number'           => 'VEL-' . strtoupper(uniqid()),
            'buyer_id'               => $this->hubUser->id,
            'status'                 => $orderStatus->value,
            'subtotal'               => 1500.00,
            'shipping_fee'           => 99.00,
            'total'                  => 1599.00,
            'payment_method'         => 'cod',
            'shipping_name'          => 'Secret Buyer Name',
            'shipping_phone'         => '09998887777',
            'shipping_address'       => 'Secret Buyer Address',
            'shipping_province'      => 'Secret Province',
            'shipping_city'          => 'Secret City',
            'shipping_barangay'      => 'Secret Barangay',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => '137602015',
        ]);

        return Parcel::create([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $seller->id,
            'status'                    => $status,
            'destination_barangay'      => 'Secret Barangay',
            'destination_barangay_code' => '137602015',
            'pickup_barangay'           => 'Barangay 043405001',
            'pickup_barangay_code'      => '043405001',
            'pickup_address_snapshot'   => [
                'shop_name'     => $seller->first_name . "'s Shop",
                'contact_phone' => $seller->phone,
                'street'        => '123 Market St',
                'barangay'      => 'Barangay 043405001',
                'city'          => 'Calamba',
                'province'      => 'Laguna',
                'barangay_code' => '043405001',
                'full_address'  => '123 Market St, Barangay 043405001, Calamba, Laguna',
            ],
            'recipient_snapshot'        => [
                'name'         => 'Secret Buyer Name',
                'phone'        => '09998887777',
                'street'       => 'Secret Buyer Address',
                'barangay'     => 'Secret Barangay',
                'full_address' => 'Secret Buyer Address, Secret Barangay, Secret City, Secret Province',
            ],
            'cod_amount'                => 1599.00,
            'ready_at'                  => now()->subMinutes(15),
            'pickup_rider_id'           => $pickupRiderId,
            'sorting_center_id'         => $pickupRiderId ? $this->hub->id : null,
            'pickup_accepted_at'        => $pickupRiderId ? now()->subMinutes(5) : null,
        ]);
    }

    // ─── verify ───────────────────────────────────────────────────────────────

    public function test_verify_returns_parcel_summary_for_own_accepted_parcel_without_private_data(): void
    {
        [$user, $rider] = $this->createRider();
        $seller = $this->createSeller('Maria');
        $parcel = $this->createParcel($seller, $rider->id);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/verify', [
            'tracking_number' => '  ' . strtolower($parcel->tracking_number) . ' ',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tracking_number', $parcel->tracking_number)
            ->assertJsonPath('data.seller_id', $seller->id)
            ->assertJsonPath('data.shop_name', "Maria's Shop")
            ->assertJsonPath('data.order_number', $parcel->order->order_number);

        $body = $response->getContent();
        $this->assertStringNotContainsString('Secret Buyer', $body);
        $this->assertStringNotContainsString('09998887777', $body);
        $this->assertStringNotContainsString('1599', $body);
        $this->assertStringNotContainsString('cod', strtolower($body));

        // Read-only: nothing changed.
        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $parcel->fresh()->status);
        $this->assertNull($parcel->fresh()->picked_up_at);
    }

    public function test_verify_returns_404_for_another_riders_or_unknown_parcel(): void
    {
        [$user] = $this->createRider();
        [, $otherRider] = $this->createRider();
        $seller = $this->createSeller();

        $theirs = $this->createParcel($seller, $otherRider->id);
        $unclaimed = $this->createParcel($seller, null);

        foreach ([$theirs->tracking_number, $unclaimed->tracking_number, 'LIT-000000-NOPE00'] as $tn) {
            $this->actingAs($user, 'sanctum')
                ->postJson('/api/v1/rider/pickups/verify', ['tracking_number' => $tn])
                ->assertStatus(404);
        }
    }

    public function test_verify_returns_409_for_already_picked_up_parcel(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->createSeller(), $rider->id, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/pickups/verify', ['tracking_number' => $parcel->tracking_number])
            ->assertStatus(409);
    }

    public function test_verify_requires_tracking_number(): void
    {
        [$user] = $this->createRider();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/pickups/verify', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_number']);
    }

    // ─── confirm ──────────────────────────────────────────────────────────────

    public function test_confirm_moves_order_and_parcel_to_picked_up_and_writes_history_log_and_timestamp(): void
    {
        [$user, $rider] = $this->createRider();
        $seller = $this->createSeller();
        $p1 = $this->createParcel($seller, $rider->id);
        $p2 = $this->createParcel($seller, $rider->id);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', [
            'tracking_numbers' => [strtolower($p1->tracking_number), $p2->tracking_number],
        ]);

        $response->assertOk()
            ->assertJsonPath('picked_up_count', 2)
            ->assertJsonPath('hub.hub_name', $this->hub->hub_name)
            ->assertJsonPath('hub.full_address', '123 Hub St, Real, Calamba, Laguna');

        foreach ([$p1, $p2] as $parcel) {
            $parcel->refresh();
            $this->assertEquals(Parcel::STATUS_PICKED_UP, $parcel->status);
            $this->assertNotNull($parcel->picked_up_at);
            // Set at accept in 2.4; must be untouched.
            $this->assertEquals($rider->id, $parcel->pickup_rider_id);
            $this->assertEquals($this->hub->id, $parcel->sorting_center_id);

            $this->assertEquals(OrderStatus::PICKED_UP, $parcel->order->fresh()->status);

            $history = OrderStatusHistory::where('order_id', $parcel->order_id)
                ->where('to_status', OrderStatus::PICKED_UP->value)
                ->first();
            $this->assertNotNull($history);
            $this->assertEquals(OrderStatus::READY_FOR_PICKUP->value, $history->from_status);
            $this->assertEquals('rider', $history->actor_type);
            $this->assertEquals($user->id, $history->actor_id);

            $log = DeliveryLog::where('parcel_id', $parcel->id)->first();
            $this->assertNotNull($log);
            $this->assertEquals(DeliveryLog::OUTCOME_PICKED_UP, $log->outcome);
            $this->assertEquals($rider->id, $log->rider_id);
            $this->assertNotNull($log->logged_at);
        }
    }

    public function test_confirm_rejects_whole_batch_when_one_item_is_invalid(): void
    {
        [$user, $rider] = $this->createRider();
        [, $otherRider] = $this->createRider();
        $seller = $this->createSeller();

        $mine = $this->createParcel($seller, $rider->id);
        $theirs = $this->createParcel($seller, $otherRider->id);
        $done = $this->createParcel($seller, $rider->id, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', [
            'tracking_numbers' => [$mine->tracking_number, $theirs->tracking_number, $done->tracking_number, 'LIT-000000-NOPE00'],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1', 'tracking_numbers.2', 'tracking_numbers.3'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $mine->fresh()->status);
        $this->assertNull($mine->fresh()->picked_up_at);
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP, $mine->order->fresh()->status);
        $this->assertEquals(0, DeliveryLog::where('parcel_id', $mine->id)->count());
        $this->assertEquals(0, OrderStatusHistory::where('order_id', $mine->order_id)->count());
    }

    public function test_confirm_allows_partial_pickup_and_leaves_the_rest_accepted(): void
    {
        [$user, $rider] = $this->createRider();
        $seller = $this->createSeller();
        $p1 = $this->createParcel($seller, $rider->id);
        $p2 = $this->createParcel($seller, $rider->id);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', [
            'tracking_numbers' => [$p1->tracking_number],
        ])->assertOk()->assertJsonPath('picked_up_count', 1);

        $this->assertEquals(Parcel::STATUS_PICKED_UP, $p1->fresh()->status);

        $p2->refresh();
        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $p2->status);
        $this->assertEquals($rider->id, $p2->pickup_rider_id);
        $this->assertNull($p2->picked_up_at);
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP, $p2->order->fresh()->status);
    }

    public function test_confirm_rejects_duplicates_including_case_differences(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->createSeller(), $rider->id);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', [
            'tracking_numbers' => [$parcel->tracking_number, strtolower($parcel->tracking_number)],
        ])->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers.0']);

        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $parcel->fresh()->status);
    }

    public function test_confirm_validates_batch_size_and_shape(): void
    {
        [$user] = $this->createRider();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/pickups/confirm', [])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);

        $tooMany = array_map(fn ($i) => 'LIT-000000-' . str_pad((string) $i, 6, 'A'), range(1, 51));
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => $tooMany])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);
    }

    public function test_confirm_rejects_parcel_whose_order_is_no_longer_pickable(): void
    {
        [$user, $rider] = $this->createRider();
        $seller = $this->createSeller();
        $disputed = $this->createParcel($seller, $rider->id, Parcel::STATUS_READY_FOR_PICKUP, OrderStatus::DISPUTED);
        $fine = $this->createParcel($seller, $rider->id);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', [
            'tracking_numbers' => [$fine->tracking_number, $disputed->tracking_number],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $fine->fresh()->status);
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP, $fine->order->fresh()->status);
    }

    public function test_confirm_is_not_repeatable(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->createSeller(), $rider->id);
        $payload = ['tracking_numbers' => [$parcel->tracking_number]];

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', $payload)->assertOk();
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', $payload)->assertStatus(422);

        $this->assertEquals(1, DeliveryLog::where('parcel_id', $parcel->id)->count());
        $this->assertEquals(1, OrderStatusHistory::where('order_id', $parcel->order_id)->count());
    }

    public function test_pending_and_disapproved_riders_are_forbidden(): void
    {
        foreach ([Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED] as $status) {
            [$user] = $this->createRider($status);

            $this->actingAs($user, 'sanctum')
                ->postJson('/api/v1/rider/pickups/verify', ['tracking_number' => 'LIT-000000-AAAAAA'])
                ->assertStatus(403);

            $this->actingAs($user, 'sanctum')
                ->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => ['LIT-000000-AAAAAA']])
                ->assertStatus(403);
        }
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->postJson('/api/v1/rider/pickups/verify', ['tracking_number' => 'X'])->assertStatus(401);
        $this->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => ['X']])->assertStatus(401);
    }

    // ─── picked_up view ───────────────────────────────────────────────────────

    public function test_picked_up_view_lists_only_own_picked_up_parcels_grouped_by_seller_with_hub(): void
    {
        [$user, $rider] = $this->createRider();
        [, $otherRider] = $this->createRider();
        $sellerA = $this->createSeller('Alpha');
        $sellerB = $this->createSeller('Bravo');

        $a1 = $this->createParcel($sellerA, $rider->id, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP);
        $a2 = $this->createParcel($sellerA, $rider->id, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP);
        $b1 = $this->createParcel($sellerB, $rider->id, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP);
        foreach ([$a1, $a2, $b1] as $p) {
            $p->update(['picked_up_at' => now()]);
        }

        $this->createParcel($sellerA, $rider->id); // still READY_FOR_PICKUP: excluded
        $this->createParcel($sellerA, $otherRider->id, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP); // other rider
        $this->createParcel($sellerA, $rider->id, Parcel::STATUS_AT_SORTING_CENTER, OrderStatus::AT_SORTING_CENTER); // reached hub

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups?view=picked_up');

        $response->assertOk()
            ->assertJsonPath('meta.picked_up_count', 2)
            ->assertJsonPath('meta.mine_count', 1)
            ->assertJsonCount(2, 'data');

        $groupA = collect($response->json('data'))->firstWhere('seller_id', $sellerA->id);
        $this->assertEquals(2, $groupA['parcel_count']);
        $this->assertEqualsCanonicalizing([$a1->tracking_number, $a2->tracking_number], $groupA['tracking_numbers']);
        $this->assertEquals($this->hub->hub_name, $groupA['hub']['hub_name']);
        $this->assertEquals('123 Hub St, Real, Calamba, Laguna', $groupA['hub']['full_address']);

        $body = $response->getContent();
        $this->assertStringNotContainsString('Secret Buyer', $body);
        $this->assertStringNotContainsString('09998887777', $body);
    }

    public function test_picked_up_count_is_present_on_other_views(): void
    {
        [$user, $rider] = $this->createRider();
        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Area Alpha',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/pickups?view=available')
            ->assertOk()->assertJsonPath('meta.picked_up_count', 0);
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_seller_ready_rider_accepts_verifies_confirms_and_both_sides_see_picked_up(): void
    {
        [$riderUser, $rider] = $this->createRider();
        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Area Alpha',
            'coverage_barangays' => ['043405001'],
            'is_active'          => true,
        ]);

        $buyer = User::forceCreate([
            'first_name' => 'Buyer', 'last_name' => 'User',
            'email'      => 'buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Password123!'),
            'role'       => 'buyer', 'status' => 'active',
        ]);
        $seller = $this->createSeller('E2E');
        SellerProfile::create([
            'user_id'                   => $seller->id,
            'shop_name'                 => 'E2E Shop ' . uniqid(),
            'shop_category'             => 'Fashion',
            'date_of_birth'             => '1990-01-01',
            'government_id_type'        => 'national_id',
            'government_id_number'      => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', '1111-2222-3333-' . uniqid()),
            'government_id_image_path'  => 'uploads/id1.jpg',
            'payout_gcash_number'       => '09171111111',
            'application_status'        => 'approved',
            'address_province'          => 'Laguna',
            'address_city'              => 'Calamba',
            'address_barangay'          => 'Real',
            'address_street'            => '456 Burgos St',
            'address_province_code'     => '040000000',
            'address_city_code'         => '043405000',
            'address_barangay_code'     => '043405001',
            'shop_contact_number'       => '09171112222',
        ]);

        $order = Order::create([
            'buyer_id'               => $buyer->id,
            'order_number'           => 'VEL-E2E-' . substr(uniqid(), -8),
            'subtotal'               => 500.00,
            'shipping_fee'           => 99.00,
            'total'                  => 599.00,
            'payment_method'         => 'cod',
            'payment_status'         => 'pending',
            'status'                 => OrderStatus::PREPARING,
            'shipping_name'          => 'Maria Santos',
            'shipping_phone'         => '09187654321',
            'shipping_address'       => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            'shipping_barangay_code' => '137404001',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id,
            'product_name' => 'Floral Summer Dress', 'variant_label' => 'Medium / Red',
            'unit_price' => 500.00, 'quantity' => 1, 'subtotal' => 500.00,
            'commission_rate' => 0.10, 'commission_amount' => 50.00,
            'seller_earnings' => 450.00, 'payout_status' => 'pending_release',
        ]);

        // Seller marks Ready for Pickup.
        $this->actingAs($seller, 'sanctum')
            ->patchJson("/api/v1/seller/orders/{$order->id}/status", ['status' => 'READY_FOR_PICKUP'])
            ->assertOk();
        $trackingNumber = Parcel::where('order_id', $order->id)->value('tracking_number');

        // Rider accepts, verifies, confirms.
        $this->actingAs($riderUser, 'sanctum')
            ->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")
            ->assertOk();

        $this->actingAs($riderUser, 'sanctum')
            ->postJson('/api/v1/rider/pickups/verify', ['tracking_number' => $trackingNumber])
            ->assertOk()
            ->assertJsonPath('data.order_number', $order->order_number);

        $this->actingAs($riderUser, 'sanctum')
            ->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$trackingNumber]])
            ->assertOk();

        // Seller payload.
        $sellerView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$order->id}");
        $sellerView->assertOk()->assertJsonPath('data.status', OrderStatus::PICKED_UP->value);
        $this->assertContains(
            OrderStatus::PICKED_UP->value,
            collect($sellerView->json('data.status_history'))->pluck('to_status')->all()
        );

        // Buyer payload.
        $buyerView = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}");
        $buyerView->assertOk()->assertJsonPath('data.status', OrderStatus::PICKED_UP->value);
        $this->assertContains(
            OrderStatus::PICKED_UP->value,
            collect($buyerView->json('data.status_history'))->pluck('to_status')->all()
        );
    }
}
