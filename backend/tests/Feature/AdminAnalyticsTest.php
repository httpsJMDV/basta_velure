<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\AdminAnalyticsService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The admin dashboard and the Analytics & Reports page read the same service, so for the same range every shared figure
 * is equal, and equal to a recount done here by plain PHP over the fixtures (not by the SQL under test). The clock is
 * fixed, and the fixtures sit on both sides of the Asia/Manila day boundary and the window start.
 *
 * "Now" is 2026-10-16 03:00 UTC = 11:00 on 16 Oct in Manila, so the dashboard window (30 days) is 17 Sep to 16 Oct.
 */
class AdminAnalyticsTest extends TestCase
{
    use DatabaseTransactions;

    private const TZ = 'Asia/Manila';

    private User $admin;
    private User $buyer1;
    private User $buyer2;
    private User $seller1;
    private User $seller2;
    private Category $electronics;
    private Category $pantry;

    /** @var array<int, array<string, mixed>> the fixtures, as plain data, for the independent recount */
    private array $fixtures = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Carbon::setTestNow(CarbonImmutable::parse('2026-10-16 03:00:00', 'UTC'));

        $this->admin = $this->makeUser('admin');
        $this->buyer1 = $this->makeUser('buyer');
        $this->buyer2 = $this->makeUser('buyer');
        $this->seller1 = $this->makeSeller('Marco Gadgets');
        $this->seller2 = $this->makeSeller('Liza Pantry');

        $this->electronics = Category::updateOrCreate(['slug' => 'test-electronics'], ['name' => 'Test Electronics', 'sort_order' => 90, 'is_active' => true, 'requires_fda' => false]);
        $this->pantry = Category::updateOrCreate(['slug' => 'test-pantry'], ['name' => 'Test Pantry', 'sort_order' => 91, 'is_active' => true, 'requires_fda' => false]);

        $this->buildFixtures();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private function makeUser(string $role): User
    {
        $user = new User([
            'first_name' => ucfirst($role), 'last_name' => 'Tester',
            'email' => $role . '.' . uniqid() . '@example.com', 'phone' => '+63917' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male',
        ]);
        $user->role = $role;
        $user->status = 'active';
        $user->save();

        return $user;
    }

    /** An approved seller is a buyer account with an approved seller profile: users.role is never "seller". */
    private function makeSeller(string $shop): User
    {
        $user = $this->makeUser('buyer');
        SellerProfile::forceCreate([
            'user_id' => $user->id, 'shop_name' => $shop . ' ' . uniqid(), 'shop_category' => 'x', 'shop_description' => 'x',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'x' . $user->id), 'government_id_image_path' => 'x.png',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
        ]);

