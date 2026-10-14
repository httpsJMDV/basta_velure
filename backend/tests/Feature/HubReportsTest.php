<?php

namespace Tests\Feature;

use App\Models\DeliveryLog;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Feature 1.10: hub reports. The fixture is built from explicit timestamps (Asia/Manila wall-clock times converted to
 * UTC for storage) and the clock is frozen, so every figure can be checked by hand and by an independent oracle that
 * loads the rows and recomputes everything in PHP.
 */
class HubReportsTest extends TestCase
{
    use DatabaseTransactions;

    private const TZ = 'Asia/Manila';

    protected SortingCenter $hub;
    protected User $hubUser;
    protected SortingCenter $otherHub;
    protected User $otherHubUser;
    /** @var array<string, Rider> */
    protected array $riders = [];
    /** @var array<string, Parcel> */
    protected array $parcels = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-14 12:00:00', self::TZ));
        config(['logistics.delivery_sla_hours' => 48]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Fixture helpers ──────────────────────────────────────────────────────

    protected function user(string $role, string $first, string $last = 'Tester'): User
    {
        return User::forceCreate([
            'first_name' => $first,
            'last_name'  => $last,
            'email'      => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone'      => '0917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => $role,
            'status'     => 'active',
        ]);
    }

    protected function makeHub(string $status = SortingCenter::STATUS_APPROVED): array
    {
        $owner = $this->user('buyer', 'Hub');
        $hub = SortingCenter::create([
            'user_id' => $owner->id, 'hub_name' => 'Hub ' . uniqid(), 'address_province' => 'Laguna',
            'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '1 Hub St',
            'status' => $status, 'coverage_barangays' => ['043405001'],
        ]);

        return [$owner, $hub];
    }

    protected function makeRider(SortingCenter $hub, string $first, string $last = 'Rider', string $status = Rider::STATUS_ACTIVE): Rider
    {
        $user = $this->user('rider', $first, $last);

        return Rider::create([
            'user_id' => $user->id, 'sorting_center_id' => $hub->id, 'vehicle_type' => Rider::VEHICLE_MOTORCYCLE,
            'plate_number' => 'AB-' . rand(1000, 9999), 'or_cr_path' => 'ids/a.pdf', 'drivers_license_path' => 'ids/b.pdf',
            'status' => $status, 'submitted_at' => now(),
        ]);
    }

    /** A Manila wall-clock time as a UTC Carbon (what the database stores). */
    protected function at(?string $manila): ?Carbon
    {
        return $manila === null ? null : Carbon::parse($manila, self::TZ)->utc();
    }

    /**
     * @param array<string, string|null> $times scanned, sorted, assigned, ofd, delivered, returned (Manila wall clock)
     */
    protected function parcel(string $key, SortingCenter $hub, string $status, array $times, ?Rider $assigned = null): Parcel
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $this->user('buyer', 'Buyer')->id,
            'status' => 'DELIVERED', 'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'gcash',
            'shipping_name' => 'Ana', 'shipping_phone' => '09998887777', 'shipping_address' => '1 St',
            'shipping_province' => 'Laguna', 'shipping_city' => 'Calamba', 'shipping_barangay' => 'Real',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043405000', 'shipping_barangay_code' => '043405001',
        ]);

        return $this->parcels[$key] = Parcel::create([
            'tracking_number' => 'LIT-261014-' . strtoupper(substr(uniqid(), -6)),
            'order_id' => $order->id, 'seller_id' => $this->user('seller', 'Seller')->id, 'status' => $status,
            'sorting_center_id' => $hub->id, 'assigned_rider_id' => $assigned?->id,
            'destination_barangay' => 'Real', 'destination_barangay_code' => '043405001',
            'scanned_in_at' => $this->at($times['scanned'] ?? null), 'sorted_at' => $this->at($times['sorted'] ?? null),
            'assigned_at' => $this->at($times['assigned'] ?? null), 'out_for_delivery_at' => $this->at($times['ofd'] ?? null),
            'delivered_at' => $this->at($times['delivered'] ?? null), 'returned_at' => $this->at($times['returned'] ?? null),
        ]);
    }

    protected function log(Parcel $parcel, Rider $rider, string $outcome, string $manila): DeliveryLog
    {
        return DeliveryLog::create([
            'parcel_id' => $parcel->id, 'rider_id' => $rider->id, 'outcome' => $outcome, 'logged_at' => $this->at($manila),
        ]);
    }

    /**
     * Hub A (the hub under test), three active riders plus a disapproved one, and a second hub with its own data.
     * See the comments for what each parcel is there to prove.
     */
    protected function buildFixture(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        [$this->otherHubUser, $this->otherHub] = $this->makeHub();

        $this->riders['r1'] = $r1 = $this->makeRider($this->hub, 'Alice', 'Alpha');
        $this->riders['r2'] = $r2 = $this->makeRider($this->hub, 'Bob', 'Bravo');
        $this->riders['r3'] = $this->makeRider($this->hub, 'Cara', 'Idle');
        $this->riders['bad'] = $this->makeRider($this->hub, 'Dan', 'Disapproved', Rider::STATUS_DISAPPROVED);
        $this->riders['rb'] = $rb = $this->makeRider($this->otherHub, 'Eve', 'OtherHub');

        // P1: a plain on-time delivery by R1 on Oct 10 (dwell 3h, delivery 6h).
        $p1 = $this->parcel('p1', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'sorted' => '2026-10-10 10:00:00', 'assigned' => '2026-10-10 11:00:00', 'ofd' => '2026-10-10 12:00:00', 'delivered' => '2026-10-10 18:00:00'], $r1);
        $this->log($p1, $r1, 'DELIVERED', '2026-10-10 18:00:00');

        // P2: received at 23:59:59, delivered by R2 exactly 48h later (on time, at the SLA boundary).
        $p2 = $this->parcel('p2', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 23:59:59', 'sorted' => '2026-10-11 08:00:00', 'assigned' => '2026-10-12 08:00:00', 'ofd' => '2026-10-12 20:00:00', 'delivered' => '2026-10-12 23:59:59'], $r2);
        $this->log($p2, $r2, 'DELIVERED', '2026-10-12 23:59:59');

        // P3: received at exactly 00:00:00 on Oct 11, delivered by R1 48h and one second later (late, next day).
        $p3 = $this->parcel('p3', $this->hub, 'DELIVERED', ['scanned' => '2026-10-11 00:00:00', 'sorted' => '2026-10-11 08:00:00', 'assigned' => '2026-10-12 09:00:00', 'ofd' => '2026-10-12 10:00:00', 'delivered' => '2026-10-13 00:00:01'], $r1);
        $this->log($p3, $r1, 'DELIVERED', '2026-10-13 00:00:01');

        // P4: R1 fails it on Oct 11, the hub reschedules it and R2 delivers it on Oct 12 (55h: late).
        // The failure belongs to R1 and the delivery to R2, although assigned_rider_id now points at R2.
        $p4 = $this->parcel('p4', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 08:00:00', 'sorted' => '2026-10-10 09:00:00', 'assigned' => '2026-10-12 11:00:00', 'ofd' => '2026-10-12 12:00:00', 'delivered' => '2026-10-12 15:00:00'], $r2);
        $this->log($p4, $r1, 'DELIVERY_FAILED', '2026-10-11 10:00:00');
        $this->log($p4, $r2, 'DELIVERED', '2026-10-12 15:00:00');

        // P5: R2 fails it twice (Oct 11 and Oct 13) and it has not been delivered.
        $p5 = $this->parcel('p5', $this->hub, 'DELIVERY_FAILED', ['scanned' => '2026-10-10 15:00:00', 'sorted' => '2026-10-10 16:00:00', 'assigned' => '2026-10-13 08:00:00', 'ofd' => '2026-10-13 09:00:00'], $r2);
        $this->log($p5, $r2, 'DELIVERY_FAILED', '2026-10-11 14:00:00');
        $this->log($p5, $r2, 'DELIVERY_FAILED', '2026-10-13 12:00:00');

        // P6: received before the first range, returned to the seller on Oct 12.
        $this->parcel('p6', $this->hub, 'RETURNED', ['scanned' => '2026-10-09 10:00:00', 'returned' => '2026-10-12 09:00:00']);

        // P7: only received (Oct 14), nothing else yet.
        $this->parcel('p7', $this->hub, 'AT_SORTING_CENTER', ['scanned' => '2026-10-14 08:00:00']);

        // P8: received the evening before the range, delivered by R1 on Oct 10 morning (12h, on time).
        $p8 = $this->parcel('p8', $this->hub, 'DELIVERED', ['scanned' => '2026-10-09 20:00:00', 'sorted' => '2026-10-09 21:00:00', 'assigned' => '2026-10-10 05:00:00', 'ofd' => '2026-10-10 06:00:00', 'delivered' => '2026-10-10 08:00:00'], $r1);
        $this->log($p8, $r1, 'DELIVERED', '2026-10-10 08:00:00');

        // P9: received after both ranges. P10: soft-deleted, so it must never count.
        $this->parcel('p9', $this->hub, 'AT_SORTING_CENTER', ['scanned' => '2026-10-15 09:00:00']);
        $p10 = $this->parcel('p10', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'delivered' => '2026-10-10 10:00:00', 'ofd' => '2026-10-10 09:30:00'], $r1);
        $this->log($p10, $r1, 'DELIVERED', '2026-10-10 10:00:00');
        $p10->delete();

        // The other hub: busy in the same days. None of it may leak into hub A.
        $x1 = $this->parcel('x1', $this->otherHub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'sorted' => '2026-10-10 10:00:00', 'assigned' => '2026-10-10 11:00:00', 'ofd' => '2026-10-10 12:00:00', 'delivered' => '2026-10-10 14:00:00', 'returned' => '2026-10-11 09:00:00'], $rb);
        $this->log($x1, $rb, 'DELIVERED', '2026-10-10 14:00:00');
        $x2 = $this->parcel('x2', $this->otherHub, 'DELIVERY_FAILED', ['scanned' => '2026-10-11 09:00:00'], $rb);
        $this->log($x2, $rb, 'DELIVERY_FAILED', '2026-10-11 12:00:00');
    }

    protected function report(string $path, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->hubUser, 'sanctum')->getJson("/api/v1/hub/reports/{$path}");
    }

    // ── Independent oracle ───────────────────────────────────────────────────

    /**
     * Recomputes every figure from the raw rows in PHP, in Manila time, without any of the service's SQL.
     *
     * @return array<string, mixed>
     */
    protected function oracle(string $from, string $to, int $slaHours = 48): array
    {
        $in = function (?Carbon $t) use ($from, $to): bool {
            if (! $t) {
                return false;
            }
            $day = $t->copy()->setTimezone(self::TZ)->toDateString();

            return $day >= $from && $day <= $to;
        };

        $parcels = Parcel::where('sorting_center_id', $this->hub->id)->get();
        $ids = $parcels->pluck('id');
        $failedLogs = DeliveryLog::whereIn('parcel_id', $ids)->where('outcome', 'DELIVERY_FAILED')->get()->filter(fn ($l) => $in($l->logged_at));

        $delivered = $parcels->filter(fn ($p) => $in($p->delivered_at));
        $onTime = fn ($p) => $p->scanned_in_at && $p->delivered_at->getTimestamp() - $p->scanned_in_at->getTimestamp() <= $slaHours * 3600;
        $deliverySecs = fn ($coll) => $coll->filter(fn ($p) => $p->out_for_delivery_at)->map(fn ($p) => $p->delivered_at->getTimestamp() - $p->out_for_delivery_at->getTimestamp());
        $dwell = $parcels->filter(fn ($p) => $in($p->out_for_delivery_at) && $p->scanned_in_at)
            ->map(fn ($p) => $p->out_for_delivery_at->getTimestamp() - $p->scanned_in_at->getTimestamp());

        $avg = fn ($c) => $c->count() ? round($c->avg() / 3600, 2) : null;
        $ratio = fn (int $n, int $d) => $d > 0 ? round($n / $d, 4) : null;

        $riders = [];
        foreach (Rider::where('sorting_center_id', $this->hub->id)->get() as $rider) {
            $mine = $delivered->filter(function ($p) use ($rider) {
                $log = DeliveryLog::where('parcel_id', $p->id)->where('outcome', 'DELIVERED')->orderByDesc('id')->first();

                return $log && $log->rider_id === $rider->id;
            });
            $failed = $failedLogs->where('rider_id', $rider->id)->count();
            $riders[$rider->id] = [
                'delivered'          => $mine->count(),
                'failed_attempts'    => $failed,
                'success_rate'       => $ratio($mine->count(), $mine->count() + $failed),
                'avg_delivery_hours' => $avg($deliverySecs($mine)),
                'on_time_deliveries' => $mine->filter($onTime)->count(),
                'on_time_rate'       => $ratio($mine->filter($onTime)->count(), $mine->count()),
            ];
        }

        $daily = [];
        for ($d = Carbon::parse($from); $d->toDateString() <= $to; $d->addDay()) {
            $day = $d->toDateString();
            $daily[$day] = [
                'received'  => $parcels->filter(fn ($p) => $in($p->scanned_in_at) && $p->scanned_in_at->copy()->setTimezone(self::TZ)->toDateString() === $day)->count(),
                'delivered' => $delivered->filter(fn ($p) => $p->delivered_at->copy()->setTimezone(self::TZ)->toDateString() === $day)->count(),
                'failed'    => $failedLogs->filter(fn ($l) => $l->logged_at->copy()->setTimezone(self::TZ)->toDateString() === $day)->count(),
                'returned'  => $parcels->filter(fn ($p) => $in($p->returned_at) && $p->returned_at->copy()->setTimezone(self::TZ)->toDateString() === $day)->count(),
            ];
        }

        return [
            'totals' => [
                'received'            => $parcels->filter(fn ($p) => $in($p->scanned_in_at))->count(),
                'sorted'              => $parcels->filter(fn ($p) => $in($p->sorted_at))->count(),
                'dispatched'          => $parcels->filter(fn ($p) => $in($p->assigned_at))->count(),
                'delivered'           => $delivered->count(),
                'failed_attempts'     => $failedLogs->count(),
                'returned'            => $parcels->filter(fn ($p) => $in($p->returned_at))->count(),
                'on_time_deliveries'  => $delivered->filter($onTime)->count(),
                'on_time_rate'        => $ratio($delivered->filter($onTime)->count(), $delivered->count()),
                'success_rate'        => $ratio($delivered->count(), $delivered->count() + $failedLogs->count()),
                'avg_hub_dwell_hours' => $avg($dwell),
                'avg_delivery_hours'  => $avg($deliverySecs($delivered)),
            ],
            'riders' => $riders,
            'daily'  => $daily,
        ];
    }

    // ── Reconciliation ───────────────────────────────────────────────────────

    /** @return array<string, array{0: string, 1: string}> */
    public static function ranges(): array
    {
        return [
            'oct 10 to 12'          => ['2026-10-10', '2026-10-12'],
            'oct 13 to 14'          => ['2026-10-13', '2026-10-14'],
            'wide, oct 1 to oct 31' => ['2026-10-01', '2026-10-31'],
            'one day, oct 11'       => ['2026-10-11', '2026-10-11'],
        ];
    }

    #[DataProvider('ranges')]
    public function test_every_summary_total_and_daily_row_equals_an_independent_count_of_the_raw_rows(string $from, string $to): void
    {
        $this->buildFixture();
        $expected = $this->oracle($from, $to);

        $response = $this->report("summary?from={$from}&to={$to}")->assertOk();
        $data = $response->json('data');

        foreach ($expected['totals'] as $key => $value) {
            $this->assertEqualsWithDelta($value, $data['totals'][$key], 0.0001, "totals.{$key}");
            $this->assertSame($value === null, $data['totals'][$key] === null, "totals.{$key} nullness");
        }
        $this->assertSame(48, $data['sla_hours']);
        $this->assertSame(['from' => $from, 'to' => $to, 'days' => count($expected['daily']), 'timezone' => 'Asia/Manila'], $data['range']);

        $this->assertSame(array_keys($expected['daily']), array_column($data['daily'], 'date'), 'a row for every day');
        foreach ($data['daily'] as $row) {
            $this->assertSame($expected['daily'][$row['date']], ['received' => $row['received'], 'delivered' => $row['delivered'], 'failed' => $row['failed'], 'returned' => $row['returned']], "daily {$row['date']}");
        }

        // Daily rows add up to the totals.
        $this->assertSame($data['totals']['received'], array_sum(array_column($data['daily'], 'received')));
        $this->assertSame($data['totals']['delivered'], array_sum(array_column($data['daily'], 'delivered')));
        $this->assertSame($data['totals']['failed_attempts'], array_sum(array_column($data['daily'], 'failed')));
        $this->assertSame($data['totals']['returned'], array_sum(array_column($data['daily'], 'returned')));
    }

    #[DataProvider('ranges')]
    public function test_every_rider_row_equals_an_independent_count_and_sums_to_the_totals(string $from, string $to): void
    {
        $this->buildFixture();
        $expected = $this->oracle($from, $to);

        $rows = collect($this->report("riders?from={$from}&to={$to}")->assertOk()->json('data.riders'));

        // Active riders of this hub only: R1, R2, R3 (idle). Not the disapproved rider, not the other hub's rider.
        $this->assertEqualsCanonicalizing(
            [$this->riders['r1']->id, $this->riders['r2']->id, $this->riders['r3']->id],
            $rows->pluck('rider_id')->all()
        );

        foreach ($rows as $row) {
            foreach ($expected['riders'][$row['rider_id']] as $key => $value) {
                $this->assertEqualsWithDelta($value, $row[$key], 0.0001, "rider {$row['name']} {$key}");
                $this->assertSame($value === null, $row[$key] === null, "rider {$row['name']} {$key} nullness");
            }
        }

        $totals = $this->report("summary?from={$from}&to={$to}")->json('data.totals');
        $this->assertSame($totals['delivered'], $rows->sum('delivered'));
        $this->assertSame($totals['failed_attempts'], $rows->sum('failed_attempts'));
        $this->assertSame($totals['on_time_deliveries'], $rows->sum('on_time_deliveries'));
    }

    public function test_known_figures_for_oct_10_to_12(): void
    {
        $this->buildFixture();
        $data = $this->report('summary?from=2026-10-10&to=2026-10-12')->assertOk()->json('data');

        // Worked out by hand from the fixture comments.
        $this->assertSame(5, $data['totals']['received']);          // p1, p2, p3, p4, p5
        $this->assertSame(4, $data['totals']['delivered']);         // p1, p2, p4, p8 (p3 is delivered one second into Oct 13)
        $this->assertSame(3, $data['totals']['on_time_deliveries']); // p1, p2 (exactly 48h), p8; p4 took 55h
        $this->assertSame(0.75, $data['totals']['on_time_rate']);
        $this->assertSame(2, $data['totals']['failed_attempts']);   // p4 by R1, p5 by R2 (its second failure is Oct 13)
        $this->assertSame(1, $data['totals']['returned']);          // p6
        $this->assertSame(0.6667, $data['totals']['success_rate']); // 4 / (4 + 2)
        $this->assertSame(28.6, $data['totals']['avg_hub_dwell_hours']); // p1 3h, p8 10h, p2 44.0003h, p3 34h, p4 52h: 143.0003 / 5

        $riders = collect($this->report('riders?from=2026-10-10&to=2026-10-12')->json('data.riders'))->keyBy('name');
        $this->assertSame(2, $riders['Alice Alpha']['delivered']);
        $this->assertSame(1, $riders['Alice Alpha']['failed_attempts']);
        $this->assertEquals(1.0, $riders['Alice Alpha']['on_time_rate']);
        $this->assertEquals(4.0, $riders['Alice Alpha']['avg_delivery_hours']);   // (6h + 2h) / 2
        $this->assertSame(0.5, $riders['Bob Bravo']['on_time_rate']);
        $this->assertSame(1, $riders['Bob Bravo']['failed_attempts']);
    }

    // ── Boundaries ───────────────────────────────────────────────────────────

    public function test_events_at_235959_and_000000_manila_land_on_the_right_day(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $this->parcel('a', $this->hub, 'AT_SORTING_CENTER', ['scanned' => '2026-10-10 23:59:59']);
        $this->parcel('b', $this->hub, 'AT_SORTING_CENTER', ['scanned' => '2026-10-11 00:00:00']);
        $this->parcel('c', $this->hub, 'AT_SORTING_CENTER', ['scanned' => '2026-10-11 23:59:59']);
        $this->parcel('d', $this->hub, 'AT_SORTING_CENTER', ['scanned' => '2026-10-12 00:00:00']);

        $daily = collect($this->report('summary?from=2026-10-10&to=2026-10-12')->json('data.daily'))->pluck('received', 'date')->all();
        $this->assertSame(['2026-10-10' => 1, '2026-10-11' => 2, '2026-10-12' => 1], $daily);

        // A one-day range takes exactly its own Manila day: both ends are inclusive.
        $this->assertSame(2, $this->report('summary?from=2026-10-11&to=2026-10-11')->json('data.totals.received'));
        $this->assertSame(1, $this->report('summary?from=2026-10-12&to=2026-10-12')->json('data.totals.received'));
    }

    public function test_on_time_at_exactly_the_sla_counts_and_one_second_over_does_not(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $this->parcel('exact', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'delivered' => '2026-10-12 09:00:00']);
        $this->parcel('over', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'delivered' => '2026-10-12 09:00:01']);
        $this->parcel('under', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'delivered' => '2026-10-12 08:59:59']);

        $totals = $this->report('summary?from=2026-10-12&to=2026-10-12')->json('data.totals');
        $this->assertSame(3, $totals['delivered']);
        $this->assertSame(2, $totals['on_time_deliveries']);

        // The threshold is configuration: with a 24 hour SLA none of them is on time.
        config(['logistics.delivery_sla_hours' => 24]);
        $response = $this->report('summary?from=2026-10-12&to=2026-10-12')->assertOk();
        $this->assertSame(0, $response->json('data.totals.on_time_deliveries'));
        $this->assertEquals(0.0, $response->json('data.totals.on_time_rate'));
        $this->assertNotNull($response->json('data.totals.on_time_rate'));
        $this->assertSame(24, $response->json('data.sla_hours'));
    }

    public function test_a_delivery_with_no_receive_time_is_not_on_time(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $this->parcel('legacy', $this->hub, 'DELIVERED', ['delivered' => '2026-10-12 09:00:00']);

        $totals = $this->report('summary?from=2026-10-12&to=2026-10-12')->json('data.totals');
        $this->assertSame(1, $totals['delivered']);
        $this->assertSame(0, $totals['on_time_deliveries']);
        $this->assertNull($totals['avg_delivery_hours']);
    }

    public function test_parcels_an_admin_delivered_directly_are_reported_as_excluded_not_hidden(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $this->parcel('admin', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00']); // status DELIVERED, no delivered_at

        $data = $this->report('summary?from=2026-10-01&to=2026-10-31')->json('data');
        $this->assertSame(0, $data['totals']['delivered']);
        $this->assertSame(1, $data['excluded']['delivered_without_time']);
    }

    // ── Empty range, defaults ────────────────────────────────────────────────

    public function test_an_empty_range_gives_zeros_and_null_rates_and_idle_riders_still_appear(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $idle = $this->makeRider($this->hub, 'Ida', 'Idle');
        $pending = $this->makeRider($this->hub, 'Pam', 'Pending', Rider::STATUS_PENDING);

        $data = $this->report('summary?from=2026-09-01&to=2026-09-03')->assertOk()->json('data');
        $this->assertSame(['received' => 0, 'sorted' => 0, 'dispatched' => 0, 'delivered' => 0, 'failed_attempts' => 0, 'returned' => 0, 'on_time_deliveries' => 0], array_intersect_key($data['totals'], array_flip(['received', 'sorted', 'dispatched', 'delivered', 'failed_attempts', 'returned', 'on_time_deliveries'])));
        foreach (['on_time_rate', 'success_rate', 'avg_hub_dwell_hours', 'avg_delivery_hours'] as $nullable) {
            $this->assertNull($data['totals'][$nullable], $nullable);
        }
        $this->assertCount(3, $data['daily']);
        foreach ($data['daily'] as $row) {
            $this->assertSame(0, $row['received'] + $row['delivered'] + $row['failed'] + $row['returned']);
        }

        $rows = $this->report('riders?from=2026-09-01&to=2026-09-03')->assertOk()->json('data.riders');
        $this->assertSame([$idle->id], array_column($rows, 'rider_id'));
        $this->assertSame(0, $rows[0]['delivered']);
        $this->assertSame(0, $rows[0]['failed_attempts']);
        $this->assertNull($rows[0]['success_rate']);
        $this->assertNull($rows[0]['avg_delivery_hours']);
        $this->assertNull($rows[0]['on_time_rate']);
        $this->assertNotContains($pending->id, array_column($rows, 'rider_id'));
    }

    public function test_a_rider_who_was_later_disapproved_still_appears_for_the_range_they_worked(): void
    {
        $this->buildFixture();
        $this->riders['r1']->update(['status' => Rider::STATUS_DISAPPROVED]);

        $ids = array_column($this->report('riders?from=2026-10-10&to=2026-10-12')->json('data.riders'), 'rider_id');
        $this->assertContains($this->riders['r1']->id, $ids);
        $this->assertNotContains($this->riders['bad']->id, $ids);
    }

    public function test_the_default_range_is_the_last_30_manila_days_ending_today(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();

        $data = $this->report('summary')->assertOk()->json('data');
        $this->assertSame('2026-10-14', $data['range']['to']);
        $this->assertSame('2026-09-15', $data['range']['from']);
        $this->assertSame(30, $data['range']['days']);
        $this->assertCount(30, $data['daily']);

        // Only `to` given: the 30 days before it.
        $this->assertSame('2026-09-11', $this->report('summary?to=2026-10-10')->json('data.range.from'));
    }

    // ── Attribution ──────────────────────────────────────────────────────────

    public function test_a_failed_attempt_counts_for_the_rider_who_made_it_and_the_delivery_for_the_rider_who_made_it(): void
    {
        $this->buildFixture();
        $rows = collect($this->report('riders?from=2026-10-11&to=2026-10-12')->json('data.riders'))->keyBy('name');

        // P4: R1 failed it on Oct 11; R2 delivered it on Oct 12, although it is assigned to R2 and R1 never delivered it.
        $this->assertSame(1, $rows['Alice Alpha']['failed_attempts']);
        $this->assertSame(0, $rows['Alice Alpha']['delivered']);
        $this->assertSame(2, $rows['Bob Bravo']['delivered']);          // p2 and p4
        $this->assertSame(1, $rows['Bob Bravo']['failed_attempts']);    // only p5 (Oct 11), not p4's failure
        $this->assertEquals(0.0, $rows['Alice Alpha']['success_rate']);
        $this->assertNotNull($rows['Alice Alpha']['success_rate']);   // 0 / (0 + 1)
    }

    public function test_a_parcel_delivered_twice_is_one_delivery_for_the_latest_deliverer(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $first = $this->makeRider($this->hub, 'First');
        $second = $this->makeRider($this->hub, 'Second');
        $p = $this->parcel('twice', $this->hub, 'DELIVERED', ['scanned' => '2026-10-10 09:00:00', 'delivered' => '2026-10-11 09:00:00']);
        $this->log($p, $first, 'DELIVERED', '2026-10-10 20:00:00');
        $this->log($p, $second, 'DELIVERED', '2026-10-11 09:00:00');

        $rows = collect($this->report('riders?from=2026-10-10&to=2026-10-12')->json('data.riders'))->keyBy('name');
        $this->assertSame(0, $rows['First Rider']['delivered']);
        $this->assertSame(1, $rows['Second Rider']['delivered']);
        $this->assertSame(1, $this->report('summary?from=2026-10-10&to=2026-10-12')->json('data.totals.delivered'));
    }

    public function test_rider_rows_sort_with_nulls_last(): void
    {
        $this->buildFixture();
        $names = fn (string $q) => array_column($this->report("riders?from=2026-10-10&to=2026-10-12{$q}")->assertOk()->json('data.riders'), 'name');

        // Alice and Bob tie on deliveries (2): the name breaks the tie. Cara has none.
        $this->assertSame(['Alice Alpha', 'Bob Bravo', 'Cara Idle'], $names('&sort=delivered&direction=desc'));
        $this->assertSame(['Alice Alpha', 'Bob Bravo', 'Cara Idle'], $names('&sort=name&direction=asc'));
        $this->assertSame(['Cara Idle', 'Bob Bravo', 'Alice Alpha'], $names('&sort=name&direction=desc'));
        // on_time_rate: Alice 1.0, Bob 0.5, Cara null. Null stays last in both directions.
        $this->assertSame(['Alice Alpha', 'Bob Bravo', 'Cara Idle'], $names('&sort=on_time_rate&direction=desc'));
        $this->assertSame(['Bob Bravo', 'Alice Alpha', 'Cara Idle'], $names('&sort=on_time_rate&direction=asc'));

        // The default is most deliveries first.
        $this->assertSame('delivered', $this->report('riders?from=2026-10-10&to=2026-10-12')->json('data.sort'));
    }

    // ── Validation ───────────────────────────────────────────────────────────

    /** @return array<string, array{0: string, 1: string}> */
    public static function invalidQueries(): array
    {
        return [
            'from after to'        => ['from=2026-10-12&to=2026-10-10', 'from'],
            'invalid from'         => ['from=not-a-date&to=2026-10-10', 'from'],
            'impossible from date' => ['from=2026-02-30&to=2026-10-10', 'from'],
            'invalid to'           => ['from=2026-10-01&to=13-10-2026', 'to'],
            'impossible to date'   => ['from=2026-10-01&to=2026-13-01', 'to'],
            'range of 367 days'    => ['from=2025-10-14&to=2026-10-15', 'to'],
            'array from'           => ['from[]=2026-10-01&to=2026-10-10', 'from'],
            'bad sort'             => ['from=2026-10-01&to=2026-10-10&sort=password', 'sort'],
            'bad direction'        => ['from=2026-10-01&to=2026-10-10&direction=up', 'direction'],
        ];
    }

    #[DataProvider('invalidQueries')]
    public function test_an_invalid_range_or_sort_returns_422_with_field_errors(string $query, string $field): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();

        foreach (['summary', 'riders'] as $endpoint) {
            $this->report("{$endpoint}?{$query}")->assertStatus(422)->assertJsonValidationErrors($field);
        }
        $this->report("export?report=daily&{$query}")->assertStatus(422)->assertJsonValidationErrors($field);
    }

    public function test_a_range_of_exactly_366_days_is_allowed_and_one_day_longer_is_not(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();

        $ok = $this->report('summary?from=2025-10-14&to=2026-10-14')->assertOk();   // 365 days between the dates, 366 counting both ends
        $this->assertSame(366, $ok->json('data.range.days'));
        $this->assertCount(366, $ok->json('data.daily'));

        $this->report('summary?from=2025-10-13&to=2026-10-14')->assertStatus(422)->assertJsonValidationErrors('to');
    }

    public function test_export_needs_a_valid_report_name(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();

        $this->report('export?from=2026-10-01&to=2026-10-02')->assertStatus(422)->assertJsonValidationErrors('report');
        $this->report('export?report=everything&from=2026-10-01&to=2026-10-02')->assertStatus(422)->assertJsonValidationErrors('report');
    }

    // ── Export ───────────────────────────────────────────────────────────────

    /** @return array<int, array<int, string>> */
    protected function csvRows(string $content): array
    {
        $this->assertStringStartsWith("\xEF\xBB\xBF", $content, 'UTF-8 byte-order mark');
        $handle = fopen('php://memory', 'w+');
        fwrite($handle, substr($content, 3));
        rewind($handle);
        $rows = [];
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            $rows[] = $row;
        }

        return $rows;
    }

    public function test_the_daily_export_has_the_right_headers_filename_and_rows(): void
    {
        $this->buildFixture();

        $response = $this->actingAs($this->hubUser, 'sanctum')->get('/api/v1/hub/reports/export?report=daily&from=2026-10-10&to=2026-10-12');
        $response->assertOk();
        $this->assertStringStartsWith('text/csv', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('charset=UTF-8', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment', $response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('hub-daily-report-2026-10-10_to_2026-10-12.csv', $response->headers->get('Content-Disposition'));

        $rows = $this->csvRows($response->streamedContent());
        $this->assertSame(['Date', 'Received', 'Delivered', 'Failed attempts', 'Returned'], $rows[0]);
        $this->assertCount(4, $rows); // header + 3 days

        $summary = $this->report('summary?from=2026-10-10&to=2026-10-12')->json('data.daily');
        foreach ($summary as $i => $day) {
            $this->assertSame([$day['date'], (string) $day['received'], (string) $day['delivered'], (string) $day['failed'], (string) $day['returned']], $rows[$i + 1]);
        }
    }

    public function test_the_riders_export_matches_the_rider_report_and_blanks_null_rates(): void
    {
        $this->buildFixture();

        $response = $this->actingAs($this->hubUser, 'sanctum')->get('/api/v1/hub/reports/export?report=riders&from=2026-10-10&to=2026-10-12');
        $this->assertStringContainsString('hub-riders-report-2026-10-10_to_2026-10-12.csv', $response->headers->get('Content-Disposition'));

        $rows = $this->csvRows($response->streamedContent());
        $this->assertSame(['Rider', 'Delivered', 'Failed attempts', 'Success rate (%)', 'Average delivery time (hours)', 'On-time deliveries', 'On-time rate (%)'], $rows[0]);
        $byName = collect(array_slice($rows, 1))->keyBy(0);
        $this->assertCount(3, $byName);
        $this->assertSame(['Alice Alpha', '2', '1', '66.7', '4', '2', '100'], $byName['Alice Alpha']);
        $this->assertSame(['Bob Bravo', '2', '1', '66.7', '3.5', '1', '50'], $byName['Bob Bravo']);
        $this->assertSame(['Cara Idle', '0', '0', '', '', '0', ''], $byName['Cara Idle']);
        $this->assertArrayNotHasKey('Eve OtherHub', $byName->all());
    }

    public function test_rider_names_that_look_like_formulas_are_neutralized_and_cells_are_escaped(): void
    {
        [$this->hubUser, $this->hub] = $this->makeHub();
        $this->makeRider($this->hub, '=HYPERLINK("http://evil.example","x")', 'Eq');
        $this->makeRider($this->hub, '+1+1', 'Plus');
        $this->makeRider($this->hub, '-2+3', 'Minus');
        $this->makeRider($this->hub, '@SUM(A1)', 'At');
        $this->makeRider($this->hub, 'Comma, "Quote"', 'Name');

        $content = $this->actingAs($this->hubUser, 'sanctum')->get('/api/v1/hub/reports/export?report=riders&from=2026-10-10&to=2026-10-12')->streamedContent();
        $rows = collect($this->csvRows($content))->slice(1)->pluck(0)->all();

        $this->assertContains('\'=HYPERLINK("http://evil.example","x") Eq', $rows);
        $this->assertContains("'+1+1 Plus", $rows);
        $this->assertContains("'-2+3 Minus", $rows);
        $this->assertContains("'@SUM(A1) At", $rows);
        $this->assertContains('Comma, "Quote" Name', $rows, 'commas and quotes survive a round trip');
        foreach ($rows as $cell) {
            $this->assertDoesNotMatchRegularExpression('/^[=+\-@]/', $cell);
        }
    }

    public function test_the_export_contains_only_this_hubs_data(): void
    {
        $this->buildFixture();

        $mine = $this->actingAs($this->hubUser, 'sanctum')->get('/api/v1/hub/reports/export?report=riders&from=2026-10-10&to=2026-10-12')->streamedContent();
        $theirs = $this->actingAs($this->otherHubUser, 'sanctum')->get('/api/v1/hub/reports/export?report=riders&from=2026-10-10&to=2026-10-12')->streamedContent();

        $this->assertStringNotContainsString('Eve', $mine);
        $this->assertStringContainsString('Eve OtherHub', $theirs);
        $this->assertStringNotContainsString('Alice', $theirs);

        $theirDaily = $this->csvRows($this->actingAs($this->otherHubUser, 'sanctum')->get('/api/v1/hub/reports/export?report=daily&from=2026-10-10&to=2026-10-12')->streamedContent());
        $this->assertSame(['2026-10-10', '1', '1', '0', '0'], $theirDaily[1]);
        $this->assertSame(['2026-10-11', '1', '0', '1', '1'], $theirDaily[2]);
    }

    // ── Isolation and access ─────────────────────────────────────────────────

    public function test_another_hubs_data_never_appears(): void
    {
        $this->buildFixture();

        $theirs = $this->report('summary?from=2026-10-10&to=2026-10-12', $this->otherHubUser)->assertOk()->json('data');
        $this->assertSame(2, $theirs['totals']['received']);        // x1 (Oct 10) and x2 (Oct 11)
        $this->assertSame(1, $theirs['totals']['delivered']);
        $this->assertSame(1, $theirs['totals']['failed_attempts']);

        $mine = $this->report('summary?from=2026-10-10&to=2026-10-12')->json('data.totals');
        $this->assertSame(5, $mine['received']);
        $this->assertSame(4, $mine['delivered']);

        $theirRiders = array_column($this->report('riders?from=2026-10-10&to=2026-10-12', $this->otherHubUser)->json('data.riders'), 'name');
        $this->assertSame(['Eve OtherHub'], $theirRiders);
    }

    #[DataProvider('blockedHubStatuses')]
    public function test_hubs_that_are_not_approved_get_403(string $status): void
    {
        [$owner] = $this->makeHub($status);

        foreach (['summary', 'riders', 'export?report=daily'] as $path) {
            $this->report($path, $owner)->assertForbidden();
        }
    }

    /** @return array<string, array{0: string}> */
    public static function blockedHubStatuses(): array
    {
        return [
            'pending'   => [SortingCenter::STATUS_PENDING],
            'rejected'  => [SortingCenter::STATUS_REJECTED],
            'suspended' => [SortingCenter::STATUS_SUSPENDED],
        ];
    }

    public function test_users_who_are_not_hubs_get_403(): void
    {
        foreach (['buyer', 'seller', 'rider', 'admin'] as $role) {
            $this->report('summary', $this->user($role, ucfirst($role)))->assertForbidden();
        }
    }

    public function test_guests_get_401(): void
    {
        foreach (['summary', 'riders', 'export?report=daily'] as $path) {
            $this->getJson("/api/v1/hub/reports/{$path}")->assertStatus(401);
        }
    }
}
