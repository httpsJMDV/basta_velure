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
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class RiderDeliveryTest extends TestCase
{
    use DatabaseTransactions;

    private const CODE_A = '043405001'; // leading zero on purpose
    private const CODE_B = '137602015';
    private const CODE_C = '137404001';

    protected User $hubUser;
    protected SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->hubUser = User::forceCreate([
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

        $this->hub = SortingCenter::create([
            'user_id'            => $this->hubUser->id,
            'hub_name'           => 'Central Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => [self::CODE_A, self::CODE_B, self::CODE_C],
        ]);
    }

    protected function createRider(string $status = Rider::STATUS_ACTIVE, string $first = 'Juan'): array
    {
        $user = User::forceCreate([
            'first_name'    => $first,
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

    protected function cover(Rider $rider, array $codes): void
    {
        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Area ' . uniqid(),
            'coverage_barangays' => $codes,
            'is_active'          => true,
        ]);
    }

    /**
     * @param array<int, array{name: string, qty: int}> $items
     * @param array<string, mixed> $overrides
     */
    protected function createParcel(
        ?Rider $rider,
        string $status = Parcel::STATUS_ASSIGNED_TO_RIDER,
        OrderStatus $orderStatus = OrderStatus::ASSIGNED_TO_RIDER,
        string $code = self::CODE_A,
        string $name = 'Real',
        string $payment = 'cod',
        array $items = [['name' => 'Floral Summer Dress', 'qty' => 1]],
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
            'subtotal'               => 1150.00,
            'shipping_fee'           => 100.00,
            'total'                  => 1250.00,
            'payment_method'         => $payment,
            'shipping_name'          => 'Ana Buyer',
            'shipping_phone'         => '09998887777',
            'shipping_address'       => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Makati City',
            'shipping_barangay'      => $name,
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => $code,
        ]);

        foreach ($items as $item) {
            OrderItem::create([
                'order_id' => $order->id, 'seller_id' => $seller->id,
                'product_name' => $item['name'], 'variant_label' => 'M / Red',
                'unit_price' => 500.00, 'quantity' => $item['qty'], 'subtotal' => 500.00 * $item['qty'],
                'commission_rate' => 0.10, 'commission_amount' => 50.00,
                'seller_earnings' => 450.00, 'payout_status' => 'pending_release',
            ]);
        }

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
                'name'         => 'Ana Buyer',
                'phone'        => '09998887777',
                'street'       => '12 Sampaguita St',
                'barangay'     => $name,
                'city'         => 'Makati City',
                'province'     => 'Metro Manila',
                'full_address' => "12 Sampaguita St, {$name}, Makati City, Metro Manila",
            ],
            'cod_amount'                => $payment === 'cod' ? 1250.00 : null,
            'ready_at'                  => now()->subHours(9),
            'picked_up_at'              => now()->subHours(8),
            'scanned_in_at'             => now()->subHours(6),
            'sorted_at'                 => now()->subHours(5),
            'assigned_at'               => now()->subHours(4),
            'assigned_rider_id'         => $rider?->id,
            'sorting_center_id'         => $this->hub->id,
        ], $overrides));
    }

    protected function list(User $user, string $query = '')
    {
        return $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/deliveries' . $query);
    }

    protected function start(User $user, array $trackingNumbers)
    {
        return $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => $trackingNumbers]);
    }

    // ─── list ─────────────────────────────────────────────────────────────────

    public function test_list_returns_only_this_riders_parcels_in_the_requested_status_with_counts(): void
    {
        [$userA, $riderA] = $this->createRider();
        [, $riderB] = $this->createRider();

        $a1 = $this->createParcel($riderA);
        $a2 = $this->createParcel($riderA);
        $aOut = $this->createParcel($riderA, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, overrides: ['out_for_delivery_at' => now()->subMinutes(30)]);
        $this->createParcel($riderA, Parcel::STATUS_DELIVERED, OrderStatus::DELIVERED);   // finished: not listed
        $b1 = $this->createParcel($riderB);                                              // another rider's
        $bOut = $this->createParcel($riderB, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY);
        $unassigned = $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED); // nobody's

        $assigned = $this->list($userA)->assertOk()
            ->assertJsonPath('meta.view', 'assigned')
            ->assertJsonPath('meta.assigned_count', 2)
            ->assertJsonPath('meta.out_for_delivery_count', 1);

        $listed = collect($assigned->json('data'))->pluck('parcels')->flatten(1)->pluck('tracking_number')->all();
        $this->assertEqualsCanonicalizing([$a1->tracking_number, $a2->tracking_number], $listed);

        $out = $this->list($userA, '?view=out_for_delivery')->assertOk();
        $this->assertEquals(
            [$aOut->tracking_number],
            collect($out->json('data'))->pluck('parcels')->flatten(1)->pluck('tracking_number')->all()
        );
        $this->assertNotNull($out->json('data.0.parcels.0.out_for_delivery_at'));

        // Another rider's and unassigned parcels never appear anywhere in the payload.
        foreach ([$assigned, $out] as $response) {
            $body = $response->getContent();
            foreach ([$b1, $bOut, $unassigned] as $foreign) {
                $this->assertStringNotContainsString($foreign->tracking_number, $body);
            }
        }
    }

    public function test_list_includes_recipient_phone_cod_address_items_and_hub_for_the_assigned_rider(): void
    {
        [$user, $rider] = $this->createRider();
        $cod = $this->createParcel($rider, items: [
            ['name' => 'Floral Summer Dress', 'qty' => 1],
            ['name' => 'Cotton Tee', 'qty' => 2],
            ['name' => 'Canvas Bag', 'qty' => 1],
            ['name' => 'Leather Belt', 'qty' => 1],
        ]);
        $prepaid = $this->createParcel($rider, payment: 'gcash');

        $response = $this->list($user)->assertOk();
        $byTracking = collect($response->json('data'))->pluck('parcels')->flatten(1)->keyBy('tracking_number');

        $c = $byTracking[$cod->tracking_number];
        $this->assertSame($cod->order->order_number, $c['order_number']);
        $this->assertSame('Ana Buyer', $c['recipient']['name']);
        $this->assertSame('09998887777', $c['recipient']['phone']);
        $this->assertSame('12 Sampaguita St', $c['recipient']['address']['street']);
        $this->assertSame('Real', $c['recipient']['address']['barangay']);
        $this->assertSame('Makati City', $c['recipient']['address']['city']);
        $this->assertSame('Metro Manila', $c['recipient']['address']['province']);
        $this->assertSame('12 Sampaguita St, Real, Makati City, Metro Manila', $c['recipient']['address']['full_address']);
        $this->assertEquals(1250, $c["cod_amount"]);
        $this->assertSame(5, $c['item_count']);
        $this->assertSame('Floral Summer Dress x1, Cotton Tee x2, +2 more', $c['item_summary']);
        $this->assertNotNull($c['assigned_at']);
        $this->assertNull($c['out_for_delivery_at']);

        $this->assertNull($byTracking[$prepaid->tracking_number]['cod_amount']);

        $response->assertJsonPath('hub.hub_name', $this->hub->hub_name)
            ->assertJsonPath('hub.full_address', '123 Hub St, Real, Calamba, Laguna');
    }

    public function test_list_is_grouped_by_barangay_oldest_assigned_first_within_and_between_groups(): void
    {
        [$user, $rider] = $this->createRider();

        $b = $this->createParcel($rider, code: self::CODE_B, name: 'Poblacion', overrides: ['assigned_at' => now()->subHours(5)]);
        $a3 = $this->createParcel($rider, code: self::CODE_A, overrides: ['assigned_at' => now()->subHours(3)]);
        $a6 = $this->createParcel($rider, code: self::CODE_A, overrides: ['assigned_at' => now()->subHours(6)]);
        $c1 = $this->createParcel($rider, code: self::CODE_C, name: 'Batasan Hills', overrides: ['assigned_at' => now()->subHour()]);

        $data = $this->list($user)->assertOk()->json('data');

        // Group with the oldest assignment first: A (6h), B (5h), C (1h).
        $this->assertSame([self::CODE_A, self::CODE_B, self::CODE_C], array_column($data, 'barangay_code'));
        $this->assertSame('Real', $data[0]['barangay_name']);
        $this->assertSame('Makati City', $data[0]['city']);

        // Inside group A: the 6h parcel before the 3h one.
        $this->assertSame([$a6->tracking_number, $a3->tracking_number], array_column($data[0]['parcels'], 'tracking_number'));
        $this->assertSame([$b->tracking_number], array_column($data[1]['parcels'], 'tracking_number'));
        $this->assertSame([$c1->tracking_number], array_column($data[2]['parcels'], 'tracking_number'));
    }

    public function test_list_handles_an_empty_queue_and_rejects_an_unknown_view(): void
    {
        [$user] = $this->createRider();

        $this->list($user)->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.assigned_count', 0)
            ->assertJsonPath('meta.out_for_delivery_count', 0);

        $this->list($user, '?view=bogus')->assertStatus(422)->assertJsonValidationErrors(['view']);
    }

    public function test_pending_and_disapproved_riders_are_forbidden_and_unauthenticated_gets_401(): void
    {
        foreach ([Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED] as $status) {
            [$user] = $this->createRider($status);
            $this->list($user)->assertStatus(403);
            $this->start($user, ['LIT-000000-AAAAAA'])->assertStatus(403);
        }

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/rider/deliveries')->assertStatus(401);
        $this->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => ['X']])->assertStatus(401);
    }

    // ─── start ────────────────────────────────────────────────────────────────

    public function test_start_moves_orders_and_parcels_to_out_for_delivery_and_writes_history(): void
    {
        [$user, $rider] = $this->createRider();
        $p1 = $this->createParcel($rider);
        $p2 = $this->createParcel($rider);

        $this->start($user, [strtolower($p1->tracking_number), $p2->tracking_number])
            ->assertOk()
            ->assertJsonPath('started_count', 2);

        foreach ([$p1, $p2] as $parcel) {
            $parcel->refresh();
            $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->status);
            $this->assertNotNull($parcel->out_for_delivery_at);
            $this->assertEquals($rider->id, $parcel->assigned_rider_id); // unchanged
            $this->assertEquals(OrderStatus::OUT_FOR_DELIVERY, $parcel->order->fresh()->status);

            $history = OrderStatusHistory::where('order_id', $parcel->order_id)
                ->where('to_status', OrderStatus::OUT_FOR_DELIVERY->value)->first();
            $this->assertNotNull($history);
            $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER->value, $history->from_status);
            $this->assertEquals('rider', $history->actor_type);
            $this->assertEquals($user->id, $history->actor_id);
        }

        $this->list($user)->assertJsonPath('meta.assigned_count', 0)->assertJsonPath('meta.out_for_delivery_count', 2);
    }

    public function test_start_rejects_the_whole_batch_when_one_item_is_invalid(): void
    {
        [$user, $rider] = $this->createRider();
        [, $other] = $this->createRider();

        $mine = $this->createParcel($rider);
        $theirs = $this->createParcel($other);
        $already = $this->createParcel($rider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY);

        $response = $this->start($user, [$mine->tracking_number, $theirs->tracking_number, $already->tracking_number, 'LIT-000000-NOPE00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1', 'tracking_numbers.2', 'tracking_numbers.3'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $errors = $response->json('errors');
        $this->assertSame('This parcel is already out for delivery.', $errors['tracking_numbers.2'][0]);
        // Another rider's parcel reads exactly like an unknown one.
        $this->assertSame($errors['tracking_numbers.3'], $errors['tracking_numbers.1']);

        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $mine->fresh()->status);
        $this->assertNull($mine->fresh()->out_for_delivery_at);
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $mine->order->fresh()->status);
        $this->assertEquals(0, OrderStatusHistory::where('order_id', $mine->order_id)->count());
        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $theirs->fresh()->status);
    }

    public function test_start_rejects_parcels_that_are_not_waiting_to_be_collected(): void
    {
        [$user, $rider] = $this->createRider();
        $fine = $this->createParcel($rider);
        $sorted = $this->createParcel($rider, Parcel::STATUS_SORTED, OrderStatus::SORTED);

        $this->start($user, [$fine->tracking_number, $sorted->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $fine->fresh()->status);
    }

    public function test_start_rejects_a_disputed_order_and_writes_nothing(): void
    {
        [$user, $rider] = $this->createRider();
        $fine = $this->createParcel($rider);
        $disputed = $this->createParcel($rider, orderStatus: OrderStatus::DISPUTED);

        $this->start($user, [$fine->tracking_number, $disputed->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $fine->fresh()->status);
        $this->assertNull($fine->fresh()->out_for_delivery_at);
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $fine->order->fresh()->status);
        $this->assertEquals(OrderStatus::DISPUTED, $disputed->order->fresh()->status);
        $this->assertEquals(0, OrderStatusHistory::where('order_id', $fine->order_id)->count());
    }

    public function test_repeated_starts_of_the_same_parcel_yield_exactly_one_success(): void
    {
        [$user, $rider] = $this->createRider();
        $p = $this->createParcel($rider);

        // Sequential stand-in for simultaneous requests: the second must observe the first one's
        // result under the row lock. A true parallel run needs two DB connections, which
        // DatabaseTransactions cannot provide.
        $codes = [];
        foreach (range(1, 3) as $_) {
            $codes[] = $this->start($user, [$p->tracking_number])->getStatusCode();
        }

        $this->assertEquals([200, 422, 422], $codes);
        $this->assertEquals(1, OrderStatusHistory::where('order_id', $p->order_id)
            ->where('to_status', OrderStatus::OUT_FOR_DELIVERY->value)->count());
    }

    public function test_start_validates_shape_and_size(): void
    {
        [$user, $rider] = $this->createRider();
        $p = $this->createParcel($rider);

        $this->start($user, [])->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/deliveries/start', [])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);
        $this->start($user, [$p->tracking_number, strtolower($p->tracking_number)])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers.0']);

        $tooMany = array_map(fn ($i) => 'LIT-000000-' . str_pad((string) $i, 6, 'A'), range(1, 51));
        $this->start($user, $tooMany)->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);

        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $p->fresh()->status);
    }

    // ─── the rider's queue matches what the hub dispatched ────────────────────

    public function test_each_riders_list_matches_exactly_what_the_hub_assigned_to_them(): void
    {
        Mail::fake();
        [$userOne, $riderOne] = $this->createRider(first: 'Uno');
        [$userTwo, $riderTwo] = $this->createRider(first: 'Dos');
        $this->cover($riderOne, [self::CODE_A]);
        $this->cover($riderTwo, [self::CODE_B]);

        $forOne = [
            $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED, self::CODE_A, 'Real', overrides: ['assigned_at' => null]),
            $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED, self::CODE_A, 'Real', overrides: ['assigned_at' => null]),
            $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED, self::CODE_A, 'Real', overrides: ['assigned_at' => null]),
        ];
        $forTwo = [
            $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED, self::CODE_B, 'Poblacion', overrides: ['assigned_at' => null]),
            $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED, self::CODE_B, 'Poblacion', overrides: ['assigned_at' => null]),
        ];
        // Sorted but never dispatched: must appear for nobody.
        $undispatched = $this->createParcel(null, Parcel::STATUS_SORTED, OrderStatus::SORTED, self::CODE_A, 'Real', overrides: ['assigned_at' => null]);

        $trackings = fn (array $parcels) => array_map(fn (Parcel $p) => $p->tracking_number, $parcels);

        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', [
            'rider_id' => $riderOne->id, 'tracking_numbers' => $trackings($forOne),
        ])->assertOk();
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', [
            'rider_id' => $riderTwo->id, 'tracking_numbers' => $trackings($forTwo),
        ])->assertOk();

        $listed = fn (User $u) => collect($this->list($u)->assertOk()->json('data'))
            ->pluck('parcels')->flatten(1)->pluck('tracking_number')->all();

        $this->assertEqualsCanonicalizing($trackings($forOne), $listed($userOne));
        $this->assertEqualsCanonicalizing($trackings($forTwo), $listed($userTwo));

        $this->assertNotContains($undispatched->tracking_number, $listed($userOne));
        $this->assertNotContains($undispatched->tracking_number, $listed($userTwo));
        $this->assertEmpty(array_intersect($listed($userOne), $listed($userTwo)));

        $this->list($userOne)->assertJsonPath('meta.assigned_count', 3);
        $this->list($userTwo)->assertJsonPath('meta.assigned_count', 2);
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_seller_ready_to_rider_start_and_both_sides_see_out_for_delivery(): void
    {
        Mail::fake();
        [$riderUser, $rider] = $this->createRider();
        $this->cover($rider, [self::CODE_A, self::CODE_C]);

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
        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/parcels/{$tracking}/receive")->assertOk();
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => [$tracking]])->assertOk();

        // Not on the rider's list until the hub assigns it, and cannot be started early.
        $this->list($riderUser)->assertJsonPath('meta.assigned_count', 0);
        $this->start($riderUser, [$tracking])->assertStatus(422);

        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', [
            'rider_id' => $rider->id, 'tracking_numbers' => [$tracking],
        ])->assertOk();

        $listed = $this->list($riderUser)->assertOk()->assertJsonPath('meta.assigned_count', 1);
        $this->assertSame($tracking, $listed->json('data.0.parcels.0.tracking_number'));
        $this->assertEquals(599, $listed->json("data.0.parcels.0.cod_amount"));
        $this->assertSame('Maria Santos', $listed->json('data.0.parcels.0.recipient.name'));

        $this->start($riderUser, [$tracking])->assertOk()->assertJsonPath('started_count', 1);

        $this->list($riderUser, '?view=out_for_delivery')->assertOk()->assertJsonPath('meta.out_for_delivery_count', 1);

        $sellerView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$order->id}");
        $sellerView->assertOk()->assertJsonPath('data.status', OrderStatus::OUT_FOR_DELIVERY->value);
        $this->assertContains(OrderStatus::OUT_FOR_DELIVERY->value, collect($sellerView->json('data.status_history'))->pluck('to_status')->all());

        $buyerView = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}");
        $buyerView->assertOk()->assertJsonPath('data.status', OrderStatus::OUT_FOR_DELIVERY->value);
        $this->assertContains(OrderStatus::OUT_FOR_DELIVERY->value, collect($buyerView->json('data.status_history'))->pluck('to_status')->all());
    }
}
