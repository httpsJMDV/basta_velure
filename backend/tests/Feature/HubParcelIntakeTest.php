<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class HubParcelIntakeTest extends TestCase
{
    use DatabaseTransactions;

    protected User $hubUser;
    protected SortingCenter $hub;
    protected User $otherHubUser;
    protected SortingCenter $otherHub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        [$this->hubUser, $this->hub] = $this->createHub('Central Hub');
        [$this->otherHubUser, $this->otherHub] = $this->createHub('Other Hub');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    protected function createHub(string $name, string $status = SortingCenter::STATUS_APPROVED): array
    {
        $user = User::forceCreate([
            'first_name'    => 'Hub',
            'last_name'     => 'Manager',
            'email'         => 'hub.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-05-10',
            'sex'           => 'male',
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        $hub = SortingCenter::create([
            'user_id'            => $user->id,
            'hub_name'           => $name . ' ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => $status,
            'coverage_barangays' => ['043405001'],
        ]);

        return [$user, $hub];
    }

    protected function createRider(?SortingCenter $hub = null): array
    {
        $hub ??= $this->hub;

        $user = User::forceCreate([
            'first_name'    => 'Juan',
            'last_name'     => 'Rider' . substr(uniqid(), -4),
            'email'         => 'rider.' . uniqid() . '@example.com',
            'phone'         => '+63918' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1995-06-15',
            'sex'           => 'male',
            'role'          => 'rider',
            'status'        => 'active',
        ]);

        $rider = Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $hub->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => 'AB-' . rand(1000, 9999),
            'or_cr_path'           => 'ids/or_cr_test.pdf',
            'drivers_license_path' => 'ids/license_test.pdf',
            'status'               => Rider::STATUS_ACTIVE,
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

    /**
     * @param array<string, mixed> $parcelOverrides
     */
    protected function createParcel(
        ?SortingCenter $hub,
        ?Rider $rider,
        string $status = Parcel::STATUS_PICKED_UP,
        OrderStatus $orderStatus = OrderStatus::PICKED_UP,
        array $parcelOverrides = []
    ): Parcel {
        $seller = $this->createSeller('Maria');

        $order = Order::forceCreate([
            'order_number'           => 'VEL-' . strtoupper(uniqid()),
            'buyer_id'               => $this->hubUser->id,
            'status'                 => $orderStatus->value,
            'subtotal'               => 1500.00,
            'shipping_fee'           => 99.00,
            'total'                  => 1599.00,
            'payment_method'         => 'cod',
            'shipping_name'          => 'Ana Buyer',
            'shipping_phone'         => '09998887777',
            'shipping_address'       => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Makati City',
            'shipping_barangay'      => 'Poblacion',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => '137602015',
        ]);

        return Parcel::create(array_merge([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $seller->id,
            'status'                    => $status,
            'destination_barangay'      => 'Poblacion',
            'destination_barangay_code' => '137602015',
            'pickup_barangay'           => 'Real',
            'pickup_barangay_code'      => '043405001',
            'pickup_address_snapshot'   => [
                'shop_name'     => "Maria's Shop",
                'contact_phone' => $seller->phone,
                'street'        => '123 Market St',
                'barangay'      => 'Real',
                'city'          => 'Calamba',
                'province'      => 'Laguna',
            ],
            'recipient_snapshot'        => [
                'name'     => 'Ana Buyer',
                'phone'    => '09998887777',
                'street'   => '12 Sampaguita St',
                'barangay' => 'Poblacion',
                'city'     => 'Makati City',
                'province' => 'Metro Manila',
            ],
            'cod_amount'                => 1599.00,
            'ready_at'                  => now()->subHours(3),
            'pickup_rider_id'           => $rider?->id,
            'sorting_center_id'         => $hub?->id,
            'pickup_accepted_at'        => $rider ? now()->subHours(2) : null,
            'picked_up_at'              => $status === Parcel::STATUS_READY_FOR_PICKUP ? null : now()->subHour(),
        ], $parcelOverrides));
    }

    protected function receive(string $tracking, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')
            ->postJson('/api/v1/hub/parcels/' . rawurlencode($tracking) . '/receive');
    }

    // ─── receive ──────────────────────────────────────────────────────────────

    public function test_receive_moves_order_and_parcel_to_at_sorting_center_and_stamps_scan_time(): void
    {
        [, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->hub, $rider);

        $response = $this->receive('  ' . strtolower($parcel->tracking_number) . ' ');

        $response->assertOk()
            ->assertJsonPath('data.tracking_number', $parcel->tracking_number)
            ->assertJsonPath('data.status', Parcel::STATUS_AT_SORTING_CENTER);

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_AT_SORTING_CENTER, $parcel->status);
        $this->assertNotNull($parcel->scanned_in_at);
        $this->assertEquals(OrderStatus::AT_SORTING_CENTER, $parcel->order->fresh()->status);

        $history = OrderStatusHistory::where('order_id', $parcel->order_id)
            ->where('to_status', OrderStatus::AT_SORTING_CENTER->value)
            ->first();
        $this->assertNotNull($history);
        $this->assertEquals(OrderStatus::PICKED_UP->value, $history->from_status);
        $this->assertEquals('hub', $history->actor_type);
        $this->assertEquals($this->hubUser->id, $history->actor_id);
    }

    public function test_receive_unknown_tracking_returns_404(): void
    {
        $this->receive('LIT-000000-NOPE00')->assertStatus(404);
    }

    public function test_receive_another_hubs_parcel_returns_404_with_same_message_and_changes_nothing(): void
    {
        [, $otherRider] = $this->createRider($this->otherHub);
        $parcel = $this->createParcel($this->otherHub, $otherRider);

        $unknown = $this->receive('LIT-000000-NOPE00');
        $foreign = $this->receive($parcel->tracking_number);

        $foreign->assertStatus(404);
        $this->assertEquals($unknown->json('message'), $foreign->json('message'));

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_PICKED_UP, $parcel->status);
        $this->assertNull($parcel->scanned_in_at);
        $this->assertEquals(OrderStatus::PICKED_UP, $parcel->order->fresh()->status);
    }

    public function test_receive_parcel_still_ready_for_pickup_returns_409(): void
    {
        [, $rider] = $this->createRider();
        $parcel = $this->createParcel(
            $this->hub,
            $rider,
            Parcel::STATUS_READY_FOR_PICKUP,
            OrderStatus::READY_FOR_PICKUP
        );

        $this->receive($parcel->tracking_number)
            ->assertStatus(409)
            ->assertJsonPath('message', 'This parcel has not been picked up by a rider yet.');

        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $parcel->fresh()->status);
        $this->assertNull($parcel->fresh()->scanned_in_at);
    }

    public function test_receive_parcel_no_rider_has_accepted_yet_returns_404(): void
    {
        $parcel = $this->createParcel(null, null, Parcel::STATUS_READY_FOR_PICKUP, OrderStatus::READY_FOR_PICKUP);

        $this->receive($parcel->tracking_number)->assertStatus(404);
    }

    public function test_duplicate_scan_returns_409_with_original_timestamp(): void
    {
        [, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->hub, $rider);

        $this->receive($parcel->tracking_number)->assertOk();
        $stamp = $parcel->fresh()->scanned_in_at;

        $second = $this->receive($parcel->tracking_number);

        $second->assertStatus(409)
            ->assertJsonPath('message', 'This parcel has already been received.');
        $this->assertEquals($stamp->toIso8601String(), $second->json('scanned_in_at'));
    }

    public function test_repeated_scans_of_one_parcel_yield_exactly_one_success_and_one_history_row(): void
    {
        [, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->hub, $rider);

        // Sequential stand-in for simultaneous scans: the second attempt must observe the
        // first one's result under the row lock. A true parallel run needs two DB
        // connections, which DatabaseTransactions cannot provide.
        $codes = [];
        foreach (range(1, 4) as $_) {
            $codes[] = $this->receive($parcel->tracking_number)->getStatusCode();
        }

        $this->assertEquals([200, 409, 409, 409], $codes);
        $this->assertEquals(1, OrderStatusHistory::where('order_id', $parcel->order_id)
            ->where('to_status', OrderStatus::AT_SORTING_CENTER->value)->count());
    }

    public function test_receive_rejects_parcel_whose_order_cannot_transition(): void
    {
        [, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->hub, $rider, Parcel::STATUS_PICKED_UP, OrderStatus::DISPUTED);

        $this->receive($parcel->tracking_number)->assertStatus(409);

        $this->assertNull($parcel->fresh()->scanned_in_at);
        $this->assertEquals(OrderStatus::DISPUTED, $parcel->order->fresh()->status);
    }

    public function test_non_approved_hubs_are_forbidden(): void
    {
        foreach ([SortingCenter::STATUS_PENDING, SortingCenter::STATUS_REJECTED, SortingCenter::STATUS_SUSPENDED] as $status) {
            [$user] = $this->createHub('Hub ' . $status, $status);

            $this->receive('LIT-000000-AAAAAA', $user)->assertStatus(403);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/parcels/LIT-000000-AAAAAA')->assertStatus(403);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/intake/expected')->assertStatus(403);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/intake/received-today')->assertStatus(403);
        }
    }

    public function test_unauthenticated_requests_get_401(): void
    {
        $this->postJson('/api/v1/hub/parcels/LIT-000000-AAAAAA/receive')->assertStatus(401);
        $this->getJson('/api/v1/hub/parcels/LIT-000000-AAAAAA')->assertStatus(401);
        $this->getJson('/api/v1/hub/intake/expected')->assertStatus(401);
        $this->getJson('/api/v1/hub/intake/received-today')->assertStatus(401);
    }

    // ─── lookup ───────────────────────────────────────────────────────────────

    public function test_lookup_returns_full_record_without_recipient_phone_or_cod_amount(): void
    {
        [$riderUser, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->hub, $rider);

        $response = $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/parcels/' . strtolower($parcel->tracking_number));

        $response->assertOk()
            ->assertJsonPath('data.tracking_number', $parcel->tracking_number)
            ->assertJsonPath('data.order_number', $parcel->order->order_number)
            ->assertJsonPath('data.status', Parcel::STATUS_PICKED_UP)
            ->assertJsonPath('data.shop_name', "Maria's Shop")
            ->assertJsonPath('data.destination_barangay.code', '137602015')
            ->assertJsonPath('data.destination_barangay.name', 'Poblacion')
            ->assertJsonPath('data.recipient.name', 'Ana Buyer')
            ->assertJsonPath('data.recipient.address.street', '12 Sampaguita St')
            ->assertJsonPath('data.recipient.address.barangay', 'Poblacion')
            ->assertJsonPath('data.recipient.address.city', 'Makati City')
            ->assertJsonPath('data.recipient.address.province', 'Metro Manila')
            ->assertJsonPath('data.pickup_rider.name', $riderUser->first_name . ' ' . $riderUser->last_name)
            ->assertJsonPath('data.pickup_rider.plate_number', $rider->plate_number)
            ->assertJsonPath('data.scanned_in_at', null);
        $this->assertNotNull($response->json('data.picked_up_at'));

        $body = $response->getContent();
        $this->assertStringNotContainsString('09998887777', $body);
        $this->assertStringNotContainsString('1599.00', $body);
        $this->assertStringNotContainsString('"cod_amount"', $body);
        $this->assertStringNotContainsString('"phone"', $body);
        $response->assertJsonMissingPath('data.recipient.phone')->assertJsonMissingPath('data.cod_amount');

        // Read-only.
        $this->assertEquals(Parcel::STATUS_PICKED_UP, $parcel->fresh()->status);
        $this->assertNull($parcel->fresh()->scanned_in_at);
    }

    public function test_lookup_of_another_hubs_or_unknown_parcel_returns_identical_404(): void
    {
        [, $otherRider] = $this->createRider($this->otherHub);
        $foreign = $this->createParcel($this->otherHub, $otherRider);

        $a = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/parcels/' . $foreign->tracking_number);
        $b = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/parcels/LIT-000000-NOPE00');

        $a->assertStatus(404);
        $b->assertStatus(404);
        $this->assertEquals($b->json('message'), $a->json('message'));
    }

    // ─── expected / received today ───────────────────────────────────────────

    public function test_expected_lists_only_this_hubs_picked_up_parcels_paginated(): void
    {
        [, $rider] = $this->createRider();
        [, $otherRider] = $this->createRider($this->otherHub);

        $mine1 = $this->createParcel($this->hub, $rider, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP, ['picked_up_at' => now()->subHours(3)]);
        $mine2 = $this->createParcel($this->hub, $rider, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP, ['picked_up_at' => now()->subHours(1)]);
        $this->createParcel($this->hub, $rider, Parcel::STATUS_READY_FOR_PICKUP, OrderStatus::READY_FOR_PICKUP);
        $this->createParcel($this->hub, $rider, Parcel::STATUS_AT_SORTING_CENTER, OrderStatus::AT_SORTING_CENTER, ['scanned_in_at' => now()]);
        $this->createParcel($this->otherHub, $otherRider);

        $response = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/intake/expected');

        $response->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.tracking_number', $mine1->tracking_number) // waiting longest first
            ->assertJsonPath('data.1.tracking_number', $mine2->tracking_number)
            ->assertJsonPath('data.0.pickup_rider.plate_number', $rider->plate_number);
        $this->assertNotNull($response->json('data.0.picked_up_at'));

        $paged = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/intake/expected?per_page=1&page=2');
        $paged->assertOk()
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.tracking_number', $mine2->tracking_number);
    }

    public function test_received_today_uses_the_asia_manila_day_boundary_and_is_newest_first(): void
    {
        // 03:00 UTC on Oct 14 = 11:00 in Manila. Manila's Oct 14 is 2026-10-13 16:00:00Z .. 2026-10-14 15:59:59Z.
        Carbon::setTestNow(Carbon::parse('2026-10-14 03:00:00', 'UTC'));
        [, $rider] = $this->createRider();

        $make = fn (string $scannedAtUtc) => $this->createParcel(
            $this->hub,
            $rider,
            Parcel::STATUS_AT_SORTING_CENTER,
            OrderStatus::AT_SORTING_CENTER,
            ['scanned_in_at' => Carbon::parse($scannedAtUtc, 'UTC')]
        );

        $yesterdayLast = $make('2026-10-13 15:59:59'); // Manila Oct 13 23:59:59 -> excluded
        $todayFirst    = $make('2026-10-13 16:00:00'); // Manila Oct 14 00:00:00 -> included
        $todayLast     = $make('2026-10-14 15:59:59'); // Manila Oct 14 23:59:59 -> included
        $tomorrowFirst = $make('2026-10-14 16:00:00'); // Manila Oct 15 00:00:00 -> excluded

        [, $otherRider] = $this->createRider($this->otherHub);
        $this->createParcel($this->otherHub, $otherRider, Parcel::STATUS_AT_SORTING_CENTER, OrderStatus::AT_SORTING_CENTER, ['scanned_in_at' => Carbon::parse('2026-10-14 01:00:00', 'UTC')]);
        $this->createParcel($this->hub, $rider); // not scanned in

        $response = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/intake/received-today');

        $response->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.tracking_number', $todayLast->tracking_number)
            ->assertJsonPath('data.1.tracking_number', $todayFirst->tracking_number);

        $listed = collect($response->json('data'))->pluck('tracking_number');
        $this->assertFalse($listed->contains($yesterdayLast->tracking_number));
        $this->assertFalse($listed->contains($tomorrowFirst->tracking_number));
    }

    // ─── metrics ──────────────────────────────────────────────────────────────

    public function test_receive_increments_inbound_today_and_in_sorting_by_one(): void
    {
        [, $rider] = $this->createRider();
        $parcel = $this->createParcel($this->hub, $rider);

        $before = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dashboard/metrics')->assertOk();

        $this->receive($parcel->tracking_number)->assertOk();

        $after = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dashboard/metrics')->assertOk();

        $this->assertEquals($before->json('data.inbound_today') + 1, $after->json('data.inbound_today'));
        $this->assertEquals($before->json('data.in_sorting') + 1, $after->json('data.in_sorting'));
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_seller_ready_rider_picks_up_hub_receives_and_both_sides_see_at_sorting_center(): void
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

        $this->actingAs($seller, 'sanctum')
            ->patchJson("/api/v1/seller/orders/{$order->id}/status", ['status' => 'READY_FOR_PICKUP'])
            ->assertOk();
        $tracking = Parcel::where('order_id', $order->id)->value('tracking_number');

        // The hub cannot receive it before a rider has accepted and collected it.
        $this->receive($tracking)->assertStatus(404);

        $this->actingAs($riderUser, 'sanctum')
            ->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")->assertOk();

        $this->receive($tracking)->assertStatus(409);

        $this->actingAs($riderUser, 'sanctum')
            ->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$tracking]])->assertOk();

        $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/intake/expected')
            ->assertOk()->assertJsonPath('meta.total', 1);

        $this->receive($tracking)->assertOk();

        $sellerView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$order->id}");
        $sellerView->assertOk()->assertJsonPath('data.status', OrderStatus::AT_SORTING_CENTER->value);
        $this->assertContains(
            OrderStatus::AT_SORTING_CENTER->value,
            collect($sellerView->json('data.status_history'))->pluck('to_status')->all()
        );

        $buyerView = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}");
        $buyerView->assertOk()->assertJsonPath('data.status', OrderStatus::AT_SORTING_CENTER->value);
        $this->assertContains(
            OrderStatus::AT_SORTING_CENTER->value,
            collect($buyerView->json('data.status_history'))->pluck('to_status')->all()
        );
    }
}
