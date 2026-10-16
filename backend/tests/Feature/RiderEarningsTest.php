<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\DeliveryLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\OrderStateMachine;
use App\Support\Money;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RiderEarningsTest extends TestCase
{
    use DatabaseTransactions;

    // Wednesday 14 Oct 2026, 11:00 in Manila. Week = Mon 12 Oct .. Sun 18 Oct. Month = October.
    private const NOW = '2026-10-14 03:00:00';

    protected SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Carbon::setTestNow(Carbon::parse(self::NOW, 'UTC'));

        $hubUser = $this->makeUser('buyer', 'Hub');
        $this->hub = SortingCenter::create([
            'user_id' => $hubUser->id, 'hub_name' => 'Earnings Hub ' . uniqid(), 'address_province' => 'Laguna',
            'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '1 Hub St',
            'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => ['043405001'],
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ─── fixtures ─────────────────────────────────────────────────────────────

    protected function makeUser(string $role, string $first = 'Test'): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'User' . substr(uniqid(), -4),
            'email' => strtolower($role) . '.' . uniqid() . '@example.com', 'phone' => '09' . rand(100000000, 999999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1992-02-02', 'sex' => 'male', 'role' => $role, 'status' => 'active',
        ]);
    }

    protected function makeRider(string $status = Rider::STATUS_ACTIVE, string $first = 'Juan'): array
    {
        $user = $this->makeUser('rider', $first);
        $rider = Rider::create([
            'user_id' => $user->id, 'sorting_center_id' => $this->hub->id, 'vehicle_type' => 'Motorcycle',
            'plate_number' => 'AB-' . rand(1000, 9999), 'or_cr_path' => 'ids/a.pdf', 'drivers_license_path' => 'ids/b.pdf',
            'status' => $status, 'submitted_at' => now(),
        ]);

        return [$user, $rider];
    }

    /**
     * An order plus its parcel, in the given state, assigned to $rider (or nobody).
     *
     * @param array<string, mixed> $parcelOverrides
     */
    protected function makeParcel(
        ?Rider $rider,
        OrderStatus $orderStatus = OrderStatus::OUT_FOR_DELIVERY,
        string $parcelStatus = Parcel::STATUS_OUT_FOR_DELIVERY,
        string $payment = 'cod',
        array $parcelOverrides = []
    ): Parcel {
        $seller = $this->makeUser('seller', 'Maria');
        $buyer = $this->makeUser('buyer', 'Ana');

        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => $orderStatus->value,
            'subtotal' => 1150.00, 'shipping_fee' => 50.00, 'total' => 1200.00, 'payment_method' => $payment,
            'shipping_name' => 'Ana Buyer', 'shipping_phone' => '09998887777', 'shipping_address' => '12 Sampaguita St',
            'shipping_province' => 'Metro Manila', 'shipping_city' => 'Makati City', 'shipping_barangay' => 'Poblacion',
            'shipping_province_code' => '130000000', 'shipping_city_code' => '137602000', 'shipping_barangay_code' => '137602015',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Floral Summer Dress', 'variant_label' => 'M / Red',
            'unit_price' => 575.00, 'quantity' => 2, 'subtotal' => 1150.00, 'commission_rate' => 0.10, 'commission_amount' => 115.00,
            'seller_earnings' => 1035.00, 'payout_status' => 'pending_release',
        ]);

        return Parcel::create(array_merge([
            'tracking_number' => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)), 'order_id' => $order->id,
            'seller_id' => $seller->id, 'status' => $parcelStatus, 'destination_barangay' => 'Poblacion',
            'destination_barangay_code' => '137602015', 'pickup_address_snapshot' => ['shop_name' => "Maria's Shop"],
            'recipient_snapshot' => ['name' => 'Ana Buyer', 'phone' => '09998887777', 'street' => '12 Sampaguita St',
                'barangay' => 'Poblacion', 'city' => 'Makati City', 'province' => 'Metro Manila'],
            'cod_amount' => $payment === 'cod' ? 1200.00 : null, 'sorting_center_id' => $this->hub->id,
            'assigned_rider_id' => $rider?->id, 'out_for_delivery_at' => now()->subHour(),
        ], $parcelOverrides));
    }

    /** An earnings row at an exact UTC instant (what the state machine would have created). */
    protected function earn(Rider $rider, string $earnedAtUtc, string $amount = '50.00'): RiderEarning
    {
        $parcel = $this->makeParcel($rider, OrderStatus::DELIVERED, Parcel::STATUS_DELIVERED);

        return RiderEarning::create([
            'rider_id' => $rider->id, 'parcel_id' => $parcel->id, 'amount' => $amount,
            'earned_at' => Carbon::parse($earnedAtUtc, 'UTC'), 'notes' => 'Flat delivery fee',
        ]);
    }

    protected function summary(User $user, string $period = 'day', ?string $date = null)
    {
        $url = '/api/v1/rider/earnings/summary?period=' . $period . ($date ? "&date={$date}" : '');

        return $this->actingAs($user, 'sanctum')->getJson($url);
    }

    protected function deliverVia(Parcel $parcel, string $actor = 'rider'): void
    {
        app(OrderStateMachine::class)->transition($parcel->order, OrderStatus::DELIVERED, $actor, 1, 'Delivered');
    }

    // ─── earnings creation ────────────────────────────────────────────────────

    public function test_delivered_creates_one_rider_row_and_one_hub_row_that_split_the_delivery_fee_85_15(): void
    {
        [, $rider] = $this->makeRider();
        $parcel = $this->makeParcel($rider);

        $this->deliverVia($parcel);

        $rows = RiderEarning::where('parcel_id', $parcel->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame($rider->id, $rows[0]->rider_id);
        // The order paid a 50.00 delivery fee: 85% to the rider, the rest to the hub, and the two add up to the fee.
        $this->assertSame('42.50', (string) $rows[0]->amount);
        $this->assertEqualsWithDelta(now()->getTimestamp(), $rows[0]->earned_at->getTimestamp(), 5);

        $hubRows = \App\Models\HubEarning::where('parcel_id', $parcel->id)->get();
        $this->assertCount(1, $hubRows);
        $this->assertSame($this->hub->id, $hubRows[0]->sorting_center_id);
        $this->assertSame('7.50', (string) $hubRows[0]->amount);
    }

    public function test_the_pickup_rider_earns_at_the_hub_and_the_delivery_rider_earns_the_rest_at_delivery(): void
    {
        [, $picker] = $this->makeRider(first: 'Pickup');
        [, $deliverer] = $this->makeRider(first: 'Delivery');
        $parcel = $this->makeParcel(null, OrderStatus::PICKED_UP, Parcel::STATUS_PICKED_UP, 'cod', ['pickup_rider_id' => $picker->id]);

        // The hub receives it: the pickup rider's 20% of the 50.00 fee, kept whatever happens next.
        app(OrderStateMachine::class)->transition($parcel->order, OrderStatus::AT_SORTING_CENTER, 'hub', 1, 'Received');
        $pickup = RiderEarning::where('parcel_id', $parcel->id)->sole();
        $this->assertSame([$picker->id, RiderEarning::KIND_PICKUP, '10.00'], [$pickup->rider_id, $pickup->kind, (string) $pickup->amount]);

        // Delivered by another rider: 65% to them, 15% to the hub, and the pickup is not paid twice.
        $parcel->order->forceFill(['status' => OrderStatus::OUT_FOR_DELIVERY->value])->save();
        $parcel->update(['assigned_rider_id' => $deliverer->id, 'status' => Parcel::STATUS_OUT_FOR_DELIVERY]);
        $this->deliverVia($parcel->fresh());
        $rows = RiderEarning::where('parcel_id', $parcel->id)->orderBy('id')->get();
        $this->assertSame([['pickup', $picker->id, '10.00'], ['delivery', $deliverer->id, '32.50']],
            $rows->map(fn ($r) => [$r->kind, $r->rider_id, (string) $r->amount])->all());
        $this->assertSame('7.50', (string) \App\Models\HubEarning::where('parcel_id', $parcel->id)->value('amount'));

        // One rider doing both legs earns both shares (85%); a parcel received before pickups earned is paid in full
        // at delivery.
        [, $both] = $this->makeRider(first: 'Both');
        $solo = $this->makeParcel($both, parcelOverrides: ['pickup_rider_id' => $both->id]);
        $this->deliverVia($solo);
        $this->assertSame('42.50', (string) RiderEarning::where('parcel_id', $solo->id)->sum('amount'));
        $this->assertSame(2, RiderEarning::where('parcel_id', $solo->id)->where('rider_id', $both->id)->count());
    }

    public function test_the_split_always_adds_up_to_the_fee_to_the_centavo(): void
    {
        foreach ([5000, 9900, 3333, 1, 0, 12345] as $fee) {
            $split = \App\Support\ShippingSplit::split($fee);
            $this->assertSame($fee, $split['rider'] + $split['hub'], "fee {$fee}");
            $this->assertSame($split['rider'], $split['pickup'] + $split['delivery'], "fee {$fee} riders");
        }
        $this->assertSame(['rider' => 8415, 'hub' => 1485, 'pickup' => 1980, 'delivery' => 6435], \App\Support\ShippingSplit::split(9900));

        // The percentage is a setting. Outside 0 to 100 it falls back to 85.
        config(['shipping.rider_share_percent' => 70]);
        $this->assertSame(['rider' => 3500, 'hub' => 1500, 'pickup' => 1000, 'delivery' => 2500], \App\Support\ShippingSplit::split(5000));
        config(['shipping.rider_share_percent' => 150]);
        $this->assertSame(['rider' => 4250, 'hub' => 750, 'pickup' => 1000, 'delivery' => 3250], \App\Support\ShippingSplit::split(5000));
    }

    public function test_transitioning_again_never_creates_a_second_row_and_a_config_change_never_rewrites_history(): void
    {
        [, $rider] = $this->makeRider();
        $first = $this->makeParcel($rider);
        $this->deliverVia($first);

        // The order is disputed, then an admin restores the delivery: DELIVERED is entered a second time.
        $machine = app(OrderStateMachine::class);
        $machine->transition($first->order->fresh(), OrderStatus::DISPUTED, 'buyer', 1, 'Return requested');
        $machine->transition($first->order->fresh(), OrderStatus::DELIVERED, 'admin', 1, 'Claim rejected');
        $this->assertSame(1, RiderEarning::where('parcel_id', $first->id)->count());

        // The rider's percentage changes. The old row keeps its snapshot; only new deliveries use the new share.
        config(['shipping.rider_share_percent' => 90]);
        $second = $this->makeParcel($rider);
        $this->deliverVia($second);

        $this->assertSame('42.50', (string) RiderEarning::where('parcel_id', $first->id)->value('amount'));
        $this->assertSame('45.00', (string) RiderEarning::where('parcel_id', $second->id)->value('amount'));
        $this->assertSame(1, \App\Models\HubEarning::where('parcel_id', $first->id)->count());
        $this->assertSame(1, RiderEarning::where('parcel_id', $first->id)->count());
    }

    public function test_the_database_itself_refuses_a_second_row_for_one_parcel(): void
    {
        [, $rider] = $this->makeRider();
        $parcel = $this->makeParcel($rider);
        $this->deliverVia($parcel);

        $this->expectException(QueryException::class);
        RiderEarning::create(['rider_id' => $rider->id, 'parcel_id' => $parcel->id, 'amount' => '50.00', 'earned_at' => now()]);
    }

    public function test_an_admin_triggered_delivery_with_an_assigned_rider_still_earns_the_rider_a_fee(): void
    {
        [, $rider] = $this->makeRider();
        $parcel = $this->makeParcel($rider);

        $this->deliverVia($parcel, 'admin');

        $this->assertSame(1, RiderEarning::where('rider_id', $rider->id)->where('parcel_id', $parcel->id)->count());
    }

    public function test_a_parcel_with_no_assigned_rider_earns_nobody_anything_but_still_delivers(): void
    {
        $parcel = $this->makeParcel(null);

        $this->deliverVia($parcel, 'admin');

        $this->assertEquals(OrderStatus::DELIVERED, $parcel->order->fresh()->status);
        $this->assertSame(0, RiderEarning::count() - RiderEarning::where('parcel_id', '!=', $parcel->id)->count());
    }

    public function test_a_failed_delivery_earns_nothing_and_a_later_return_does_not_claw_the_fee_back(): void
    {
        [, $rider] = $this->makeRider();
        $failed = $this->makeParcel($rider);
        app(OrderStateMachine::class)->transition($failed->order, OrderStatus::DELIVERY_FAILED, 'rider', 1, 'Failed');
        $this->assertSame(0, RiderEarning::where('parcel_id', $failed->id)->count());

        // Delivered, then the buyer returns it: the fee stays.
        $delivered = $this->makeParcel($rider);
        $this->deliverVia($delivered);
        $machine = app(OrderStateMachine::class);
        $machine->transition($delivered->order->fresh(), OrderStatus::DISPUTED, 'buyer', 1, 'Return requested');
        $machine->transition($delivered->order->fresh(), OrderStatus::RETURNED, 'seller', 1, 'Return accepted');

        $this->assertSame(1, RiderEarning::where('parcel_id', $delivered->id)->count());
        $this->assertSame('42.50', (string) RiderEarning::where('parcel_id', $delivered->id)->value('amount'));
    }

    public function test_creating_the_fee_changes_no_buyer_seller_or_platform_money(): void
    {
        [, $rider] = $this->makeRider();
        $parcel = $this->makeParcel($rider);
        $before = [$parcel->order->only(['subtotal', 'shipping_fee', 'total']), $parcel->order->items()->first()->only(['subtotal', 'commission_amount', 'seller_earnings', 'payout_status'])];

        $this->deliverVia($parcel);

        $order = $parcel->order->fresh();
        $this->assertEquals($before[0], $order->only(['subtotal', 'shipping_fee', 'total']));
        $this->assertEquals($before[1], $order->items()->first()->only(['subtotal', 'commission_amount', 'seller_earnings', 'payout_status']));
    }

    public function test_an_unusable_share_setting_is_logged_and_never_blocks_a_delivery(): void
    {
        [, $rider] = $this->makeRider();
        config(['shipping.rider_share_percent' => 'abc']);
        $parcel = $this->makeParcel($rider);

        $this->deliverVia($parcel);

        $this->assertEquals(OrderStatus::DELIVERED, $parcel->order->fresh()->status);
        $this->assertSame('42.50', (string) RiderEarning::where('parcel_id', $parcel->id)->value('amount'));
    }

    // ─── summary ──────────────────────────────────────────────────────────────

    public function test_summary_totals_equal_delivered_count_times_the_fee_for_day_week_and_month(): void
    {
        [$user, $rider] = $this->makeRider();
        // Wed 14 Oct (today): 3 deliveries. Mon 12 Oct: 2. Thu 1 Oct: 1. Sep 20: 1 (previous month).
        foreach (['2026-10-14 01:00:00', '2026-10-14 02:30:00', '2026-10-14 02:59:00'] as $t) { $this->earn($rider, $t); }
        foreach (['2026-10-12 00:30:00', '2026-10-11 20:00:00'] as $t) { $this->earn($rider, $t); }
        $this->earn($rider, '2026-10-01 05:00:00');
        $this->earn($rider, '2026-09-20 05:00:00');

        $day = $this->summary($user, 'day')->assertOk()->json('data');
        $this->assertSame(3, $day['deliveries_count']);
        $this->assertSame('150.00', $day['total_earned']);
        $this->assertSame('50.00', $day['average_per_delivery']);

        $week = $this->summary($user, 'week')->json('data');
        $this->assertSame(5, $week['deliveries_count']);
        $this->assertSame('250.00', $week['total_earned']);

        $month = $this->summary($user, 'month')->json('data');
        $this->assertSame(6, $month['deliveries_count']);
        $this->assertSame('300.00', $month['total_earned']);
        $this->assertSame('350.00', $month['lifetime_total']);
        $this->assertSame('350.00', $day['lifetime_total']);
    }

    public function test_manila_midnight_and_monday_boundaries_are_exact(): void
    {
        [$user, $rider] = $this->makeRider();

        // Day: Wed 14 Oct in Manila is 2026-10-13 16:00:00Z up to (not including) 2026-10-14 16:00:00Z.
        $this->earn($rider, '2026-10-13 15:59:59'); // Tue 23:59:59 Manila: yesterday
        $this->earn($rider, '2026-10-13 16:00:00'); // Wed 00:00:00 Manila: today
        $this->earn($rider, '2026-10-14 15:59:59'); // Wed 23:59:59 Manila: today
        $this->earn($rider, '2026-10-14 16:00:00'); // Thu 00:00:00 Manila: tomorrow

        $day = $this->summary($user, 'day', '2026-10-14')->json('data');
        $this->assertSame(2, $day['deliveries_count']);
        $this->assertSame('2026-10-14', $day['period']['start_date']);
        $this->assertSame('2026-10-14', $day['period']['end_date']);
        $this->assertSame(1, $day['previous']['deliveries_count']);                       // Tue 23:59:59 Manila
        $this->assertSame(1, $this->summary($user, 'day', '2026-10-15')->json('data.deliveries_count')); // Thu 00:00:00 Manila

        // Week (Mon..Sun): Mon 12 Oct 00:00 Manila = 2026-10-11 16:00:00Z; next Monday = 2026-10-18 16:00:00Z.
        [$user2, $rider2] = $this->makeRider();
        $this->earn($rider2, '2026-10-11 15:59:59'); // Sun 11 Oct 23:59:59 Manila: previous week
        $this->earn($rider2, '2026-10-11 16:00:00'); // Mon 12 Oct 00:00:00 Manila: this week
        $this->earn($rider2, '2026-10-18 15:59:59'); // Sun 18 Oct 23:59:59 Manila: this week
        $this->earn($rider2, '2026-10-18 16:00:00'); // Mon 19 Oct 00:00:00 Manila: next week

        $week = $this->summary($user2, 'week', '2026-10-14')->json('data');
        $this->assertSame(2, $week['deliveries_count']);
        $this->assertSame('2026-10-12', $week['period']['start_date']);
        $this->assertSame('2026-10-18', $week['period']['end_date']);
        $this->assertSame(1, $week['previous']['deliveries_count']);
        $this->assertSame('2026-10-05', $week['previous']['start_date']);
        // Asking for a Sunday still gives the same Monday-to-Sunday week.
        $this->assertSame('2026-10-12', $this->summary($user2, 'week', '2026-10-18')->json('data.period.start_date'));
        $this->assertSame('2026-10-19', $this->summary($user2, 'week', '2026-10-19')->json('data.period.start_date'));

        // Month: Oct 1 00:00 Manila = 2026-09-30 16:00:00Z; Nov 1 00:00 Manila = 2026-10-31 16:00:00Z.
        [$user3, $rider3] = $this->makeRider();
        $this->earn($rider3, '2026-09-30 15:59:59'); // Sep 30 23:59:59 Manila
        $this->earn($rider3, '2026-09-30 16:00:00'); // Oct 1 00:00:00 Manila
        $this->earn($rider3, '2026-10-31 15:59:59'); // Oct 31 23:59:59 Manila
        $this->earn($rider3, '2026-10-31 16:00:00'); // Nov 1 00:00:00 Manila

        $month = $this->summary($user3, 'month', '2026-10-14')->json('data');
        $this->assertSame(2, $month['deliveries_count']);
        $this->assertSame('2026-10-01', $month['period']['start_date']);
        $this->assertSame('2026-10-31', $month['period']['end_date']);
        $this->assertSame(1, $month['previous']['deliveries_count']);
        $this->assertSame('2026-09-01', $month['previous']['start_date']);
        $this->assertSame('2026-09-30', $month['previous']['end_date']);
    }

    public function test_an_empty_period_returns_zeros_and_a_full_zero_filled_breakdown(): void
    {
        [$user] = $this->makeRider();

        foreach (['day' => 24, 'week' => 7, 'month' => 31] as $period => $points) {
            $data = $this->summary($user, $period)->assertOk()->json('data');

            $this->assertSame('0.00', $data['total_earned'], $period);
            $this->assertSame(0, $data['deliveries_count'], $period);
            $this->assertSame('0.00', $data['average_per_delivery'], $period);
            $this->assertSame('0.00', $data['previous']['total_earned'], $period);
            $this->assertSame(0, $data['previous']['deliveries_count'], $period);
            $this->assertSame('0.00', $data['lifetime_total'], $period);
            $this->assertCount($points, $data['breakdown'], $period);
            foreach ($data['breakdown'] as $point) {
                $this->assertSame('0.00', $point['total']);
                $this->assertSame(0, $point['count']);
            }
        }
    }

    public function test_the_breakdown_points_sum_to_the_total_and_land_in_the_right_manila_bucket(): void
    {
        [$user, $rider] = $this->makeRider();
        // Today in Manila: 00:00 (16:00Z yesterday), 08:15, 08:45, 23:59.
        $this->earn($rider, '2026-10-13 16:00:00', '50.00');
        $this->earn($rider, '2026-10-14 00:15:00', '50.00');
        $this->earn($rider, '2026-10-14 00:45:00', '75.50');
        $this->earn($rider, '2026-10-14 15:59:00', '50.00');

        $day = $this->summary($user, 'day', '2026-10-14')->json('data');
        $this->assertSame('225.50', $day['total_earned']);
        $this->assertSame(
            Money::toCents($day['total_earned']),
            array_sum(array_map(fn ($p) => Money::toCents($p['total']), $day['breakdown']))
        );
        $this->assertSame(4, array_sum(array_column($day['breakdown'], 'count')));
        $hours = collect($day['breakdown'])->keyBy('key');
        $this->assertSame(1, $hours['00']['count']);
        $this->assertSame(2, $hours['08']['count']);
        $this->assertSame('125.50', $hours['08']['total']);
        $this->assertSame(1, $hours['23']['count']);
        $this->assertSame('1 AM', $hours['01']['label']);

        $week = $this->summary($user, 'week', '2026-10-14')->json('data');
        $this->assertSame(Money::toCents($week['total_earned']), array_sum(array_map(fn ($p) => Money::toCents($p['total']), $week['breakdown'])));
        $byDay = collect($week['breakdown'])->keyBy('key');
        // All four fall on Wed 14 Oct in Manila, including the 00:00 one stored as 16:00Z the day before.
        $this->assertSame(4, $byDay['2026-10-14']['count']);
        $this->assertSame(0, $byDay['2026-10-13']['count']);
        $this->assertSame('Mon 12', $week['breakdown'][0]['label']);

        $month = $this->summary($user, 'month', '2026-10-14')->json('data');
        $this->assertSame(Money::toCents($month['total_earned']), array_sum(array_map(fn ($p) => Money::toCents($p['total']), $month['breakdown'])));
        $this->assertCount(31, $month['breakdown']);
    }

    public function test_money_is_exact_with_no_float_drift(): void
    {
        [$user, $rider] = $this->makeRider();
        // 0.10 + 0.20 is the classic float trap; 33 x 50.01 is another.
        $this->earn($rider, '2026-10-14 01:00:00', '0.10');
        $this->earn($rider, '2026-10-14 01:05:00', '0.20');
        $this->assertSame('0.30', $this->summary($user, 'day')->json('data.total_earned'));

        [$user2, $rider2] = $this->makeRider();
        for ($i = 0; $i < 33; $i++) { $this->earn($rider2, '2026-10-14 01:00:00', '50.01'); }
        $data = $this->summary($user2, 'day')->json('data');
        $this->assertSame('1650.33', $data['total_earned']);
        $this->assertSame('50.01', $data['average_per_delivery']);
        $this->assertSame(33, $data['deliveries_count']);

        $this->assertSame(10033, Money::averageCents(30100, 3));   // 100.333 rounds down
        $this->assertSame(3, Money::averageCents(5, 2));           // 2.5 rounds half up
        $this->assertSame(0, Money::averageCents(0, 0));
    }

    public function test_the_previous_period_and_lifetime_numbers_are_right(): void
    {
        [$user, $rider] = $this->makeRider();
        $this->earn($rider, '2026-10-14 01:00:00');                       // today
        $this->earn($rider, '2026-10-13 01:00:00');                       // yesterday
        $this->earn($rider, '2026-10-13 02:00:00');                       // yesterday
        $this->earn($rider, '2026-06-01 02:00:00', '60.00');              // long ago, a different fee

        $data = $this->summary($user, 'day', '2026-10-14')->json('data');
        $this->assertSame('50.00', $data['total_earned']);
        $this->assertSame('2026-10-13', $data['previous']['start_date']);
        $this->assertSame('100.00', $data['previous']['total_earned']);
        $this->assertSame(2, $data['previous']['deliveries_count']);
        $this->assertSame('210.00', $data['lifetime_total']);
        $this->assertTrue($data['period']['is_current']);
        $this->assertFalse($this->summary($user, 'day', '2026-10-13')->json('data.period.is_current'));
        $this->assertFalse($this->summary($user, 'day', '2026-10-15')->json('data.period.is_current'));
        $this->assertSame('Asia/Manila', $data['period']['timezone']);
    }

    public function test_period_and_date_are_validated(): void
    {
        [$user] = $this->makeRider();

        $this->summary($user, 'year')->assertStatus(422)->assertJsonValidationErrors(['period']);
        $this->summary($user, 'day', '14-10-2026')->assertStatus(422)->assertJsonValidationErrors(['date']);
        $this->summary($user, 'day', '2026-13-45')->assertStatus(422)->assertJsonValidationErrors(['date']);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/earnings/summary')->assertOk()->assertJsonPath('data.period.type', 'day');
    }

    // ─── deliveries list ──────────────────────────────────────────────────────

    public function test_the_deliveries_list_shows_the_periods_rows_newest_first_with_the_fee_on_each(): void
    {
        [$user, $rider] = $this->makeRider();
        $a = $this->earn($rider, '2026-10-14 01:00:00', '50.00');
        $b = $this->earn($rider, '2026-10-14 02:00:00', '75.00');
        $this->earn($rider, '2026-10-13 02:00:00');   // yesterday: not in a day view

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/earnings/deliveries?period=day&date=2026-10-14')->assertOk();

        $this->assertSame([$b->parcel->tracking_number, $a->parcel->tracking_number], array_column($response->json('data'), 'tracking_number'));
        $row = $response->json('data.0');
        $this->assertSame('75.00', $row['fee']);
        $this->assertSame($b->parcel->order->order_number, $row['order_number']);
        $this->assertSame('Poblacion', $row['destination']['barangay_name']);
        $this->assertSame('Makati City', $row['destination']['city']);
        $this->assertSame(2, $response->json('meta.total'));
        $this->assertStringNotContainsString('09998887777', $response->getContent());

        $week = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/earnings/deliveries?period=week&date=2026-10-14')->json('meta.total');
        $this->assertSame(3, $week);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/earnings/deliveries?period=week&date=2026-10-14&per_page=1&page=2')
            ->assertOk()->assertJsonPath('meta.last_page', 3)->assertJsonCount(1, 'data');
    }

    // ─── reconcile (QA) ───────────────────────────────────────────────────────

    public function test_dashboard_totals_reconcile_with_a_raw_count_of_delivered_parcels_and_riders_never_mix(): void
    {
        [$userA, $riderA] = $this->makeRider(first: 'Alpha');
        [$userB, $riderB] = $this->makeRider(first: 'Bravo');

        // Deliver through the real transition so the rows come from the production code path.
        $mineA = [];
        foreach (range(1, 4) as $_) { $p = $this->makeParcel($riderA); $this->deliverVia($p); $mineA[] = $p->tracking_number; }
        $mineB = [];
        foreach (range(1, 7) as $_) { $p = $this->makeParcel($riderB); $this->deliverVia($p); $mineB[] = $p->tracking_number; }
        // Parcels that must not count: failed, still out, and someone else's.
        $f = $this->makeParcel($riderA);
        app(OrderStateMachine::class)->transition($f->order, OrderStatus::DELIVERY_FAILED, 'rider', 1, 'Failed');
        $this->makeParcel($riderA);

        $fee = '42.50'; // 85% of the 50.00 delivery fee on every order here
        foreach ([[$userA, $riderA, $mineA, $mineB], [$userB, $riderB, $mineB, $mineA]] as [$user, $rider, $own, $foreign]) {
            $rawDelivered = Parcel::where('assigned_rider_id', $rider->id)->where('status', Parcel::STATUS_DELIVERED)->count();
            $expectedCents = $rawDelivered * Money::toCents($fee);

            foreach (['day', 'week', 'month'] as $period) {
                $data = $this->summary($user, $period)->json('data');
                $this->assertSame($rawDelivered, $data['deliveries_count'], $period);
                $this->assertSame(Money::fromCents($expectedCents), $data['total_earned'], $period);
            }
            $this->assertSame(Money::fromCents($expectedCents), $this->summary($user, 'day')->json('data.lifetime_total'));

            // The lists contain exactly this rider's parcels and none of the other rider's.
            $listed = collect($this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/earnings/deliveries?period=month&per_page=100')->json('data'))->pluck('tracking_number')->all();
            $this->assertEqualsCanonicalizing($own, $listed);
            $history = collect($this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/history?outcome=delivered&per_page=100')->json('data'))->pluck('tracking_number')->all();
            $this->assertEqualsCanonicalizing($own, $history);
            $this->assertEmpty(array_intersect($foreign, array_merge($listed, $history)));
        }
        $this->assertSame(4, Parcel::where('assigned_rider_id', $riderA->id)->where('status', Parcel::STATUS_DELIVERED)->count());
    }

    // ─── history ──────────────────────────────────────────────────────────────

    /** @return array{0: User, 1: Rider, 2: array<string, Parcel>} a rider with one entry of each kind plus a double failure */
    private function riderWithHistory(): array
    {
        [$user, $rider] = $this->makeRider();

        $delivered = $this->makeParcel($rider, OrderStatus::DELIVERED, Parcel::STATUS_DELIVERED, parcelOverrides: ['cod_collected_at' => now(), 'delivered_at' => now()]);
        RiderEarning::create(['rider_id' => $rider->id, 'parcel_id' => $delivered->id, 'amount' => '50.00', 'earned_at' => Carbon::parse('2026-10-14 02:00:00', 'UTC')]);

        $twice = $this->makeParcel($rider, OrderStatus::DELIVERY_FAILED, Parcel::STATUS_DELIVERY_FAILED);
        DeliveryLog::create(['parcel_id' => $twice->id, 'rider_id' => $rider->id, 'outcome' => 'DELIVERY_FAILED', 'logged_at' => Carbon::parse('2026-10-12 02:00:00', 'UTC'), 'notes' => 'RECIPIENT_UNAVAILABLE: Recipient unavailable - Gate locked, secret code 1234']);
        DeliveryLog::create(['parcel_id' => $twice->id, 'rider_id' => $rider->id, 'outcome' => 'DELIVERY_FAILED', 'logged_at' => Carbon::parse('2026-10-13 02:00:00', 'UTC'), 'notes' => 'REFUSED: Recipient refused the parcel']);

        $returned = $this->makeParcel($rider, OrderStatus::RETURNED, Parcel::STATUS_RETURNED, parcelOverrides: ['returned_at' => Carbon::parse('2026-10-13 05:00:00', 'UTC')]);
        DeliveryLog::create(['parcel_id' => $returned->id, 'rider_id' => $rider->id, 'outcome' => 'DELIVERY_FAILED', 'logged_at' => Carbon::parse('2026-10-13 01:00:00', 'UTC'), 'notes' => 'WRONG_ADDRESS: Wrong or incomplete address']);

        return [$user, $rider, compact('delivered', 'twice', 'returned')];
    }

    private function history(User $user, string $query = '')
    {
        return $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/history' . ($query ? "?{$query}" : ''));
    }

    public function test_history_has_delivered_each_failed_attempt_separately_and_returned_entries_newest_first(): void
    {
        [$user, , $p] = $this->riderWithHistory();

        $response = $this->history($user)->assertOk();
        $rows = $response->json('data');

        $this->assertSame(['delivered', 'returned', 'failed', 'failed', 'failed'], array_column($rows, 'outcome'));
        $this->assertSame(5, $response->json('meta.total'));
        // Newest first.
        $times = array_map(fn ($r) => strtotime($r['occurred_at']), $rows);
        $sorted = $times; rsort($sorted);
        $this->assertSame($sorted, $times);

        $delivered = $rows[0];
        $this->assertSame($p['delivered']->tracking_number, $delivered['tracking_number']);
        $this->assertSame('50.00', $delivered['fee']);
        $this->assertSame('1200.00', $delivered['cod_collected']);
        $this->assertNull($delivered['failure_reason']);
        $this->assertSame('Poblacion', $delivered['destination']['barangay_name']);
        $this->assertSame('Makati City', $delivered['destination']['city']);
        $this->assertSame($p['delivered']->order->order_number, $delivered['order_number']);

        $this->assertSame($p['returned']->tracking_number, $rows[1]['tracking_number']);
        $this->assertNull($rows[1]['fee']);

        // The parcel that failed twice appears twice, each with its own reason label.
        $twiceRows = array_values(array_filter($rows, fn ($r) => $r['tracking_number'] === $p['twice']->tracking_number));
        $this->assertCount(2, $twiceRows);
        $this->assertSame('REFUSED', $twiceRows[0]['failure_reason']['code']);
        $this->assertSame('Recipient refused the parcel', $twiceRows[0]['failure_reason']['label']);
        $this->assertSame('RECIPIENT_UNAVAILABLE', $twiceRows[1]['failure_reason']['code']);
        $this->assertSame('Recipient unavailable', $twiceRows[1]['failure_reason']['label']);
        $this->assertNull($twiceRows[0]['fee']);

        // A returned parcel's earlier failed attempt is its own entry too.
        $returnedRows = array_values(array_filter($rows, fn ($r) => $r['tracking_number'] === $p['returned']->tracking_number));
        $this->assertEqualsCanonicalizing(['returned', 'failed'], array_column($returnedRows, 'outcome'));
    }

    public function test_history_never_exposes_the_recipient_phone_the_riders_free_text_or_the_cod_for_failed_entries(): void
    {
        [$user] = $this->riderWithHistory();

        $body = $this->history($user, 'per_page=100')->assertOk()->getContent();

        $this->assertStringNotContainsString('09998887777', $body);
        $this->assertStringNotContainsString('"phone"', $body);
        $this->assertStringNotContainsString('secret code 1234', $body);
        $this->assertStringNotContainsString('Gate locked', $body);
        $this->assertStringNotContainsString('Ana Buyer', $body);
    }

    public function test_history_filters_by_outcome(): void
    {
        [$user] = $this->riderWithHistory();

        foreach (['delivered' => 1, 'failed' => 3, 'returned' => 1, 'all' => 5] as $outcome => $count) {
            $r = $this->history($user, "outcome={$outcome}")->assertOk();
            $this->assertSame($count, $r->json('meta.total'), $outcome);
            if ($outcome !== 'all') {
                $this->assertSame([$outcome], array_values(array_unique(array_column($r->json('data'), 'outcome'))));
            }
        }
        $this->history($user, 'outcome=bogus')->assertStatus(422)->assertJsonValidationErrors(['outcome']);
    }

    public function test_history_filters_by_manila_date_range_and_search(): void
    {
        [$user, , $p] = $this->riderWithHistory();

        // 2026-10-13 in Manila covers 2026-10-12 16:00Z .. 2026-10-13 16:00Z: two failures and the return.
        $day = $this->history($user, 'from=2026-10-13&to=2026-10-13')->assertOk();
        $this->assertSame(3, $day->json('meta.total'));
        $this->assertSame(0, $this->history($user, 'from=2026-10-15')->json('meta.total'));
        $this->assertSame(5, $this->history($user, 'from=2026-10-12&to=2026-10-14')->json('meta.total'));
        $this->history($user, 'from=2026-10-14&to=2026-10-13')->assertStatus(422)->assertJsonValidationErrors(['to']);

        $this->assertSame(1, $this->history($user, 'search=' . $p['delivered']->tracking_number)->json('meta.total'));
        $this->assertSame(1, $this->history($user, 'search=' . strtolower($p['delivered']->tracking_number))->json('meta.total'));
        $this->assertSame(1, $this->history($user, 'search=' . $p['delivered']->order->order_number)->json('meta.total'));
        $this->assertSame(0, $this->history($user, 'search=NOPE-NOT-A-PARCEL')->json('meta.total'));
        $this->assertSame(0, $this->history($user, 'search=%25')->json('meta.total'));
        $this->assertSame(3, $this->history($user, 'outcome=failed&from=2026-10-12&to=2026-10-13')->json('meta.total'));
    }

    public function test_history_paginates(): void
    {
        [$user] = $this->riderWithHistory();

        $page1 = $this->history($user, 'per_page=2')->assertOk();
        $this->assertCount(2, $page1->json('data'));
        $this->assertSame(3, $page1->json('meta.last_page'));
        $page3 = $this->history($user, 'per_page=2&page=3')->assertOk();
        $this->assertCount(1, $page3->json('data'));

        $seen = array_merge(
            array_column($page1->json('data'), 'occurred_at'),
            array_column($this->history($user, 'per_page=2&page=2')->json('data'), 'occurred_at'),
            array_column($page3->json('data'), 'occurred_at'),
        );
        $this->assertCount(5, $seen);
    }

    public function test_history_only_ever_shows_this_riders_parcels(): void
    {
        [$userA, , $mine] = $this->riderWithHistory();
        [$userB, $riderB] = $this->makeRider(first: 'Other');
        $theirs = $this->makeParcel($riderB, OrderStatus::DELIVERED, Parcel::STATUS_DELIVERED);
        RiderEarning::create(['rider_id' => $riderB->id, 'parcel_id' => $theirs->id, 'amount' => '50.00', 'earned_at' => now()]);
        DeliveryLog::create(['parcel_id' => $theirs->id, 'rider_id' => $riderB->id, 'outcome' => 'DELIVERY_FAILED', 'logged_at' => now(), 'notes' => 'REFUSED: Recipient refused the parcel']);

        $aBody = $this->history($userA, 'per_page=100')->getContent();
        $this->assertStringNotContainsString($theirs->tracking_number, $aBody);
        $bBody = $this->history($userB, 'per_page=100')->getContent();
        $this->assertStringContainsString($theirs->tracking_number, $bBody);
        $this->assertStringNotContainsString($mine['delivered']->tracking_number, $bBody);
        $this->assertSame(2, $this->history($userB)->json('meta.total'));
    }

    public function test_a_parcel_returned_after_a_buyer_dispute_is_not_listed_as_a_failed_delivery_return(): void
    {
        // RETURNED by the seller accepting a return carries no returned_at (only the hub's return action sets it),
        // so it is not part of the delivery history.
        [$user, $rider] = $this->makeRider();
        $this->makeParcel($rider, OrderStatus::RETURNED, Parcel::STATUS_RETURNED);

        $this->assertSame(0, $this->history($user, 'outcome=returned')->json('meta.total'));
    }

    // ─── access ───────────────────────────────────────────────────────────────

    public function test_pending_and_disapproved_riders_get_403_and_unauthenticated_gets_401(): void
    {
        $urls = ['/api/v1/rider/earnings/summary', '/api/v1/rider/earnings/deliveries', '/api/v1/rider/history'];

        foreach ([Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED] as $status) {
            [$user] = $this->makeRider($status);
            foreach ($urls as $url) {
                $this->actingAs($user, 'sanctum')->getJson($url)->assertStatus(403);
            }
        }

        $this->app['auth']->forgetGuards();
        foreach ($urls as $url) {
            $this->getJson($url)->assertStatus(401);
        }
    }

    // ─── backfill ─────────────────────────────────────────────────────────────

    public function test_backfill_creates_only_the_missing_rows_and_is_idempotent(): void
    {
        [, $rider] = $this->makeRider();

        $already = $this->makeParcel($rider, OrderStatus::DELIVERED, Parcel::STATUS_DELIVERED, parcelOverrides: ['delivered_at' => now()->subDays(3)]);
        RiderEarning::create(['rider_id' => $rider->id, 'parcel_id' => $already->id, 'amount' => '60.00', 'earned_at' => now()->subDays(3)]);
        $old1 = $this->makeParcel($rider, OrderStatus::DELIVERED, Parcel::STATUS_DELIVERED, parcelOverrides: ['delivered_at' => now()->subDays(10)]);
        $old2 = $this->makeParcel($rider, OrderStatus::COMPLETED, Parcel::STATUS_DELIVERED, parcelOverrides: ['delivered_at' => now()->subDays(20)]);
        // Must be skipped: no rider, not delivered, failed, returned.
        $noRider = $this->makeParcel(null, OrderStatus::DELIVERED, Parcel::STATUS_DELIVERED);
        $out = $this->makeParcel($rider);
        $failed = $this->makeParcel($rider, OrderStatus::DELIVERY_FAILED, Parcel::STATUS_DELIVERY_FAILED);
        $returned = $this->makeParcel($rider, OrderStatus::RETURNED, Parcel::STATUS_RETURNED);

        $this->artisan('riders:backfill-earnings')->expectsOutputToContain('created 2 rider earnings row(s) (85% of each delivery fee)')->assertSuccessful();

        $this->assertSame('60.00', (string) RiderEarning::where('parcel_id', $already->id)->value('amount'), 'existing row untouched');
        $this->assertSame('42.50', (string) RiderEarning::where('parcel_id', $old1->id)->value('amount'));
        $this->assertSame('42.50', (string) RiderEarning::where('parcel_id', $old2->id)->value('amount'));
        $this->assertSame('7.50', (string) \App\Models\HubEarning::where('parcel_id', $old1->id)->value('amount'), 'the hub share is added too');
        $this->assertEquals($old1->delivered_at->getTimestamp(), RiderEarning::where('parcel_id', $old1->id)->first()->earned_at->getTimestamp(), 'earned at the parcel\'s own delivery time');
        foreach ([$noRider, $out, $failed, $returned] as $skipped) {
            $this->assertSame(0, RiderEarning::where('parcel_id', $skipped->id)->count());
        }

        $total = RiderEarning::count();
        $this->artisan('riders:backfill-earnings')->expectsOutputToContain('created 0 rider earnings row(s)')->assertSuccessful();
        $this->assertSame($total, RiderEarning::count());
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_a_delivered_parcel_shows_in_earnings_and_history_and_a_failed_one_in_history_only(): void
    {
        [$user, $rider] = $this->makeRider();
        $deliver = $this->makeParcel($rider);
        $fail = $this->makeParcel($rider);

        // Through the real rider endpoints.
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        $this->actingAs($user, 'sanctum')->post("/api/v1/rider/deliveries/{$deliver->tracking_number}/delivered", [
            'proof_photo' => UploadedFile::fake()->createWithContent('proof.png', $png), 'cod_collected' => '1',
            'proof_photo_2' => UploadedFile::fake()->createWithContent('proof-2.png', $png . 'x'),
        ], ['Accept' => 'application/json'])->assertOk();
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/deliveries/{$fail->tracking_number}/failed", ['reason' => 'REFUSED'])->assertOk();

        $summary = $this->summary($user, 'day')->json('data');
        $this->assertSame(1, $summary['deliveries_count']);
        $this->assertSame('42.50', $summary['total_earned']);

        $earnings = collect($this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/earnings/deliveries?period=day')->json('data'))->pluck('tracking_number')->all();
        $this->assertSame([$deliver->tracking_number], $earnings);

        $history = collect($this->history($user)->json('data'));
        $this->assertEqualsCanonicalizing(['delivered', 'failed'], $history->pluck('outcome')->all());
        $this->assertSame('42.50', $history->firstWhere('outcome', 'delivered')['fee']);
        $this->assertSame('1200.00', $history->firstWhere('outcome', 'delivered')['cod_collected']);
        $this->assertSame('REFUSED', $history->firstWhere('outcome', 'failed')['failure_reason']['code']);
        $this->assertSame($fail->tracking_number, $history->firstWhere('outcome', 'failed')['tracking_number']);

        // The failed parcel earned nothing.
        $this->assertSame(0, RiderEarning::where('parcel_id', $fail->id)->count());
    }
}