        return $user;
    }

    /**
     * @param array{at: string, buyer: User, seller: User, status: string, method: string, total: float, sub: float, qty: int, commission: float, earnings: float, category: Category, deleted?: bool} $f
     */
    private function order(array $f): Order
    {
        $order = Order::forceCreate([
            'buyer_id' => $f['buyer']->id, 'checkout_group_id' => (string) \Illuminate\Support\Str::uuid(),
            'order_number' => 'VEL-T-' . uniqid(), 'subtotal' => $f['sub'], 'shipping_fee' => $f['total'] - $f['sub'], 'total' => $f['total'],
            'payment_method' => $f['method'], 'payment_status' => 'pending', 'status' => $f['status'],
            'created_at' => $f['at'], 'updated_at' => $f['at'],
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $f['seller']->id, 'category_id' => (string) $f['category']->id,
            'product_name' => 'Thing', 'unit_price' => $f['sub'] / $f['qty'], 'quantity' => $f['qty'], 'subtotal' => $f['sub'],
            // Stored values on purpose: not 10% of anything, so only a sum of the stored amounts can match.
            'commission_rate' => 0.1, 'commission_amount' => $f['commission'], 'seller_earnings' => $f['earnings'], 'payout_status' => 'pending_release',
        ]);
        if (! empty($f['deleted'])) {
            $order->delete();
        }

        return $order;
    }

    private function buildFixtures(): void
    {
        $e = $this->electronics;
        $p = $this->pantry;
        $rows = [
            // In the window, counted.
            ['at' => '2026-10-16 02:00:00', 'buyer' => $this->buyer1, 'seller' => $this->seller1, 'status' => 'DELIVERED', 'method' => 'gcash', 'total' => 1000.00, 'sub' => 900.00, 'qty' => 3, 'commission' => 90.00, 'earnings' => 810.00, 'category' => $e],
            // 23:59:59 on 15 Oct in Manila.
            ['at' => '2026-10-15 15:59:59', 'buyer' => $this->buyer2, 'seller' => $this->seller2, 'status' => 'COMPLETED', 'method' => 'cod', 'total' => 500.00, 'sub' => 400.00, 'qty' => 2, 'commission' => 33.33, 'earnings' => 366.67, 'category' => $p],
            // 00:00:00 on 16 Oct in Manila, one second later.
            ['at' => '2026-10-15 16:00:00', 'buyer' => $this->buyer1, 'seller' => $this->seller2, 'status' => 'PLACED', 'method' => 'cod', 'total' => 250.00, 'sub' => 150.00, 'qty' => 1, 'commission' => 15.00, 'earnings' => 135.00, 'category' => $p],
            // DISPUTED is not excluded.
            ['at' => '2026-10-12 06:00:00', 'buyer' => $this->buyer2, 'seller' => $this->seller1, 'status' => 'DISPUTED', 'method' => 'gcash', 'total' => 600.00, 'sub' => 500.00, 'qty' => 4, 'commission' => 50.55, 'earnings' => 449.45, 'category' => $e],
            // The first second of the window (17 Sep 00:00 in Manila = 16 Sep 16:00 UTC).
            ['at' => '2026-09-16 16:00:00', 'buyer' => $this->buyer1, 'seller' => $this->seller1, 'status' => 'DELIVERED', 'method' => 'cod', 'total' => 222.00, 'sub' => 200.00, 'qty' => 2, 'commission' => 22.20, 'earnings' => 177.80, 'category' => $e],
            // Placed, but excluded from every counted figure.
            ['at' => '2026-10-14 05:00:00', 'buyer' => $this->buyer1, 'seller' => $this->seller1, 'status' => 'CANCELLED', 'method' => 'gcash', 'total' => 777.00, 'sub' => 700.00, 'qty' => 7, 'commission' => 77.70, 'earnings' => 622.30, 'category' => $e],
            ['at' => '2026-10-13 05:00:00', 'buyer' => $this->buyer2, 'seller' => $this->seller2, 'status' => 'RETURNED', 'method' => 'cod', 'total' => 333.00, 'sub' => 300.00, 'qty' => 3, 'commission' => 33.30, 'earnings' => 266.70, 'category' => $p],
            // One second before the window (23:59:59 on 16 Sep in Manila): outside it.
            ['at' => '2026-09-16 15:59:59', 'buyer' => $this->buyer2, 'seller' => $this->seller2, 'status' => 'DELIVERED', 'method' => 'cod', 'total' => 111.00, 'sub' => 100.00, 'qty' => 1, 'commission' => 11.10, 'earnings' => 88.90, 'category' => $p],
            // Long before the window.
            ['at' => '2026-08-01 05:00:00', 'buyer' => $this->buyer2, 'seller' => $this->seller2, 'status' => 'COMPLETED', 'method' => 'gcash', 'total' => 4000.00, 'sub' => 3900.00, 'qty' => 9, 'commission' => 400.00, 'earnings' => 3500.00, 'category' => $p],
            // Soft-deleted: never counted.
            ['at' => '2026-10-12 07:00:00', 'buyer' => $this->buyer1, 'seller' => $this->seller1, 'status' => 'DELIVERED', 'method' => 'gcash', 'total' => 10000.00, 'sub' => 9900.00, 'qty' => 9, 'commission' => 990.00, 'earnings' => 8910.00, 'category' => $e, 'deleted' => true],
        ];
        foreach ($rows as $row) {
            $order = $this->order($row);
            $this->fixtures[] = $row + ['id' => $order->id];
        }

        // Disputes: one open and one in progress inside the window, one resolved, one old and still open.
        $first = Order::where('order_number', 'like', 'VEL-T-%')->orderBy('id')->first();
        foreach ([['open', '2026-10-15 10:00:00'], ['in_progress', '2026-10-01 10:00:00'], ['resolved', '2026-10-10 10:00:00'], ['open', '2026-08-02 10:00:00']] as [$status, $at]) {
            Dispute::forceCreate(['order_id' => $first->id, 'buyer_id' => $this->buyer1->id, 'reason' => 'x', 'status' => $status, 'created_at' => $at, 'updated_at' => $at]);
        }
    }

    // ── The independent recount ──────────────────────────────────────────────

    /** The Manila date of a fixture. */
    private function day(array $f): string
    {
        return CarbonImmutable::parse($f['at'], 'UTC')->setTimezone(self::TZ)->toDateString();
    }

    /**
     * What the figures must be for the Manila days $from..$to, by looping over the fixtures.
     *
     * @return array<string, mixed>
     */
    private function recount(string $from, string $to): array
    {
        $in = fn (array $f) => empty($f['deleted']) && $this->day($f) >= $from && $this->day($f) <= $to;
        $placed = array_values(array_filter($this->fixtures, $in));
        $counted = array_values(array_filter($placed, fn ($f) => ! in_array($f['status'], ['CANCELLED', 'RETURNED'], true)));

        $by = fn (array $rows, string $key) => count(array_unique(array_map(fn ($f) => $f[$key]->id, $rows)));
        $sum = fn (array $rows, string $key) => round(array_sum(array_map(fn ($f) => $f[$key], $rows)), 2);
        $method = fn (string $m) => array_values(array_filter($counted, fn ($f) => $f['method'] === $m));

        $statuses = [];
        foreach ($placed as $f) {
            $statuses[$f['status']] = ($statuses[$f['status']] ?? 0) + 1;
        }

        return [
            'gmv'           => $sum($counted, 'total'),
            'orders'        => count($counted),
            'orders_placed' => count($placed),
            'cancelled'     => count(array_filter($placed, fn ($f) => $f['status'] === 'CANCELLED')),
            'returned'      => count(array_filter($placed, fn ($f) => $f['status'] === 'RETURNED')),
            'commission'    => $sum($counted, 'commission'),
            'earnings'      => $sum($counted, 'earnings'),
            'units'         => array_sum(array_map(fn ($f) => $f['qty'], $counted)),
            'buyers'        => $by($counted, 'buyer'),
            'sellers'       => $by($counted, 'seller'),
            'gcash'         => ['count' => count($method('gcash')), 'volume' => $sum($method('gcash'), 'total')],
            'cod'           => ['count' => count($method('cod')), 'volume' => $sum($method('cod'), 'total')],
            'statuses'      => $statuses,
            'days'          => $counted,
        ];
    }

    // ── Dashboard = reports = recount ───────────────────────────────────────

    public function test_every_dashboard_figure_equals_the_reports_figure_and_the_raw_recount_for_the_same_range(): void
    {
        Sanctum::actingAs($this->admin);

        $stats = $this->getJson('/api/v1/admin/stats')->assertOk()->json('data');
        $window = $stats['window'];
        $this->assertSame(['from' => '2026-09-17', 'to' => '2026-10-16', 'days' => 30, 'timezone' => 'Asia/Manila'], collect($window)->only(['from', 'to', 'days', 'timezone'])->all());

        $reports = $this->getJson("/api/v1/admin/reports/summary?from={$window['from']}&to={$window['to']}")->assertOk()->json('data');
        $split = $this->getJson("/api/v1/admin/reports/payment-method-split?from={$window['from']}&to={$window['to']}")->assertOk()->json('data');
        $chart = $this->getJson("/api/v1/admin/reports/revenue-chart?from={$window['from']}&to={$window['to']}")->assertOk()->json('data');
        $expected = $this->recount($window['from'], $window['to']);

        // Sanity: the recount is the numbers worked out by hand in the fixtures above.
        $this->assertSame(2572.0, $expected['gmv']);
        $this->assertSame(5, $expected['orders']);
        $this->assertSame(7, $expected['orders_placed']);
        $this->assertSame(211.08, $expected['commission']);

        // Dashboard window == reports == recount.
        $m = $stats['metrics'];
        $this->assertEquals($expected['gmv'], $m['gmv']);
        $this->assertEquals($expected['gmv'], $reports['total_gmv']);
        $this->assertSame($expected['orders'], $m['orders']);
        $this->assertSame($expected['orders'], $reports['total_orders']);
        $this->assertSame($expected['orders_placed'], $m['orders_placed']);
        $this->assertSame($expected['orders_placed'], $reports['orders_placed']);
        $this->assertSame($expected['cancelled'], $m['cancelled_orders']);
        $this->assertSame($expected['returned'], $reports['returned_orders']);
        $this->assertEquals($expected['commission'], $m['commission']);
        $this->assertEquals($expected['commission'], $reports['total_commission']);
        $this->assertEquals($expected['earnings'], $reports['total_seller_earnings']);
        $this->assertSame($expected['units'], $reports['total_units_sold']);
        $this->assertSame($expected['units'], $m['units_sold']);
        $this->assertSame($expected['buyers'], $m['active_buyers']);
        $this->assertSame($expected['buyers'], $reports['active_buyers']);
        $this->assertSame($expected['sellers'], $m['active_sellers']);
        $this->assertSame($expected['sellers'], $reports['active_sellers']);
        $this->assertEquals(round($expected['commission'] / $expected['gmv'] * 100, 2), $reports['avg_commission_rate']);
        $this->assertEquals($m['avg_commission_rate'], $reports['avg_commission_rate']);

        // Payment split: dashboard == reports == recount, and the original dashboard keys carry the same numbers.
        foreach (['gcash', 'cod'] as $method) {
            $this->assertEquals($expected[$method], $split[$method]);
            $this->assertEquals($expected[$method], $stats['payment_split'][$method]);
            $this->assertSame($expected[$method]['count'], $stats["{$method}_orders_count"]);
            $this->assertEquals($expected[$method]['volume'], $stats["{$method}_volume"]);
        }
        $this->assertSame($expected['orders'], $split['total_orders']);

        // Pipeline: every OrderStatus once; the groups add up to every order placed.
        $this->assertSame($expected['orders_placed'], $stats['pipeline']['total']);
        $this->assertSame($stats['pipeline'], $reports['pipeline']);
        foreach (\App\Enums\OrderStatus::cases() as $case) {
            $this->assertSame($expected['statuses'][$case->value] ?? 0, $stats['pipeline']['by_status'][$case->value], $case->value);
        }
        $this->assertSame(7, array_sum(array_column($stats['pipeline']['groups'], 'count')));
        $allStatuses = collect($stats['pipeline']['groups'])->pluck('statuses')->flatten();
        $this->assertEqualsCanonicalizing(\App\Enums\OrderStatus::values(), $allStatuses->all());

        // Disputes: opened in the window (two), open right now (three: the old one still counts).
        $this->assertSame(['opened' => 3, 'open_now' => 3], $stats['disputes']);
        $this->assertSame($stats['disputes'], $reports['disputes']);
        $this->assertSame(3, $stats['open_disputes']);

        // The daily series: the dashboard feed, the reports chart and the recount agree day by day.
        $feed = $this->getJson('/api/v1/admin/dashboard-feed')->assertOk()->json('data.chart_data');
        $this->assertCount(30, $feed);
        $this->assertCount(30, $chart);
        $byDay = collect($expected['days'])->groupBy(fn ($f) => $this->day($f));
        foreach ($feed as $i => $point) {
            $rows = $byDay->get($point['date'], collect());
            $this->assertEquals($rows->sum('total'), $point['gmv'], "gmv on {$point['date']}");
            $this->assertEquals(round($rows->sum('commission'), 2), $point['commission'], "commission on {$point['date']}");
            $this->assertSame($rows->count(), $point['orders'], "orders on {$point['date']}");
            $this->assertSame($point['date'], $chart[$i]['iso_date']);
            $this->assertEquals($point['gmv'], $chart[$i]['gmv']);
            $this->assertEquals($point['commission'], $chart[$i]['commission']);
            $this->assertSame($point['orders'], $chart[$i]['orders_count']);
        }
        $this->assertEquals($expected['gmv'], round(array_sum(array_column($feed, 'gmv')), 2));
        $this->assertSame(2, collect($feed)->firstWhere('date', '2026-10-16')['orders'], 'a Manila-midnight order belongs to 16 Oct');
        $this->assertSame(1, collect($feed)->firstWhere('date', '2026-10-15')['orders'], 'the 23:59:59 order belongs to 15 Oct');
        $this->assertSame(0, collect($feed)->firstWhere('date', '2026-10-14')['orders'], 'the cancelled order is not counted');
        $this->assertSame(1, collect($feed)->firstWhere('date', '2026-10-14')['orders_placed'], 'but it was placed');
        $this->assertSame(1, collect($feed)->firstWhere('date', '2026-09-17')['orders'], 'the first second of the window is in');
        $this->assertSame(1, collect($feed)->firstWhere('date', '2026-09-17')['orders_placed']);
    }

    public function test_the_manila_day_boundary_decides_which_day_an_order_belongs_to(): void
    {
        Sanctum::actingAs($this->admin);

        foreach ([['2026-10-15', '2026-10-15'], ['2026-10-16', '2026-10-16'], ['2026-10-15', '2026-10-16'], ['2026-09-16', '2026-09-16'], ['2026-09-17', '2026-09-17']] as [$from, $to]) {
            $expected = $this->recount($from, $to);
            $r = $this->getJson("/api/v1/admin/reports/summary?from={$from}&to={$to}")->assertOk()->json('data');
            $this->assertEquals($expected['gmv'], $r['total_gmv'], "{$from}..{$to}");
            $this->assertSame($expected['orders'], $r['total_orders'], "{$from}..{$to}");
            $this->assertEquals($expected['commission'], $r['total_commission'], "{$from}..{$to}");
        }

        // The two orders either side of Manila midnight land on different days.
        $this->assertEquals(500.0, $this->getJson('/api/v1/admin/reports/summary?from=2026-10-15&to=2026-10-15')->json('data.total_gmv'));
        $this->assertEquals(1250.0, $this->getJson('/api/v1/admin/reports/summary?from=2026-10-16&to=2026-10-16')->json('data.total_gmv'));
        // The order one second before the window starts is on 16 Sep, the one at the start on 17 Sep.
        $this->assertEquals(111.0, $this->getJson('/api/v1/admin/reports/summary?from=2026-09-16&to=2026-09-16')->json('data.total_gmv'));
        $this->assertEquals(222.0, $this->getJson('/api/v1/admin/reports/summary?from=2026-09-17&to=2026-09-17')->json('data.total_gmv'));
    }

    public function test_cancelled_returned_and_soft_deleted_orders_never_count_and_commission_is_the_stored_sum(): void
    {
        Sanctum::actingAs($this->admin);
        $r = $this->getJson('/api/v1/admin/reports/summary?from=2026-08-01&to=2026-10-16')->assertOk()->json('data');

        // 5 in the window + the 16 Sep 15:59:59 one + the August one; not the cancelled, returned or deleted.
        $expected = $this->recount('2026-08-01', '2026-10-16');
        $this->assertSame(7, $expected['orders']);
        $this->assertSame(7, $r['total_orders']);
        $this->assertEquals(2572.0 + 111.0 + 4000.0, $r['total_gmv']);
        // 90 + 33.33 + 15 + 50.55 + 22.20 + 11.10 + 400: exactly the stored amounts.
        $this->assertEquals(622.18, $r['total_commission']);
        $this->assertSame(1, $r['cancelled_orders']);
        $this->assertSame(1, $r['returned_orders']);
        $this->assertSame(9, $r['orders_placed']);

        // The dashboard's lifetime commission is the same sum.
        $this->assertEquals(622.18, $this->getJson('/api/v1/admin/stats')->json('data.commission_lifetime'));
    }

    public function test_the_original_response_keys_are_all_still_there(): void
    {
        Sanctum::actingAs($this->admin);

        $stats = $this->getJson('/api/v1/admin/stats')->assertOk()->json('data');
        foreach ([
            'pending_seller_applications', 'pending_buyer_applications', 'pending_rider_applications', 'pending_products', 'total_buyers',
            'total_sellers', 'total_riders', 'orders_today', 'orders_yesterday', 'open_disputes', 'new_buyers_this_week', 'new_buyers_last_week',
            'pending_sellers_this_week', 'pending_sellers_last_week', 'gmv_today', 'gmv_yesterday', 'commission_today', 'commission_this_week',
            'commission_this_month', 'commission_lifetime', 'gcash_orders_count', 'cod_orders_count', 'gcash_volume', 'cod_volume',
            'pending_payment_verifications', 'pending_payout_requests',
        ] as $key) {
            $this->assertArrayHasKey($key, $stats, "/admin/stats lost {$key}");
        }

        // "Today" is the Manila day: 16 Oct holds two counted orders (1000 + 250), yesterday one (500).
        $this->assertSame(2, $stats['orders_today']);
        $this->assertEquals(1250.0, $stats['gmv_today']);
        $this->assertEquals(105.0, $stats['commission_today']);
        $this->assertSame(1, $stats['orders_yesterday']);
        $this->assertEquals(500.0, $stats['gmv_yesterday']);
        // Sellers are counted by their approved shop (the role is "buyer"); buyers by role.
        $this->assertSame(2, $stats['total_sellers']);
        $this->assertSame(4, $stats['total_buyers']);

        $this->getJson('/api/v1/admin/reports/summary')->assertOk()->assertJsonStructure(['data' => [
            'total_gmv', 'total_commission', 'total_seller_earnings', 'total_orders', 'total_units_sold', 'avg_commission_rate',
        ]]);
        $this->getJson('/api/v1/admin/reports/revenue-chart')->assertOk()->assertJsonStructure(['data' => [['date', 'iso_date', 'gmv', 'commission', 'orders_count']]]);
        $this->getJson('/api/v1/admin/reports/category-breakdown')->assertOk()->assertJsonStructure(['data' => [['category', 'gross_sales', 'units_sold', 'orders_count', 'commission_rate', 'commission_earned']]]);
        $this->getJson('/api/v1/admin/reports/top-sellers')->assertOk()->assertJsonStructure(['data' => [['seller_id', 'seller_name', 'shop_name', 'email', 'gross_sales', 'orders_count', 'units_sold', 'commission_generated', 'net_payout_credited', 'avg_order_value']]]);
        $this->getJson('/api/v1/admin/reports/payment-method-split')->assertOk()->assertJsonStructure(['data' => ['gcash' => ['count', 'volume'], 'cod' => ['count', 'volume'], 'total_orders', 'total_volume']]);
        $feed = $this->getJson('/api/v1/admin/dashboard-feed')->assertOk()->json('data');
        $this->assertArrayHasKey('attention_items', $feed);
        $this->assertArrayHasKey('recent_activity', $feed);
        foreach (['date', 'new_sellers', 'orders', 'gmv'] as $key) {
            $this->assertArrayHasKey($key, $feed['chart_data'][0]);
        }
    }

    // ── Presets, validation, empty data, categories, sellers ────────────────

    public function test_presets_are_manila_days_ending_today_and_all_starts_at_the_first_order(): void
    {
        Sanctum::actingAs($this->admin);
        $service = app(AdminAnalyticsService::class);

        $this->assertSame(['2026-10-10', '2026-10-16', 7], [$service->preset('7d')['from'], $service->preset('7d')['to'], $service->preset('7d')['days']]);
        $this->assertSame(['2026-09-17', '2026-10-16', 30], [$service->preset('30d')['from'], $service->preset('30d')['to'], $service->preset('30d')['days']]);
        $this->assertSame('2026-08-01', $service->preset('all')['from']);

        $r = $this->getJson('/api/v1/admin/reports/summary?range=7d')->assertOk()->json('data');
        $this->assertSame(['from' => '2026-10-10', 'to' => '2026-10-16', 'days' => 7, 'timezone' => 'Asia/Manila', 'preset' => '7d'], $r['range']);
        $expected = $this->recount('2026-10-10', '2026-10-16');
        $this->assertEquals($expected['gmv'], $r['total_gmv']);

        // Explicit dates win over a preset; a monthly chart buckets by Manila month.
        $monthly = $this->getJson('/api/v1/admin/reports/revenue-chart?range=7d&from=2026-08-01&to=2026-10-16&interval=monthly')->assertOk();
        $this->assertSame(['2026-08-01', '2026-09-01', '2026-10-01'], array_column($monthly->json('data'), 'iso_date'));
        $this->assertEquals([4000.0, 333.0, 2350.0], array_column($monthly->json('data'), 'gmv'));
        $this->assertSame(['Aug 2026', 'Sep 2026', 'Oct 2026'], array_column($monthly->json('data'), 'date'));
    }

    public function test_bad_ranges_are_rejected_and_only_admins_get_in(): void
    {
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/v1/admin/reports/summary?from=2026-10-16&to=2026-10-01')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/admin/reports/summary?from=16-10-2026&to=2026-10-20')->assertStatus(422)->assertJsonValidationErrors('from');
        $this->getJson('/api/v1/admin/reports/summary?from=2026-10-01')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/admin/reports/summary?from=2020-01-01&to=2026-10-16')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/admin/reports/summary?range=forever')->assertStatus(422)->assertJsonValidationErrors('range');

        Sanctum::actingAs($this->buyer1);
        $this->getJson('/api/v1/admin/stats')->assertForbidden();
        $this->getJson('/api/v1/admin/reports/summary')->assertForbidden();
    }

    public function test_an_empty_range_shows_zeros_and_a_null_rate_never_a_made_up_one(): void
    {
        Sanctum::actingAs($this->admin);
        $r = $this->getJson('/api/v1/admin/reports/summary?from=2026-01-01&to=2026-01-31')->assertOk()->json('data');

        $this->assertEquals(0, $r['total_gmv']);
        $this->assertSame(0, $r['total_orders']);
        $this->assertEquals(0, $r['total_commission']);
        $this->assertNull($r['avg_commission_rate'], 'there was no GMV to take a rate of');
        $this->assertSame(0, $r['pipeline']['total']);
        $this->assertSame([], $this->getJson('/api/v1/admin/reports/top-sellers?from=2026-01-01&to=2026-01-31')->json('data'));
        $this->assertSame([], $this->getJson('/api/v1/admin/reports/category-breakdown?from=2026-01-01&to=2026-01-31')->json('data'));
        $chart = $this->getJson('/api/v1/admin/reports/revenue-chart?from=2026-01-01&to=2026-01-31')->json('data');
        $this->assertCount(31, $chart);
        $this->assertSame(0, array_sum(array_column($chart, 'orders_count')));
    }

    public function test_top_sellers_and_categories_use_the_order_items_not_the_account_role(): void
    {
        Sanctum::actingAs($this->admin);

        $sellers = $this->getJson('/api/v1/admin/reports/top-sellers?from=2026-09-17&to=2026-10-16')->assertOk()->json('data');
        // seller1: 900 + 500 + 200 = 1600 over 3 orders; seller2: 400 + 150 = 550 over 2 orders. Both are role "buyer".
        $this->assertSame([$this->seller1->id, $this->seller2->id], array_column($sellers, 'seller_id'));
        $this->assertEquals(1600.0, $sellers[0]['gross_sales']);
        $this->assertSame(3, $sellers[0]['orders_count']);
        $this->assertSame(9, $sellers[0]['units_sold']);
        $this->assertEquals(162.75, $sellers[0]['commission_generated']);
        $this->assertEquals(1437.25, $sellers[0]['net_payout_credited']);
        $this->assertEquals(533.33, $sellers[0]['avg_order_value']);
        $this->assertEquals(550.0, $sellers[1]['gross_sales']);
        $this->assertStringStartsWith('Marco Gadgets', $sellers[0]['shop_name']);

        $categories = collect($this->getJson('/api/v1/admin/reports/category-breakdown?from=2026-09-17&to=2026-10-16')->assertOk()->json('data'))->keyBy('category');
        $this->assertEquals(['Test Electronics', 'Test Pantry'], $categories->keys()->sortBy(fn ($k) => $k)->values()->all());
        $this->assertEquals(1600.0, $categories['Test Electronics']['gross_sales']);
        $this->assertSame(9, $categories['Test Electronics']['units_sold']);
        $this->assertEquals(162.75, $categories['Test Electronics']['commission_earned']);
        $this->assertEquals(10.17, $categories['Test Electronics']['commission_rate'], 'stored commission over stored sales');
        $this->assertEquals(550.0, $categories['Test Pantry']['gross_sales']);
        $this->assertEquals(48.33, $categories['Test Pantry']['commission_earned']);
    }
}
