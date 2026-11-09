<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\HubCoverage;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Courier\HubRouter;
use App\Services\Courier\NetworkBuilder;
use App\Support\PhPlaces;
use App\Support\RemoteDelivery;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Branches instead of a hub in every town (network:consolidate), very remote towns (barangay hall or the branch
 * counter), and the vehicles on a parcel's route: riders' own for the short rides, trucks for the long part.
 */
class BranchNetworkTest extends TestCase
{
    use DatabaseTransactions;

    private const MAJAYJAY = '043416001';

    private const KALAYAAN_TOWN = '175321000';

    private function user(string $tag): User
    {
        return User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63918' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male', 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    private function courier(): LogisticsCompany
    {
        $code = strtoupper(substr(uniqid(), -6));

        return LogisticsCompany::create([
            'name' => 'Branch Express ' . $code, 'code' => $code, 'slug' => 'branch-' . strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED,
            'submitted_at' => now(), 'owner_user_id' => $this->user('owner')->id,
        ]);
    }

    public function test_remote_towns_are_far_islands_and_town_locations_are_known(): void
    {
        $this->assertTrue(PhPlaces::isRemoteTown(self::KALAYAAN_TOWN));
        $this->assertTrue(PhPlaces::isRemoteBarangay('175321004'));
        $this->assertFalse(PhPlaces::isRemoteBarangay(self::MAJAYJAY));
        $this->assertFalse(PhPlaces::isRemoteBarangay('133901001'), 'Manila is no remote town.');
        $this->assertCount(count(PhPlaces::cities()), array_filter(PhPlaces::cities(), fn ($c) => isset($c['lat'], $c['lng'])), 'Every town has a location.');
        $km = PhPlaces::distanceKm('043416000', '043426000');
        $this->assertTrue($km > 5 && $km < 20, "Majayjay to Santa Cruz is a short ride ({$km} km).");
        $this->assertStringContainsString('barangay hall', RemoteDelivery::buyerNote(RemoteDelivery::BARANGAY_HALL, 'Pag-asa'));
        $this->assertNull(RemoteDelivery::buyerNote(null));
    }

    public function test_consolidate_cuts_the_network_to_branches_that_still_cover_every_barangay_with_riders_and_trucks(): void
    {
        Storage::fake('ids');
        Storage::fake('local');
        $courier = $this->courier();
        $builder = app(NetworkBuilder::class);
        $builder->build([$courier->id]);
        $this->assertSame(count(PhPlaces::cities()), SortingCenter::where('logistics_company_id', $courier->id)->count());

        $stats = $builder->consolidate([$courier->id], radiusKm: 15.0)[$courier->name];

        $hubs = SortingCenter::where('logistics_company_id', $courier->id);
        $branches = (clone $hubs)->count();
        $this->assertSame($branches, $stats['branches']);
        $this->assertTrue($branches > 500 && $branches < 700, "About 600 branches, not {$branches}.");
        $this->assertSame(42046, HubCoverage::whereIn('sorting_center_id', (clone $hubs)->select('id'))->distinct()->count('barangay_code'), 'Every barangay is still covered.');
        $this->assertSame(17, (clone $hubs)->whereNotNull('gateway_region_code')->count(), 'The gateways stay.');
        $this->assertSame(0, (clone $hubs)->where('city_code', self::KALAYAAN_TOWN)->count(), 'A very remote town gets no branch.');

        // Majayjay has no branch of its own; the branch that covers it is a short ride away.
        $majayjay = SortingCenter::whereIn('id', HubCoverage::where('barangay_code', self::MAJAYJAY)->select('sorting_center_id'))
            ->where('logistics_company_id', $courier->id)->firstOrFail();
        $this->assertNotSame('043416000', $majayjay->city_code);
        $this->assertLessThanOrEqual(15.0, PhPlaces::distanceKm($majayjay->city_code, '043416000'));

        // Every branch has 2 delivery riders covering it and a truck driver (2 at a gateway).
        $riders = Rider::where('logistics_company_id', $courier->id)->where('status', Rider::STATUS_ACTIVE);
        foreach ((clone $hubs)->inRandomOrder()->limit(25)->get() as $hub) {
            $this->assertGreaterThanOrEqual(2, (clone $riders)->where('sorting_center_id', $hub->id)->where('duty', Rider::DUTY_DELIVERY)->count());
            $this->assertGreaterThanOrEqual($hub->isGateway() ? 2 : 1, (clone $riders)->where('sorting_center_id', $hub->id)->where('duty', Rider::DUTY_TRUCK)->count());
        }
        $this->assertSame(0, (clone $riders)->where('duty', Rider::DUTY_TRUCK)->where('vehicle_type', '!=', Rider::VEHICLE_TRUCK)->count());
        $this->assertGreaterThan(0, (clone $riders)->where('vehicle_type', Rider::VEHICLE_TRICYCLE)->count(), 'Towns that are not cities get a tricycle rider.');
        $sample = (clone $riders)->where('duty', Rider::DUTY_DELIVERY)->where('sorting_center_id', $majayjay->id)->firstOrFail();
        $this->assertContains(self::MAJAYJAY, array_map('strval', $sample->areaAssignments()->where('is_active', true)->first()->coverage_barangays), 'The branch riders cover Majayjay.');

        // A second run changes nothing.
        $before = [SortingCenter::count(), User::count(), Rider::count()];
        $again = $builder->consolidate([$courier->id], radiusKm: 15.0)[$courier->name];
        $this->assertSame(0, $again['hubs_removed'] + $again['riders_created'] + $again['truck_drivers_created']);
        $this->assertSame($before, [SortingCenter::count(), User::count(), Rider::count()]);
    }

    /** @return array{0: User, 1: SortingCenter, 2: Parcel} a hub and a sorted parcel whose remote buyer collects it there */
    private function counterParcel(?float $cod = 250.0): array
    {
        $courier = $this->courier();
        $hubUser = $this->user('hub');
        $hub = SortingCenter::forceCreate([
            'user_id' => $hubUser->id, 'hub_name' => 'Puerto Princesa Hub ' . uniqid(), 'address_province' => 'Palawan', 'address_city' => 'Puerto Princesa',
            'address_barangay' => 'Poblacion', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['175321004'], 'logistics_company_id' => $courier->id, 'city_code' => '175316000', 'island_group' => 'luzon',
        ]);
        $buyer = $this->user('buyer');
        $order = Order::forceCreate([
            'buyer_id' => $buyer->id, 'order_number' => 'VEL-' . strtoupper(uniqid()), 'status' => OrderStatus::SORTED->value,
            'subtotal' => 100, 'shipping_fee' => 150, 'total' => 250, 'payment_method' => $cod ? 'cod' : 'gcash', 'shipping_name' => 'Ana', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 St', 'shipping_province' => 'Palawan', 'shipping_city' => 'Kalayaan', 'shipping_barangay' => 'Pag-asa',
            'shipping_barangay_code' => '175321004', 'logistics_company_id' => $courier->id, 'delivery_point' => RemoteDelivery::BRANCH,
        ]);
        $parcel = Parcel::forceCreate([
            'order_id' => $order->id, 'seller_id' => $this->user('seller')->id, 'tracking_number' => 'LIT-' . strtoupper(uniqid()), 'status' => Parcel::STATUS_SORTED,
            'logistics_company_id' => $courier->id, 'sorting_center_id' => $hub->id, 'destination_barangay' => 'Pag-asa', 'destination_barangay_code' => '175321004',
            'cod_amount' => $cod, 'sorted_at' => now()->subHour(), 'picked_up_at' => now()->subDay(),
            'recipient_snapshot' => ['name' => 'Ana Santos', 'phone' => '09171234567', 'barangay' => 'Pag-asa', 'city' => 'Kalayaan', 'province' => 'Palawan'],
        ]);

        return [$hubUser, $hub, $parcel];
    }

    public function test_a_remote_buyer_collects_at_the_branch_counter_without_a_rider(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        [$hubUser, , $parcel] = $this->counterParcel();
        Sanctum::actingAs($hubUser);

        // It waits at the counter, not in the riders' dispatch list.
        $this->getJson('/api/v1/hub/counter')->assertOk()->assertJsonPath('data.0.tracking_number', $parcel->tracking_number)->assertJsonPath('data.0.cod_amount', 250);
        $this->getJson('/api/v1/hub/dispatch/batches')->assertOk()->assertJsonCount(0, 'data');

        $url = "/api/v1/hub/counter/{$parcel->tracking_number}/handed-over";
        $this->post($url, ['received_by' => 'Ana Santos', 'cod_amount' => '250.00'], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('proof_photo');
        $this->post($url, ['proof_photo' => UploadedFile::fake()->image('a.jpg'), 'received_by' => 'Ana Santos', 'cod_amount' => '200'], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('cod_amount');
        $this->post($url, ['proof_photo' => UploadedFile::fake()->image('a.jpg'), 'received_by' => 'Ana Santos', 'cod_amount' => '250.00'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('cod_collected', true);

        $parcel->refresh();
        $this->assertSame(Parcel::STATUS_DELIVERED, $parcel->status);
        $this->assertSame(OrderStatus::DELIVERED->value, $parcel->order->fresh()->status instanceof OrderStatus ? $parcel->order->fresh()->status->value : (string) $parcel->order->fresh()->status);
        $this->assertSame('Ana Santos', $parcel->received_by);
        $this->assertNotNull($parcel->cod_collected_at);
        $this->getJson('/api/v1/hub/counter')->assertOk()->assertJsonCount(0, 'data');

        // The route ends at the branch, picked up.
        $buyer = collect(app(HubRouter::class)->journey($parcel->fresh()))->firstWhere('kind', 'buyer');
        $this->assertSame('Pick up at the branch', $buyer['title']);
        $this->assertSame('Picked up', $buyer['label']);
        $this->assertNull($buyer['rider_vehicle']);
    }

    public function test_a_hub_cannot_give_a_counter_parcel_to_a_rider(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        [$hubUser, $hub, $parcel] = $this->counterParcel(null);
        $rider = Rider::forceCreate([
            'user_id' => $this->user('rider')->id, 'sorting_center_id' => $hub->id, 'logistics_company_id' => $hub->logistics_company_id,
            'vehicle_type' => Rider::VEHICLE_TRICYCLE, 'plate_number' => 'R' . random_int(10000, 99999), 'status' => Rider::STATUS_ACTIVE,
        ]);
        $rider->areaAssignments()->create(['sorting_center_id' => $hub->id, 'area_label' => 'All', 'coverage_barangays' => ['175321004'], 'is_active' => true]);
        Sanctum::actingAs($hubUser);

        $this->postJson('/api/v1/hub/dispatch/assign', ['rider_id' => $rider->id, 'tracking_numbers' => [$parcel->tracking_number]])
            ->assertStatus(422)->assertJsonValidationErrors('tracking_numbers.0');
        $this->assertSame(Parcel::STATUS_SORTED, $parcel->fresh()->status);
    }
}
