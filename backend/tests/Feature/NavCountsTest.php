<?php

namespace Tests\Feature;

use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Product;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * The numbers on each portal's sidebar (docs/api/nav-counts.md): counts only, each scoped to the account asking and
 * following the rule of the page it points to.
 */
class NavCountsTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private const AREA = '043405001';

    private LogisticsCompany $company;
    private User $ops;
    private SortingCenter $hub;
    private User $hubUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->company = LogisticsCompany::create([
            'name' => 'Nav Courier ' . Str::random(4), 'slug' => 'nav-' . Str::lower(Str::random(6)), 'code' => 'NV' . Str::upper(Str::random(4)),
            'contact_email' => 'nav' . Str::random(5) . '@example.com', 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(), 'is_default' => false,
        ]);
        $this->ops = $this->person('Ops');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->ops->id, 'role' => 'owner']);
        [$this->hubUser, $this->hub] = $this->hub(SortingCenter::STATUS_APPROVED);
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private function person(string $first, string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Tester', 'email' => Str::lower($first) . '.' . Str::lower(Str::random(10)) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: SortingCenter} */
    private function hub(string $status): array
    {
        $user = $this->person('Hub');
        $hub = SortingCenter::create([
            'logistics_company_id' => $this->company->id, 'user_id' => $user->id, 'hub_name' => 'Nav Hub ' . Str::random(4),
            'address_province' => 'Laguna', 'address_city' => 'Santa Cruz', 'address_barangay' => 'Poblacion', 'address_street' => '1 Hub St',
            'status' => $status, 'coverage_barangays' => [self::AREA],
        ]);

        return [$user, $hub];
    }

    /** @return array{0: User, 1: Rider} */
    private function rider(string $status = Rider::STATUS_ACTIVE, array $extra = []): array
    {
        $user = $this->person('Rider');
        $rider = Rider::forceCreate($extra + [
            'user_id' => $user->id, 'sorting_center_id' => $this->hub->id, 'logistics_company_id' => $this->company->id,
            'vehicle_type' => Rider::VEHICLE_MOTORCYCLE, 'plate_number' => 'NAV' . random_int(1000, 9999),
            'or_cr_path' => 'ids/or.pdf', 'drivers_license_path' => 'ids/license.pdf', 'status' => $status, 'submitted_at' => now(),
        ]);

        return [$user, $rider];
    }

    /** An order of the seller with the given number of lines. */
    private function order(User $seller, string $status, int $lines = 1): Order
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . Str::upper(Str::random(10)), 'buyer_id' => $this->person('Buyer')->id,
            'logistics_company_id' => $this->company->id, 'status' => $status, 'subtotal' => 450, 'shipping_fee' => 50, 'total' => 500,
            'payment_method' => 'cod', 'payment_status' => 'pending', 'shipping_name' => 'Ana Buyer', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 Rizal St', 'shipping_province' => 'Laguna', 'shipping_city' => 'Santa Cruz', 'shipping_barangay' => 'Poblacion',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043405000', 'shipping_barangay_code' => self::AREA,
        ]);
        for ($i = 0; $i < $lines; $i++) {
            OrderItem::create(['order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Woven basket', 'unit_price' => 450, 'quantity' => 1, 'subtotal' => 450]);
        }

        return $order;
    }

    private function parcel(string $status, array $extra = []): Parcel
    {
        $seller = $this->person('Shop');
        $order = $this->order($seller, $status === Parcel::STATUS_RETURN_TO_SENDER ? 'DELIVERY_FAILED' : $status);

        return Parcel::create($extra + [
            'tracking_number' => 'LIT-' . date('ymd') . '-' . Str::upper(Str::random(6)), 'order_id' => $order->id, 'seller_id' => $seller->id,
            'logistics_company_id' => $this->company->id, 'status' => $status, 'sorting_center_id' => $this->hub->id,
            'destination_barangay' => 'Poblacion', 'destination_barangay_code' => self::AREA,
            'pickup_barangay' => 'Poblacion', 'pickup_barangay_code' => self::AREA, 'ready_at' => now()->subHour(),
        ]);
    }

    // ── Access ───────────────────────────────────────────────────────────────

    public function test_each_portal_only_answers_its_own_accounts(): void
    {
        $buyer = $this->person('Shopper');

        $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/admin/nav-counts')->assertForbidden();
        $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/seller/nav-counts')->assertForbidden();
        $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/hub/nav-counts')->assertForbidden();
        $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/logistics/nav-counts')->assertForbidden();
        $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/rider/nav-counts')->assertForbidden();
    }

    public function test_a_guest_gets_401(): void
    {
        $this->getJson('/api/v1/admin/nav-counts')->assertUnauthorized();
        $this->getJson('/api/v1/rider/nav-counts')->assertUnauthorized();
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    public function test_admin_counts_what_waits_for_loved_it(): void
    {
        $admin = $this->person('Admin', 'admin');
        $before = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/nav-counts')->assertOk()->json('data');

        $this->seller('Waiting Shop', $this->qc, ['application_status' => 'pending', 'submitted_at' => now()]);
        $this->hub(SortingCenter::STATUS_PENDING);
        LogisticsCompany::create([
            'name' => 'New Courier ' . Str::random(4), 'slug' => 'new-' . Str::lower(Str::random(6)), 'code' => 'NC' . Str::upper(Str::random(4)),
            'contact_email' => 'new' . Str::random(5) . '@example.com', 'status' => LogisticsCompany::STATUS_PENDING, 'submitted_at' => now(), 'is_default' => false,
        ]);
        $shop = $this->seller('Live Shop', $this->qc);
        $this->product($shop, 'Held listing', ['Default' => [100, 5]], 0.5, ['status' => 'pending_review']);

        $after = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/nav-counts')->assertOk()->json('data');

        $this->assertSame($before['seller_applications'] + 1, $after['seller_applications']);
        $this->assertSame($before['hub_applications'] + 1, $after['hub_applications']);
        $this->assertSame($before['courier_applications'] + 1, $after['courier_applications']);
        $this->assertSame($before['products'] + 1, $after['products']);
        foreach (['buyer_applications', 'payments', 'disputes', 'messages'] as $key) {
            $this->assertIsInt($after[$key]);
        }
    }

    // ── Seller ───────────────────────────────────────────────────────────────

    public function test_seller_counts_orders_not_order_lines_and_only_their_own(): void
    {
        $shop = $this->seller('Counting Shop', $this->qc);
        $other = $this->seller('Other Shop', $this->qc);

        // Four new orders (one with three lines): the old badge stopped at 3 and counted lines.
        $this->order($shop, 'PLACED', 3);
        $this->order($shop, 'PLACED');
        $this->order($shop, 'PLACED');
        $this->order($shop, 'PLACED');
        $this->order($shop, 'CONFIRMED');
        $this->order($shop, 'PREPARING', 2);
        // Not the shop's job any more, or not the shop's order.
        $this->order($shop, 'READY_FOR_PICKUP');
        $this->order($shop, 'COMPLETED');
        $this->order($other, 'PLACED');
        $this->product($shop, 'Rejected mat', ['Default' => [100, 5]], 0.5, ['status' => 'rejected']);

        $this->actingAs($shop, 'sanctum')->getJson('/api/v1/seller/nav-counts')->assertOk()
            ->assertJsonPath('data.orders_new', 4)
            ->assertJsonPath('data.orders_to_prepare', 2)
            ->assertJsonPath('data.returns_to_answer', 0)
            ->assertJsonPath('data.refunds_to_send', 0)
            ->assertJsonPath('data.products_rejected', 1)
            ->assertJsonPath('data.messages', 0);
    }

    // ── Hub ──────────────────────────────────────────────────────────────────

    public function test_hub_counts_each_stage_of_its_own_parcels(): void
    {
        $this->parcel(Parcel::STATUS_PICKED_UP);
        $this->parcel(Parcel::STATUS_AT_SORTING_CENTER);
        $this->parcel(Parcel::STATUS_AT_SORTING_CENTER);
        $this->parcel(Parcel::STATUS_SORTED);
        $this->parcel(Parcel::STATUS_DELIVERY_FAILED);
        $this->rider(Rider::STATUS_PENDING);
        // Another hub's parcel is not counted.
        [, $otherHub] = $this->hub(SortingCenter::STATUS_APPROVED);
        $this->parcel(Parcel::STATUS_SORTED, ['sorting_center_id' => $otherHub->id]);

        $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/nav-counts')->assertOk()
            ->assertJsonPath('data.intake', 1)
            ->assertJsonPath('data.sorting', 2)
            ->assertJsonPath('data.dispatch', 1)
            ->assertJsonPath('data.deliveries', 1)
            ->assertJsonPath('data.riders', 1);
    }

    // ── Courier company ──────────────────────────────────────────────────────

    public function test_courier_counts_its_network_only(): void
    {
        $this->hub(SortingCenter::STATUS_PENDING);
        $this->rider(Rider::STATUS_PENDING, ['applied_at' => now()]);
        $this->rider(Rider::STATUS_ACTIVE);
        $this->parcel(Parcel::STATUS_READY_FOR_PICKUP);
        $this->parcel(Parcel::STATUS_DELIVERY_FAILED);
        $this->parcel(Parcel::STATUS_RETURN_TO_SENDER, ['rts_at' => now()]);

        $this->actingAs($this->ops, 'sanctum')->getJson('/api/v1/logistics/nav-counts')->assertOk()
            ->assertJsonPath('data.hubs', 1)
            ->assertJsonPath('data.riders', 1)
            ->assertJsonPath('data.trucks', 0)
            ->assertJsonPath('data.dispatch', 1)
            ->assertJsonPath('data.parcels', 1)
            ->assertJsonPath('data.returns', 1)
            ->assertJsonPath('data.cod', 0);
    }

    // ── Rider ────────────────────────────────────────────────────────────────

    public function test_rider_counts_pickup_stops_and_parcels_to_deliver(): void
    {
        [$user, $rider] = $this->rider();
        RiderAreaAssignment::create(['rider_id' => $rider->id, 'sorting_center_id' => $this->hub->id, 'area_label' => 'Poblacion', 'coverage_barangays' => [self::AREA], 'is_active' => true]);

        // Two open pickups in the rider's area (two shops), one the rider took, one in another area.
        $this->parcel(Parcel::STATUS_READY_FOR_PICKUP);
        $this->parcel(Parcel::STATUS_READY_FOR_PICKUP);
        $this->parcel(Parcel::STATUS_READY_FOR_PICKUP, ['pickup_rider_id' => $rider->id]);
        $this->parcel(Parcel::STATUS_READY_FOR_PICKUP, ['pickup_barangay_code' => '137404001']);
        // Two to deliver; one delivered already.
        $this->parcel(Parcel::STATUS_ASSIGNED_TO_RIDER, ['assigned_rider_id' => $rider->id]);
        $this->parcel(Parcel::STATUS_OUT_FOR_DELIVERY, ['assigned_rider_id' => $rider->id]);
        $this->parcel(Parcel::STATUS_DELIVERED, ['assigned_rider_id' => $rider->id]);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/nav-counts')->assertOk()
            ->assertJsonPath('data.pickups', 3)
            ->assertJsonPath('data.deliveries', 2)
            ->assertJsonPath('data.trips', 0);
    }
}
