<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class OrderStateMachineTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $seller;
    private User $rider;
    private User $admin;
    private OrderStateMachine $stateMachine;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buyer = User::forceCreate([
            'first_name' => 'SM',
            'last_name'  => 'Buyer',
            'email'      => 'sm.buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->seller = User::forceCreate([
            'first_name' => 'SM',
            'last_name'  => 'Seller',
            'email'      => 'sm.seller.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

        \App\Models\SellerProfile::create([
            'user_id'                    => $this->seller->id,
            'shop_name'                  => 'SM Shop ' . uniqid(),
            'shop_category'              => 'Clothing',
            'date_of_birth'              => '1995-01-01',
            'government_id_type'         => 'national_id',
            'government_id_number'       => '1234-5678-9012',
            'government_id_number_hash'  => hash('sha256', '1234-5678-9012-' . uniqid()),
            'government_id_image_path'   => 'uploads/test.jpg',
            'payout_gcash_number'        => '09171234567',
            'application_status'         => 'approved',
            'address_province'           => 'Metro Manila',
            'address_city'               => 'Manila',
            'address_barangay'           => 'Barangay 659',
            'address_street'             => '123 Seller St',
            'shop_contact_number'        => '09171234567',
        ]);

        $this->rider = User::forceCreate([
            'first_name' => 'SM',
            'last_name'  => 'Rider',
            'email'      => 'sm.rider.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'rider',
            'status'     => 'active',
        ]);

        $this->admin = User::forceCreate([
            'first_name' => 'SM',
            'last_name'  => 'Admin',
            'email'      => 'sm.admin.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'admin',
            'status'     => 'active',
        ]);

        $this->stateMachine = new OrderStateMachine();
    }

    private function createTestOrder(OrderStatus $status = OrderStatus::PLACED): Order
    {
        $order = Order::create([
            'buyer_id'          => $this->buyer->id,
            'order_number'      => 'ORD-' . substr(uniqid(), -10),
            'subtotal'          => 500.00,
            'shipping_fee'      => 50.00,
            'total'             => 550.00,
            'payment_method'    => 'cod',
            'payment_status'    => 'pending',
            'status'            => $status,
            'shipping_name'     => 'Buyer Name',
            'shipping_phone'    => '09171234567',
            'shipping_address'  => '123 Buyer St',
            'shipping_province' => 'Metro Manila',
            'shipping_city'     => 'Manila',
            'shipping_barangay' => 'Barangay 1',
        ]);

        OrderItem::create([
            'order_id'          => $order->id,
            'seller_id'         => $this->seller->id,
            'product_name'      => 'Test Silk Blouse',
            'variant_label'     => 'Black / M',
            'unit_price'        => 500.00,
            'quantity'          => 1,
            'subtotal'          => 500.00,
            'commission_rate'   => 0.10,
            'commission_amount' => 50.00,
            'seller_earnings'   => 450.00,
            'payout_status'     => 'pending_release',
        ]);

        return $order;
    }

    public function test_full_forward_lifecycle_and_history_recording(): void
    {
        $order = $this->createTestOrder(OrderStatus::PLACED);

        // 1. PLACED -> CONFIRMED (seller)
        $order = $this->stateMachine->transition($order, OrderStatus::CONFIRMED, 'seller', $this->seller->id, 'Payment confirmed');
        $this->assertEquals(OrderStatus::CONFIRMED, $order->status);

        // 2. CONFIRMED -> PREPARING (seller)
        $order = $this->stateMachine->transition($order, OrderStatus::PREPARING, 'seller', $this->seller->id, 'Item packaging started');
        $this->assertEquals(OrderStatus::PREPARING, $order->status);

        // 3. PREPARING -> READY_FOR_PICKUP (seller)
        $order = $this->stateMachine->transition($order, OrderStatus::READY_FOR_PICKUP, 'seller', $this->seller->id, 'Ready at counter');
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP, $order->status);

        // 4. READY_FOR_PICKUP -> PICKED_UP (rider)
        $order = $this->stateMachine->transition($order, OrderStatus::PICKED_UP, 'rider', $this->rider->id, 'Picked up by courier');
        $this->assertEquals(OrderStatus::PICKED_UP, $order->status);

        // 5. PICKED_UP -> AT_SORTING_CENTER (hub)
        $order = $this->stateMachine->transition($order, OrderStatus::AT_SORTING_CENTER, 'hub', 1, 'Inbound scanned at hub');
        $this->assertEquals(OrderStatus::AT_SORTING_CENTER, $order->status);

        // 6. AT_SORTING_CENTER -> SORTED (hub)
        $order = $this->stateMachine->transition($order, OrderStatus::SORTED, 'hub', 1, 'Sorted to outbound route');
        $this->assertEquals(OrderStatus::SORTED, $order->status);

        // 7. SORTED -> ASSIGNED_TO_RIDER (hub)
        $order = $this->stateMachine->transition($order, OrderStatus::ASSIGNED_TO_RIDER, 'hub', 1, 'Assigned to delivery courier');
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $order->status);

        // 8. ASSIGNED_TO_RIDER -> OUT_FOR_DELIVERY (rider)
        $order = $this->stateMachine->transition($order, OrderStatus::OUT_FOR_DELIVERY, 'rider', $this->rider->id, 'Courier on the way');
        $this->assertEquals(OrderStatus::OUT_FOR_DELIVERY, $order->status);

        // 9. OUT_FOR_DELIVERY -> DELIVERED (rider)
        $item = $order->items->first();
        $this->assertEquals('pending_release', $item->payout_status);

        $order = $this->stateMachine->transition($order, OrderStatus::DELIVERED, 'rider', $this->rider->id, 'Delivered to recipient');
        $this->assertEquals(OrderStatus::DELIVERED, $order->status);

        // Escrow trigger assert: DELIVERED sets payout_status to available
        $item->refresh();
        $this->assertEquals('available', $item->payout_status);
        $this->assertNotNull($item->delivered_at);
        $this->assertEquals('450.00', (string) $item->seller_earnings);

        // 10. DELIVERED -> COMPLETED (buyer)
        $order = $this->stateMachine->transition($order, OrderStatus::COMPLETED, 'buyer', $this->buyer->id, 'Order received and accepted');
        $this->assertEquals(OrderStatus::COMPLETED, $order->status);

        // Assert all 10 history rows exist in order
        $this->assertCount(10, $order->statusHistories);
        $this->assertEquals('PLACED', $order->statusHistories[0]->from_status);
        $this->assertEquals('CONFIRMED', $order->statusHistories[0]->to_status);
        $this->assertEquals('seller', $order->statusHistories[0]->actor_type);

        $lastHistory = $order->statusHistories->last();
        $this->assertEquals('DELIVERED', $lastHistory->from_status);
        $this->assertEquals('COMPLETED', $lastHistory->to_status);
        $this->assertEquals('buyer', $lastHistory->actor_type);
    }

    public function test_invalid_transition_is_rejected(): void
    {
        $order = $this->createTestOrder(OrderStatus::PLACED);

        $this->expectException(HttpException::class);
        // Direct jump from PLACED to DELIVERED is illegal
        $this->stateMachine->transition($order, OrderStatus::DELIVERED, 'admin');
    }

    public function test_unauthorized_actor_is_forbidden(): void
    {
        $order = $this->createTestOrder(OrderStatus::PLACED);

        $this->expectException(HttpException::class);
        // Buyer cannot confirm payment (only seller, admin, system)
        $this->stateMachine->transition($order, OrderStatus::CONFIRMED, 'buyer', $this->buyer->id);
    }

    public function test_conflicting_transition_is_rejected(): void
    {
        $order = $this->createTestOrder(OrderStatus::PLACED);

        // Transition to CONFIRMED
        $this->stateMachine->transition($order, OrderStatus::CONFIRMED, 'seller', $this->seller->id);

        // Second transition attempting to confirm already confirmed order
        $this->expectException(HttpException::class);
        $this->stateMachine->transition($order, OrderStatus::CONFIRMED, 'seller', $this->seller->id);
    }

    public function test_cancellation_and_terminal_states(): void
    {
        $order = $this->createTestOrder(OrderStatus::PLACED);

        // Buyer cancels PLACED order
        $order = $this->stateMachine->transition($order, OrderStatus::CANCELLED, 'buyer', $this->buyer->id, 'Changed mind');
        $this->assertEquals(OrderStatus::CANCELLED, $order->status);

        // Terminal state CANCELLED cannot transition further
        $this->expectException(HttpException::class);
        $this->stateMachine->transition($order, OrderStatus::CONFIRMED, 'seller', $this->seller->id);
    }

    public function test_dispute_and_return_transitions(): void
    {
        $order = $this->createTestOrder(OrderStatus::DELIVERED);

        // Buyer opens return dispute
        $order = $this->stateMachine->transition($order, OrderStatus::DISPUTED, 'buyer', $this->buyer->id, 'Item damaged');
        $this->assertEquals(OrderStatus::DISPUTED, $order->status);

        // Seller accepts return -> RETURNED
        $order = $this->stateMachine->transition($order, OrderStatus::RETURNED, 'seller', $this->seller->id, 'Return accepted');
        $this->assertEquals(OrderStatus::RETURNED, $order->status);

        // Terminal state RETURNED cannot transition further
        $this->expectException(HttpException::class);
        $this->stateMachine->transition($order, OrderStatus::COMPLETED, 'admin', $this->admin->id);
    }

    public function test_delivery_failure_and_reschedule_flow(): void
    {
        $order = $this->createTestOrder(OrderStatus::OUT_FOR_DELIVERY);

        // Rider reports delivery failure
        $order = $this->stateMachine->transition($order, OrderStatus::DELIVERY_FAILED, 'rider', $this->rider->id, 'Customer unreachable');
        $this->assertEquals(OrderStatus::DELIVERY_FAILED, $order->status);

        // Hub reschedules: DELIVERY_FAILED -> ASSIGNED_TO_RIDER
        $order = $this->stateMachine->transition($order, OrderStatus::ASSIGNED_TO_RIDER, 'hub', 1, 'Rescheduled for attempt 2');
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $order->status);

        // Rider goes back out
        $order = $this->stateMachine->transition($order, OrderStatus::OUT_FOR_DELIVERY, 'rider', $this->rider->id);
        $this->assertEquals(OrderStatus::OUT_FOR_DELIVERY, $order->status);

        // Rider fails again
        $order = $this->stateMachine->transition($order, OrderStatus::DELIVERY_FAILED, 'rider', $this->rider->id, 'Customer refused delivery');
        $this->assertEquals(OrderStatus::DELIVERY_FAILED, $order->status);

        // Hub returns to sender: DELIVERY_FAILED -> RETURNED
        $order = $this->stateMachine->transition($order, OrderStatus::RETURNED, 'hub', 1, 'Max delivery attempts reached, RTS');
        $this->assertEquals(OrderStatus::RETURNED, $order->status);
    }
}
