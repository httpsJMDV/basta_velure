<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Track package: who may read a parcel's tracking, what the timeline says, and when a courier's live position
 * is shown (only while a rider carries the parcel, and only the latest point).
 */
class ParcelTrackingTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $seller;
    private User $hubUser;
    private SortingCenter $hub;
    private User $riderUser;
    private Rider $rider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Carbon::setTestNow('2026-10-16 10:00:00');

        $this->buyer = $this->user('buyer', 'Ana');
        $this->seller = $this->user('buyer', 'Marco');
        [$this->hubUser, $this->hub] = $this->hub('Tracking Hub');
        [$this->riderUser, $this->rider] = $this->rider($this->hub);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Tester' . substr(uniqid(), -4),
            'email' => $role . '.' . uniqid() . '@example.com', 'phone' => '09' . rand(100000000, 999999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1992-02-02', 'sex' => 'male',
            'role' => $role, 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: SortingCenter} */
    private function hub(string $name): array
    {
        $user = $this->user('buyer', 'Hub');
        $hub = SortingCenter::create([
            'user_id' => $user->id, 'hub_name' => $name . ' ' . uniqid(), 'address_province' => 'Laguna',
            'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '123 Hub St',
            'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => ['043405001'],
        ]);

        return [$user, $hub];
    }

    /** @return array{0: User, 1: Rider} */
    private function rider(SortingCenter $hub): array
    {
        $user = $this->user('rider', 'Juan');
        $rider = Rider::create([
            'user_id' => $user->id, 'sorting_center_id' => $hub->id, 'vehicle_type' => Rider::VEHICLE_MOTORCYCLE,
            'plate_number' => 'AB-' . rand(1000, 9999), 'or_cr_path' => 'ids/a.pdf', 'drivers_license_path' => 'ids/b.pdf',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);

        return [$user, $rider];
    }

    /** @param array<string, mixed> $overrides */
    private function parcel(string $status, array $overrides = []): Parcel
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $this->buyer->id, 'status' => $status,
            'subtotal' => 500, 'shipping_fee' => 50, 'total' => 550, 'payment_method' => 'cod',
            'shipping_name' => 'Ana Buyer', 'shipping_phone' => '09998887777', 'shipping_address' => '12 Sampaguita St',
            'shipping_province' => 'Laguna', 'shipping_city' => 'Santa Cruz', 'shipping_barangay' => 'Bagumbayan',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043428000', 'shipping_barangay_code' => '043428001',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->seller->id, 'product_name' => 'Gadget', 'variant_label' => 'Std',
            'unit_price' => 500, 'quantity' => 1, 'subtotal' => 500, 'commission_rate' => 0.1, 'commission_amount' => 50,
            'seller_earnings' => 450, 'payout_status' => 'pending_release',
        ]);

        return Parcel::create(array_merge([
            'tracking_number' => 'LIT-261016-' . strtoupper(substr(uniqid(), -6)), 'order_id' => $order->id,
            'seller_id' => $this->seller->id, 'status' => $status, 'sorting_center_id' => $this->hub->id,
            'destination_barangay' => 'Bagumbayan', 'pickup_barangay' => 'Poblacion',
            'pickup_address_snapshot' => ['shop_name' => 'Marco Gadgets', 'street' => '12 Rizal St', 'barangay' => 'Poblacion', 'city' => 'Santa Cruz', 'province' => 'Laguna'],
            'recipient_snapshot' => ['name' => 'Ana Buyer', 'street' => '12 Sampaguita St', 'barangay' => 'Bagumbayan', 'city' => 'Santa Cruz', 'province' => 'Laguna'],
        ], $overrides));
    }

    private function history(Parcel $parcel, string $to, string $at, ?string $note = null): void
    {
        OrderStatusHistory::create([
            'order_id' => $parcel->order_id, 'from_status' => null, 'to_status' => $to, 'actor_type' => 'system',
            'note' => $note, 'created_at' => Carbon::parse($at),
        ]);
    }

    private function ping(float $lat = 14.2813, float $lng = 121.4160, ?string $at = null): void
    {
        $this->rider->forceFill([
            'last_latitude' => $lat, 'last_longitude' => $lng, 'last_heading' => 90, 'last_accuracy_m' => 12,
            'last_located_at' => $at ? Carbon::parse($at) : now(),
        ])->save();
    }

    private function url(Parcel $parcel): string
    {
        return '/api/v1/parcels/' . $parcel->tracking_number . '/tracking';
    }

    public function test_the_parties_may_read_it_and_everyone_else_gets_the_same_404(): void
    {
        $parcel = $this->parcel('OUT_FOR_DELIVERY', ['assigned_rider_id' => $this->rider->id]);
        $admin = $this->user('admin', 'Admin');

        foreach ([[$this->buyer, 'buyer'], [$this->seller, 'seller'], [$this->hubUser, 'hub'], [$this->riderUser, 'rider'], [$admin, 'admin']] as [$who, $role]) {
            $this->actingAs($who, 'sanctum')->getJson($this->url($parcel))->assertOk()->assertJsonPath('data.viewer_role', $role);
        }

        $stranger = $this->user('buyer', 'Stranger');
        [$otherHubUser] = $this->hub('Other Hub');
        [$otherRiderUser] = $this->rider($this->hub);
        $missing = $this->actingAs($stranger, 'sanctum')->getJson('/api/v1/parcels/LIT-000000-NOPE00/tracking');
        $missing->assertStatus(404);
        foreach ([$stranger, $otherHubUser, $otherRiderUser] as $who) {
            $this->actingAs($who, 'sanctum')->getJson($this->url($parcel))->assertStatus(404)
                ->assertJsonPath('message', $missing->json('message'));
        }

        $this->app['auth']->forgetGuards();
        $this->getJson($this->url($parcel))->assertStatus(401);
    }

    public function test_the_pickup_rider_may_read_it_while_they_collect_for_the_seller(): void
    {
        $parcel = $this->parcel('PICKED_UP', ['pickup_rider_id' => $this->rider->id]);
        $this->actingAs($this->riderUser, 'sanctum')->getJson($this->url($parcel))->assertOk()->assertJsonPath('data.viewer_role', 'rider');
    }

    public function test_the_timeline_is_written_from_the_history_newest_first(): void
    {
        $parcel = $this->parcel('DELIVERED', [
            'assigned_rider_id' => $this->rider->id, 'received_by' => 'Ana Buyer',
            'delivery_proof_path' => 'delivery-proofs/a.png', 'delivery_proof_path_2' => 'delivery-proofs/b.png',
        ]);
        $this->history($parcel, 'PREPARING', '2026-10-10 01:20:00');
        $this->history($parcel, 'PICKED_UP', '2026-10-10 08:07:00');
        $this->history($parcel, 'AT_SORTING_CENTER', '2026-10-10 10:20:00');
        $this->history($parcel, 'OUT_FOR_DELIVERY', '2026-10-11 07:18:00');
        $this->history($parcel, 'DELIVERED', '2026-10-11 10:25:00');

        $res = $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($parcel))->assertOk();
        $events = $res->json('data.events');

        $this->assertSame(['DELIVERED', 'OUT_FOR_DELIVERY', 'AT_SORTING_CENTER', 'PICKED_UP', 'PREPARING'], array_column($events, 'status'));
        $this->assertSame('Delivered', $events[0]['title']);
        $this->assertStringContainsString('Recipient: Ana Buyer', $events[0]['detail']);
        $this->assertTrue($events[0]['proof']);
        $this->assertFalse($events[1]['proof']);
        $this->assertStringContainsString('Poblacion', $events[3]['detail']);
        $this->assertStringContainsString('Calamba', $events[2]['detail']);
        $res->assertJsonPath('data.proof.count', 2)
            ->assertJsonPath('data.origin.name', 'Marco Gadgets')
            ->assertJsonPath('data.destination.barangay', 'Bagumbayan')
            ->assertJsonPath('data.hub.city', 'Calamba');
    }

    public function test_the_courier_position_is_shown_only_while_a_rider_carries_the_parcel(): void
    {
        $this->ping();

        // Out for delivery, fresh ping: live, and only the latest point is in the payload.
        $out = $this->parcel('OUT_FOR_DELIVERY', ['assigned_rider_id' => $this->rider->id]);
        $res = $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($out))->assertOk()
            ->assertJsonPath('data.courier.state', 'live')
            ->assertJsonPath('data.courier.leg', 'delivery')
            ->assertJsonPath('data.courier.vehicle_type', 'Motorcycle');
        $this->assertEqualsWithDelta(14.2813, $res->json('data.courier.location.latitude'), 0.00001);
        $this->assertEqualsWithDelta(121.4160, $res->json('data.courier.location.longitude'), 0.00001);
        $this->assertSame(90, $res->json('data.courier.location.heading'));
        // Name is first name and last initial only; no phone, no email, no ids.
        $this->assertMatchesRegularExpression('/^Juan T\.$/', $res->json('data.courier.name'));
        $this->assertStringNotContainsString($this->riderUser->email, $res->getContent());
        $this->assertStringNotContainsString($this->riderUser->phone, $res->getContent());

        // On the pickup leg the seller sees the rider coming.
        $pickup = $this->parcel('READY_FOR_PICKUP', ['pickup_rider_id' => $this->rider->id]);
        $this->actingAs($this->seller, 'sanctum')->getJson($this->url($pickup))->assertOk()
            ->assertJsonPath('data.courier.state', 'live')->assertJsonPath('data.courier.leg', 'pickup');

        // At the hub, with the seller, delivered or failed: the rider is not carrying it, so no position.
        foreach (['AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'DELIVERED', 'DELIVERY_FAILED', 'COMPLETED'] as $status) {
            $p = $this->parcel($status, ['assigned_rider_id' => $this->rider->id, 'pickup_rider_id' => $this->rider->id]);
            $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($p))->assertOk()
                ->assertJsonPath('data.courier.state', 'not_with_courier')
                ->assertJsonPath('data.courier.location', null);
        }
        // A parcel still waiting for a courier has none either.
        $waiting = $this->parcel('READY_FOR_PICKUP');
        $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($waiting))->assertJsonPath('data.courier.state', 'not_with_courier');
    }

    public function test_an_old_ping_goes_stale_and_then_not_sharing(): void
    {
        $out = $this->parcel('OUT_FOR_DELIVERY', ['assigned_rider_id' => $this->rider->id]);

        $this->ping(at: '2026-10-16 09:55:00'); // 5 minutes ago
        $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($out))
            ->assertJsonPath('data.courier.state', 'stale')
            ->assertJsonPath('data.courier.location.updated_at', Carbon::parse('2026-10-16 09:55:00')->toIso8601String());

        $this->ping(at: '2026-10-16 09:00:00'); // an hour ago
        $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($out))
            ->assertJsonPath('data.courier.state', 'not_sharing')->assertJsonPath('data.courier.location', null);

        $this->rider->forceFill(['last_located_at' => null, 'last_latitude' => null, 'last_longitude' => null])->save();
        $this->actingAs($this->buyer, 'sanctum')->getJson($this->url($out))->assertJsonPath('data.courier.state', 'not_sharing');
    }

    public function test_a_rider_with_a_parcel_can_share_a_location_and_only_the_latest_is_kept(): void
    {
        $this->parcel('OUT_FOR_DELIVERY', ['assigned_rider_id' => $this->rider->id]);

        $this->actingAs($this->riderUser, 'sanctum')->getJson('/api/v1/rider/location/status')->assertOk()
            ->assertJsonPath('data.sharing_required', true)->assertJsonPath('data.active_parcels', 1);

        $this->actingAs($this->riderUser, 'sanctum')->postJson('/api/v1/rider/location', ['latitude' => 14.28, 'longitude' => 121.41, 'heading' => 45, 'accuracy' => 8.4])->assertOk();
        $this->actingAs($this->riderUser, 'sanctum')->postJson('/api/v1/rider/location', ['latitude' => 14.29, 'longitude' => 121.42])->assertOk();

        $this->rider->refresh();
        $this->assertEqualsWithDelta(14.29, (float) $this->rider->last_latitude, 0.00001);
        $this->assertEqualsWithDelta(121.42, (float) $this->rider->last_longitude, 0.00001);
        $this->assertNull($this->rider->last_heading);
        $this->assertTrue($this->rider->last_located_at->equalTo(now()));
    }

    public function test_a_ping_is_validated_and_refused_when_the_rider_has_nothing_to_carry(): void
    {
        $this->actingAs($this->riderUser, 'sanctum')->getJson('/api/v1/rider/location/status')
            ->assertJsonPath('data.sharing_required', false);
        $this->actingAs($this->riderUser, 'sanctum')->postJson('/api/v1/rider/location', ['latitude' => 14.28, 'longitude' => 121.41])
            ->assertStatus(409);
        $this->assertNull($this->rider->fresh()->last_located_at);

        $this->parcel('OUT_FOR_DELIVERY', ['assigned_rider_id' => $this->rider->id]);
        foreach ([
            [['longitude' => 121.4], 'latitude'],
            [['latitude' => 14.2], 'longitude'],
            [['latitude' => 91, 'longitude' => 121.4], 'latitude'],
            [['latitude' => 14.2, 'longitude' => 181], 'longitude'],
            [['latitude' => 'north', 'longitude' => 121.4], 'latitude'],
            [['latitude' => 14.2, 'longitude' => 121.4, 'heading' => 400], 'heading'],
        ] as [$payload, $field]) {
            $this->actingAs($this->riderUser, 'sanctum')->postJson('/api/v1/rider/location', $payload)
                ->assertStatus(422)->assertJsonValidationErrors([$field]);
        }
    }

    public function test_only_riders_can_post_a_location_and_the_status_ignores_other_riders_parcels(): void
    {
        $buyer = $this->user('buyer', 'Plain');
        $this->actingAs($buyer, 'sanctum')->postJson('/api/v1/rider/location', ['latitude' => 14.2, 'longitude' => 121.4])->assertStatus(403);
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/rider/location', ['latitude' => 14.2, 'longitude' => 121.4])->assertStatus(403);

        [$otherUser] = $this->rider($this->hub);
        $this->parcel('OUT_FOR_DELIVERY', ['assigned_rider_id' => $this->rider->id]);
        $this->actingAs($otherUser, 'sanctum')->getJson('/api/v1/rider/location/status')->assertJsonPath('data.sharing_required', false);
    }
}
