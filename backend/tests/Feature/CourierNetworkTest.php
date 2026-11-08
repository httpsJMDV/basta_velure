<?php

namespace Tests\Feature;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
use App\Models\HubCoverage;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use App\Services\Courier\HubRouter;
use App\Services\Courier\ReturnPickups;
use App\Services\Courier\ReturnToSender;
use App\Services\CourierAssigner;
use App\Support\PhPlaces;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The nationwide network (docs/api/courier-network.md): routes through regional and island gateways, ships and
 * planes between island groups, failed deliveries and buyer returns going back through the hubs, the checkout's
 * coverage check and delivery estimate, the truck planner and the coverage page.
 */
class CourierNetworkTest extends TestCase
{
    use DatabaseTransactions;

    // Real PSGC barangays: Santa Cruz and Pila (Laguna), Calamba, Manila, Davao City and Digos.
    private const SANTA_CRUZ = '043426001';
    private const PILA = '043422001';
    private const CALAMBA = '043405001';
    private const MANILA = '133901001';
    private const DAVAO = '112402001';
    private const DIGOS = '112403001';

    private LogisticsCompany $company;

    /** @var array<string, array{0: User, 1: SortingCenter}> */
    private array $hubs = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        HubRouter::assumeReady(true);

        $code = strtoupper(substr(uniqid(), -6));
        $this->company = LogisticsCompany::create([
            'name' => 'Island Express ' . $code, 'code' => $code, 'slug' => strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
        $this->hubs['santa_cruz'] = $this->hub('Santa Cruz', [self::SANTA_CRUZ], '043426000', '040000000', 'luzon');
        $this->hubs['pila'] = $this->hub('Pila', [self::PILA], '043422000', '040000000', 'luzon');
        $this->hubs['calamba'] = $this->hub('Calamba', [self::CALAMBA], '043405000', '040000000', 'luzon', gateway: '040000000');
        $this->hubs['manila'] = $this->hub('Manila', [self::MANILA], '133900000', '130000000', 'luzon', gateway: '130000000', island: true);
        $this->hubs['davao'] = $this->hub('Davao City', [self::DAVAO], '112402000', '110000000', 'mindanao', gateway: '110000000', island: true);
        $this->hubs['digos'] = $this->hub('Digos', [self::DIGOS], '112403000', '110000000', 'mindanao');
    }

    protected function tearDown(): void
    {
        HubRouter::assumeReady(null);
        parent::tearDown();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function user(string $tag): User
    {
        return User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63918' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male', 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: SortingCenter} */
    private function hub(string $city, array $coverage, string $cityCode, string $region, string $group, ?string $gateway = null, bool $island = false): array
    {
        $user = $this->user('hub');
        $hub = SortingCenter::forceCreate([
            'user_id' => $user->id, 'hub_name' => "{$city} Hub " . uniqid(), 'address_province' => 'Somewhere', 'address_city' => $city,
            'address_barangay' => 'Poblacion', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => $coverage, 'logistics_company_id' => $this->company->id,
            'city_code' => $cityCode, 'province_code' => substr($cityCode, 0, 4) . '00000', 'region_code' => $region, 'island_group' => $group,
            'gateway_region_code' => $gateway, 'is_island_gateway' => $island,
        ]);

        return [$user, $hub];
    }

    private function rider(SortingCenter $hub, array $codes): Rider
    {
        $user = $this->user('rider');
        $rider = Rider::forceCreate([
            'user_id' => $user->id, 'sorting_center_id' => $hub->id, 'logistics_company_id' => $this->company->id, 'vehicle_type' => Rider::VEHICLE_MOTORCYCLE,
            'plate_number' => 'R' . random_int(10000, 99999), 'status' => Rider::STATUS_ACTIVE, 'is_online' => true, 'last_seen_at' => now(),
        ]);
        $rider->areaAssignments()->create(['sorting_center_id' => $hub->id, 'area_label' => 'All', 'coverage_barangays' => $codes, 'is_active' => true]);

        return $rider;
    }

    private function parcel(string $destination, string $pickup = self::SANTA_CRUZ): Parcel
    {
        $seller = $this->user('seller');
        $buyer = $this->user('buyer');
        $order = Order::forceCreate([
            'buyer_id' => $buyer->id, 'order_number' => 'VEL-' . strtoupper(uniqid()), 'status' => OrderStatus::PICKED_UP->value,
            'subtotal' => 100, 'shipping_fee' => 150, 'total' => 250, 'payment_method' => 'cod', 'shipping_name' => 'Ana', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 St', 'shipping_province' => 'Davao del Sur', 'shipping_city' => 'Digos', 'shipping_barangay' => 'Aplaya',
            'shipping_barangay_code' => $destination, 'logistics_company_id' => $this->company->id,
        ]);

        return Parcel::forceCreate([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'tracking_number' => 'LIT-' . strtoupper(uniqid()), 'status' => Parcel::STATUS_PICKED_UP,
            'logistics_company_id' => $this->company->id, 'sorting_center_id' => $this->hubs['santa_cruz'][1]->id, 'destination_barangay' => 'Aplaya',
            'destination_barangay_code' => $destination, 'pickup_barangay_code' => $pickup, 'picked_up_at' => now()->subHour(),
            'pickup_address_snapshot' => ['shop_name' => 'Laguna Crafts', 'barangay' => 'Poblacion', 'city' => 'Santa Cruz'],
            'recipient_snapshot' => ['name' => 'Ana Santos', 'barangay' => 'Aplaya', 'city' => 'Digos', 'province' => 'Davao del Sur', 'barangay_code' => $destination],
        ]);
    }

    private function as(string $hub): void
    {
        Sanctum::actingAs($this->hubs[$hub][0]->fresh());
    }

    /** @return list<string> hub keys of the parcel's stops, in order */
    private function stopsOf(Parcel $parcel): array
    {
        $byId = collect($this->hubs)->mapWithKeys(fn ($h, $key) => [$h[1]->id => $key]);

        return $parcel->hubStops()->orderBy('position')->get()->map(fn (ParcelHubStop $s) => $byId[$s->sorting_center_id] . ':' . $s->mode . ':' . $s->direction)->all();
    }

    /** Sends one hub's waiting parcels on by truck and has the next hub receive them. */
    private function hop(Parcel $parcel, string $from, string $to): void
    {
        $this->as($from);
        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();
        $this->as($to);
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();
    }

    // ── Routes ───────────────────────────────────────────────────────────────

    public function test_a_parcel_from_laguna_to_davao_goes_through_both_island_gateways_and_crosses_by_sea(): void
    {
        $parcel = $this->parcel(self::DIGOS);
        $this->as('santa_cruz');
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();

        $this->assertSame([
            'santa_cruz:truck:forward', 'calamba:truck:forward', 'manila:truck:forward', 'davao:sea:forward', 'digos:truck:forward',
        ], $this->stopsOf($parcel));
        $this->assertSame($this->hubs['digos'][1]->id, $parcel->fresh()->destination_hub_id);

        // The first hub sees it under For other hubs, going to the regional gateway by truck.
        $this->getJson('/api/v1/hub/transfers')->assertOk()
            ->assertJsonPath('data.0.hub.id', $this->hubs['calamba'][1]->id)
            ->assertJsonPath('data.0.mode', 'truck')
            ->assertJsonPath('data.0.hub.gateway', 'Regional gateway');

        $this->hop($parcel, 'santa_cruz', 'calamba');
        $this->hop($parcel, 'calamba', 'manila');

        // At the Luzon island gateway it waits for a ship or a plane, never a truck.
        $this->as('manila');
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('data.0.mode', 'sea')->assertJsonPath('meta.is_gateway', true);
        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number]])->assertStatus(422)->assertJsonValidationErrors('mode');
        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number], 'mode' => 'sea'])
            ->assertStatus(422)->assertJsonValidationErrors('carrier_name');

        $sent = $this->postJson('/api/v1/hub/transfers/send', [
            'tracking_numbers' => [$parcel->tracking_number], 'mode' => 'air', 'carrier_name' => 'Domestic air cargo', 'carrier_reference' => 'AWB-123456',
        ])->assertOk()->assertJsonPath('trip.mode', 'air')->assertJsonPath('trip.driver', null)->assertJsonPath('trip.carrier_reference', 'AWB-123456');
        $trip = TruckTrip::findOrFail($sent->json('trip.id'));
        $this->assertSame(0.0, (float) $trip->pay_amount, 'A plane is not one of the courier\'s drivers: nothing to pay per trip.');
        $this->assertNotNull($trip->eta_at);
        $this->assertSame('air', $parcel->hubStops()->where('sorting_center_id', $this->hubs['davao'][1]->id)->value('mode'));

        // Davao receives the whole plane at once, then trucks it to Digos, which sorts it for delivery.
        $this->as('davao');
        $this->postJson("/api/v1/hub/truck-trips/{$trip->id}/receive")->assertOk()->assertJsonPath('data.status', 'completed');
        $this->hop($parcel, 'davao', 'digos');

        $parcel->refresh();
        $this->assertSame($this->hubs['digos'][1]->id, $parcel->sorting_center_id);
        $this->assertFalse($parcel->awaitingTransfer());
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 1);

        // The buyer's tracking shows every hub, the gateways and how the parcel got to each.
        $journey = app(HubRouter::class)->journey($parcel);
        $hubs = array_values(array_filter($journey, fn ($n) => $n['kind'] === 'hub'));
        $this->assertCount(5, $hubs);
        $this->assertSame('air', $hubs[3]['arrives_by']);
        $this->assertSame('Island gateway', $hubs[2]['gateway']);
    }

    public function test_only_an_island_gateway_sends_by_ship_or_plane_and_only_across_the_sea(): void
    {
        $parcel = $this->parcel(self::PILA);
        $this->as('santa_cruz');
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();
        // Same region: one truck ride, no gateway.
        $this->assertSame(['santa_cruz:truck:forward', 'pila:truck:forward'], $this->stopsOf($parcel));

        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number], 'mode' => 'sea', 'carrier_name' => 'Ferry', 'carrier_reference' => 'BL-1'])
            ->assertStatus(422)->assertJsonValidationErrors('mode');

        // An island gateway cannot put a parcel that stays on Luzon on a ship either.
        $other = $this->parcel(self::PILA);
        $other->forceFill(['sorting_center_id' => $this->hubs['manila'][1]->id])->save();
        $this->as('manila');
        $this->postJson("/api/v1/hub/parcels/{$other->tracking_number}/receive")->assertOk();
        $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$other->tracking_number], 'mode' => 'sea', 'carrier_name' => 'Ferry', 'carrier_reference' => 'BL-1'])
            ->assertStatus(422)->assertJsonValidationErrors('mode');
    }

    // ── Back to the seller ───────────────────────────────────────────────────

    public function test_a_failed_delivery_in_davao_travels_back_through_the_hubs_before_a_rider_takes_it_home(): void
    {
        $parcel = $this->parcel(self::DIGOS);
        $this->as('santa_cruz');
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();
        $this->hop($parcel, 'santa_cruz', 'calamba');
        $this->hop($parcel, 'calamba', 'manila');
        $this->as('manila');
        $trip = $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number], 'mode' => 'sea', 'carrier_name' => 'Ferry', 'carrier_reference' => 'BL-77'])
            ->assertOk()->json('trip.id');
        $this->as('davao');
        $this->postJson("/api/v1/hub/truck-trips/{$trip}/receive")->assertOk();
        $this->hop($parcel, 'davao', 'digos');

        // The buyer refuses it at the door.
        $parcel->refresh()->forceFill(['status' => Parcel::STATUS_DELIVERY_FAILED, 'delivery_attempts' => 1])->save();
        app(ReturnToSender::class)->afterFailure($parcel, DeliveryFailureReason::REFUSED);

        $parcel->refresh();
        $this->assertSame(Parcel::STATUS_RETURN_TO_SENDER, $parcel->status);
        $this->assertSame([
            'santa_cruz:truck:forward', 'calamba:truck:forward', 'manila:truck:forward', 'davao:sea:forward', 'digos:truck:forward',
            'davao:truck:return', 'manila:sea:return', 'calamba:truck:return', 'santa_cruz:truck:return',
        ], $this->stopsOf($parcel));
        $this->assertTrue(app(HubRouter::class)->returnStillTravelling($parcel));

        // Digos cannot hand it back itself, and lists it to send on.
        $this->as('digos');
        $this->postJson("/api/v1/hub/deliveries/{$parcel->tracking_number}/return-to-seller", [])->assertStatus(409);
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('data.0.counts.return_to_sender', 1);

        $this->hop($parcel, 'digos', 'davao');
        $this->as('davao');
        $trip = $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number], 'mode' => 'sea', 'carrier_name' => 'Ferry', 'carrier_reference' => 'BL-78'])
            ->assertOk()->json('trip.id');
        $this->as('manila');
        $this->postJson("/api/v1/hub/truck-trips/{$trip}/receive")->assertOk();
        $this->hop($parcel, 'manila', 'calamba');
        $this->hop($parcel, 'calamba', 'santa_cruz');

        $parcel->refresh();
        $this->assertSame(Parcel::STATUS_RETURN_TO_SENDER, $parcel->status);
        $this->assertSame($this->hubs['santa_cruz'][1]->id, $parcel->sorting_center_id);
        $this->assertFalse(app(HubRouter::class)->returnStillTravelling($parcel));
        $journey = app(HubRouter::class)->journey($parcel);
        $this->assertCount(4, array_filter($journey, fn ($n) => ($n['direction'] ?? null) === 'return'));
    }

    public function test_a_buyer_return_far_from_the_shop_goes_back_through_the_hubs_to_the_shop(): void
    {
        Storage::fake('ids');
        $parcel = $this->parcel(self::DIGOS);
        $this->as('santa_cruz');
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();
        $this->hop($parcel, 'santa_cruz', 'calamba');
        $this->hop($parcel, 'calamba', 'manila');
        $this->as('manila');
        $trip = $this->postJson('/api/v1/hub/transfers/send', ['tracking_numbers' => [$parcel->tracking_number], 'mode' => 'sea', 'carrier_name' => 'Ferry', 'carrier_reference' => 'BL-9'])
            ->assertOk()->json('trip.id');
        $this->as('davao');
        $this->postJson("/api/v1/hub/truck-trips/{$trip}/receive")->assertOk();
        $this->hop($parcel, 'davao', 'digos');

        $order = $parcel->order;
        $pickup = app(ReturnPickups::class)->book($order, null, 'seller', null);
        $this->assertTrue($pickup->goesThroughHubs());
        $this->assertSame($this->hubs['santa_cruz'][1]->id, $pickup->destination_hub_id);

        $collector = $this->rider($this->hubs['digos'][1], [self::DIGOS]);
        $this->as('digos');
        $this->postJson("/api/v1/hub/return-pickups/{$pickup->id}/assign", ['rider_id' => $collector->id])->assertOk();

        Sanctum::actingAs($collector->user->fresh());
        $this->post("/api/v1/rider/return-pickups/{$pickup->id}/collected", ['photo' => UploadedFile::fake()->image('item.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->getJson('/api/v1/rider/return-pickups')->assertOk()->assertJsonPath('data.0.my_step', 'drop_at_hub');
        // Far from the shop: it cannot be taken straight there.
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/delivered")->assertStatus(422);
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/dropped")->assertOk()->assertJsonPath('data.status', 'at_hub');

        // Digos sends it on with the parcels; each hub receives it by its RTN code or the whole trip.
        $this->as('digos');
        $this->getJson('/api/v1/hub/transfers')->assertOk()->assertJsonPath('data.0.counts.buyer_returns', 1)->assertJsonPath('data.0.return_codes.0', $pickup->code);
        $this->postJson('/api/v1/hub/transfers/send', ['return_codes' => [$pickup->code]])->assertOk();
        $this->as('davao');
        $this->getJson('/api/v1/hub/intake/expected')->assertOk()->assertJsonPath('meta.returns.0.code', $pickup->code);
        $this->postJson("/api/v1/hub/parcels/{$pickup->code}/receive")->assertOk();
        $trip = $this->postJson('/api/v1/hub/transfers/send', ['return_codes' => [$pickup->code], 'mode' => 'sea', 'carrier_name' => 'Ferry', 'carrier_reference' => 'BL-10'])
            ->assertOk()->json('trip.id');
        $this->as('manila');
        $this->postJson("/api/v1/hub/truck-trips/{$trip}/receive")->assertOk()->assertJsonPath('data.status', 'completed');
        foreach ([['manila', 'calamba'], ['calamba', 'santa_cruz']] as [$from, $to]) {
            $this->as($from);
            $this->postJson('/api/v1/hub/transfers/send', ['return_codes' => [$pickup->code]])->assertOk();
            $this->as($to);
            $this->postJson("/api/v1/hub/parcels/{$pickup->code}/receive")->assertOk();
        }

        // The shop's hub gives the last leg to its rider, who hands it to the shop.
        $pickup->refresh();
        $this->assertTrue(app(ReturnPickups::class)->readyForShopRider($pickup));
        $shopRider = $this->rider($this->hubs['santa_cruz'][1], [self::SANTA_CRUZ]);
        $this->as('santa_cruz');
        $this->postJson("/api/v1/hub/return-pickups/{$pickup->id}/assign", ['rider_id' => $shopRider->id])->assertOk()->assertJsonPath('data.status', 'out_to_shop');
        Sanctum::actingAs($shopRider->user->fresh());
        $this->getJson('/api/v1/rider/return-pickups')->assertOk()->assertJsonPath('data.0.my_step', 'deliver_to_shop');
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/delivered")->assertOk()->assertJsonPath('data.status', 'delivered');
    }

    // ── Checkout ─────────────────────────────────────────────────────────────

    public function test_checkout_needs_one_courier_with_hubs_at_both_ends_and_estimates_the_days(): void
    {
        $assigner = app(CourierAssigner::class);
        $this->assertTrue($assigner->canDeliver(self::SANTA_CRUZ, self::DIGOS));
        $this->assertFalse($assigner->canDeliver(self::SANTA_CRUZ, '175301001'), 'No hub of any courier covers this Palawan barangay.');
        $this->assertSame($this->company->id, $assigner->forRoute(self::SANTA_CRUZ, self::DIGOS));

        $this->assertSame(['min' => 5, 'max' => 8, 'kind' => 'other_island', 'label' => 'Luzon to Mindanao by sea'], PhPlaces::estimate(self::SANTA_CRUZ, self::DIGOS));
        $this->assertSame('same_province', PhPlaces::estimate(self::SANTA_CRUZ, self::PILA)['kind']);
        $this->assertSame('same_city', PhPlaces::estimate(self::DAVAO, '112402002')['kind']);
        $this->assertSame('same_island', PhPlaces::estimate(self::SANTA_CRUZ, self::MANILA)['kind']);
    }

    public function test_the_coverage_index_follows_a_hubs_coverage_list(): void
    {
        $hub = $this->hubs['pila'][1];
        $this->assertSame([self::PILA], HubCoverage::where('sorting_center_id', $hub->id)->pluck('barangay_code')->all());
        $hub->update(['coverage_barangays' => [self::PILA, '043422002']]);
        $this->assertSame(2, HubCoverage::where('sorting_center_id', $hub->id)->count());
        $this->assertSame('043422000', HubCoverage::where('sorting_center_id', $hub->id)->value('city_code'));
        $this->assertSame('133900000', HubCoverage::cityOf('133914001'), 'Manila\'s districts belong to the City of Manila.');
    }

    // ── network:build ────────────────────────────────────────────────────────

    public function test_network_build_gives_a_courier_a_hub_in_every_city_with_gateways_and_runs_twice_safely(): void
    {
        Storage::fake('ids');
        Storage::fake('local');
        $code = strtoupper(substr(uniqid(), -6));
        $courier = LogisticsCompany::create([
            'name' => 'Nationwide ' . $code, 'code' => $code, 'slug' => 'nationwide-' . strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED,
            'submitted_at' => now(), 'owner_user_id' => $this->user('owner')->id,
        ]);

        // The command refuses the _test database on purpose; the service is what it runs.
        app(\App\Services\Courier\NetworkBuilder::class)->build([$courier->id]);

        $hubs = SortingCenter::where('logistics_company_id', $courier->id);
        $this->assertSame(count(PhPlaces::cities()), (clone $hubs)->count(), 'One hub for every city and municipality.');
        $this->assertSame(42046, HubCoverage::whereIn('sorting_center_id', (clone $hubs)->select('id'))->count(), 'Every barangay, once.');
        $this->assertSame(17, (clone $hubs)->whereNotNull('gateway_region_code')->count());
        $this->assertEqualsCanonicalizing(['Manila', 'Cebu City', 'Davao City'], (clone $hubs)->where('is_island_gateway', true)->pluck('address_city')->all());
        $this->assertSame(17, Rider::where('logistics_company_id', $courier->id)->count(), 'A starter rider at each gateway hub.');
        $davao = (clone $hubs)->where('city_code', '112402000')->firstOrFail();
        $this->assertSame('Nationwide ' . $code . ' Davao City Hub', $davao->hub_name);
        $this->assertTrue($davao->user->username !== null && str_starts_with($davao->user->username, 'hub-'));

        $before = [SortingCenter::count(), User::count(), Rider::count()];
        app(\App\Services\Courier\NetworkBuilder::class)->build([$courier->id]);
        $this->assertSame($before, [SortingCenter::count(), User::count(), Rider::count()]);
    }

    // ── Courier pages ────────────────────────────────────────────────────────

    private function asCourier(): User
    {
        $owner = $this->user('courier');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $owner->id, 'role' => 'owner']);
        $this->company->forceFill(['owner_user_id' => $owner->id])->save();
        Sanctum::actingAs($owner->fresh());

        return $owner;
    }

    public function test_the_truck_planner_turns_waiting_parcels_and_trips_into_a_driver_count(): void
    {
        foreach (range(1, 3) as $i) {
            $parcel = $this->parcel(self::DIGOS);
            $this->as('santa_cruz');
            $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();
        }
        $this->asCourier();
        $plan = $this->getJson('/api/v1/logistics/truck-planner')->assertOk()->json('data');
        $this->assertSame(3, $plan['demand']['waiting_now']);
        $this->assertSame(1, $plan['needed']['trips_per_day']);
        $this->assertSame(1, $plan['needed']['drivers']);
        $this->assertSame(2, $plan['needed']['recommended'], 'One driver plus a spare.');
        $this->assertSame('short', $plan['verdict']);
        $this->assertSame($this->hubs['calamba'][1]->id, $plan['routes'][0]['to']['id']);

        $this->putJson('/api/v1/logistics/truck-planner', ['capacity' => 5, 'shift_hours' => 99])->assertStatus(422)->assertJsonValidationErrors('shift_hours');
        $this->putJson('/api/v1/logistics/truck-planner', ['capacity' => 100, 'shift_hours' => 10])->assertOk()->assertJsonPath('data.settings.capacity', 100);
    }

    public function test_the_coverage_page_counts_hubs_riders_and_gateways_by_region(): void
    {
        $this->rider($this->hubs['davao'][1], [self::DAVAO]);
        $this->asCourier();

        $data = $this->getJson('/api/v1/logistics/coverage?region=110000000')->assertOk()->json('data');
        $this->assertSame(6, $data['totals']['hubs']);
        $this->assertSame(1, $data['totals']['riders']);
        $mindanao = collect($data['islands'])->firstWhere('key', 'mindanao');
        $this->assertSame($this->hubs['davao'][1]->id, $mindanao['gateway']['id']);
        $davao = collect($mindanao['regions'])->firstWhere('code', '110000000');
        $this->assertSame(2, $davao['hubs']);
        $this->assertSame(1, $davao['hubs_with_riders']);
        $this->assertSame('Davao Del Sur', collect($data['region']['provinces'])->firstWhere('code', '112400000')['name']);

        $this->getJson('/api/v1/logistics/coverage/hubs?region=110000000&show=no_riders')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->hubs['digos'][1]->id);
        $this->getJson('/api/v1/logistics/coverage/hubs?show=gateways')->assertOk()->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.gateway', 'Island gateway');
    }
}
