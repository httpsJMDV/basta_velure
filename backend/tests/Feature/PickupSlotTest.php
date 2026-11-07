<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\Courier\Dispatcher;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The shop chooses when the rider comes: as soon as possible (as before), or a day and a window. A scheduled pickup
 * waits and is offered to riders from an hour before its window; the shop can change it until the rider has it.
 */
class PickupSlotTest extends TestCase
{
    use DatabaseTransactions;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->seller = User::forceCreate([
            'first_name' => 'Slot', 'last_name' => 'Seller', 'email' => 'slot.seller.' . uniqid() . '@example.com',
            'password' => Hash::make('Secret123!'), 'role' => 'seller', 'status' => 'active',
        ]);
        SellerProfile::create([
            'user_id' => $this->seller->id, 'shop_name' => 'Slot Shop ' . uniqid(), 'shop_category' => 'Clothing', 'date_of_birth' => '1995-01-01',
            'government_id_type' => 'national_id', 'government_id_number' => '1234-5678-9012',
            'government_id_number_hash' => hash('sha256', '1234-5678-9012-' . uniqid()), 'government_id_image_path' => 'uploads/test_id.jpg',
            'payout_gcash_number' => '09171234567', 'application_status' => 'approved', 'address_province' => 'Metro Manila',
            'address_city' => 'Manila', 'address_barangay' => 'Barangay 659', 'address_street' => '123 Seller St',
            'address_province_code' => '130000000', 'address_city_code' => '133900000', 'address_barangay_code' => '133901001',
            'shop_contact_number' => '09171234567',
        ]);
        Sanctum::actingAs($this->seller);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
    }

    private function preparingOrder(): Order
    {
        $buyer = User::forceCreate([
            'first_name' => 'Slot', 'last_name' => 'Buyer', 'email' => 'slot.buyer.' . uniqid() . '@example.com',
            'password' => Hash::make('Secret123!'), 'role' => 'buyer', 'status' => 'active',
        ]);
        $order = Order::create([
            'buyer_id' => $buyer->id, 'order_number' => 'ORD-' . substr(uniqid(), -10), 'subtotal' => 1000, 'shipping_fee' => 80, 'total' => 1080,
            'payment_method' => 'cod', 'payment_status' => 'pending', 'status' => OrderStatus::PREPARING, 'shipping_name' => 'Buyer Name',
            'shipping_phone' => '09171234567', 'shipping_address' => '123 Test St', 'shipping_province' => 'Metro Manila', 'shipping_city' => 'Manila',
            'shipping_barangay' => 'Barangay 1', 'shipping_province_code' => '130000000', 'shipping_city_code' => '133900000', 'shipping_barangay_code' => '133901002',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->seller->id, 'product_name' => 'Dress', 'variant_label' => 'Blue / L', 'unit_price' => 1000,
            'quantity' => 1, 'subtotal' => 1000, 'commission_rate' => 0.10, 'commission_amount' => 100, 'seller_earnings' => 900, 'payout_status' => 'pending_release',
        ]);

        return $order;
    }

    /** Freeze the clock at a Manila time today. */
    private function at(string $time): CarbonImmutable
    {
        $now = CarbonImmutable::parse('2026-11-09 ' . $time, 'Asia/Manila');
        CarbonImmutable::setTestNow($now);
        \Illuminate\Support\Carbon::setTestNow($now);

        return $now;
    }

    private function ready(Order $order, array $slot = [])
    {
        return $this->patchJson("/api/v1/seller/orders/{$order->id}/status", ['status' => 'READY_FOR_PICKUP'] + $slot);
    }

    public function test_without_a_time_the_pickup_is_offered_at_once_as_before(): void
    {
        $order = $this->preparingOrder();

        $this->ready($order)->assertOk()->assertJsonPath('data.pickup_slot', null);

        $this->assertNotSame(Parcel::DISPATCH_SCHEDULED, $order->parcel()->value('dispatch_state'));
    }

    public function test_a_later_window_waits_and_is_released_an_hour_before(): void
    {
        $this->at('10:00');
        $order = $this->preparingOrder();

        $this->ready($order, ['pickup_date' => '2026-11-09', 'pickup_window' => 'afternoon'])->assertOk()
            ->assertJsonPath('data.pickup_slot.window', 'afternoon')
            ->assertJsonPath('data.pickup_slot.label', 'Today, 1 – 5 PM');
        $parcel = $order->parcel()->firstOrFail();
        $this->assertSame(Parcel::DISPATCH_SCHEDULED, $parcel->dispatch_state);
        $this->assertTrue($order->statusHistories()->where('note', 'like', '%Today, 1 – 5 PM%')->exists());

        // Too early: it keeps waiting.
        $this->at('11:30');
        $this->assertSame(0, app(Dispatcher::class)->releaseScheduled());
        $this->assertSame(Parcel::DISPATCH_SCHEDULED, $parcel->fresh()->dispatch_state);

        // From 12:00 (an hour before 1 PM) it is offered like any pickup.
        $this->at('12:05');
        $this->assertSame(1, app(Dispatcher::class)->releaseScheduled());
        $this->assertNotSame(Parcel::DISPATCH_SCHEDULED, $parcel->fresh()->dispatch_state);
    }

    public function test_a_past_far_or_half_given_time_is_refused(): void
    {
        $this->at('15:00');
        $order = $this->preparingOrder();

        $this->ready($order, ['pickup_date' => '2026-11-09', 'pickup_window' => 'morning'])->assertStatus(422)->assertJsonValidationErrors('pickup_date');
        $this->ready($order, ['pickup_date' => '2026-11-20', 'pickup_window' => 'morning'])->assertStatus(422);
        $this->ready($order, ['pickup_date' => '2026-11-10'])->assertStatus(422);
        $this->ready($order, ['pickup_date' => '2026-11-10', 'pickup_window' => 'night'])->assertStatus(422);
        $this->assertSame(OrderStatus::PREPARING, $order->fresh()->status);

        $this->ready($order, ['pickup_date' => '2026-11-10', 'pickup_window' => 'morning'])->assertOk()
            ->assertJsonPath('data.pickup_slot.label', 'Tomorrow, 9 AM – 12 NN');
    }

    public function test_the_shop_changes_the_time_until_the_rider_has_it(): void
    {
        $this->at('08:00');
        $order = $this->preparingOrder();
        $this->ready($order, ['pickup_date' => '2026-11-10', 'pickup_window' => 'morning'])->assertOk();

        $this->patchJson("/api/v1/seller/orders/{$order->id}/pickup-slot", ['pickup_date' => '2026-11-11', 'pickup_window' => 'afternoon'])->assertOk()
            ->assertJsonPath('data.pickup_slot.date', '2026-11-11');
        $this->assertTrue($order->statusHistories()->where('note', 'like', '%changed the pickup time%')->exists());

        // Back to as soon as possible: no longer scheduled.
        $this->patchJson("/api/v1/seller/orders/{$order->id}/pickup-slot", [])->assertOk()->assertJsonPath('data.pickup_slot', null);
        $this->assertNotSame(Parcel::DISPATCH_SCHEDULED, $order->parcel()->value('dispatch_state'));

        $order->parcel()->update(['status' => Parcel::STATUS_PICKED_UP]);
        $this->patchJson("/api/v1/seller/orders/{$order->id}/pickup-slot", ['pickup_date' => '2026-11-11', 'pickup_window' => 'morning'])->assertStatus(409);
    }
}
