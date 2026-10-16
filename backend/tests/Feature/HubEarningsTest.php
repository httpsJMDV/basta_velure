<?php

namespace Tests\Feature;

use App\Models\HubEarning;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Support\ShippingSplit;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The hub's share of the delivery fee: what it shows, that it is only this hub's, and that the fee is configurable.
 */
class HubEarningsTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        // Wednesday 14 Oct 2026, 10:00 in Manila (02:00 UTC)
        Carbon::setTestNow(Carbon::parse('2026-10-14 02:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Tester' . substr(uniqid(), -4), 'email' => $role . '.' . uniqid() . '@example.com',
            'phone' => '09' . rand(100000000, 999999999), 'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01',
            'sex' => 'male', 'role' => $role, 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: SortingCenter} */
    private function hub(): array
    {
        $user = $this->user('buyer', 'Hub');
        $hub = SortingCenter::create([
            'user_id' => $user->id, 'hub_name' => 'Earn Hub ' . uniqid(), 'address_province' => 'Laguna', 'address_city' => 'Calamba',
            'address_barangay' => 'Real', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => [],
        ]);

        return [$user, $hub];
    }

    private function earn(SortingCenter $hub, string $utc, string $amount = '7.50'): HubEarning
    {
        $buyer = $this->user('buyer', 'Buyer');
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => 'DELIVERED', 'subtotal' => 100, 'shipping_fee' => 50,
            'total' => 150, 'payment_method' => 'cod', 'shipping_name' => 'B', 'shipping_phone' => '09', 'shipping_address' => 'x',
            'shipping_province' => 'p', 'shipping_city' => 'c', 'shipping_barangay' => 'b', 'shipping_province_code' => '1', 'shipping_city_code' => '1', 'shipping_barangay_code' => '1',
        ]);
        $parcel = Parcel::create([
            'tracking_number' => 'LIT-261014-' . strtoupper(substr(uniqid(), -6)), 'order_id' => $order->id, 'seller_id' => $buyer->id,
            'status' => 'DELIVERED', 'sorting_center_id' => $hub->id,
        ]);

        return HubEarning::create(['sorting_center_id' => $hub->id, 'parcel_id' => $parcel->id, 'amount' => $amount, 'earned_at' => Carbon::parse($utc, 'UTC')]);
    }

    public function test_it_totals_today_week_month_and_lifetime_for_this_hub_only(): void
    {
        [$user, $hub] = $this->hub();
        [, $other] = $this->hub();

        $this->earn($hub, '2026-10-14 01:00:00');          // today (Manila 09:00)
        $this->earn($hub, '2026-10-13 17:00:00');          // Manila 01:00 on the 14th: today too
        $this->earn($hub, '2026-10-12 02:00:00');          // Monday: this week, not today
        $this->earn($hub, '2026-10-02 02:00:00');          // this month, not this week
        $this->earn($hub, '2026-09-20 02:00:00');          // last month: lifetime only
        $this->earn($other, '2026-10-14 01:30:00', '99.00'); // another hub's

        $res = $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/earnings')->assertOk();

        $res->assertJsonPath('data.today', ['total' => '15.00', 'deliveries_count' => 2])
            ->assertJsonPath('data.week', ['total' => '22.50', 'deliveries_count' => 3])
            ->assertJsonPath('data.month', ['total' => '30.00', 'deliveries_count' => 4])
            ->assertJsonPath('data.lifetime', ['total' => '37.50', 'deliveries_count' => 5])
            ->assertJsonPath('data.delivery_fee', '50.00')
            ->assertJsonPath('data.split', ['rider_percent' => 85, 'hub_percent' => 15]);
        $this->assertCount(5, $res->json('data.recent'));
        $this->assertSame('2026-10-14T01:00:00+00:00', $res->json('data.recent.0.earned_at'));
        $this->assertSame('50.00', $res->json('data.recent.0.delivery_fee'));
        $this->assertStringNotContainsString('99.00', $res->getContent());
    }

    public function test_it_is_empty_for_a_new_hub_and_closed_to_everyone_but_an_approved_hub(): void
    {
        [$user] = $this->hub();
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/hub/earnings')->assertOk()
            ->assertJsonPath('data.lifetime', ['total' => '0.00', 'deliveries_count' => 0])
            ->assertJsonPath('data.recent', []);

        $rider = $this->user('rider', 'Juan');
        $this->actingAs($rider, 'sanctum')->getJson('/api/v1/hub/earnings')->assertStatus(403);
        $this->actingAs($this->user('buyer', 'Plain'), 'sanctum')->getJson('/api/v1/hub/earnings')->assertStatus(403);

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/hub/earnings')->assertStatus(401);
    }

    public function test_the_delivery_fee_and_the_share_come_from_config_and_bad_values_fall_back(): void
    {
        $this->assertSame('50.00', ShippingSplit::fee());
        config(['shipping.fee' => '65.50']);
        $this->assertSame('65.50', ShippingSplit::fee());
        $this->assertSame(['rider' => 5568, 'hub' => 982], ShippingSplit::split(ShippingSplit::feeCents()));

        config(['shipping.fee' => 'free']);
        $this->assertSame('50.00', ShippingSplit::fee());
    }
}
