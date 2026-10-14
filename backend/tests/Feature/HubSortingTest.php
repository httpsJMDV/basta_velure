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
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class HubSortingTest extends TestCase
{
    use DatabaseTransactions;

    // Leading-zero PSGC code on purpose: must always be compared as a string.
    private const CODE_A = '043405001';
    private const CODE_B = '137602015';
    private const CODE_C = '137404001';

    protected User $hubUser;
    protected SortingCenter $hub;
    protected User $otherHubUser;
    protected SortingCenter $otherHub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        [$this->hubUser, $this->hub] = $this->createHub('Central Hub', [self::CODE_A, self::CODE_B]);
        [$this->otherHubUser, $this->otherHub] = $this->createHub('Other Hub', [self::CODE_A]);
    }

    protected function createHub(string $name, array $coverage, string $status = SortingCenter::STATUS_APPROVED): array
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
            'coverage_barangays' => $coverage,
        ]);

        return [$user, $hub];
    }

    protected function createRider(?SortingCenter $hub = null, string $status = Rider::STATUS_ACTIVE): array
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
            'status'               => $status,
            'submitted_at'         => now(),
        ]);

        return [$user, $rider];
    }

    protected function assign(Rider $rider, array $codes, bool $active = true, ?SortingCenter $hub = null): RiderAreaAssignment
    {
        return RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => ($hub ?? $this->hub)->id,
            'area_label'         => 'Area ' . uniqid(),
            'coverage_barangays' => $codes,
            'is_active'          => $active,
        ]);
    }

    /**
     * @param array<string, mixed> $overrides
     */
    protected function createParcel(
        ?SortingCenter $hub,
        string $code = self::CODE_A,
        string $name = 'Real',
        string $city = 'Calamba',
        string $status = Parcel::STATUS_AT_SORTING_CENTER,
        OrderStatus $orderStatus = OrderStatus::AT_SORTING_CENTER,
        array $overrides = []
    ): Parcel {
        $seller = User::forceCreate([
            'first_name' => 'Maria',
            'last_name'  => 'Merchant',
            'email'      => 'seller.' . uniqid() . '@example.com',
            'phone'      => '0917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

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
            'shipping_city'          => $city,
            'shipping_barangay'      => $name,
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => $code,
        ]);

        return Parcel::create(array_merge([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $seller->id,
            'status'                    => $status,
            'destination_barangay'      => $name,
            'destination_barangay_code' => $code,
            'pickup_barangay'           => 'Real',
            'pickup_barangay_code'      => self::CODE_A,
            'pickup_address_snapshot'   => ['shop_name' => "Maria's Shop"],
            'recipient_snapshot'        => [
                'name'     => 'Ana Buyer',
                'phone'    => '09998887777',
                'street'   => '12 Sampaguita St',
                'barangay' => $name,
                'city'     => $city,
                'province' => 'Metro Manila',
            ],
            'cod_amount'                => 1599.00,
            'ready_at'                  => now()->subHours(6),
            'picked_up_at'              => now()->subHours(4),
            'scanned_in_at'             => now()->subHours(2),
            'sorting_center_id'         => $hub?->id,
        ], $overrides));
    }

    protected function fetchGroups(string $query = '', ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')->getJson('/api/v1/hub/sorting/groups' . $query);
    }

    protected function sort(array $trackingNumbers, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')
            ->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => $trackingNumbers]);
    }

    // ─── groups ───────────────────────────────────────────────────────────────

    public function test_groups_counts_parcels_per_barangay_with_oldest_waiting_time_and_is_scoped_to_this_hub(): void
    {
        $oldest = now()->subHours(5);
        $a1 = $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba', overrides: ['scanned_in_at' => now()->subHours(3)]);
        $a2 = $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba', overrides: ['scanned_in_at' => $oldest]);
        $b1 = $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City', overrides: ['scanned_in_at' => now()->subHour()]);

        // Excluded: other hub, other statuses, no hub.
        $this->createParcel($this->otherHub, self::CODE_A);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_SORTED, orderStatus: OrderStatus::SORTED);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_PICKED_UP, orderStatus: OrderStatus::PICKED_UP, overrides: ['scanned_in_at' => null]);

        $response = $this->fetchGroups()->assertOk()
            ->assertJsonPath('meta.total_groups', 2)
            ->assertJsonPath('meta.total_parcels', 3);

        $byCode = collect($response->json('data'))->keyBy('barangay_code');

        $this->assertEquals(2, $byCode[self::CODE_A]['parcel_count']);
        $this->assertEquals('Real', $byCode[self::CODE_A]['barangay_name']);
        $this->assertEquals('Calamba', $byCode[self::CODE_A]['city']);
        $this->assertEquals(
            $oldest->copy()->utc()->format('Y-m-d H:i:s'),
            \Carbon\Carbon::parse($byCode[self::CODE_A]['oldest_scanned_in_at'])->utc()->format('Y-m-d H:i:s')
        );

        $this->assertEquals(1, $byCode[self::CODE_B]['parcel_count']);
        $this->assertEquals('Poblacion', $byCode[self::CODE_B]['barangay_name']);
        $this->assertEquals('Makati City', $byCode[self::CODE_B]['city']);

        // Default sort is longest-waiting first.
        $this->assertEquals([self::CODE_A, self::CODE_B], collect($response->json('data'))->pluck('barangay_code')->all());
    }

    public function test_groups_in_coverage_and_riders_covering_are_correct(): void
    {
        $this->createParcel($this->hub, self::CODE_A);           // in coverage, riders cover it
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City'); // in coverage, nobody covers it
        $this->createParcel($this->hub, self::CODE_C, 'Batasan Hills', 'Quezon City'); // outside coverage

        [, $r1] = $this->createRider();
        [, $r2] = $this->createRider();
        [, $pending] = $this->createRider(null, Rider::STATUS_PENDING);
        [, $disapproved] = $this->createRider(null, Rider::STATUS_DISAPPROVED);
        [, $otherHubRider] = $this->createRider($this->otherHub);
        [, $inactiveOnly] = $this->createRider();

        $this->assign($r1, [self::CODE_A]);
        $this->assign($r1, [self::CODE_A, '999999999']);   // same rider twice: still counts once
        $this->assign($r2, [self::CODE_A]);
        $this->assign($pending, [self::CODE_A]);           // PENDING excluded
        $this->assign($disapproved, [self::CODE_A]);       // DISAPPROVED excluded
        $this->assign($otherHubRider, [self::CODE_A], true, $this->otherHub); // other hub's rider excluded
        $this->assign($inactiveOnly, [self::CODE_A], false); // inactive assignment excluded

        $byCode = collect($this->fetchGroups()->assertOk()->json('data'))->keyBy('barangay_code');

        $this->assertTrue($byCode[self::CODE_A]['in_coverage']);
        $this->assertSame(2, $byCode[self::CODE_A]['riders_covering']);

        $this->assertTrue($byCode[self::CODE_B]['in_coverage']);
        $this->assertSame(0, $byCode[self::CODE_B]['riders_covering']);

        $this->assertFalse($byCode[self::CODE_C]['in_coverage']);
        $this->assertSame(0, $byCode[self::CODE_C]['riders_covering']);
    }

    public function test_groups_supports_search_and_sort(): void
    {
        $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba', overrides: ['scanned_in_at' => now()->subHours(6)]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City', overrides: ['scanned_in_at' => now()->subHours(1)]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City', overrides: ['scanned_in_at' => now()->subHours(1)]);

        $this->assertEquals(
            [self::CODE_B, self::CODE_A],
            collect($this->fetchGroups('?sort=count')->assertOk()->json('data'))->pluck('barangay_code')->all()
        );
        $this->assertEquals(
            [self::CODE_A, self::CODE_B],
            collect($this->fetchGroups('?sort=waiting')->assertOk()->json('data'))->pluck('barangay_code')->all()
        );

        $this->assertEquals([self::CODE_B], collect($this->fetchGroups('?search=pobla')->json('data'))->pluck('barangay_code')->all());
        $this->assertEquals([self::CODE_B], collect($this->fetchGroups('?search=MAKATI')->json('data'))->pluck('barangay_code')->all());
        $this->assertCount(0, $this->fetchGroups('?search=zzz')->json('data'));

        $this->fetchGroups('?sort=bogus')->assertStatus(422)->assertJsonValidationErrors(['sort']);
    }

    // ─── group parcels ────────────────────────────────────────────────────────

    public function test_group_parcels_lists_one_group_paginated_without_phone_or_cod(): void
    {
        $p1 = $this->createParcel($this->hub, self::CODE_A, overrides: ['scanned_in_at' => now()->subHours(4)]);
        $p2 = $this->createParcel($this->hub, self::CODE_A, overrides: ['scanned_in_at' => now()->subHours(2)]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City');
        $this->createParcel($this->otherHub, self::CODE_A);

        $response = $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/sorting/groups/' . self::CODE_A . '/parcels')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.tracking_number', $p1->tracking_number)
            ->assertJsonPath('data.0.order_number', $p1->order->order_number)
            ->assertJsonPath('data.1.tracking_number', $p2->tracking_number);
        $this->assertNotNull($response->json('data.0.scanned_in_at'));

        $body = $response->getContent();
        $this->assertStringNotContainsString('09998887777', $body);
        $this->assertStringNotContainsString('1599.00', $body);
        $this->assertStringNotContainsString('"cod_amount"', $body);
        $this->assertStringNotContainsString('"phone"', $body);

        $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/sorting/groups/' . self::CODE_A . '/parcels?per_page=1&page=2')
            ->assertOk()->assertJsonPath('meta.last_page', 2)->assertJsonCount(1, 'data');

        // A code that only has another hub's parcels looks empty, not forbidden.
        $this->actingAs($this->otherHubUser, 'sanctum')
            ->getJson('/api/v1/hub/sorting/groups/' . self::CODE_B . '/parcels')
            ->assertOk()->assertJsonPath('meta.total', 0);
    }

    // ─── sort ─────────────────────────────────────────────────────────────────

    public function test_sort_moves_orders_and_parcels_to_sorted_stamps_time_and_writes_history(): void
    {
        $p1 = $this->createParcel($this->hub, self::CODE_A);
        $p2 = $this->createParcel($this->hub, self::CODE_A);

        $this->sort([strtolower($p1->tracking_number), $p2->tracking_number])
            ->assertOk()
            ->assertJsonPath('sorted_count', 2)
            ->assertJsonPath('barangay.code', self::CODE_A)
            ->assertJsonPath('barangay.name', 'Real');

        foreach ([$p1, $p2] as $parcel) {
            $parcel->refresh();
            $this->assertEquals(Parcel::STATUS_SORTED, $parcel->status);
            $this->assertNotNull($parcel->sorted_at);
            $this->assertEquals(OrderStatus::SORTED, $parcel->order->fresh()->status);

            $history = OrderStatusHistory::where('order_id', $parcel->order_id)
                ->where('to_status', OrderStatus::SORTED->value)->first();
            $this->assertNotNull($history);
            $this->assertEquals(OrderStatus::AT_SORTING_CENTER->value, $history->from_status);
            $this->assertEquals('hub', $history->actor_type);
            $this->assertEquals($this->hubUser->id, $history->actor_id);
        }
    }

    public function test_sort_rejects_a_mixed_barangay_batch_and_changes_nothing(): void
    {
        $a = $this->createParcel($this->hub, self::CODE_A);
        $b = $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City');

        $this->sort([$a->tracking_number, $b->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        foreach ([$a, $b] as $parcel) {
            $this->assertEquals(Parcel::STATUS_AT_SORTING_CENTER, $parcel->fresh()->status);
            $this->assertNull($parcel->fresh()->sorted_at);
            $this->assertEquals(OrderStatus::AT_SORTING_CENTER, $parcel->order->fresh()->status);
            $this->assertEquals(0, OrderStatusHistory::where('order_id', $parcel->order_id)->count());
        }
    }

    public function test_sort_item_errors_for_wrong_status_unknown_and_other_hubs_parcels(): void
    {
        $ok = $this->createParcel($this->hub, self::CODE_A);
        $picked = $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_PICKED_UP, orderStatus: OrderStatus::PICKED_UP, overrides: ['scanned_in_at' => null]);
        $foreign = $this->createParcel($this->otherHub, self::CODE_A);

        $response = $this->sort([$ok->tracking_number, $picked->tracking_number, $foreign->tracking_number, 'LIT-000000-NOPE00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1', 'tracking_numbers.2', 'tracking_numbers.3'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertEquals('This parcel is not waiting to be sorted.', $response->json('errors')['tracking_numbers.1'][0]);
        // Another hub's parcel reads exactly like an unknown one.
        $this->assertEquals($response->json('errors')['tracking_numbers.3'], $response->json('errors')['tracking_numbers.2']);

        $this->assertEquals(Parcel::STATUS_AT_SORTING_CENTER, $ok->fresh()->status);
        $this->assertEquals(Parcel::STATUS_AT_SORTING_CENTER, $foreign->fresh()->status);
    }

    public function test_sort_rejects_a_disputed_order_and_writes_nothing(): void
    {
        $fine = $this->createParcel($this->hub, self::CODE_A);
        $disputed = $this->createParcel($this->hub, self::CODE_A, orderStatus: OrderStatus::DISPUTED);

        $this->sort([$fine->tracking_number, $disputed->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1']);

        $this->assertEquals(Parcel::STATUS_AT_SORTING_CENTER, $fine->fresh()->status);
        $this->assertNull($fine->fresh()->sorted_at);
        $this->assertEquals(OrderStatus::AT_SORTING_CENTER, $fine->order->fresh()->status);
        $this->assertEquals(OrderStatus::DISPUTED, $disputed->order->fresh()->status);
        $this->assertEquals(0, OrderStatusHistory::where('order_id', $fine->order_id)->count());
    }

    public function test_repeated_sorts_of_the_same_parcels_yield_exactly_one_success(): void
    {
        $p = $this->createParcel($this->hub, self::CODE_A);

        // Sequential stand-in for simultaneous requests: the second must observe the first one's
        // result under the row lock. A true parallel run needs two DB connections, which
        // DatabaseTransactions cannot provide.
        $codes = [];
        foreach (range(1, 3) as $_) {
            $codes[] = $this->sort([$p->tracking_number])->getStatusCode();
        }

        $this->assertEquals([200, 422, 422], $codes);
        $this->assertEquals(1, OrderStatusHistory::where('order_id', $p->order_id)
            ->where('to_status', OrderStatus::SORTED->value)->count());
    }

    public function test_sort_validates_batch_shape_and_size(): void
    {
        $p = $this->createParcel($this->hub, self::CODE_A);

        $this->sort([])->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/sorting/sort', [])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);
        $this->sort([$p->tracking_number, strtolower($p->tracking_number)])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers.0']);

        $tooMany = array_map(fn ($i) => 'LIT-000000-' . str_pad((string) $i, 6, 'A'), range(1, 201));
        $this->sort($tooMany)->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);

        $this->assertEquals(Parcel::STATUS_AT_SORTING_CENTER, $p->fresh()->status);
    }

    public function test_non_approved_hubs_are_forbidden(): void
    {
        foreach ([SortingCenter::STATUS_PENDING, SortingCenter::STATUS_REJECTED, SortingCenter::STATUS_SUSPENDED] as $status) {
            [$user] = $this->createHub('Hub ' . $status, [self::CODE_A], $status);

            $this->fetchGroups('', $user)->assertStatus(403);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/sorting/groups/' . self::CODE_A . '/parcels')->assertStatus(403);
            $this->sort(['LIT-000000-AAAAAA'], $user)->assertStatus(403);
        }
    }

    public function test_unauthenticated_requests_get_401(): void
    {
        $this->getJson('/api/v1/hub/sorting/groups')->assertStatus(401);
        $this->getJson('/api/v1/hub/sorting/groups/' . self::CODE_A . '/parcels')->assertStatus(401);
        $this->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => ['X']])->assertStatus(401);
    }

    // ─── metrics ──────────────────────────────────────────────────────────────

    public function test_sort_lowers_in_sorting_by_the_sorted_count(): void
    {
        $p1 = $this->createParcel($this->hub, self::CODE_A);
        $p2 = $this->createParcel($this->hub, self::CODE_A);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City');

        $before = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dashboard/metrics')->assertOk();
        $this->assertEquals(3, $before->json('data.in_sorting'));

        $this->sort([$p1->tracking_number, $p2->tracking_number])->assertOk();

        $after = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dashboard/metrics')->assertOk();
        $this->assertEquals(1, $after->json('data.in_sorting'));
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_seller_ready_rider_pickup_hub_receive_hub_sort_and_both_sides_see_sorted(): void
    {
        [$riderUser, $rider] = $this->createRider();
        $this->assign($rider, [self::CODE_A]);

        $buyer = User::forceCreate([
            'first_name' => 'Buyer', 'last_name' => 'User',
            'email'      => 'buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Password123!'),
            'role'       => 'buyer', 'status' => 'active',
        ]);
        $seller = User::forceCreate([
            'first_name' => 'E2E', 'last_name' => 'Merchant',
            'email'      => 'seller.' . uniqid() . '@example.com',
            'phone'      => '0917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => 'seller', 'status' => 'active',
        ]);
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
            'address_barangay_code'     => self::CODE_A,
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
            'shipping_barangay_code' => self::CODE_C,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id,
            'product_name' => 'Floral Summer Dress', 'variant_label' => 'Medium / Red',
            'unit_price' => 500.00, 'quantity' => 1, 'subtotal' => 500.00,
            'commission_rate' => 0.10, 'commission_amount' => 50.00,
            'seller_earnings' => 450.00, 'payout_status' => 'pending_release',
        ]);

        $this->actingAs($seller, 'sanctum')
            ->patchJson("/api/v1/seller/orders/{$order->id}/status", ['status' => 'READY_FOR_PICKUP'])->assertOk();
        $tracking = Parcel::where('order_id', $order->id)->value('tracking_number');

        $this->actingAs($riderUser, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")->assertOk();
        $this->actingAs($riderUser, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$tracking]])->assertOk();

        // Cannot be sorted before the hub receives it.
        $this->sort([$tracking])->assertStatus(422);

        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/parcels/{$tracking}/receive")->assertOk();

        $group = collect($this->fetchGroups()->assertOk()->json('data'))->firstWhere('barangay_code', self::CODE_C);
        $this->assertNotNull($group);
        $this->assertEquals('Batasan Hills', $group['barangay_name']);
        $this->assertEquals(1, $group['parcel_count']);
        $this->assertFalse($group['in_coverage']);
        $this->assertSame(0, $group['riders_covering']);

        $this->sort([$tracking])->assertOk()->assertJsonPath('sorted_count', 1);

        $sellerView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$order->id}");
        $sellerView->assertOk()->assertJsonPath('data.status', OrderStatus::SORTED->value);
        $this->assertContains(OrderStatus::SORTED->value, collect($sellerView->json('data.status_history'))->pluck('to_status')->all());

        $buyerView = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}");
        $buyerView->assertOk()->assertJsonPath('data.status', OrderStatus::SORTED->value);
        $this->assertContains(OrderStatus::SORTED->value, collect($buyerView->json('data.status_history'))->pluck('to_status')->all());
    }
}
