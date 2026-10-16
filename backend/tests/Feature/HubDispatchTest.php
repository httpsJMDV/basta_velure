<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Mail\ParcelsAssignedMail;
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
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class HubDispatchTest extends TestCase
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

        [$this->hubUser, $this->hub] = $this->createHub('Central Hub');
        [$this->otherHubUser, $this->otherHub] = $this->createHub('Other Hub');
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
            'coverage_barangays' => [self::CODE_A, self::CODE_B],
        ]);

        return [$user, $hub];
    }

    protected function createRider(?SortingCenter $hub = null, string $status = Rider::STATUS_ACTIVE, string $first = 'Juan'): array
    {
        $hub ??= $this->hub;

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

    protected function assign(Rider $rider, array $codes, bool $active = true, ?SortingCenter $hub = null, ?string $label = null): RiderAreaAssignment
    {
        return RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => ($hub ?? $this->hub)->id,
            'area_label'         => $label ?? ('Area ' . uniqid()),
            'coverage_barangays' => $codes,
            'is_active'          => $active,
        ]);
    }

    /** An ACTIVE rider of this hub who covers the given codes. */
    protected function eligibleRider(array $codes = [self::CODE_A], string $first = 'Juan', ?string $label = null): array
    {
        [$user, $rider] = $this->createRider(null, Rider::STATUS_ACTIVE, $first);
        $this->assign($rider, $codes, true, null, $label);

        return [$user, $rider];
    }

    /**
     * @param array<string, mixed> $overrides
     */
    protected function createParcel(
        ?SortingCenter $hub,
        string $code = self::CODE_A,
        string $name = 'Real',
        string $city = 'Calamba',
        string $status = Parcel::STATUS_SORTED,
        OrderStatus $orderStatus = OrderStatus::SORTED,
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
            'ready_at'                  => now()->subHours(8),
            'picked_up_at'              => now()->subHours(6),
            'scanned_in_at'             => now()->subHours(4),
            'sorted_at'                 => now()->subHours(2),
            'sorting_center_id'         => $hub?->id,
        ], $overrides));
    }

    protected function batches(string $query = '', ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')->getJson('/api/v1/hub/dispatch/batches' . $query);
    }

    protected function dispatchTo(?Rider $rider, array $trackingNumbers, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', [
            'rider_id'         => $rider?->id,
            'tracking_numbers' => $trackingNumbers,
        ]);
    }

    // ─── batches ──────────────────────────────────────────────────────────────

    public function test_batches_group_sorted_parcels_by_barangay_with_counts_and_oldest_wait_and_are_scoped_to_this_hub(): void
    {
        $oldest = now()->subHours(7);
        $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba', overrides: ['sorted_at' => now()->subHours(3)]);
        $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba', overrides: ['sorted_at' => $oldest]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City', overrides: ['sorted_at' => now()->subHour()]);

        // Excluded: other hub, other statuses, empty code.
        $this->createParcel($this->otherHub, self::CODE_A);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_AT_SORTING_CENTER, orderStatus: OrderStatus::AT_SORTING_CENTER);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_ASSIGNED_TO_RIDER, orderStatus: OrderStatus::ASSIGNED_TO_RIDER);
        $this->createParcel($this->hub, self::CODE_A, overrides: ['destination_barangay_code' => '']);

        $response = $this->batches()->assertOk()
            ->assertJsonPath('meta.total_batches', 2)
            ->assertJsonPath('meta.total_parcels', 3);

        $byCode = collect($response->json('data'))->keyBy('barangay_code');

        $this->assertEquals(2, $byCode[self::CODE_A]['parcel_count']);
        $this->assertEquals('Real', $byCode[self::CODE_A]['barangay_name']);
        $this->assertEquals('Calamba', $byCode[self::CODE_A]['city']);
        $this->assertEquals(
            $oldest->copy()->utc()->format('Y-m-d H:i:s'),
            \Carbon\Carbon::parse($byCode[self::CODE_A]['oldest_sorted_at'])->utc()->format('Y-m-d H:i:s')
        );
        $this->assertEquals(1, $byCode[self::CODE_B]['parcel_count']);
        $this->assertEquals('Makati City', $byCode[self::CODE_B]['city']);

        $this->assertEquals([self::CODE_A, self::CODE_B], collect($response->json('data'))->pluck('barangay_code')->all());
    }

    public function test_batches_eligible_riders_count_applies_every_eligibility_rule(): void
    {
        $this->createParcel($this->hub, self::CODE_A);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City');

        [, $r1] = $this->createRider();
        [, $r2] = $this->createRider();
        [, $pending] = $this->createRider(null, Rider::STATUS_PENDING);
        [, $disapproved] = $this->createRider(null, Rider::STATUS_DISAPPROVED);
        [, $otherHubRider] = $this->createRider($this->otherHub);
        [, $inactiveOnly] = $this->createRider();

        $this->assign($r1, [self::CODE_A]);
        $this->assign($r1, [self::CODE_A, '999999999']);    // same rider twice: counts once
        $this->assign($r2, [self::CODE_A]);
        $this->assign($pending, [self::CODE_A]);            // PENDING excluded
        $this->assign($disapproved, [self::CODE_A]);        // DISAPPROVED excluded
        $this->assign($otherHubRider, [self::CODE_A], true, $this->otherHub); // other hub excluded
        $this->assign($inactiveOnly, [self::CODE_A], false); // inactive assignment excluded

        $byCode = collect($this->batches()->assertOk()->json('data'))->keyBy('barangay_code');

        $this->assertSame(2, $byCode[self::CODE_A]['eligible_riders']);
        $this->assertSame(0, $byCode[self::CODE_B]['eligible_riders']);
    }

    public function test_batches_support_search_and_sort(): void
    {
        $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba', overrides: ['sorted_at' => now()->subHours(6)]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City', overrides: ['sorted_at' => now()->subHour()]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City', overrides: ['sorted_at' => now()->subHour()]);

        $this->assertEquals([self::CODE_B, self::CODE_A], collect($this->batches('?sort=count')->json('data'))->pluck('barangay_code')->all());
        $this->assertEquals([self::CODE_A, self::CODE_B], collect($this->batches('?sort=waiting')->json('data'))->pluck('barangay_code')->all());
        $this->assertEquals([self::CODE_B], collect($this->batches('?search=pobla')->json('data'))->pluck('barangay_code')->all());
        $this->assertEquals([self::CODE_B], collect($this->batches('?search=MAKATI')->json('data'))->pluck('barangay_code')->all());
        $this->assertCount(0, $this->batches('?search=zzz')->json('data'));

        $this->batches('?sort=bogus')->assertStatus(422)->assertJsonValidationErrors(['sort']);
    }

    // ─── batch parcels ────────────────────────────────────────────────────────

    public function test_batch_parcels_lists_one_batch_paginated_without_phone_or_cod(): void
    {
        $p1 = $this->createParcel($this->hub, self::CODE_A, overrides: ['sorted_at' => now()->subHours(4)]);
        $p2 = $this->createParcel($this->hub, self::CODE_A, overrides: ['sorted_at' => now()->subHours(2)]);
        $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City');
        $this->createParcel($this->otherHub, self::CODE_A);

        $url = '/api/v1/hub/dispatch/batches/' . self::CODE_A . '/parcels';
        $response = $this->actingAs($this->hubUser, 'sanctum')->getJson($url)
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.tracking_number', $p1->tracking_number)
            ->assertJsonPath('data.0.order_number', $p1->order->order_number)
            ->assertJsonPath('data.1.tracking_number', $p2->tracking_number);
        $this->assertNotNull($response->json('data.0.sorted_at'));

        $body = $response->getContent();
        $this->assertStringNotContainsString('09998887777', $body);
        $this->assertStringNotContainsString('1599.00', $body);
        $this->assertStringNotContainsString('"cod_amount"', $body);
        $this->assertStringNotContainsString('"phone"', $body);

        $this->actingAs($this->hubUser, 'sanctum')->getJson($url . '?per_page=1&page=2')
            ->assertOk()->assertJsonPath('meta.last_page', 2)->assertJsonCount(1, 'data');

        $this->actingAs($this->otherHubUser, 'sanctum')
            ->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_B . '/parcels')
            ->assertOk()->assertJsonPath('meta.total', 0);
    }

    // ─── batch riders ─────────────────────────────────────────────────────────

    public function test_batch_riders_lists_only_eligible_riders_with_details_and_current_load(): void
    {
        [$u1, $r1] = $this->eligibleRider([self::CODE_A], 'Alpha', 'North Area');
        [$u2, $r2] = $this->eligibleRider([self::CODE_A, self::CODE_B], 'Bravo', 'South Area');
        [, $pending] = $this->createRider(null, Rider::STATUS_PENDING);
        $this->assign($pending, [self::CODE_A]);
        [, $otherHubRider] = $this->createRider($this->otherHub);
        $this->assign($otherHubRider, [self::CODE_A], true, $this->otherHub);
        [, $inactive] = $this->createRider();
        $this->assign($inactive, [self::CODE_A], false);
        [, $elsewhere] = $this->eligibleRider([self::CODE_C], 'Elsewhere');

        // r2 already carries 3 parcels in flight (ASSIGNED + OUT_FOR_DELIVERY count; DELIVERED does not).
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_ASSIGNED_TO_RIDER, orderStatus: OrderStatus::ASSIGNED_TO_RIDER, overrides: ['assigned_rider_id' => $r2->id]);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_ASSIGNED_TO_RIDER, orderStatus: OrderStatus::ASSIGNED_TO_RIDER, overrides: ['assigned_rider_id' => $r2->id]);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_OUT_FOR_DELIVERY, orderStatus: OrderStatus::OUT_FOR_DELIVERY, overrides: ['assigned_rider_id' => $r2->id]);
        $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_DELIVERED, orderStatus: OrderStatus::DELIVERED, overrides: ['assigned_rider_id' => $r2->id]);

        $response = $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_A . '/riders')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // Least loaded first.
        $this->assertEquals([$r1->id, $r2->id], collect($response->json('data'))->pluck('id')->all());

        $first = $response->json('data.0');
        $this->assertEquals($u1->first_name . ' ' . $u1->last_name, $first['name']);
        $this->assertEquals('Motorcycle', $first['vehicle_type']);
        $this->assertEquals($r1->plate_number, $first['plate_number']);
        $this->assertEquals(['North Area'], $first['area_labels']);
        $this->assertSame(0, $first['current_load']);

        $this->assertSame(3, $response->json('data.1.current_load'));
        $this->assertEquals(['South Area'], $response->json('data.1.area_labels'));
        $this->assertNotContains($elsewhere->id, collect($response->json('data'))->pluck('id')->all());
        $this->assertStringNotContainsString('"email"', $response->getContent());

        // A barangay nobody covers.
        $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_B . '/riders')
            ->assertOk()->assertJsonCount(1, 'data'); // r2 covers CODE_B
        $this->actingAs($this->hubUser, 'sanctum')
            ->getJson('/api/v1/hub/dispatch/batches/999999999/riders')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    // ─── assign ───────────────────────────────────────────────────────────────

    public function test_assign_moves_orders_and_parcels_to_assigned_to_rider_and_records_who_and_when(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $p1 = $this->createParcel($this->hub, self::CODE_A);
        $p2 = $this->createParcel($this->hub, self::CODE_A);

        $this->dispatchTo($rider, [strtolower($p1->tracking_number), $p2->tracking_number])
            ->assertOk()
            ->assertJsonPath('assigned_count', 2)
            ->assertJsonPath('barangay.code', self::CODE_A)
            ->assertJsonPath('barangay.name', 'Real')
            ->assertJsonPath('rider.id', $rider->id);

        foreach ([$p1, $p2] as $parcel) {
            $parcel->refresh();
            $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $parcel->status);
            $this->assertEquals($rider->id, $parcel->assigned_rider_id);
            $this->assertNotNull($parcel->assigned_at);
            $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $parcel->order->fresh()->status);

            $history = OrderStatusHistory::where('order_id', $parcel->order_id)
                ->where('to_status', OrderStatus::ASSIGNED_TO_RIDER->value)->first();
            $this->assertNotNull($history);
            $this->assertEquals(OrderStatus::SORTED->value, $history->from_status);
            $this->assertEquals('hub', $history->actor_type);
            $this->assertEquals($this->hubUser->id, $history->actor_id);
        }
    }

    public function test_assign_rejects_a_rider_whose_area_does_not_cover_the_barangay(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider([self::CODE_B]);
        $parcel = $this->createParcel($this->hub, self::CODE_A);

        $this->dispatchTo($rider, [$parcel->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rider_id'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertNothingChanged([$parcel]);
        Mail::assertNothingQueued();
    }

    public function test_assign_rejects_riders_who_are_not_active_or_have_only_inactive_assignments(): void
    {
        $parcel = $this->createParcel($this->hub, self::CODE_A);

        [, $pending] = $this->createRider(null, Rider::STATUS_PENDING);
        $this->assign($pending, [self::CODE_A]);
        [, $disapproved] = $this->createRider(null, Rider::STATUS_DISAPPROVED);
        $this->assign($disapproved, [self::CODE_A]);
        [, $inactive] = $this->createRider();
        $this->assign($inactive, [self::CODE_A], false);

        foreach ([$pending, $disapproved, $inactive] as $rider) {
            $this->dispatchTo($rider, [$parcel->tracking_number])
                ->assertStatus(422)->assertJsonValidationErrors(['rider_id']);
        }

        $this->assertNothingChanged([$parcel]);
    }

    public function test_assign_rejects_a_mixed_barangay_batch_and_changes_nothing(): void
    {
        [, $rider] = $this->eligibleRider([self::CODE_A, self::CODE_B]);
        $a = $this->createParcel($this->hub, self::CODE_A);
        $b = $this->createParcel($this->hub, self::CODE_B, 'Poblacion', 'Makati City');

        $this->dispatchTo($rider, [$a->tracking_number, $b->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertNothingChanged([$a, $b]);
    }

    public function test_assign_item_errors_for_wrong_status_unknown_and_other_hubs_parcels(): void
    {
        [, $rider] = $this->eligibleRider();
        $ok = $this->createParcel($this->hub, self::CODE_A);
        $atHub = $this->createParcel($this->hub, self::CODE_A, status: Parcel::STATUS_AT_SORTING_CENTER, orderStatus: OrderStatus::AT_SORTING_CENTER);
        $foreign = $this->createParcel($this->otherHub, self::CODE_A);

        $response = $this->dispatchTo($rider, [$ok->tracking_number, $atHub->tracking_number, $foreign->tracking_number, 'LIT-000000-NOPE00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1', 'tracking_numbers.2', 'tracking_numbers.3'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertEquals('This parcel is not waiting for dispatch.', $response->json('errors')['tracking_numbers.1'][0]);
        $this->assertEquals($response->json('errors')['tracking_numbers.3'], $response->json('errors')['tracking_numbers.2']);

        $this->assertNothingChanged([$ok, $foreign]);
    }

    public function test_assign_treats_another_hubs_rider_exactly_like_an_unknown_rider(): void
    {
        $parcel = $this->createParcel($this->hub, self::CODE_A);
        [, $otherHubRider] = $this->createRider($this->otherHub);
        $this->assign($otherHubRider, [self::CODE_A], true, $this->otherHub);

        $foreign = $this->dispatchTo($otherHubRider, [$parcel->tracking_number]);
        $unknown = $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', [
            'rider_id' => 99999999, 'tracking_numbers' => [$parcel->tracking_number],
        ]);

        $foreign->assertStatus(422)->assertJsonValidationErrors(['rider_id']);
        $unknown->assertStatus(422)->assertJsonValidationErrors(['rider_id']);
        $this->assertEquals($unknown->json('errors.rider_id'), $foreign->json('errors.rider_id'));
        $this->assertNothingChanged([$parcel]);
    }

    public function test_assign_rejects_a_disputed_order_and_writes_nothing(): void
    {
        [, $rider] = $this->eligibleRider();
        $fine = $this->createParcel($this->hub, self::CODE_A);
        $disputed = $this->createParcel($this->hub, self::CODE_A, orderStatus: OrderStatus::DISPUTED);

        $this->dispatchTo($rider, [$fine->tracking_number, $disputed->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1']);

        $this->assertEquals(Parcel::STATUS_SORTED, $fine->fresh()->status);
        $this->assertNull($fine->fresh()->assigned_rider_id);
        $this->assertEquals(OrderStatus::SORTED, $fine->order->fresh()->status);
        $this->assertEquals(OrderStatus::DISPUTED, $disputed->order->fresh()->status);
        $this->assertEquals(0, OrderStatusHistory::where('order_id', $fine->order_id)->count());
    }

    public function test_assign_rejects_a_parcel_with_an_empty_destination_barangay_code(): void
    {
        [, $rider] = $this->eligibleRider();
        $fine = $this->createParcel($this->hub, self::CODE_A);
        $blank = $this->createParcel($this->hub, self::CODE_A, overrides: ['destination_barangay_code' => '']);

        $this->dispatchTo($rider, [$fine->tracking_number, $blank->tracking_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_numbers.1'])
            ->assertJsonMissingValidationErrors(['tracking_numbers.0']);

        $this->assertNothingChanged([$fine, $blank]);
    }

    public function test_repeated_assigns_of_the_same_parcels_yield_exactly_one_success(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $p = $this->createParcel($this->hub, self::CODE_A);

        // Sequential stand-in for simultaneous requests: the second must observe the first one's
        // result under the row lock. A true parallel run needs two DB connections, which
        // DatabaseTransactions cannot provide.
        $codes = [];
        foreach (range(1, 3) as $_) {
            $codes[] = $this->dispatchTo($rider, [$p->tracking_number])->getStatusCode();
        }

        $this->assertEquals([200, 422, 422], $codes);
        $this->assertEquals(1, OrderStatusHistory::where('order_id', $p->order_id)
            ->where('to_status', OrderStatus::ASSIGNED_TO_RIDER->value)->count());
        $this->assertSame(1, Mail::queued(\App\Mail\ParcelsAssignedMail::class)->count() + Mail::queued(\App\Mail\ParcelReturnedMail::class)->count()); // hub mails only; order-status notices are NoticeMail
    }

    public function test_assign_validates_shape_and_size(): void
    {
        [, $rider] = $this->eligibleRider();
        $p = $this->createParcel($this->hub, self::CODE_A);

        $this->dispatchTo(null, [$p->tracking_number])->assertStatus(422)->assertJsonValidationErrors(['rider_id']);
        $this->dispatchTo($rider, [])->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', [])
            ->assertStatus(422)->assertJsonValidationErrors(['rider_id', 'tracking_numbers']);
        $this->dispatchTo($rider, [$p->tracking_number, strtolower($p->tracking_number)])
            ->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers.0']);

        $tooMany = array_map(fn ($i) => 'LIT-000000-' . str_pad((string) $i, 6, 'A'), range(1, 201));
        $this->dispatchTo($rider, $tooMany)->assertStatus(422)->assertJsonValidationErrors(['tracking_numbers']);

        $this->assertNothingChanged([$p]);
    }

    public function test_non_approved_hubs_are_forbidden(): void
    {
        foreach ([SortingCenter::STATUS_PENDING, SortingCenter::STATUS_REJECTED, SortingCenter::STATUS_SUSPENDED] as $status) {
            [$user] = $this->createHub('Hub ' . $status, $status);

            $this->batches('', $user)->assertStatus(403);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_A . '/parcels')->assertStatus(403);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_A . '/riders')->assertStatus(403);
            $this->actingAs($user, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', ['rider_id' => 1, 'tracking_numbers' => ['X']])->assertStatus(403);
        }
    }

    public function test_unauthenticated_requests_get_401(): void
    {
        $this->getJson('/api/v1/hub/dispatch/batches')->assertStatus(401);
        $this->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_A . '/parcels')->assertStatus(401);
        $this->getJson('/api/v1/hub/dispatch/batches/' . self::CODE_A . '/riders')->assertStatus(401);
        $this->postJson('/api/v1/hub/dispatch/assign', ['rider_id' => 1, 'tracking_numbers' => ['X']])->assertStatus(401);
    }

    // ─── email ────────────────────────────────────────────────────────────────

    public function test_one_email_is_queued_per_assign_with_real_data_and_a_login_link_from_config(): void
    {
        Mail::fake();
        // The mail layout's header also links to app.url, so point both at real hosts: any "localhost"
        // left in the rendered mail would then have to be hardcoded in our own content.
        config(['app.frontend_url' => 'https://app.lovedit.example', 'app.url' => 'https://api.lovedit.example']);

        [$riderUser, $rider] = $this->eligibleRider([self::CODE_A], 'Pedro');
        $p1 = $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba');
        $p2 = $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba');
        $p3 = $this->createParcel($this->hub, self::CODE_A, 'Real', 'Calamba');

        $this->dispatchTo($rider, [$p1->tracking_number, $p2->tracking_number, $p3->tracking_number])->assertOk();

        $this->assertSame(1, Mail::queued(\App\Mail\ParcelsAssignedMail::class)->count() + Mail::queued(\App\Mail\ParcelReturnedMail::class)->count()); // hub mails only; order-status notices are NoticeMail
        Mail::assertQueued(ParcelsAssignedMail::class, function (ParcelsAssignedMail $mail) use ($riderUser) {
            $html = $mail->render();

            $this->assertTrue($mail->hasTo($riderUser->email));
            $this->assertStringContainsString('Hi Pedro,', $html);
            $this->assertStringContainsString($this->hub->hub_name, $html);
            $this->assertStringContainsString('3 parcels', $html);
            $this->assertStringContainsString('Real', $html);
            $this->assertStringContainsString('https://app.lovedit.example/rider/login', $html);
            $this->assertStringNotContainsString('localhost', $html);

            return true;
        });
    }

    public function test_awaiting_pickup_lists_assigned_parcels_by_rider_for_this_hub_only(): void
    {
        Mail::fake();
        [, $riderA] = $this->eligibleRider();
        [, $riderB] = $this->eligibleRider();
        $a1 = $this->createParcel($this->hub, self::CODE_A);
        $a2 = $this->createParcel($this->hub, self::CODE_A);
        $b1 = $this->createParcel($this->hub, self::CODE_A);
        $this->dispatchTo($riderA, [$a1->tracking_number, $a2->tracking_number])->assertOk();
        $this->dispatchTo($riderB, [$b1->tracking_number])->assertOk();

        // Not waiting for a rider: still sorted, and another hub's.
        $sorted = $this->createParcel($this->hub, self::CODE_A);
        $theirs = $this->createParcel($this->otherHub, self::CODE_A, status: Parcel::STATUS_ASSIGNED_TO_RIDER, orderStatus: OrderStatus::ASSIGNED_TO_RIDER, overrides: ['assigned_rider_id' => $riderA->id, 'assigned_at' => now()]);

        $res = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dispatch/awaiting-pickup')->assertOk()
            ->assertJsonPath('meta.parcel_count', 3);

        $groups = collect($res->json('data'));
        $this->assertCount(2, $groups);
        $this->assertEqualsCanonicalizing([$a1->tracking_number, $a2->tracking_number], $groups->firstWhere('rider.id', $riderA->id)['parcels'] ? array_column($groups->firstWhere('rider.id', $riderA->id)['parcels'], 'tracking_number') : []);
        $this->assertSame([$b1->tracking_number], array_column($groups->firstWhere('rider.id', $riderB->id)['parcels'], 'tracking_number'));
        $this->assertStringNotContainsString($sorted->tracking_number, $res->getContent());
        $this->assertStringNotContainsString($theirs->tracking_number, $res->getContent());

        // The other hub sees only its own, and a rider is not a hub.
        $other = $this->actingAs($this->otherHubUser, 'sanctum')->getJson('/api/v1/hub/dispatch/awaiting-pickup')->assertOk();
        $this->assertSame([$theirs->tracking_number], array_column($other->json('data.0.parcels'), 'tracking_number'));
        [$riderUser] = $this->createRider();
        $this->actingAs($riderUser, 'sanctum')->getJson('/api/v1/hub/dispatch/awaiting-pickup')->assertStatus(403);
    }

    public function test_email_falls_back_to_app_url_and_uses_singular_wording(): void
    {
        Mail::fake();
        config(['app.frontend_url' => null, 'app.url' => 'https://api.lovedit.example']);

        [, $rider] = $this->eligibleRider();
        $p = $this->createParcel($this->hub, self::CODE_A);

        $this->dispatchTo($rider, [$p->tracking_number])->assertOk();

        Mail::assertQueued(ParcelsAssignedMail::class, function (ParcelsAssignedMail $mail) {
            $html = $mail->render();
            $this->assertStringContainsString('1 parcel', $html);
            $this->assertStringNotContainsString('1 parcels', $html);
            $this->assertStringContainsString('https://api.lovedit.example/rider/login', $html);

            return true;
        });
    }

    public function test_no_email_is_sent_when_the_assignment_is_rejected(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider([self::CODE_B]);
        $p = $this->createParcel($this->hub, self::CODE_A);

        $this->dispatchTo($rider, [$p->tracking_number])->assertStatus(422);

        Mail::assertNothingQueued();
    }

    public function test_a_mail_failure_does_not_undo_the_assignment(): void
    {
        [, $rider] = $this->eligibleRider();
        $p = $this->createParcel($this->hub, self::CODE_A);

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));
        Log::spy();

        $this->dispatchTo($rider, [$p->tracking_number])
            ->assertOk()
            ->assertJsonPath('assigned_count', 1);

        $p->refresh();
        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $p->status);
        $this->assertEquals($rider->id, $p->assigned_rider_id);
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $p->order->fresh()->status);
        Log::shouldHaveReceived('error')->withArgs(fn ($message) => str_contains($message, 'smtp is down'))->once();
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_seller_ready_rider_pickup_hub_receive_sort_assign_and_both_sides_see_assigned_to_rider(): void
    {
        Mail::fake();
        [$riderUser, $rider] = $this->createRider();
        // Covers the seller's pickup barangay (for the first-mile pickup) and the buyer's barangay (for delivery).
        $this->assign($rider, [self::CODE_A, self::CODE_C]);

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

        // Not dispatchable before the hub has received and sorted it.
        $this->dispatchTo($rider, [$tracking])->assertStatus(422);

        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/parcels/{$tracking}/receive")->assertOk();
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => [$tracking]])->assertOk();

        $batch = collect($this->batches()->assertOk()->json('data'))->firstWhere('barangay_code', self::CODE_C);
        $this->assertNotNull($batch);
        $this->assertEquals(1, $batch['parcel_count']);
        $this->assertSame(1, $batch['eligible_riders']);

        $this->dispatchTo($rider, [$tracking])->assertOk()->assertJsonPath('assigned_count', 1);
        $this->assertSame(1, Mail::queued(\App\Mail\ParcelsAssignedMail::class)->count() + Mail::queued(\App\Mail\ParcelReturnedMail::class)->count()); // hub mails only; order-status notices are NoticeMail

        $sellerView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$order->id}");
        $sellerView->assertOk()->assertJsonPath('data.status', OrderStatus::ASSIGNED_TO_RIDER->value);
        $this->assertContains(OrderStatus::ASSIGNED_TO_RIDER->value, collect($sellerView->json('data.status_history'))->pluck('to_status')->all());

        $buyerView = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}");
        $buyerView->assertOk()->assertJsonPath('data.status', OrderStatus::ASSIGNED_TO_RIDER->value);
        $this->assertContains(OrderStatus::ASSIGNED_TO_RIDER->value, collect($buyerView->json('data.status_history'))->pluck('to_status')->all());
    }

    /**
     * @param array<int, Parcel> $parcels
     */
    private function assertNothingChanged(array $parcels): void
    {
        foreach ($parcels as $parcel) {
            $fresh = $parcel->fresh();
            $this->assertEquals($parcel->status, $fresh->status);
            $this->assertNull($fresh->assigned_rider_id);
            $this->assertNull($fresh->assigned_at);
            $this->assertEquals(0, OrderStatusHistory::where('order_id', $parcel->order_id)->count());
        }
    }
}
