<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use App\Services\Courier\HubRouter;
use App\Services\RiderAreaCoverage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Truck drivers carry parcels between the courier's hubs. The sending hub picks the driver, the next hub's scans
 * complete the trip, and the courier pays the driver per trip from its own money.
 */
class TruckTripTest extends TestCase
{
    use DatabaseTransactions;

    private const SANTA_CRUZ = '0403424001';

    private const PILA = '0403424999';

    private LogisticsCompany $company;

    private User $ops;

    private User $firstUser;

    private User $secondUser;

    private SortingCenter $first;

    private SortingCenter $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        HubRouter::assumeReady(true);

        $code = strtoupper(substr(uniqid(), -6));
        $this->company = LogisticsCompany::create([
            'name' => 'Line Haul ' . $code, 'code' => $code, 'slug' => strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
        $this->ops = $this->user('ops');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->ops->id, 'role' => 'owner']);
        [$this->firstUser, $this->first] = $this->hub('Santa Cruz Hub', [self::SANTA_CRUZ]);
        [$this->secondUser, $this->second] = $this->hub('Pila Hub', [self::PILA]);
    }

    protected function tearDown(): void
    {
        HubRouter::assumeReady(null);
        parent::tearDown();
    }

    private function user(string $tag, string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => ucfirst($tag), 'last_name' => 'Reyes', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63918' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male', 'role' => $role, 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: SortingCenter} */
    private function hub(string $name, array $coverage): array
    {
        $user = $this->user('hub');
        $hub = SortingCenter::forceCreate([
            'user_id' => $user->id, 'hub_name' => $name . ' ' . uniqid(), 'address_province' => 'Laguna', 'address_city' => 'Santa Cruz',
            'address_barangay' => 'Real', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => $coverage, 'logistics_company_id' => $this->company->id,
        ]);

        return [$user, $hub];
    }

    private function driver(string $duty = Rider::DUTY_TRUCK, string $status = Rider::STATUS_ACTIVE): Rider
    {
        $user = $this->user('driver', 'rider');

        return Rider::forceCreate([
            'user_id' => $user->id, 'logistics_company_id' => $this->company->id, 'sorting_center_id' => $this->first->id,
            'vehicle_type' => $duty === Rider::DUTY_TRUCK ? 'Truck' : 'Motorcycle', 'duty' => $duty,
            'plate_number' => 'TRK' . random_int(1000, 9999), 'status' => $status, 'activated_at' => now(),
        ])->fresh();
    }

    private function parcel(string $barangay = self::PILA): Parcel
    {
        $order = Order::forceCreate([
            'buyer_id' => $this->user('buyer')->id, 'order_number' => 'VEL-' . strtoupper(uniqid()), 'status' => OrderStatus::PICKED_UP->value,
            'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'cod', 'shipping_name' => 'Ana', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 St', 'shipping_province' => 'Laguna', 'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043424000', 'shipping_barangay_code' => $barangay,
        ]);

        $parcel = Parcel::forceCreate([
            'order_id' => $order->id, 'seller_id' => $this->user('seller')->id, 'tracking_number' => 'LIT-' . strtoupper(uniqid()), 'status' => Parcel::STATUS_PICKED_UP,
            'logistics_company_id' => $this->company->id, 'sorting_center_id' => $this->first->id, 'destination_barangay' => 'Santa Clara',
            'destination_barangay_code' => $barangay, 'picked_up_at' => now()->subHour(),
            'pickup_address_snapshot' => ['shop_name' => 'Marco Gadgets', 'barangay' => 'Bubukal', 'city' => 'Santa Cruz'],
            'recipient_snapshot' => ['name' => 'Ana Santos', 'barangay' => 'Santa Clara', 'city' => 'Pila', 'province' => 'Laguna'],
        ]);

        Sanctum::actingAs($this->firstUser->fresh());
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();

        return $parcel->fresh();
    }

    /** @param list<Parcel> $parcels */
    private function send(array $parcels, ?Rider $driver)
    {
        Sanctum::actingAs($this->firstUser->fresh());

        return $this->postJson('/api/v1/hub/transfers/send', array_filter([
            'tracking_numbers' => array_map(fn (Parcel $p) => $p->tracking_number, $parcels),
            'driver_id'        => $driver?->id,
        ]));
    }

    public function test_the_hub_lists_its_couriers_truck_drivers_and_not_delivery_riders(): void
    {
        $truck = $this->driver();
        $this->driver(Rider::DUTY_DELIVERY);
        $this->driver(Rider::DUTY_TRUCK, Rider::STATUS_SUSPENDED);

        Sanctum::actingAs($this->firstUser->fresh());
        $this->getJson('/api/v1/hub/truck-drivers')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $truck->id)
            ->assertJsonPath('data.0.busy', false);
    }

    public function test_once_the_courier_has_truck_drivers_a_transfer_needs_one(): void
    {
        $this->driver();
        $parcel = $this->parcel();

        $this->send([$parcel], null)->assertStatus(422)->assertJsonValidationErrors('driver_id');
        $this->assertNull($parcel->fresh()->transit_since);
    }

    public function test_without_truck_drivers_a_transfer_works_as_before(): void
    {
        $parcel = $this->parcel();

        $this->send([$parcel], null)->assertOk()->assertJsonPath('trip', null);
        $this->assertSame(0, TruckTrip::count());
    }

    public function test_sending_with_a_driver_opens_a_trip_and_tells_the_driver(): void
    {
        $driver = $this->driver();
        $parcels = [$this->parcel(), $this->parcel()];

        $this->send($parcels, $driver)->assertOk()
            ->assertJsonPath('trip.status', TruckTrip::STATUS_ON_THE_WAY)
            ->assertJsonPath('trip.parcel_count', 2)
            ->assertJsonPath('trip.to_hub.id', $this->second->id)
            ->assertJsonPath('trip.pay_amount', 800);

        $trip = TruckTrip::firstOrFail();
        $this->assertSame($driver->plate_number, $trip->plate_number);
        $this->assertSame(1, $driver->user->notifications()->where('data->kind', 'rider.truck_trip')->count());
        $this->assertTrue(AuditLog::where('action', 'truck_trip.departed')->where('subject_id', $trip->id)->exists());
        $this->assertTrue(\App\Models\OrderStatusHistory::where('order_id', $parcels[0]->order_id)->where('note', 'like', '%left%on a truck%')->exists());

        // The driver is busy until the trip is done.
        Sanctum::actingAs($this->firstUser->fresh());
        $this->getJson('/api/v1/hub/truck-drivers')->assertOk()->assertJsonPath('data.0.busy', true);
        $this->send([$this->parcel()], $driver)->assertStatus(422)->assertJsonValidationErrors('driver_id');
    }

    public function test_a_delivery_rider_or_another_couriers_driver_cannot_drive(): void
    {
        $rider = $this->driver(Rider::DUTY_DELIVERY);
        $parcel = $this->parcel();

        $this->send([$parcel], $rider)->assertStatus(422)->assertJsonValidationErrors('driver_id');
    }

    public function test_the_trip_completes_when_the_next_hub_scans_in_every_parcel(): void
    {
        $driver = $this->driver();
        [$a, $b] = [$this->parcel(), $this->parcel()];
        $this->send([$a, $b], $driver)->assertOk();
        $trip = TruckTrip::firstOrFail();

        Sanctum::actingAs($driver->user->fresh());
        $this->postJson("/api/v1/rider/trips/{$trip->id}/arrived")->assertOk();
        $this->assertSame(1, $this->secondUser->notifications()->where('data->kind', 'hub.truck_arrived')->count());

        Sanctum::actingAs($this->secondUser->fresh());
        $this->postJson("/api/v1/hub/parcels/{$a->tracking_number}/receive")->assertOk();
        $this->assertSame(1, $trip->fresh()->received_count);
        $this->assertSame(TruckTrip::STATUS_ON_THE_WAY, $trip->fresh()->status);

        $this->postJson("/api/v1/hub/parcels/{$b->tracking_number}/receive")->assertOk();
        $trip->refresh();
        $this->assertSame(TruckTrip::STATUS_COMPLETED, $trip->status);
        $this->assertNotNull($trip->completed_at);

        Sanctum::actingAs($driver->user->fresh());
        $this->getJson('/api/v1/rider/trips')->assertOk()
            ->assertJsonPath('data.is_truck_driver', true)
            ->assertJsonPath('data.current', null)
            ->assertJsonPath('data.trips.0.status', TruckTrip::STATUS_COMPLETED)
            ->assertJsonPath('data.pay.unpaid_total', 800)
            ->assertJsonPath('data.pay.unpaid_trips', 1);
    }

    public function test_the_next_hub_receives_a_whole_truck_at_once_and_names_what_is_missing(): void
    {
        $driver = $this->driver();
        [$a, $b, $c] = [$this->parcel(), $this->parcel(), $this->parcel()];
        $this->send([$a, $b, $c], $driver)->assertOk();
        $trip = TruckTrip::firstOrFail();

        // Only the hub the truck is going to.
        Sanctum::actingAs($this->firstUser->fresh());
        $this->postJson("/api/v1/hub/truck-trips/{$trip->id}/receive")->assertNotFound();

        Sanctum::actingAs($this->secondUser->fresh());
        $this->postJson("/api/v1/hub/truck-trips/{$trip->id}/receive", ['missing' => [$c->tracking_number]])->assertOk()
            ->assertJsonPath('received', 2)
            ->assertJsonPath('data.status', TruckTrip::STATUS_ON_THE_WAY)
            ->assertJsonPath('data.received_count', 2);
        $this->assertNull($a->fresh()->transit_since);
        $this->assertNotNull($c->fresh()->transit_since);

        // The missing one turns up and is scanned in as usual: the trip completes.
        $this->postJson("/api/v1/hub/parcels/{$c->tracking_number}/receive")->assertOk();
        $this->assertSame(TruckTrip::STATUS_COMPLETED, $trip->fresh()->status);
        $this->postJson("/api/v1/hub/truck-trips/{$trip->id}/receive")->assertStatus(409);
        $this->getJson('/api/v1/hub/sorting/groups')->assertOk()->assertJsonPath('meta.total_parcels', 3);
    }

    public function test_the_courier_pays_the_driver_and_sets_the_rate(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $driver = $this->driver();
        Sanctum::actingAs($this->ops->fresh());
        $this->putJson('/api/v1/logistics/truck-rate', ['rate' => 1250])->assertOk();

        $parcel = $this->parcel();
        $this->send([$parcel], $driver)->assertOk()->assertJsonPath('trip.pay_amount', 1250);
        Sanctum::actingAs($this->secondUser->fresh());
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();

        Sanctum::actingAs($this->ops->fresh());
        $this->getJson('/api/v1/logistics/truck-drivers')->assertOk()
            ->assertJsonPath('data.0.unpaid_amount', 1250)
            ->assertJsonPath('summary.rate', 1250);
        $this->postJson("/api/v1/logistics/truck-drivers/{$driver->id}/pay", ['reference' => '1234567890123'])->assertOk()
            ->assertJsonPath('data.amount', 1250);
        $this->postJson("/api/v1/logistics/truck-drivers/{$driver->id}/pay")->assertStatus(422);

        $this->assertNotNull(TruckTrip::firstOrFail()->paid_at);
        $this->assertTrue(AuditLog::where('action', 'truck_driver.paid')->where('subject_id', $driver->id)->exists());
        $this->assertSame(1, $driver->user->notifications()->where('data->kind', 'rider.truck_paid')->count());
        \Illuminate\Support\Facades\Mail::assertQueued(\App\Mail\NoticeMail::class, fn ($m) => $m->kind === 'truck_pay_sent' && $m->hasTo($driver->user->email));
    }

    public function test_the_courier_can_close_a_trip_with_parcels_missing(): void
    {
        $driver = $this->driver();
        $this->send([$this->parcel(), $this->parcel()], $driver)->assertOk();
        $trip = TruckTrip::firstOrFail();

        Sanctum::actingAs($this->ops->fresh());
        $this->postJson("/api/v1/logistics/truck-trips/{$trip->id}/close", ['reason' => ''])->assertStatus(422);
        $this->postJson("/api/v1/logistics/truck-trips/{$trip->id}/close", ['reason' => 'One sack fell off at the toll.'])->assertOk()
            ->assertJsonPath('data.status', TruckTrip::STATUS_CLOSED);

        $this->assertSame(1, TruckTrip::unpaid()->count());
        $this->postJson("/api/v1/logistics/truck-trips/{$trip->id}/close", ['reason' => 'Again, please.'])->assertStatus(422);
    }

    public function test_truck_drivers_never_get_delivery_areas_or_jobs(): void
    {
        $driver = $this->driver();
        RiderAreaAssignment::forceCreate([
            'rider_id' => $driver->id, 'sorting_center_id' => $this->first->id, 'area_label' => 'Pila', 'coverage_barangays' => [self::SANTA_CRUZ], 'is_active' => true,
        ]);

        $this->assertArrayNotHasKey(self::SANTA_CRUZ, app(RiderAreaCoverage::class)->eligibleByBarangayCode($this->first));

        Sanctum::actingAs($this->firstUser->fresh());
        $this->postJson("/api/v1/hub/riders/{$driver->id}/areas", ['area_label' => 'Real', 'coverage_barangays' => [self::SANTA_CRUZ]])
            ->assertStatus(422);
    }

    public function test_the_courier_adds_a_truck_driver_with_a_truck(): void
    {
        \Illuminate\Support\Facades\Storage::fake('ids');
        \Illuminate\Support\Facades\Mail::fake();
        Sanctum::actingAs($this->ops->fresh());

        $form = [
            'first_name' => 'Ramon', 'last_name' => 'Villanueva', 'date_of_birth' => '1985-04-02',
            'email' => 'ramon.' . uniqid() . '@example.com', 'phone' => '0917' . random_int(1000000, 9999999),
            'license_number' => 'N01-' . random_int(10, 99) . '-' . random_int(100000, 999999), 'license_expiry' => now()->addYears(2)->toDateString(),
            'plate_number' => 'NBC' . random_int(1000, 9999), 'duty' => 'truck', 'vehicle_type' => 'Motorcycle',
            'drivers_license_image' => \Illuminate\Http\UploadedFile::fake()->image('license.jpg'),
            'or_cr_image' => \Illuminate\Http\UploadedFile::fake()->image('orcr.jpg'),
        ];
        $this->post('/api/v1/logistics/riders', $form, ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('vehicle_type');

        $form['vehicle_type'] = 'truck';
        $this->post('/api/v1/logistics/riders', $form, ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.duty', 'truck')
            ->assertJsonPath('data.vehicle_type', 'Truck');
        $this->getJson('/api/v1/logistics/riders?duty=truck')->assertOk()->assertJsonCount(1, 'data');
    }

    // ── Activity logs (hub, courier, rider) ──────────────────────────────────

    /** @return list<string> */
    private function titles(string $url): array
    {
        return array_column($this->getJson($url)->assertOk()->json('data'), 'title');
    }

    public function test_each_hub_sees_the_steps_of_the_parcels_it_handled_and_its_trucks(): void
    {
        $driver = $this->driver();
        $parcel = $this->parcel();
        $this->send([$parcel], $driver)->assertOk();
        $stranger = $this->parcel(self::SANTA_CRUZ);
        Sanctum::actingAs($this->secondUser->fresh());
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();

        Sanctum::actingAs($this->firstUser->fresh());
        $titles = $this->titles('/api/v1/hub/activity');
        $this->assertContains('Received at the hub', $titles);
        $this->assertContains('Left for another hub', $titles);
        $this->assertContains('Truck left with parcels', $titles);

        // Narrowed to transfers, then to one tracking number.
        $transfers = $this->getJson('/api/v1/hub/activity?category=transfers')->assertOk()->json('data');
        $this->assertNotEmpty($transfers);
        $this->assertSame(['transfers'], array_values(array_unique(array_column($transfers, 'category'))));
        $only = $this->getJson('/api/v1/hub/activity?search=' . $stranger->tracking_number)->assertOk()->json('data');
        $this->assertSame([$stranger->tracking_number], array_values(array_unique(array_column($only, 'tracking_number'))));

        // The second hub sees the parcel it received, not the one that stayed at the first hub.
        Sanctum::actingAs($this->secondUser->fresh());
        $rows = $this->getJson('/api/v1/hub/activity')->assertOk()->json('data');
        $this->assertContains('Arrived from another hub', array_column($rows, 'title'));
        $this->assertNotContains($stranger->tracking_number, array_column($rows, 'tracking_number'));

        $this->getJson('/api/v1/hub/activity?category=nonsense')->assertStatus(422);
    }

    public function test_the_courier_and_the_driver_see_their_activity(): void
    {
        $driver = $this->driver();
        $parcel = $this->parcel();
        $this->send([$parcel], $driver)->assertOk();
        Sanctum::actingAs($this->secondUser->fresh());
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();
        Sanctum::actingAs($this->ops->fresh());
        $this->postJson("/api/v1/logistics/truck-drivers/{$driver->id}/pay")->assertOk();

        $titles = $this->titles('/api/v1/logistics/activity');
        $this->assertContains('Truck driver paid', $titles);
        $this->assertContains('Arrived from another hub', $titles);
        $money = $this->getJson('/api/v1/logistics/activity?category=money')->assertOk()->json('data');
        $this->assertSame('Truck driver paid', $money[0]['title']);
        $this->assertSame('Courier', $money[0]['actor']['role']);

        Sanctum::actingAs($driver->user->fresh());
        $mine = $this->titles('/api/v1/rider/activity');
        $this->assertContains('Truck left with parcels', $mine);
        $this->assertContains('Truck driver paid', $mine);
    }

    public function test_the_log_pages_with_next_before(): void
    {
        $parcel = $this->parcel();
        Sanctum::actingAs($this->firstUser->fresh());
        $first = $this->getJson('/api/v1/hub/activity')->assertOk();
        $this->assertNull($first->json('meta.next_before'));
        $this->assertNotEmpty($first->json('meta.categories'));

        $later = $this->getJson('/api/v1/hub/activity?before=' . urlencode(now()->subDay()->toIso8601String()))->assertOk();
        $this->assertSame([], $later->json('data'));
        $this->assertNotNull($parcel);
    }
}
