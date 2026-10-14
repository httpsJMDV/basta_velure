<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\DeliveryLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\OrderStateMachine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * An order entering DELIVERED stamps parcels.delivered_at for every actor, so an admin-delivered parcel is not
 * invisible to hub reports and the rider history. The rider endpoint's own value is never overwritten, no delivery log
 * is written for an admin, and nothing about earnings or money changes.
 */
class ParcelDeliveredAtTest extends TestCase
{
    use DatabaseTransactions;

    private const TZ = 'Asia/Manila';

    protected User $hubUser;
    protected SortingCenter $hub;
    protected User $riderUser;
    protected Rider $rider;
    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('ids');
        Carbon::setTestNow(Carbon::parse('2026-10-14 10:00:00', self::TZ));

        $this->hubUser = $this->user('buyer', 'Hub');
        $this->hub = SortingCenter::create([
            'user_id' => $this->hubUser->id, 'hub_name' => 'Hub ' . uniqid(), 'address_province' => 'Laguna',
            'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '1 Hub St',
            'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => ['043405001'],
        ]);
        $this->riderUser = $this->user('rider', 'Juan');
        $this->rider = Rider::create([
            'user_id' => $this->riderUser->id, 'sorting_center_id' => $this->hub->id, 'vehicle_type' => 'Motorcycle',
            'plate_number' => 'AB-1234', 'or_cr_path' => 'ids/a.pdf', 'drivers_license_path' => 'ids/b.pdf',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        $this->admin = $this->user('admin', 'Root');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    protected function user(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Tester', 'email' => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone' => '0917' . rand(1000000, 9999999), 'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ]);
    }

    protected function parcel(string $parcelStatus = 'OUT_FOR_DELIVERY', OrderStatus $orderStatus = OrderStatus::OUT_FOR_DELIVERY, array $overrides = [], ?Rider $assigned = null): Parcel
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $this->user('buyer', 'Buyer')->id,
            'status' => $orderStatus->value, 'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'gcash',
            'shipping_name' => 'Ana', 'shipping_phone' => '09998887777', 'shipping_address' => '1 St',
            'shipping_province' => 'Laguna', 'shipping_city' => 'Calamba', 'shipping_barangay' => 'Real',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043405000', 'shipping_barangay_code' => '043405001',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->user('seller', 'Seller')->id, 'product_name' => 'Dress',
            'variant_label' => 'M', 'unit_price' => 100, 'quantity' => 1, 'subtotal' => 100, 'commission_rate' => 0.10,
            'commission_amount' => 10, 'seller_earnings' => 90, 'payout_status' => 'pending_release',
        ]);

