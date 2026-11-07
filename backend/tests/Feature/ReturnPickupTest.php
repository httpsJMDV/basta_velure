<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Return pickups: after an approved return, a rider of the hub that delivered the order collects the item from the
 * buyer (with a photo) and hands it to the shop, which confirms it arrived. Three failed visits cancel it.
 */
class ReturnPickupTest extends TestCase
{
    use \Tests\Support\BuildsCommerce;
    use DatabaseTransactions;

    private LogisticsCompany $company;

    private User $hubUser;

    private SortingCenter $hub;

    private User $ops;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Storage::fake('public');

        $code = strtoupper(Str::random(6));
        $this->company = LogisticsCompany::create([
            'name' => 'Balik Express ' . $code, 'code' => $code, 'slug' => strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
        $this->ops = $this->user('ops');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->ops->id, 'role' => 'owner']);
        $this->hubUser = $this->user('hub');
        $this->hub = SortingCenter::forceCreate([
            'user_id' => $this->hubUser->id, 'hub_name' => 'Pila Hub ' . $code, 'address_province' => 'Laguna', 'address_city' => 'Pila',
            'address_barangay' => 'Santa Clara', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043424015'], 'logistics_company_id' => $this->company->id,
        ]);
    }

    private function user(string $tag, string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => ucfirst($tag), 'last_name' => 'Santos', 'email' => $tag . '.' . Str::lower(Str::random(10)) . '@example.com',
            'phone' => '+63917' . random_int(1000000, 9999999), 'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
            'buyer_application_status' => 'approved',
        ]);
    }

    private function rider(string $duty = Rider::DUTY_DELIVERY): Rider
    {
        return Rider::forceCreate([
            'user_id' => $this->user('rider', 'rider')->id, 'logistics_company_id' => $this->company->id, 'sorting_center_id' => $this->hub->id,
            'vehicle_type' => 'Motorcycle', 'duty' => $duty, 'plate_number' => 'RTN' . random_int(1000, 9999), 'status' => Rider::STATUS_ACTIVE,
            'activated_at' => now(),
        ])->fresh(['user']);
    }

    /** @return array{0: Order, 1: User, 2: User} the order, its buyer and its shop, with an approved return */
    private function approvedReturn(bool $returnItem = true, string $reason = 'Damaged item'): array
    {
        $buyer = $this->user('buyer');
        $seller = $this->seller('Maria Clara Handicrafts ' . Str::random(4), $this->qc);
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => OrderStatus::DELIVERED->value,
            'subtotal' => 450.00, 'shipping_fee' => 50.00, 'total' => 500.00, 'payment_method' => 'cod', 'payment_status' => 'paid',
            'settlement' => Order::SETTLEMENT_DIRECT, 'shipping_name' => 'Ana Buyer', 'shipping_phone' => '09998887777',
            'shipping_address' => '12 Sampaguita St', 'shipping_province' => 'Laguna', 'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara',
            'shipping_barangay_code' => '043424015', 'logistics_company_id' => $this->company->id,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Rattan Basket', 'variant_label' => 'Default',
            'unit_price' => 450.00, 'quantity' => 1, 'subtotal' => 450.00, 'commission_rate' => 0.05, 'commission_amount' => 22.50,
            'seller_earnings' => 427.50, 'payout_status' => 'pending_release',
        ]);
        Parcel::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'tracking_number' => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'status' => Parcel::STATUS_DELIVERED, 'logistics_company_id' => $this->company->id, 'sorting_center_id' => $this->hub->id,
            'destination_barangay' => 'Santa Clara', 'destination_barangay_code' => '043424015', 'pickup_barangay' => 'Bubukal',
            'delivered_at' => now()->subHour(), 'delivery_proof_path' => 'delivery-proofs/a.jpg', 'received_by' => 'Ana',
            'pickup_address_snapshot' => ['shop_name' => 'Maria Clara Handicrafts', 'phone' => '09171112222', 'full_address' => '3 Rizal St, Bubukal, Santa Cruz', 'barangay' => 'Bubukal', 'city' => 'Santa Cruz'],
            'recipient_snapshot' => ['name' => 'Ana Buyer', 'phone' => '09998887777', 'full_address' => '12 Sampaguita St, Santa Clara, Pila', 'barangay' => 'Santa Clara', 'city' => 'Pila', 'barangay_code' => '043424015'],
        ]);

        Sanctum::actingAs($buyer);
        $this->post("/api/v1/buyer/orders/{$order->id}/request-return",
            ['reason' => $reason, 'description' => 'The basket arrived with a broken rim.', 'photos' => [$this->png('a.png')]],
            ['Accept' => 'application/json'])->assertOk();
        if ($reason !== \App\Models\Dispute::REASON_NOT_RECEIVED) {
            Sanctum::actingAs($seller);
            $this->postJson("/api/v1/seller/orders/{$order->id}/respond-return", ['action' => 'approve', 'return_item' => $returnItem])->assertOk();
        }

        return [$order->fresh(), $buyer, $seller];
    }

    private function png(string $name = 'item.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    }

    public function test_an_approved_return_books_a_pickup_for_the_hub_that_delivered_it(): void
    {
        [$order, $buyer] = $this->approvedReturn();

        $pickup = ReturnPickup::where('order_id', $order->id)->firstOrFail();
        $this->assertSame(ReturnPickup::STATUS_REQUESTED, $pickup->status);
        $this->assertSame($this->hub->id, $pickup->sorting_center_id);
        $this->assertSame('Ana Buyer', $pickup->buyer_snapshot['name']);
        $this->assertSame('Maria Clara Handicrafts', $pickup->shop_snapshot['shop_name']);
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'return.pickup_booked')->count());
        $this->assertSame(1, $this->hubUser->notifications()->where('data->kind', 'hub.return_pickup')->count());

        Sanctum::actingAs($buyer);
        $this->getJson("/api/v1/buyer/orders/{$order->id}")->assertOk()->assertJsonPath('data.return_pickup.status', 'requested');
        Sanctum::actingAs($this->hubUser->fresh());
        $this->getJson('/api/v1/hub/return-pickups')->assertOk()->assertJsonPath('meta.waiting', 1)->assertJsonPath('data.0.buyer.name', 'Ana Buyer');
    }

    public function test_the_shop_can_let_the_buyer_keep_it_and_a_missing_parcel_has_nothing_to_collect(): void
    {
        [$kept] = $this->approvedReturn(false);
        $this->assertFalse(ReturnPickup::where('order_id', $kept->id)->exists());

        [$missing] = $this->approvedReturn(true, \App\Models\Dispute::REASON_NOT_RECEIVED);
        $this->assertFalse(ReturnPickup::where('order_id', $missing->id)->exists());
    }

    public function test_rider_collects_with_a_photo_hands_it_to_the_shop_and_the_shop_confirms(): void
    {
        [$order, $buyer, $seller] = $this->approvedReturn();
        $pickup = ReturnPickup::where('order_id', $order->id)->firstOrFail();
        $rider = $this->rider();

        Sanctum::actingAs($this->hubUser->fresh());
        $this->postJson("/api/v1/hub/return-pickups/{$pickup->id}/assign", ['rider_id' => $rider->id])->assertOk()
            ->assertJsonPath('data.status', 'assigned');
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'return.pickup_assigned')->count());

        Sanctum::actingAs($rider->user->fresh());
        $this->getJson('/api/v1/rider/return-pickups')->assertOk()->assertJsonPath('meta.open', 1)->assertJsonPath('data.0.buyer.phone', '09998887777');
        // Not before it is collected.
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/delivered")->assertStatus(422);
        $this->post("/api/v1/rider/return-pickups/{$pickup->id}/collected", [], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post("/api/v1/rider/return-pickups/{$pickup->id}/collected", ['photo' => $this->png()], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.status', 'collected');
        $this->assertNotNull($pickup->fresh()->collect_photo_path);
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/delivered")->assertOk()->assertJsonPath('data.status', 'delivered');

        // The buyer and the shop can see the photo; a stranger cannot.
        Sanctum::actingAs($buyer);
        $this->get("/api/v1/return-pickups/{$pickup->id}/photo")->assertOk();
        Sanctum::actingAs($this->user('stranger'));
        $this->get("/api/v1/return-pickups/{$pickup->id}/photo")->assertNotFound();

        Sanctum::actingAs($seller);
        $this->getJson("/api/v1/seller/orders/{$order->id}")->assertOk()->assertJsonPath('data.return_pickup.status', 'delivered');
        $this->postJson("/api/v1/seller/orders/{$order->id}/return-pickup/received")->assertOk()->assertJsonPath('data.status', 'received');
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'return.pickup_received')->count());

        // Every step is on the order's timeline and the hub's activity log.
        Sanctum::actingAs($this->hubUser->fresh());
        $titles = array_column($this->getJson('/api/v1/hub/activity?category=returns')->assertOk()->json('data'), 'title');
        foreach (['Return pickup booked', 'Return pickup given to a rider', 'Returned item collected from the buyer', 'Returned item back with the shop'] as $title) {
            $this->assertContains($title, $titles);
        }
    }

    public function test_three_failed_visits_cancel_the_pickup(): void
    {
        [$order, $buyer, $seller] = $this->approvedReturn();
        $pickup = ReturnPickup::where('order_id', $order->id)->firstOrFail();
        $rider = $this->rider();
        Sanctum::actingAs($this->ops->fresh());
        $this->getJson('/api/v1/logistics/return-pickups')->assertOk()->assertJsonPath('meta.waiting', 1);
        $this->postJson("/api/v1/logistics/return-pickups/{$pickup->id}/assign", ['rider_id' => $rider->id])->assertOk();

        Sanctum::actingAs($rider->user->fresh());
        for ($i = 1; $i <= 2; $i++) {
            $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/failed", ['reason' => 'Nobody was home.'])->assertOk()
                ->assertJsonPath('data.status', 'assigned')->assertJsonPath('data.attempts', $i);
        }
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/failed", ['reason' => 'Nobody was home.'])->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(1, $seller->notifications()->where('data->kind', 'return.pickup_cancelled')->count());
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'return.pickup_failed')->where('data->title', 'Return pickup cancelled')->count());
    }

    public function test_truck_drivers_other_riders_and_other_hubs_cannot_touch_it(): void
    {
        [$order] = $this->approvedReturn();
        $pickup = ReturnPickup::where('order_id', $order->id)->firstOrFail();
        $truck = $this->rider(Rider::DUTY_TRUCK);
        $rider = $this->rider();
        $other = $this->rider();

        Sanctum::actingAs($this->hubUser->fresh());
        $this->postJson("/api/v1/hub/return-pickups/{$pickup->id}/assign", ['rider_id' => $truck->id])->assertStatus(422);
        $this->postJson("/api/v1/hub/return-pickups/{$pickup->id}/assign", ['rider_id' => $rider->id])->assertOk();

        Sanctum::actingAs($other->user->fresh());
        $this->postJson("/api/v1/rider/return-pickups/{$pickup->id}/failed", ['reason' => 'Nobody was home.'])->assertNotFound();

        $elsewhere = SortingCenter::forceCreate([
            'user_id' => ($otherHubUser = $this->user('otherhub'))->id, 'hub_name' => 'Far Hub ' . uniqid(), 'address_province' => 'Laguna',
            'address_city' => 'Bay', 'address_barangay' => 'X', 'address_street' => '1', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['0434099999'], 'logistics_company_id' => $this->company->id,
        ]);
        $this->assertNotNull($elsewhere);
        Sanctum::actingAs($otherHubUser->fresh());
        $this->getJson('/api/v1/hub/return-pickups')->assertOk()->assertJsonPath('meta.waiting', 0);
        $this->postJson("/api/v1/hub/return-pickups/{$pickup->id}/assign", ['rider_id' => $rider->id])->assertNotFound();
    }
}
