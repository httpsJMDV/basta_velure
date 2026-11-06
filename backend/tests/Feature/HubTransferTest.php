<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Courier\HubRouter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Hub to hub: a parcel received by a hub that does not cover the buyer's barangay goes on to the hub that does, and
 * every hand-over shows on the timeline. The order stays AT_SORTING_CENTER on the way.
 */
class HubTransferTest extends TestCase
{
    use DatabaseTransactions;

    private const SANTA_CRUZ = '0403424001';

    private const PILA = '0403424999';

    private User $firstUser;

    private User $secondUser;

    private SortingCenter $first;

    private SortingCenter $second;

    private int $company;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->company = $this->company('Line Haul');
        [$this->firstUser, $this->first] = $this->hub('Santa Cruz Hub', [self::SANTA_CRUZ]);
        [$this->secondUser, $this->second] = $this->hub('Pila Hub', [self::PILA]);
    }

    protected function tearDown(): void
    {
        HubRouter::assumeReady(null);
        parent::tearDown();
    }

    private function company(string $name): int
    {
        $code = strtoupper(substr(uniqid(), -6));

        return (int) LogisticsCompany::create([
            'name' => $name . ' ' . $code, 'code' => $code, 'slug' => strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ])->id;
    }

    private function user(string $tag, string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63918' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male', 'role' => $role, 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: SortingCenter} */
    private function hub(string $name, array $coverage, ?int $company = null): array
    {
        $user = $this->user('hub', 'buyer');
        $hub = SortingCenter::forceCreate([
            'user_id' => $user->id, 'hub_name' => $name . ' ' . uniqid(), 'address_province' => 'Laguna', 'address_city' => $name === 'Pila Hub' ? 'Pila' : 'Santa Cruz',
            'address_barangay' => 'Real', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => $coverage, 'logistics_company_id' => $company ?? $this->company,
        ]);

        return [$user, $hub];
    }

    private function parcel(string $barangay, string $status = Parcel::STATUS_PICKED_UP, OrderStatus $orderStatus = OrderStatus::PICKED_UP, ?SortingCenter $at = null): Parcel
    {
        $seller = $this->user('seller');
        $buyer = $this->user('buyer');
        $order = Order::forceCreate([
            'buyer_id' => $buyer->id, 'order_number' => 'VEL-' . strtoupper(uniqid()), 'status' => $orderStatus->value,
            'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'cod', 'shipping_name' => 'Ana', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 St', 'shipping_province' => 'Laguna', 'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043424000', 'shipping_barangay_code' => $barangay,
        ]);

        return Parcel::forceCreate([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'tracking_number' => 'LIT-' . strtoupper(uniqid()), 'status' => $status,
            'logistics_company_id' => $this->company, 'sorting_center_id' => ($at ?? $this->first)->id, 'destination_barangay' => 'Santa Clara',
            'destination_barangay_code' => $barangay, 'picked_up_at' => now()->subHour(),
            'pickup_address_snapshot' => ['shop_name' => 'Marco Gadgets', 'barangay' => 'Bubukal', 'city' => 'Santa Cruz'],
            'recipient_snapshot' => ['name' => 'Ana Santos', 'barangay' => 'Santa Clara', 'city' => 'Pila', 'province' => 'Laguna'],
        ]);
    }

    private function asHub(User $user): void
    {
        Sanctum::actingAs($user->fresh());
    }

    private function receive(Parcel $parcel, User $by)
    {
        $this->asHub($by);

        return $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive");
    }

    private function toTheSecondHub(): Parcel
    {
        $parcel = $this->parcel(self::PILA);
        $this->receive($parcel, $this->firstUser)->assertOk();
        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();

        return $parcel->fresh();
    }

    public function test_a_parcel_for_a_barangay_this_hub_covers_stays_here(): void
    {
        $parcel = $this->parcel(self::SANTA_CRUZ);

        $this->receive($parcel, $this->firstUser)->assertOk()->assertJsonPath('data.next_hub', null);

        $this->assertNull($parcel->fresh()->destination_hub_id);
        $this->assertSame(1, $parcel->hubStops()->count());
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('meta.total_parcels', 0);
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 1);
    }

    public function test_a_parcel_for_another_hubs_barangay_is_listed_to_send_and_not_to_sort(): void
    {
        $parcel = $this->parcel(self::PILA);

        $this->receive($parcel, $this->firstUser)->assertOk()->assertJsonPath('data.next_hub', $this->second->hub_name);

        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 0);
        $this->getJson('/api/v1/hub/transfers')->assertOk()
            ->assertJsonPath('meta.total_parcels', 1)
            ->assertJsonPath('data.0.hub.name', $this->second->hub_name)
            ->assertJsonPath('data.0.tracking_numbers.0', $parcel->tracking_number);
        $this->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => [$parcel->tracking_number]])->assertStatus(422);
    }

    public function test_only_the_same_couriers_hub_can_be_the_next_one(): void
    {
        $other = $this->company('Rival');
        $this->hub('Rival Hub', ['0499999999'], $other);
        $parcel = $this->parcel('0499999999');

        $this->receive($parcel, $this->firstUser)->assertOk()->assertJsonPath('data.next_hub', null);

        $this->assertNull($parcel->fresh()->destination_hub_id);
    }

    public function test_when_nobody_covers_the_barangay_the_first_hub_keeps_it(): void
    {
        $parcel = $this->parcel('0400000000');

        $this->receive($parcel, $this->firstUser)->assertOk();

        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 1);
    }

    public function test_sending_moves_it_to_the_next_hubs_expected_list_and_keeps_the_order_status(): void
    {
        $parcel = $this->toTheSecondHub();

        $this->assertSame($this->second->id, $parcel->sorting_center_id);
        $this->assertNotNull($parcel->transit_since);
        $this->assertSame(OrderStatus::AT_SORTING_CENTER->value, $parcel->order->status->value);
        $this->assertNotNull(ParcelHubStop::where('parcel_id', $parcel->id)->where('position', 0)->value('departed_at'));

        // The hub that sent it no longer has it.
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('meta.total_parcels', 0)->assertJsonPath('meta.sent_today', 1);

        $this->asHub($this->secondUser);
        $this->getJson('/api/v1/hub/intake/expected')->assertOk()
            ->assertJsonPath('data.0.tracking_number', $parcel->tracking_number)
            ->assertJsonPath('data.0.coming_from', $this->first->hub_name);
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('meta.on_the_way_here', 1);
        // It is not here yet, so it cannot be sorted here.
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 0);
        $this->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => [$parcel->tracking_number]])->assertStatus(422);
    }

    public function test_the_next_hub_scans_it_in_and_sorts_it_as_usual(): void
    {
        $parcel = $this->toTheSecondHub();

        $this->receive($parcel, $this->secondUser)->assertOk();

        $parcel->refresh();
        $this->assertNull($parcel->transit_since);
        $this->assertFalse($parcel->awaitingTransfer());
        $this->assertNotNull(ParcelHubStop::where('parcel_id', $parcel->id)->where('position', 1)->value('arrived_at'));
        $this->getJson('/api/v1/hub/intake/received-today')->assertOk()->assertJsonPath('data.0.tracking_number', $parcel->tracking_number);
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 1);
        $this->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();

        // A second scan is a repeat, not a second arrival.
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertStatus(409);
    }

    public function test_each_side_of_a_transfer_is_told_it_was_sent_and_received(): void
    {
        $parcel = $this->toTheSecondHub();

        // The next hub hears a parcel is on its way.
        $incoming = $this->secondUser->notifications()->where('data->kind', 'hub.transfer_incoming')->first();
        $this->assertNotNull($incoming);
        $this->assertStringContainsString($parcel->tracking_number, $incoming->data['body']);
        $this->assertStringContainsString($this->first->hub_name, $incoming->data['body']);
        $this->assertSame(0, $this->firstUser->notifications()->where('data->kind', 'hub.transfer_received')->count());

        // When it scans it in, the hub that sent it gets the confirmation.
        $this->receive($parcel, $this->secondUser)->assertOk();
        $received = $this->firstUser->notifications()->where('data->kind', 'hub.transfer_received')->first();
        $this->assertNotNull($received);
        $this->assertStringContainsString($this->second->hub_name, $received->data['body']);

        // A repeat scan confirms nothing twice.
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertStatus(409);
        $this->assertSame(1, $this->firstUser->notifications()->where('data->kind', 'hub.transfer_received')->count());
    }

    public function test_a_hub_cannot_send_or_receive_another_hubs_parcel(): void
    {
        $parcel = $this->parcel(self::PILA);
        $this->receive($parcel, $this->firstUser)->assertOk();

        $this->asHub($this->secondUser);
        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number]])->assertStatus(422);
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertNotFound();
        $this->assertNull($parcel->fresh()->transit_since);
    }

    public function test_a_parcel_that_stays_cannot_be_sent(): void
    {
        $parcel = $this->parcel(self::SANTA_CRUZ);
        $this->receive($parcel, $this->firstUser)->assertOk();

        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number]])->assertStatus(422);
    }

    public function test_one_bad_parcel_stops_the_whole_batch(): void
    {
        $good = $this->parcel(self::PILA);
        $bad = $this->parcel(self::SANTA_CRUZ);
        $this->receive($good, $this->firstUser)->assertOk();
        $this->receive($bad, $this->firstUser)->assertOk();

        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$good->tracking_number, $bad->tracking_number]])->assertStatus(422);

        $this->assertNull($good->fresh()->transit_since);
    }

    public function test_every_hand_over_is_on_the_timeline_with_the_next_hub_named(): void
    {
        $parcel = $this->toTheSecondHub();
        $this->receive($parcel, $this->secondUser)->assertOk();

        $notes = OrderStatusHistory::where('order_id', $parcel->order_id)->pluck('note')->implode(' | ');
        $this->assertStringContainsString('Next stop: ' . $this->second->hub_name, $notes);
        $this->assertStringContainsString('Package arrived at ' . $this->second->hub_name, $notes);

        $events = collect($this->getJson("/api/v1/parcels/{$parcel->tracking_number}/tracking")->assertOk()->json('data.events'));
        $this->assertTrue($events->contains('title', 'Left the hub'));
        $this->assertTrue($events->contains('title', 'Arrived at the next hub'));
    }

    public function test_the_journey_shows_each_hub_in_order_without_the_buyers_name(): void
    {
        $parcel = $this->toTheSecondHub();

        $this->asHub($this->secondUser);
        $response = $this->getJson("/api/v1/parcels/{$parcel->tracking_number}/tracking")->assertOk();
        $journey = $response->json('data.journey');

        $this->assertSame(['shop', 'hub', 'hub', 'buyer'], array_column($journey, 'kind'));
        $this->assertSame('Marco Gadgets', $journey[0]['title']);
        $this->assertSame($this->first->hub_name, $journey[1]['title']);
        $this->assertSame('done', $journey[1]['state']);
        $this->assertSame($this->second->hub_name, $journey[2]['title']);
        $this->assertTrue($journey[2]['moving_here']);
        $this->assertSame('On the way here', $journey[2]['label']);
        $this->assertSame('Delivery to Santa Clara', $journey[3]['title']);
        $this->assertStringNotContainsString('Ana', json_encode($journey));
    }

    public function test_a_rider_collecting_a_parcel_sees_where_it_goes_before_any_hub_has_it(): void
    {
        $rider = Rider::create([
            'user_id' => $this->user('rider', 'rider')->id, 'sorting_center_id' => $this->first->id, 'vehicle_type' => Rider::VEHICLE_TRICYCLE, 'plate_number' => 'AB-' . random_int(1000, 9999),
            'or_cr_path' => 'x', 'drivers_license_path' => 'x', 'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        $parcel = $this->parcel(self::PILA);
        $parcel->forceFill(['pickup_rider_id' => $rider->id])->save();

        $this->assertSame([$this->first->hub_name, $this->second->hub_name], app(HubRouter::class)->path($parcel->fresh()));
        $groups = app(HubRouter::class)->groupedPaths(collect([$parcel->fresh()]), $this->first);
        $this->assertSame(1, $groups[0]['parcel_count']);
        $this->assertSame($parcel->tracking_number, $groups[0]['tracking_number']);
    }

    public function test_a_parcel_from_before_transfers_has_a_one_hub_journey(): void
    {
        $parcel = $this->parcel(self::PILA, Parcel::STATUS_AT_SORTING_CENTER, OrderStatus::AT_SORTING_CENTER);
        $parcel->forceFill(['scanned_in_at' => now()])->save();

        $journey = app(HubRouter::class)->journey($parcel->fresh());

        $this->assertSame(['shop', 'hub', 'buyer'], array_column($journey, 'kind'));
        $this->assertSame('current', $journey[1]['state']);
        $this->asHub($this->firstUser);
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 1);
    }

    public function test_the_site_keeps_working_before_the_live_database_is_migrated(): void
    {
        HubRouter::assumeReady(false);
        $parcel = $this->parcel(self::PILA);

        // The old flow, from scan to sort, with no transfer and no new table touched.
        $this->receive($parcel, $this->firstUser)->assertOk()->assertJsonPath('data.next_hub', null);
        $this->assertSame(0, $parcel->hubStops()->count());
        $this->getJson('/api/v1/hub/intake/expected')->assertOk();
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('data', []);
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 1);
        $this->getJson("/api/v1/parcels/{$parcel->tracking_number}/tracking")->assertOk();
    }
}