        return Parcel::create(array_merge([
            'tracking_number' => 'LIT-261014-' . strtoupper(substr(uniqid(), -6)), 'order_id' => $order->id,
            'seller_id' => $order->items()->first()->seller_id, 'status' => $parcelStatus, 'sorting_center_id' => $this->hub->id,
            'assigned_rider_id' => ($assigned ?? $this->rider)->id, 'destination_barangay' => 'Real', 'destination_barangay_code' => '043405001',
            'recipient_snapshot' => ['name' => 'Ana', 'phone' => '09998887777', 'city' => 'Calamba'],
            'scanned_in_at' => now()->subHours(10), 'out_for_delivery_at' => now()->subHours(2),
        ], $overrides));
    }

    protected function adminDelivers(Parcel $parcel)
    {
        return $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/v1/admin/orders/{$parcel->order_id}/status", ['status' => 'delivered', 'note' => 'Delivered by admin']);
    }

    // ── The state machine ────────────────────────────────────────────────────

    public function test_an_admin_delivering_an_order_stamps_the_parcels_delivered_at(): void
    {
        $parcel = $this->parcel();
        $this->assertNull($parcel->delivered_at);

        $this->adminDelivers($parcel)->assertOk();

        $parcel->refresh();
        $this->assertSame(Parcel::STATUS_DELIVERED, $parcel->status);
        $this->assertNotNull($parcel->delivered_at);
        $this->assertSame(now()->getTimestamp(), $parcel->delivered_at->getTimestamp());
    }

    public function test_the_stamp_is_the_only_new_effect_no_delivery_log_and_earnings_work_as_before(): void
    {
        $parcel = $this->parcel();

        $this->adminDelivers($parcel)->assertOk();

        // No log: a delivery log means a rider reported the outcome.
        $this->assertSame(0, DeliveryLog::where('parcel_id', $parcel->id)->count());
        // The 2.9 earning is still recorded exactly once, for the assigned rider.
        $earnings = RiderEarning::where('parcel_id', $parcel->id)->get();
        $this->assertCount(1, $earnings);
        $this->assertSame($this->rider->id, $earnings->first()->rider_id);
        // Escrow bookkeeping still happens: the items get their delivery time and stay in escrow.
        $item = OrderItem::where('order_id', $parcel->order_id)->first();
        $this->assertNotNull($item->delivered_at);
        $this->assertSame('pending_release', $item->payout_status);
    }

    public function test_a_delivered_at_that_is_already_set_is_never_overwritten(): void
    {
        $already = now()->subHours(3)->startOfSecond();
        $parcel = $this->parcel(overrides: ['delivered_at' => $already]);

        $this->adminDelivers($parcel)->assertOk();

        $this->assertSame($already->getTimestamp(), $parcel->fresh()->delivered_at->getTimestamp());
    }

    public function test_an_order_without_a_parcel_can_still_be_delivered(): void
    {
        $parcel = $this->parcel();
        $order = $parcel->order;
        $parcel->forceDelete();

        $this->adminDelivers($parcel)->assertOk();

        $this->assertSame('DELIVERED', $order->fresh()->status->value);
    }

    public function test_the_rider_flow_keeps_its_own_delivery_time_and_log(): void
    {
        $parcel = $this->parcel();
        $proof = UploadedFile::fake()->createWithContent('proof.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));

        $this->actingAs($this->riderUser, 'sanctum')
            ->post("/api/v1/rider/deliveries/{$parcel->tracking_number}/delivered", ['proof_photo' => $proof], ['Accept' => 'application/json'])
            ->assertOk();

        $parcel->refresh();
        $log = DeliveryLog::where('parcel_id', $parcel->id)->where('outcome', 'DELIVERED')->sole();
        $this->assertSame($log->logged_at->getTimestamp(), $parcel->delivered_at->getTimestamp());
        $this->assertSame($this->rider->id, $log->rider_id);
        $this->assertNotNull($parcel->delivery_proof_path);
    }

    // ── Reports and history ──────────────────────────────────────────────────

    public function test_the_hub_report_counts_an_admin_delivered_parcel_and_flags_it_as_nobodys(): void
    {
        $parcel = $this->parcel();
        $this->adminDelivers($parcel)->assertOk();
        $today = now()->setTimezone(self::TZ)->toDateString();

        $summary = $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/reports/summary?from={$today}&to={$today}")->assertOk()->json('data');
        $this->assertSame(1, $summary['totals']['delivered']);
        $this->assertSame(1, $summary['totals']['on_time_deliveries']); // received 10h before, delivered now
        $this->assertSame(0, $summary['excluded']['delivered_without_time']); // contract kept, normally 0 now
        $this->assertSame(1, collect($summary['daily'])->firstWhere('date', $today)['delivered']);

        $riders = $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/reports/riders?from={$today}&to={$today}")->assertOk()->json('data');
        $this->assertSame(1, $riders['unattributed_deliveries']);
        $this->assertSame(0, collect($riders['riders'])->sum('delivered'), 'no rider reported it, so no rider is credited');
    }

    public function test_a_rider_delivery_is_not_unattributed(): void
    {
        $parcel = $this->parcel(overrides: ['delivered_at' => now()]);
        DeliveryLog::create(['parcel_id' => $parcel->id, 'rider_id' => $this->rider->id, 'outcome' => 'DELIVERED', 'logged_at' => now()]);
        $today = now()->setTimezone(self::TZ)->toDateString();

        $riders = $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/reports/riders?from={$today}&to={$today}")->json('data');
        $this->assertSame(0, $riders['unattributed_deliveries']);
        $this->assertSame(1, collect($riders['riders'])->sum('delivered'));
    }

    public function test_a_delivered_parcel_that_still_has_no_time_is_reported_as_excluded(): void
    {
        $this->parcel('DELIVERED', OrderStatus::DELIVERED); // legacy row: no delivered_at

        $summary = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/reports/summary?from=2026-10-01&to=2026-10-31')->json('data');
        $this->assertSame(0, $summary['totals']['delivered']);
        $this->assertSame(1, $summary['excluded']['delivered_without_time']);
    }

    public function test_the_rider_history_dates_a_delivery_by_the_parcels_delivered_at(): void
    {
        $viaAdmin = $this->parcel();
        $this->adminDelivers($viaAdmin)->assertOk();

        // A delivery whose earning was recorded at a different moment than the parcel's delivery time.
        $other = $this->parcel('DELIVERED', OrderStatus::DELIVERED, ['delivered_at' => now()->subDays(2)]);
        RiderEarning::create(['rider_id' => $this->rider->id, 'parcel_id' => $other->id, 'amount' => 50, 'earned_at' => now()->subDay()]);

        $entries = collect($this->actingAs($this->riderUser, 'sanctum')->getJson('/api/v1/rider/history')->assertOk()->json('data'))->keyBy('tracking_number');

        $this->assertSame('delivered', $entries[$viaAdmin->tracking_number]['outcome']);
        $this->assertSame($viaAdmin->fresh()->delivered_at->getTimestamp(), Carbon::parse($entries[$viaAdmin->tracking_number]['occurred_at'])->getTimestamp());
        $this->assertSame($other->delivered_at->getTimestamp(), Carbon::parse($entries[$other->tracking_number]['occurred_at'])->getTimestamp());
    }

    // ── Backfill ─────────────────────────────────────────────────────────────

    protected function historyRow(Parcel $parcel, string $to, Carbon $at): void
    {
        OrderStatusHistory::create([
            'order_id' => $parcel->order_id, 'from_status' => 'OUT_FOR_DELIVERY', 'to_status' => $to,
            'actor_type' => 'admin', 'actor_id' => $this->admin->id, 'note' => 'seeded', 'created_at' => $at,
        ]);
    }

    public function test_the_backfill_is_a_dry_run_unless_applied_and_idempotent(): void
    {
        $first = now()->subDays(5)->startOfSecond();
        $later = now()->subDays(2)->startOfSecond();

        $fixable = $this->parcel('DELIVERED', OrderStatus::DELIVERED);
        $this->historyRow($fixable, 'DELIVERED', $first);
        $this->historyRow($fixable, 'DELIVERED', $later);      // delivered again after a reversal: the first time wins

        $noHistory = $this->parcel('DELIVERED', OrderStatus::DELIVERED);

        $alreadySet = $this->parcel('DELIVERED', OrderStatus::DELIVERED, ['delivered_at' => now()->subDays(9)->startOfSecond()]);
        $this->historyRow($alreadySet, 'DELIVERED', $first);

        $notDelivered = $this->parcel();
        $this->historyRow($notDelivered, 'DELIVERED', $first);

        $deleted = $this->parcel('DELIVERED', OrderStatus::DELIVERED);
        $this->historyRow($deleted, 'DELIVERED', $first);
        $deleted->delete();

        $logsBefore = DeliveryLog::count();
        $earningsBefore = RiderEarning::count();

        // Dry run (the default): reports, writes nothing.
        $this->artisan('parcels:backfill-delivered-at')
            ->expectsOutputToContain('(dry run): would update 1 parcel(s); 1 DELIVERED parcel(s) have no delivery history')
            ->assertSuccessful();
        $this->assertNull($fixable->fresh()->delivered_at);

        // Apply.
        $this->artisan('parcels:backfill-delivered-at --apply')->expectsOutputToContain('updated 1 parcel(s)')->assertSuccessful();
        $this->assertSame($first->getTimestamp(), $fixable->fresh()->delivered_at->getTimestamp());
        $this->assertNull($noHistory->fresh()->delivered_at, 'no history, nothing to infer from');
        $this->assertSame(now()->subDays(9)->startOfSecond()->getTimestamp(), $alreadySet->fresh()->delivered_at->getTimestamp(), 'an existing value is never touched');
        $this->assertNull($notDelivered->fresh()->delivered_at, 'only DELIVERED parcels');
        $this->assertNull(Parcel::withTrashed()->find($deleted->id)->delivered_at, 'soft-deleted parcels are left alone');

        // Idempotent: a second run changes nothing.
        $this->artisan('parcels:backfill-delivered-at --apply')->expectsOutputToContain('updated 0 parcel(s)')->assertSuccessful();
        $this->assertSame($first->getTimestamp(), $fixable->fresh()->delivered_at->getTimestamp());

        // It writes no delivery logs and touches no earnings.
        $this->assertSame($logsBefore, DeliveryLog::count());
        $this->assertSame($earningsBefore, RiderEarning::count());
    }

    public function test_after_the_backfill_the_report_counts_the_old_admin_delivery(): void
    {
        $delivered = now()->setTimezone(self::TZ)->subDays(3)->startOfSecond();
        $parcel = $this->parcel('DELIVERED', OrderStatus::DELIVERED);
        $this->historyRow($parcel, 'DELIVERED', $delivered);
        $day = $delivered->toDateString();

        $before = $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/reports/summary?from={$day}&to={$day}")->json('data');
        $this->assertSame(0, $before['totals']['delivered']);
        $this->assertSame(1, $before['excluded']['delivered_without_time']);

        $this->artisan('parcels:backfill-delivered-at --apply')->assertSuccessful();

        $after = $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/reports/summary?from={$day}&to={$day}")->json('data');
        $this->assertSame(1, $after['totals']['delivered']);
        $this->assertSame(0, $after['excluded']['delivered_without_time']);
    }

    public function test_the_state_machine_can_also_be_driven_directly(): void
    {
        $parcel = $this->parcel();

        app(OrderStateMachine::class)->transition($parcel->order, OrderStatus::DELIVERED, 'admin', $this->admin->id, 'direct');

        $this->assertNotNull($parcel->fresh()->delivered_at);
    }
}
