<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\AuditLog;
use App\Models\DispatchOffer;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\ProductVariant;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\RiderEarning;
use App\Models\ShippingZone;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * The Logistics and Rider modules (L1, L4 to L9; R3 to R9): Online and Offline, 60-second pickup offers to the nearest
 * rider, manual and bulk assignment with the 3-job limit, scanning at the company's hubs, the delivery code and the
 * exact COD amount, failed attempts and Return to Sender, overrides, Lost and Damaged, parcel search, COD
 * remittance, exports and the fixed rider pay.
 */
class CourierOpsTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private LogisticsCompany $company;
    private User $ops;
    private SortingCenter $hub;
    private User $shop;
    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Storage::fake('ids');
        config(['logistics.max_delivery_attempts' => 3]);

        $this->company = LogisticsCompany::create([
            'name' => 'Bilis Hatid Express ' . Str::random(4), 'slug' => 'bilis-' . Str::lower(Str::random(6)), 'code' => 'BH' . Str::upper(Str::random(4)),
            'contact_email' => 'ops' . Str::random(5) . '@example.com', 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(), 'is_default' => false,
        ]);
        $this->ops = $this->person('Carlos', 'Mendoza');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->ops->id, 'role' => 'owner']);
        $this->hub = SortingCenter::create([
            'logistics_company_id' => $this->company->id, 'user_id' => $this->person('Hub', 'Lead')->id, 'hub_name' => 'Bilis QC Hub ' . Str::random(3),
            'address_province' => 'Metro Manila', 'address_city' => 'Quezon City', 'address_barangay' => 'Central', 'address_street' => '1 Hub St',
            'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => [$this->qc[3]],
        ]);
        foreach (['NCR' => '130000000', 'Visayas' => '070000000'] as $name => $region) {
            ShippingZone::create(['logistics_company_id' => $this->company->id, 'name' => $name])->areas()->create(['level' => 'region', 'psgc_code' => $region, 'name' => $name]);
        }
        $this->shop = $this->seller('Maria Clara Handicrafts', $this->qc);
        $this->customer = User::forceCreate([
            'first_name' => 'Juan Miguel', 'last_name' => 'Dela Cruz', 'email' => 'juan.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('Mamimili@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private function person(string $first, string $last): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => $last, 'email' => Str::lower($first) . '.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('Hatid@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: Rider} */
    private function rider(string $first, array $barangays, bool $online = true, string $status = Rider::STATUS_ACTIVE): array
    {
        $user = $this->person($first, 'Garcia');
        $rider = Rider::forceCreate([
            'user_id' => $user->id, 'sorting_center_id' => $this->hub->id, 'logistics_company_id' => $this->company->id,
            'vehicle_type' => Rider::VEHICLE_MOTORCYCLE, 'plate_number' => 'NBC' . random_int(1000, 9999), 'license_number' => 'N01-23-' . random_int(100000, 999999),
            'license_expiry' => '2030-03-22', 'or_cr_path' => 'ids/or.pdf', 'drivers_license_path' => 'ids/license.pdf', 'status' => $status,
            'submitted_at' => now(), 'is_online' => $online, 'online_at' => now()->subMinutes(10), 'last_seen_at' => now(),
        ]);
        RiderAreaAssignment::create(['rider_id' => $rider->id, 'sorting_center_id' => $this->hub->id, 'area_label' => 'Area ' . $first, 'coverage_barangays' => $barangays, 'is_active' => true]);

        return [$user, $rider];
    }

    /** An order of the shop, made Ready for Pickup through the state machine, so its parcel and first offer are real. */
    private function ready(float $total = 500.00, string $method = 'cod', ?ProductVariant $variant = null, string $paymentStatus = 'pending'): Parcel
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . Str::upper(Str::random(10)), 'buyer_id' => $this->customer->id, 'logistics_company_id' => $this->company->id,
            'status' => OrderStatus::PREPARING->value, 'subtotal' => $total - 50, 'shipping_fee' => 50, 'total' => $total,
            'payment_method' => $method, 'payment_status' => $paymentStatus, 'total_weight_grams' => 800,
            'shipping_name' => 'Juan Miguel Dela Cruz', 'shipping_phone' => '09171234567', 'shipping_address' => '45 Kalayaan Ave.',
            'shipping_province' => 'Metro Manila', 'shipping_city' => 'Quezon City', 'shipping_barangay' => 'Central',
            'shipping_province_code' => $this->qc[1], 'shipping_city_code' => $this->qc[2], 'shipping_barangay_code' => $this->qc[3],
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->shop->id, 'product_id' => $variant?->product_id, 'product_variant_id' => $variant?->id,
            'product_name' => 'Rattan Fruit Basket', 'variant_label' => 'Default', 'unit_price' => $total - 50, 'quantity' => 1, 'subtotal' => $total - 50,
            'commission_rate' => 0.05, 'commission_amount' => round(($total - 50) * 0.05, 2), 'seller_earnings' => round(($total - 50) * 0.95, 2),
            'payout_status' => in_array($method, Order::GATEWAY_METHODS, true) ? 'pending_release' : 'direct',
        ]);
        app(OrderStateMachine::class)->transition($order, OrderStatus::READY_FOR_PICKUP, 'seller', $this->shop->id, 'Packed');

        return Parcel::where('order_id', $order->id)->firstOrFail();
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user);

        return $this;
    }

    private function openOffer(Parcel $p): ?DispatchOffer
    {
        return DispatchOffer::where('parcel_id', $p->id)->where('status', DispatchOffer::STATUS_OFFERED)->first();
    }

    /** Assigned, picked up, received, sorted and handed to the rider, then sent out: the parcel is Out for Delivery. */
    private function outForDelivery(Parcel $p, User $riderUser, Rider $rider): Parcel
    {
        $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$p->id], 'rider_id' => $rider->id])->assertOk();
        $this->as($riderUser)->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$p->tracking_number]])->assertOk();
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/inbound', ['tracking_number' => $p->tracking_number])->assertOk();
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/sort', ['tracking_number' => $p->tracking_number])->assertOk();
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/outbound', ['tracking_number' => $p->tracking_number, 'rider_id' => $rider->id])->assertOk();
        $this->as($riderUser)->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => [$p->tracking_number]])->assertOk();

        return $p->fresh();
    }

    private function photo(string $name = 'pod_photo.jpg'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
    }

    private function deliver(User $riderUser, Parcel $p, array $fields = [])
    {
        return $this->as($riderUser)->post("/api/v1/rider/deliveries/{$p->tracking_number}/delivered", $fields + [
            'proof_photo' => $this->photo(), 'otp' => $p->fresh()->delivery_otp, 'cod_amount' => (string) $p->cod_amount,
        ], ['Accept' => 'application/json']);
    }

    private function failAttempt(User $riderUser, Parcel $p, string $reason = 'RECIPIENT_UNAVAILABLE')
    {
        return $this->as($riderUser)->postJson("/api/v1/rider/deliveries/{$p->tracking_number}/failed", ['reason' => $reason]);
    }

    // ── R3: Online and Offline ───────────────────────────────────────────────

    public function test_a_rider_goes_online_and_offline_and_a_suspended_rider_cannot(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]], online: false);
        $this->as($user)->postJson('/api/v1/rider/availability', ['online' => true])->assertOk()->assertJsonPath('data.online', true);
        $listed = collect($this->as($this->ops)->getJson('/api/v1/logistics/riders')->json('data'))->firstWhere('id', $rider->id);
        $this->assertTrue($listed['online']);

        $this->as($user)->postJson('/api/v1/rider/availability', ['online' => false])->assertOk()->assertJsonPath('data.online', false);
        $this->assertFalse($rider->fresh()->isAvailable());

        // Logging out goes Offline (RID-AVAIL-004).
        $this->as($user)->postJson('/api/v1/rider/availability', ['online' => true])->assertOk();
        $this->as($user)->postJson('/api/v1/auth/logout')->assertOk();
        $this->assertFalse($rider->fresh()->is_online);

        // A suspended rider cannot go Online and sees why (RID-PROF-006).
        [$suspendedUser] = $this->rider('Ramon', [$this->qc[3]], online: false, status: Rider::STATUS_SUSPENDED);
        Rider::where('user_id', $suspendedUser->id)->update(['suspension_reason' => 'Repeated late deliveries this week.']);
        $this->as($suspendedUser)->postJson('/api/v1/rider/availability', ['online' => true])->assertStatus(403)
            ->assertJsonFragment(['message' => 'Your rider account is suspended by your courier company, so you cannot go Online or take jobs. Reason: Repeated late deliveries this week..']);
    }

    // ── L4 / R4: offers to the nearest rider ─────────────────────────────────

    public function test_the_offer_goes_to_the_nearest_rider_and_on_to_the_next_after_a_decline_or_60_seconds(): void
    {
        [$farUser, $far] = $this->rider('Far', [$this->cebu[3]]);
        [$nearUser, $near] = $this->rider('Near', [$this->qc[3]]);
        [$thirdUser, $third] = $this->rider('Third', ['137404099']);

        $parcel = $this->ready();
        $this->assertSame($near->id, $this->openOffer($parcel)->rider_id);

        // The offer shows the pickup, the drop-off area, the COD and the pickup pay.
        $offer = $this->as($nearUser)->getJson('/api/v1/rider/offers')->assertOk()->json('data.0');
        $this->assertStringContainsString('Maria Clara Handicrafts', $offer['pickup']['shop_name']);
        $this->assertSame('Central, Quezon City', $offer['dropoff_area']);
        $this->assertEquals(500, $offer['cod_amount']);
        $this->assertSame('30.00', $offer['pay']);
        $this->assertLessThanOrEqual(60, $offer['seconds_left']);
        $this->assertArrayNotHasKey('recipient', $offer);

        // Declined: it goes to the next nearest (same city before another region).
        $this->as($nearUser)->postJson("/api/v1/rider/offers/{$offer['id']}/decline")->assertOk();
        $second = $this->openOffer($parcel);
        $this->assertSame($third->id, $second->rider_id);

        // 61 seconds: expired, Accept is refused, and it moves on.
        $this->travel(61)->seconds();
        $this->as($thirdUser)->postJson("/api/v1/rider/offers/{$second->id}/accept")->assertStatus(409);
        $this->assertSame(DispatchOffer::STATUS_EXPIRED, $second->fresh()->status);
        $last = $this->openOffer($parcel);
        $this->assertSame($far->id, $last->rider_id);

        // The third try declined: the job waits in the Unassigned queue and is no longer offered.
        $this->as($farUser)->postJson("/api/v1/rider/offers/{$last->id}/decline")->assertOk();
        $this->assertNull($this->openOffer($parcel));
        $this->assertSame(Parcel::DISPATCH_UNASSIGNED, $parcel->fresh()->dispatch_state);
        $queue = $this->as($this->ops)->getJson('/api/v1/logistics/dispatch?state=unassigned')->assertOk();
        $this->assertContains($parcel->tracking_number, array_column($queue->json('data'), 'tracking_number'));

        // Accept at 55 seconds works, and the company sees the rider as the assignee.
        $next = $this->ready();
        $o = $this->openOffer($next);
        $this->assertSame($near->id, $o->rider_id);
        $this->travel(55)->seconds();
        $this->as($nearUser)->postJson("/api/v1/rider/offers/{$o->id}/accept")->assertOk();
        $this->assertSame($near->id, $next->fresh()->pickup_rider_id);
        $row = collect($this->as($this->ops)->getJson('/api/v1/logistics/dispatch?state=assigned')->json('data'))->firstWhere('id', $next->id);
        $this->assertSame($near->id, $row['rider']['id']);
    }

    public function test_offline_and_suspended_riders_and_full_riders_get_no_jobs(): void
    {
        [, $off] = $this->rider('Offline', [$this->qc[3]], online: false);
        [, $suspended] = $this->rider('Suspended', [$this->qc[3]], status: Rider::STATUS_SUSPENDED);
        [$busyUser, $busy] = $this->rider('Busy', [$this->qc[3]]);
        foreach (range(1, 3) as $_) {
            $p = $this->ready();
            $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$p->id], 'rider_id' => $busy->id])->assertOk();
        }

        $parcel = $this->ready();
        $this->assertNull($this->openOffer($parcel), 'nobody eligible is Online');

        $riders = $this->as($this->ops)->getJson("/api/v1/logistics/dispatch/riders?parcel_id={$parcel->id}")->assertOk();
        $this->assertNotContains($off->id, array_column($riders->json('data'), 'id'));
        $this->assertNotContains($suspended->id, array_column($riders->json('data'), 'id'));
        $this->assertNotContains($busy->id, array_column($riders->json('data'), 'id'));

        foreach ([[$off, 'Offline'], [$suspended, 'suspended'], [$busy, 'active jobs']] as [$r, $words]) {
            $res = $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$parcel->id], 'rider_id' => $r->id])->assertStatus(422);
            $this->assertStringContainsString($words, $res->json('message'));
        }
        $this->assertNull($parcel->fresh()->pickup_rider_id);

        // A full rider cannot accept a 4th job from the open pool either.
        $this->as($busyUser)->postJson("/api/v1/rider/pickups/sellers/{$this->shop->id}/accept")->assertStatus(409);
    }

    public function test_manual_reassign_bulk_assign_and_the_race_between_accept_and_assign(): void
    {
        [$aUser, $a] = $this->rider('Ana', [$this->qc[3]]);
        [$bUser, $b] = $this->rider('Ben', ['137404099']);

        // The offer goes to Ana; the company assigns Ben at the same moment. Exactly one rider ends with it.
        $parcel = $this->ready();
        $offer = $this->openOffer($parcel);
        $this->assertSame($a->id, $offer->rider_id);
        $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$parcel->id], 'rider_id' => $b->id])->assertOk();
        $this->as($aUser)->postJson("/api/v1/rider/offers/{$offer->id}/accept")->assertStatus(409);
        $this->assertSame($b->id, $parcel->fresh()->pickup_rider_id);

        // The buyer's timeline shows the assignment.
        $history = OrderStatusHistory::where('order_id', $parcel->order_id)->get()->filter(fn ($h) => ($h->meta['event'] ?? null) === 'pickup_assigned');
        $this->assertCount(1, $history);

        // Reassign before pickup: Ben loses it, Ana has it, both events on the timeline.
        $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$parcel->id], 'rider_id' => $a->id])->assertOk();
        $this->assertSame($a->id, $parcel->fresh()->pickup_rider_id);
        $this->assertTrue(OrderStatusHistory::where('order_id', $parcel->order_id)->get()->contains(fn ($h) => ($h->meta['event'] ?? null) === 'pickup_reassigned'));
        $this->as($bUser)->getJson('/api/v1/rider/pickups?view=mine')->assertOk()->assertJsonPath('meta.mine_count', 0);

        // After pickup the rider can no longer change.
        $this->as($aUser)->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();
        $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$parcel->id], 'rider_id' => $b->id])->assertStatus(409);

        // Bulk: 5 parcels to a rider with no jobs: 3 assigned, 2 skipped for the limit, and those 2 stay unassigned.
        [, $c] = $this->rider('Cora', ['137404098'], online: true);
        Rider::whereIn('id', [$a->id, $b->id])->update(['is_online' => false]);
        $five = collect(range(1, 5))->map(fn () => $this->ready());
        $res = $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => $five->pluck('id')->all(), 'rider_id' => $c->id])->assertOk();
        $this->assertCount(3, $res->json('data.assigned'));
        $this->assertCount(2, $res->json('data.skipped'));
        $this->assertStringContainsString('active jobs', $res->json('data.skipped.0.reason'));
        $this->assertSame(2, Parcel::whereIn('id', $five->pluck('id'))->whereNull('pickup_rider_id')->count());

        // A parcel that is not ready for pickup is not in the queue and cannot be assigned.
        $delivered = $this->ready();
        $delivered->update(['status' => Parcel::STATUS_DELIVERED, 'picked_up_at' => now()]);
        $queue = array_column($this->as($this->ops)->getJson('/api/v1/logistics/dispatch')->json('data'), 'id');
        $this->assertNotContains($delivered->id, $queue);
        $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$delivered->id], 'rider_id' => $c->id])->assertStatus(409);
    }

    // ── R5 pickup, L5 hub scans, R6 delivery ─────────────────────────────────

    public function test_pickup_scan_pays_30_and_the_hub_scans_work_in_order_once_and_only_on_our_parcels(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        $parcel = $this->ready();
        $this->as($user)->postJson("/api/v1/rider/offers/{$this->openOffer($parcel)->id}/accept")->assertOk();
        $this->as($user)->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();

        $this->assertSame(Parcel::STATUS_PICKED_UP, $parcel->fresh()->status);
        $this->assertSame('30.00', (string) RiderEarning::where('parcel_id', $parcel->id)->where('kind', RiderEarning::KIND_PICKUP)->value('amount'));
        $this->as($this->customer)->getJson("/api/v1/buyer/orders/{$parcel->order_id}")->assertOk()->assertJsonPath('data.tab', 'to_receive');
        $this->as($this->shop)->postJson("/api/v1/seller/orders/{$parcel->order_id}/cancel", ['reason' => 'Out of stock'])->assertStatus(409);

        // On the way in: listed for Inbound with the rider bringing it, and only on its own hub's board.
        $board = fn (array $query = []) => $this->as($this->ops)->getJson('/api/v1/logistics/hub-ops/zones?' . http_build_query($query))->assertOk();
        $incoming = collect($board(['hub_id' => $this->hub->id])->json('data.incoming'))->firstWhere('tracking_number', $parcel->tracking_number);
        $this->assertNotNull($incoming);
        $this->assertSame('Pedro', strtok((string) $incoming['rider'], ' '));
        $this->assertNotContains($parcel->tracking_number, array_column($board(['hub_id' => $this->hub->id + 1000])->json('data.incoming'), 'tracking_number'));

        // Outbound before Inbound: blocked, nothing changes.
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/outbound', ['tracking_number' => $parcel->tracking_number, 'rider_id' => $rider->id])->assertStatus(409);
        $this->assertSame(Parcel::STATUS_PICKED_UP, $parcel->fresh()->status);

        // Inbound, then the same scan again: "already received", one At Hub event.
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/inbound', ['tracking_number' => strtolower($parcel->tracking_number), 'hub_id' => $this->hub->id])->assertOk();
        $this->assertSame(Parcel::STATUS_AT_SORTING_CENTER, $parcel->fresh()->status);
        $this->assertNotNull($parcel->fresh()->scanned_in_at);
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/inbound', ['tracking_number' => $parcel->tracking_number])->assertStatus(409)
            ->assertJsonFragment(['message' => 'Already received on ' . $parcel->fresh()->scanned_in_at->setTimezone('Asia/Manila')->format('M j, g:i A') . '. Nothing was changed.']);
        $this->assertSame(1, OrderStatusHistory::where('order_id', $parcel->order_id)->where('to_status', 'AT_SORTING_CENTER')->count());

        // Unknown and another company's tracking numbers: not found, nothing created or changed.
        $count = Parcel::count();
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/inbound', ['tracking_number' => 'TRK-0000000'])->assertStatus(404);
        $this->assertSame($count, Parcel::count());
        $foreign = $this->ready();
        $foreign->update(['logistics_company_id' => LogisticsCompany::defaultId(), 'status' => Parcel::STATUS_PICKED_UP]);
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/inbound', ['tracking_number' => $foreign->tracking_number])->assertStatus(404);
        $this->assertSame(Parcel::STATUS_PICKED_UP, $foreign->fresh()->status);

        // Sorted into the NCR zone list only.
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/sort', ['tracking_number' => $parcel->tracking_number])->assertOk();
        $zones = collect($this->as($this->ops)->getJson('/api/v1/logistics/hub-ops/zones')->json('data.zones'));
        $this->assertSame(['NCR'], $zones->filter(fn ($z) => in_array($parcel->tracking_number, array_column($z['parcels'], 'tracking_number'), true))->pluck('zone')->values()->all());

        // Outbound to the rider; Out for Delivery shows the buyer a 6-digit code.
        $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/outbound', ['tracking_number' => $parcel->tracking_number, 'rider_id' => $rider->id])->assertOk();
        $this->as($user)->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();
        $code = $this->as($this->customer)->getJson("/api/v1/buyer/orders/{$parcel->order_id}")->json('data.delivery_otp');
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);
        // Never in the rider's list: only that a code is needed.
        $list = $this->as($user)->getJson('/api/v1/rider/deliveries?view=out_for_delivery')->assertOk();
        $this->assertStringNotContainsString('delivery_otp', $list->getContent());
        $this->assertTrue($list->json('data.0.parcels.0.otp_required'));
    }

    public function test_the_delivery_code_locks_after_5_wrong_tries_and_the_cod_must_be_exact(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        $parcel = $this->outForDelivery($this->ready(), $user, $rider);
        $right = $parcel->delivery_otp;
        $wrong = $right === '000000' ? '111111' : '000000';

        $this->deliver($user, $parcel, ['otp' => '12345'])->assertStatus(422)->assertJsonValidationErrors(['otp']);
        foreach (range(1, 4) as $i) {
            $this->deliver($user, $parcel, ['otp' => $wrong])->assertStatus(422)->assertJsonFragment(['message' => 'Wrong delivery code. ' . (5 - $i) . ' tries left.']);
        }
        $this->deliver($user, $parcel, ['otp' => $wrong])->assertStatus(423);
        $this->deliver($user, $parcel, ['otp' => $right])->assertStatus(423); // locked: even the right code
        $this->assertSame(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->fresh()->status);

        $this->travel(15)->minutes();
        $this->travel(1)->seconds();
        foreach (['499.99', '500.01'] as $amount) {
            $this->deliver($user, $parcel, ['otp' => $right, 'cod_amount' => $amount])->assertStatus(422)->assertJsonValidationErrors(['cod_amount']);
        }
        $this->deliver($user, $parcel, ['otp' => $right, 'cod_amount' => '500.00'])->assertOk()->assertJsonPath('pay', '50.00');

        $this->assertSame(Parcel::STATUS_DELIVERED, $parcel->fresh()->status);
        $this->as($user)->getJson('/api/v1/rider/cod')->assertOk()->assertJsonPath('data.balance.outstanding', '500.00');
        $this->assertSame('50.00', (string) RiderEarning::where('parcel_id', $parcel->id)->where('kind', RiderEarning::KIND_DELIVERY)->value('amount'));
    }

    // ── R7 / L7: failed attempts and Return to Sender ────────────────────────

    public function test_three_failed_attempts_go_back_to_the_seller_who_confirms_before_the_stock_returns(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        [, $variants] = $this->product($this->shop, 'Buri Placemat Set', ['Default' => [450, 19]], 0.8);
        $parcel = $this->outForDelivery($this->ready(500, 'cod', $variants['Default']), $user, $rider);

        $this->failAttempt($user, $parcel)->assertOk()->assertJsonPath('delivery_attempts', 1)->assertJsonPath('return_to_sender', false)->assertJsonPath('pay', '0.00');
        $this->assertSame(Parcel::STATUS_DELIVERY_FAILED, $parcel->fresh()->status);
        $this->assertTrue($this->customer->notifications()->where('data->title', 'Delivery attempt failed')->exists());

        $res = null;
        foreach ([2, 3] as $attempt) {
            $this->as($this->ops)->postJson("/api/v1/logistics/parcels/{$parcel->id}/reschedule", ['rider_id' => $rider->id])->assertOk()
                ->assertJsonFragment(['message' => "Rescheduled: attempt {$attempt} of 3 with " . 'Pedro G..']);
            $this->as($user)->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => [$parcel->tracking_number]])->assertOk();
            $this->as($user)->getJson('/api/v1/rider/deliveries?view=out_for_delivery')->assertOk()->assertJsonPath('data.0.parcels.0.attempt', $attempt);
            $res = $this->failAttempt($user, $parcel, $attempt === 3 ? 'WRONG_ADDRESS' : 'RECIPIENT_UNAVAILABLE')->assertOk();
        }
        $res->assertJsonPath('return_to_sender', true);
        $this->assertSame(Parcel::STATUS_RETURN_TO_SENDER, $parcel->fresh()->status);
        $this->as($this->ops)->postJson("/api/v1/logistics/parcels/{$parcel->id}/reschedule", ['rider_id' => $rider->id])->assertStatus(409);

        // The RTS queue lists it with all three reasons.
        $row = collect($this->as($this->ops)->getJson('/api/v1/logistics/returns')->json('data'))->firstWhere('id', $parcel->id);
        $this->assertSame(['Recipient unavailable', 'Recipient unavailable', 'Wrong or incomplete address'], array_column($row['failures'], 'reason'));

        // A rider takes it back; the buyer sees Cancelled (failed delivery); the seller confirms before the stock returns.
        $this->as($this->ops)->postJson("/api/v1/logistics/returns/{$parcel->id}/assign", ['rider_id' => $rider->id])->assertOk();
        $this->as($user)->getJson('/api/v1/rider/returns')->assertOk()->assertJsonPath('data.0.tracking_number', $parcel->tracking_number);
        $this->as($user)->postJson("/api/v1/rider/returns/{$parcel->tracking_number}/delivered")->assertOk();
        $this->assertSame(Parcel::STATUS_RETURNED, $parcel->fresh()->status);
        $this->as($this->customer)->getJson("/api/v1/buyer/orders/{$parcel->order_id}")->assertOk()
            ->assertJsonPath('data.status', 'CANCELLED')->assertJsonPath('data.cancel_reason', 'Failed delivery');
        $this->as($this->shop)->getJson("/api/v1/seller/orders/{$parcel->order_id}")->assertOk()->assertJsonPath('data.return_to_sender.state', 'awaiting_confirmation');
        $this->assertSame(19, $variants['Default']->fresh()->stock_quantity);
        $this->as($this->shop)->postJson("/api/v1/seller/orders/{$parcel->order_id}/confirm-return-received")->assertOk();
        $this->assertSame(20, $variants['Default']->fresh()->stock_quantity);
        $this->as($this->shop)->postJson("/api/v1/seller/orders/{$parcel->order_id}/confirm-return-received")->assertStatus(409);
        $this->assertSame(20, $variants['Default']->fresh()->stock_quantity);
    }

    public function test_a_refusal_goes_straight_back_and_a_prepaid_order_is_refunded_with_no_earnings(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        $parcel = $this->outForDelivery($this->ready(500, 'e_wallet', null, 'paid'), $user, $rider);

        $this->failAttempt($user, $parcel, 'REFUSED')->assertOk()->assertJsonPath('return_to_sender', true)->assertJsonPath('delivery_attempts', 1);
        $this->assertSame(Parcel::STATUS_RETURN_TO_SENDER, $parcel->fresh()->status);

        $this->as($this->ops)->postJson("/api/v1/logistics/returns/{$parcel->id}/assign", ['rider_id' => $rider->id])->assertOk();
        $this->as($user)->postJson("/api/v1/rider/returns/{$parcel->tracking_number}/delivered")->assertOk();

        $order = Order::find($parcel->order_id);
        $this->assertSame(OrderStatus::CANCELLED, $order->status);
        $this->assertSame('refunded', $order->refund_status);
        $this->assertEqualsWithDelta(500.00, (float) $order->refund_amount, 0.001);
        $this->assertEquals(0, $this->as($this->shop)->getJson('/api/v1/seller/reports/summary?range=today')->assertOk()->json('data.net_earnings'));
    }

    // ── L6: overrides, Lost, Damaged and search ──────────────────────────────

    public function test_an_override_needs_a_reason_and_is_in_the_audit_log_and_lost_and_damaged_cancel_the_order(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        $parcel = $this->outForDelivery($this->ready(), $user, $rider);

        $this->as($this->ops)->postJson("/api/v1/logistics/parcels/{$parcel->id}/override", ['status' => 'DELIVERED', 'reason' => ''])->assertStatus(422);
        $this->as($this->ops)->postJson("/api/v1/logistics/parcels/{$parcel->id}/override", ['status' => 'DELIVERED', 'reason' => 'Too short'])->assertStatus(422);
        $this->assertSame(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->fresh()->status);
        $this->as($this->ops)->postJson("/api/v1/logistics/parcels/{$parcel->id}/override", ['status' => 'DELIVERED', 'reason' => 'Rider app offline, delivery confirmed by phone.'])->assertOk();
        $this->assertSame(Parcel::STATUS_DELIVERED, $parcel->fresh()->status);

        $audit = $this->as($this->ops)->getJson("/api/v1/logistics/parcels/{$parcel->id}")->assertOk()->json('data.audit.0');
        $this->assertSame('parcel.override', $audit['action']);
        $this->assertSame(['status' => 'OUT_FOR_DELIVERY'], $audit['from']);
        $this->assertSame('DELIVERED', $audit['to']['status']);
        $this->assertSame('Rider app offline, delivery confirmed by phone.', $audit['reason']);
        $this->assertSame('Carlos Mendoza', $audit['by']);
        $this->assertNotNull($audit['at']);
        // There is no way to edit or delete an entry.
        $this->as($this->ops)->deleteJson("/api/v1/logistics/parcels/{$parcel->id}/audit/{$audit['id']}")->assertNotFound();
        $this->as($this->ops)->patchJson("/api/v1/logistics/parcels/{$parcel->id}/audit/{$audit['id']}", ['reason' => 'changed'])->assertNotFound();
        $this->assertSame(1, AuditLog::where('action', 'parcel.override')->where('subject_id', $parcel->id)->count());

        // Lost: the order is cancelled, the prepaid payment refunded, and both sides told.
        $lost = $this->outForDelivery($this->ready(700, 'card', null, 'paid'), $user, $rider);
        $this->as($this->ops)->postJson("/api/v1/logistics/parcels/{$lost->id}/exception", ['type' => 'lost', 'reason' => 'Not found at the hub after the inventory count.'])->assertOk();
        $this->assertSame(Parcel::STATUS_LOST, $lost->fresh()->status);
        $this->assertSame('refunded', Order::find($lost->order_id)->refund_status);
        $this->assertTrue($this->customer->notifications()->where('data->kind', 'order.parcel_lost')->exists());
        $this->assertTrue($this->shop->notifications()->where('data->kind', 'order.parcel_lost')->exists());

        // Damaged: needs a photo.
        $damaged = $this->outForDelivery($this->ready(), $user, $rider);
        $this->as($this->ops)->post("/api/v1/logistics/parcels/{$damaged->id}/exception", ['type' => 'damaged', 'reason' => 'Box crushed during the trip.'], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['photo']);
        $this->as($this->ops)->post("/api/v1/logistics/parcels/{$damaged->id}/exception", ['type' => 'damaged', 'reason' => 'Box crushed during the trip.', 'photo' => $this->photo()], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(Parcel::STATUS_DAMAGED, $damaged->fresh()->status);
        $this->assertTrue(Storage::disk('ids')->exists($damaged->fresh()->exception_photo_path));
    }

    public function test_search_finds_a_parcel_by_tracking_order_number_order_id_or_buyer_name(): void
    {
        $parcel = $this->ready();
        $order = Order::find($parcel->order_id);
        $ids = fn (string $q) => array_column($this->as($this->ops)->getJson('/api/v1/logistics/parcels?search=' . urlencode($q))->assertOk()->json('data'), 'id');

        $this->assertSame([$parcel->id], $ids($parcel->tracking_number));
        $this->assertSame([$parcel->id], $ids($order->order_number));
        $this->assertSame([$parcel->id], $ids((string) $order->id));
        $this->assertContains($parcel->id, $ids('Juan Miguel Dela Cruz'));
        $this->assertSame([], $ids('Nobody By This Name'));
        $this->assertSame([], $ids("' OR '1'='1"));
    }

    // ── R9 / L9: COD, remittances and exports ────────────────────────────────

    public function test_cod_balance_remittance_confirmation_and_shortfall(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        foreach ([500.00, 1300.00] as $total) {
            $p = $this->outForDelivery($this->ready($total), $user, $rider);
            $this->deliver($user, $p)->assertOk();
        }
        $this->as($user)->getJson('/api/v1/rider/cod')->assertOk()->assertJsonPath('data.balance.outstanding', '1800.00')->assertJsonCount(2, 'data.collections');

        $r = $this->as($user)->postJson('/api/v1/rider/cod/remittances', ['amount' => 1800], ['Idempotency-Key' => 'k-' . Str::random(8)])->assertCreated()->json('data');
        $this->assertSame('pending', $r['status']);
        $this->as($user)->getJson('/api/v1/rider/cod')->assertJsonPath('data.balance.outstanding', '1800.00')->assertJsonPath('data.balance.pending', '1800.00');

        // The rider cannot confirm their own remittance.
        $this->as($user)->postJson("/api/v1/logistics/cod/remittances/{$r['id']}/confirm")->assertForbidden();

        $day = $this->as($this->ops)->getJson('/api/v1/logistics/cod')->assertOk()->json('data');
        $mine = collect($day['riders'])->firstWhere('rider_id', $rider->id);
        $this->assertSame(['1800.00', '1800.00', '0.00', false], [$mine['collected'], $mine['remitted'], $mine['difference'], $mine['shortfall']]);
        $this->assertCount(2, $mine['orders']);

        $this->as($this->ops)->postJson("/api/v1/logistics/cod/remittances/{$r['id']}/confirm")->assertOk();
        $this->as($user)->getJson('/api/v1/rider/cod')->assertJsonPath('data.balance.outstanding', '0.00');
        $this->assertTrue(AuditLog::where('action', 'cod.remittance_confirmed')->where('subject_id', $r['id'])->exists());

        // A short remittance: flagged for the company, and the rest stays on the rider's balance.
        [$user2, $rider2] = $this->rider('Rosa', [$this->qc[3]]);
        foreach ([500.00, 1300.00] as $total) {
            $p = $this->outForDelivery($this->ready($total), $user2, $rider2);
            $this->deliver($user2, $p)->assertOk();
        }
        $short = $this->as($user2)->postJson('/api/v1/rider/cod/remittances', ['amount' => 1750])->assertCreated()->json('data');
        $pending = collect($this->as($this->ops)->getJson('/api/v1/logistics/cod')->json('data.pending'))->firstWhere('id', $short['id']);
        $this->assertSame('50.00', $pending['shortfall']);
        $row = collect($this->as($this->ops)->getJson('/api/v1/logistics/cod')->json('data.riders'))->firstWhere('rider_id', $rider2->id);
        $this->assertSame(['-50.00', true], [$row['difference'], $row['shortfall']]);
        $this->as($this->ops)->postJson("/api/v1/logistics/cod/remittances/{$short['id']}/confirm")->assertOk();
        $this->as($user2)->getJson('/api/v1/rider/cod')->assertJsonPath('data.balance.outstanding', '50.00');
    }

    public function test_exports_match_the_records_and_an_empty_range_has_headers_only(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        $p = $this->outForDelivery($this->ready(), $user, $rider);
        $this->deliver($user, $p)->assertOk();
        $today = now('Asia/Manila')->toDateString();

        $csv = $this->as($this->ops)->get("/api/v1/logistics/exports?type=deliveries&format=csv&from={$today}&to={$today}")->assertOk();
        $lines = array_values(array_filter(explode("\n", trim($csv->streamedContent()))));
        $this->assertCount(3, $lines); // header, the delivery, the total
        $this->assertStringContainsString($p->tracking_number, $lines[1]);

        $cod = $this->as($this->ops)->get("/api/v1/logistics/exports?type=cod&format=csv&from={$today}&to={$today}")->assertOk()->streamedContent();
        $this->assertStringContainsString('500', $cod);

        $xlsx = $this->as($this->ops)->get("/api/v1/logistics/exports?type=deliveries&format=xlsx&from={$today}&to={$today}")->assertOk();
        $file = $xlsx->baseResponse->getFile()->getPathname();
        $zip = new \ZipArchive();
        $this->assertTrue($zip->open($file) === true);
        $this->assertStringContainsString($p->tracking_number, $zip->getFromName('xl/worksheets/sheet1.xml'));
        $zip->close();

        $empty = $this->as($this->ops)->get('/api/v1/logistics/exports?type=deliveries&format=csv&from=2020-01-01&to=2020-01-31')->assertOk()->streamedContent();
        $this->assertCount(1, array_filter(explode("\n", trim($empty))));
        $this->as($this->ops)->getJson("/api/v1/logistics/exports?type=cod&format=csv&from={$today}&to=2020-01-01")->assertStatus(422);
    }

    public function test_the_dashboard_counts_shipments_on_the_first_and_last_day_of_the_range(): void
    {
        $day = now('Asia/Manila')->subDays(5);
        $first = $this->ready();
        $last = $this->ready();
        $outside = $this->ready();
        $first->update(['ready_at' => $day->copy()->startOfDay()->addMinute()->utc()]);
        $last->update(['ready_at' => $day->copy()->endOfDay()->subMinute()->utc()]);
        $outside->update(['ready_at' => $day->copy()->subDay()->utc()]);

        $d = $day->toDateString();
        $this->as($this->ops)->getJson("/api/v1/logistics/dashboard?from={$d}&to={$d}")->assertOk()->assertJsonPath('data.period.shipments', 2);
        $today = now('Asia/Manila')->toDateString();
        $this->as($this->ops)->getJson("/api/v1/logistics/dashboard?from={$today}&to={$today}")->assertOk()->assertJsonPath('data.period.shipments', 0);
        $this->as($this->ops)->getJson("/api/v1/logistics/dashboard?from={$today}&to={$d}")->assertStatus(422);
    }

    // ── R8: pay per job ──────────────────────────────────────────────────────

    public function test_two_pickups_three_deliveries_and_a_failed_attempt_pay_exactly_210(): void
    {
        [$user, $rider] = $this->rider('Pedro', [$this->qc[3]]);
        [$otherUser, $other] = $this->rider('Other', [$this->qc[3]]);

        // Another rider picks it up; Pedro takes it from the hub.
        $pickedByOther = function () use ($otherUser, $other, $user, $rider) {
            $p = $this->ready();
            $this->as($this->ops)->postJson('/api/v1/logistics/dispatch/assign', ['parcel_ids' => [$p->id], 'rider_id' => $other->id])->assertOk();
            $this->as($otherUser)->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$p->tracking_number]])->assertOk();
            foreach (['inbound', 'sort'] as $step) {
                $this->as($this->ops)->postJson("/api/v1/logistics/hub-ops/{$step}", ['tracking_number' => $p->tracking_number])->assertOk();
            }
            $this->as($this->ops)->postJson('/api/v1/logistics/hub-ops/outbound', ['tracking_number' => $p->tracking_number, 'rider_id' => $rider->id])->assertOk();
            $this->as($user)->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => [$p->tracking_number]])->assertOk();

            return $p->fresh();
        };

        // Today: 2 pickups and 3 deliveries by Pedro, and 1 failed attempt.
        foreach (range(1, 2) as $_) {
            $this->deliver($user, $this->outForDelivery($this->ready(), $user, $rider))->assertOk();
        }
        $this->deliver($user, $pickedByOther())->assertOk();
        $this->failAttempt($user, $pickedByOther())->assertOk()->assertJsonPath('pay', '0.00');

        $summary = $this->as($user)->getJson('/api/v1/rider/earnings/summary?period=day')->assertOk()->json('data');
        $this->assertSame('210.00', $summary['total_earned']); // 2 x 30.00 + 3 x 50.00 + 1 x 0.00
        $week = $this->as($user)->getJson('/api/v1/rider/earnings/summary?period=week')->json('data.total_earned');
        $this->assertGreaterThanOrEqual((float) $summary['total_earned'], (float) $week);
    }
}
