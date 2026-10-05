<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderLifecycleBridgeTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $seller;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buyer = User::forceCreate([
            'first_name' => 'Bridge',
            'last_name'  => 'Buyer',
            'email'      => 'bridge.buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->seller = User::forceCreate([
            'first_name' => 'Bridge',
            'last_name'  => 'Seller',
            'email'      => 'bridge.seller.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

        SellerProfile::create([
            'user_id'                    => $this->seller->id,
            'shop_name'                  => 'Bridge Test Shop ' . uniqid(),
            'shop_category'              => 'Clothing',
            'date_of_birth'              => '1995-01-01',
            'government_id_type'         => 'national_id',
            'government_id_number'       => '1234-5678-9012',
            'government_id_number_hash'  => hash('sha256', '1234-5678-9012-' . uniqid()),
            'government_id_image_path'   => 'uploads/test_id.jpg',
            'payout_gcash_number'        => '09171234567',
            'application_status'         => 'approved',
            'address_province'           => 'Metro Manila',
            'address_city'               => 'Manila',
            'address_barangay'           => 'Barangay 659',
            'address_street'             => '123 Seller St',
            'shop_contact_number'        => '09171234567',
        ]);

        $this->admin = User::forceCreate([
            'first_name' => 'Bridge',
            'last_name'  => 'Admin',
            'email'      => 'bridge.admin.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'admin',
            'status'     => 'active',
        ]);
    }

    private function createOrder(OrderStatus $status = OrderStatus::PLACED, string $paymentMethod = 'cod', string $paymentStatus = 'pending'): Order
    {
        $order = Order::create([
            'buyer_id'          => $this->buyer->id,
            'order_number'      => 'ORD-' . substr(uniqid(), -10),
            'subtotal'          => 1000.00,
            'shipping_fee'      => 80.00,
            'total'             => 1080.00,
            'payment_method'    => $paymentMethod,
            'payment_status'    => $paymentStatus,
            'status'            => $status,
            'shipping_name'     => 'Buyer Name',
            'shipping_phone'    => '09171234567',
            'shipping_address'  => '123 Test St',
            'shipping_province' => 'Metro Manila',
            'shipping_city'     => 'Manila',
            'shipping_barangay' => 'Barangay 1',
        ]);

        OrderItem::create([
            'order_id'          => $order->id,
            'seller_id'         => $this->seller->id,
            'product_name'      => 'Test Premium Dress',
            'variant_label'     => 'Blue / L',
            'unit_price'        => 1000.00,
            'quantity'          => 1,
            'subtotal'          => 1000.00,
            'commission_rate'   => 0.10,
            'commission_amount' => 100.00,
            'seller_earnings'   => 900.00,
            'payout_status'     => 'pending_release',
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method'   => $paymentMethod,
            'amount'   => 1080.00,
            'status'   => $paymentStatus === 'paid' ? 'paid' : 'pending',
        ]);

        return $order;
    }

    public function test_buyer_request_return_transitions_to_disputed_on_string_column(): void
    {
        Sanctum::actingAs($this->buyer);

        $order = $this->createOrder(OrderStatus::DELIVERED, 'cod', 'paid');

        $response = $this->postJson("/api/v1/buyer/orders/{$order->id}/request-return", [
            'reason'      => 'Defective item',
            'description' => 'The zipper was broken upon arrival.',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'DISPUTED');
        $this->assertEquals(OrderStatus::DISPUTED, $order->fresh()->status);

        $dispute = Dispute::where('order_id', $order->id)->first();
        $this->assertNotNull($dispute);
        $this->assertEquals('Defective item', $dispute->reason);
        $this->assertEquals('open', $dispute->status);

        // Verify status history
        $this->assertDatabaseHas('order_status_histories', [
            'order_id'    => $order->id,
            'from_status' => 'DELIVERED',
            'to_status'   => 'DISPUTED',
            'actor_type'  => 'buyer',
            'actor_id'    => $this->buyer->id,
        ]);
    }

    public function test_seller_lifecycle_confirm_prepare_and_ready_for_pickup(): void
    {
        Sanctum::actingAs($this->seller);

        $order = $this->createOrder(OrderStatus::PLACED, 'gcash', 'pending');

        // 1. Seller confirms payment -> CONFIRMED
        $confirmRes = $this->postJson("/api/v1/seller/orders/{$order->id}/confirm-payment");
        $confirmRes->assertStatus(200);
        $confirmRes->assertJsonPath('data.status', 'CONFIRMED');
        $this->assertEquals(OrderStatus::CONFIRMED, $order->fresh()->status);

        // 2. Seller starts preparing -> PREPARING
        $prepareRes = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'PREPARING',
        ]);
        $prepareRes->assertStatus(200);
        $prepareRes->assertJsonPath('data.status', 'PREPARING');
        $this->assertEquals(OrderStatus::PREPARING, $order->fresh()->status);

        // 3. Seller completes packaging -> READY_FOR_PICKUP
        $readyRes = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ]);
        $readyRes->assertStatus(200);
        $readyRes->assertJsonPath('data.status', 'READY_FOR_PICKUP');
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP, $order->fresh()->status);
    }

    public function test_seller_cannot_mark_shipped_out_for_delivery_or_delivered(): void
    {
        Sanctum::actingAs($this->seller);

        $order = $this->createOrder(OrderStatus::READY_FOR_PICKUP);

        // Seller attempts to mark delivered
        $res = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'DELIVERED',
        ]);
        $res->assertStatus(403);

        // Seller attempts to mark out_for_delivery
        $res2 = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'OUT_FOR_DELIVERY',
        ]);
        $res2->assertStatus(403);
    }

    public function test_seller_accept_return_transitions_disputed_to_returned(): void
    {
        Sanctum::actingAs($this->seller);

        $order = $this->createOrder(OrderStatus::DISPUTED);
        Dispute::create([
            'order_id'    => $order->id,
            'buyer_id'    => $this->buyer->id,
            'reason'      => 'Wrong size',
            'description' => 'Need a smaller size.',
            'status'      => 'open',
        ]);

        $response = $this->postJson("/api/v1/seller/orders/{$order->id}/respond-return", [
            'action' => 'accept',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'RETURNED');
        $this->assertEquals(OrderStatus::RETURNED, $order->fresh()->status);
        $this->assertEquals('resolved', Dispute::where('order_id', $order->id)->value('status'));
    }

    public function test_admin_update_status_routed_through_state_machine(): void
    {
        Sanctum::actingAs($this->admin);

        $order = $this->createOrder(OrderStatus::READY_FOR_PICKUP);

        // Admin advances to PICKED_UP
        $res = $this->patchJson("/api/v1/admin/orders/{$order->id}/status", [
            'status' => 'PICKED_UP',
            'note'   => 'Scanned by logistics coordinator',
        ]);
        $res->assertStatus(200);
        $res->assertJsonPath('data.status', 'PICKED_UP');
        $this->assertEquals(OrderStatus::PICKED_UP, $order->fresh()->status);

        // Admin invalid jump directly to DELIVERED is rejected
        $resInvalid = $this->patchJson("/api/v1/admin/orders/{$order->id}/status", [
            'status' => 'DELIVERED',
        ]);
        $resInvalid->assertStatus(422);
    }

    public function test_seller_earnings_and_reports_exclude_cancelled_and_returned(): void
    {
        Sanctum::actingAs($this->seller);

        $orderActive = $this->createOrder(OrderStatus::DELIVERED);
        $orderActive->items()->update(['payout_status' => 'available']);

        $orderCancelled = $this->createOrder(OrderStatus::CANCELLED);
        $orderReturned = $this->createOrder(OrderStatus::RETURNED);

        $earningsRes = $this->getJson('/api/v1/seller/earnings');
        $earningsRes->assertStatus(200);
        // Only active order's seller earnings (900.00) are counted
        $earningsRes->assertJsonPath('data.available_balance', 900);
        $earningsRes->assertJsonPath('data.lifetime_earnings', 900);

        $reportRes = $this->getJson('/api/v1/seller/reports/summary');
        $reportRes->assertStatus(200);
        $reportRes->assertJsonPath('data.total_orders', 1);
        $reportRes->assertJsonPath('data.delivered_orders', 1);
    }

    public function test_admin_payments_index_loads_with_seller_relation_and_items(): void
    {
        Sanctum::actingAs($this->admin);

        $order = $this->createOrder(OrderStatus::CONFIRMED, 'gcash', 'paid');

        $res = $this->getJson('/api/v1/admin/payments');
        $res->assertStatus(200);
        $res->assertJsonStructure([
            'data' => [
                '*' => [
                    'id',
                    'order_number',
                    'payment_method',
                    'payment_status',
                    'amount',
                    'order_status',
                    'seller' => ['id', 'name', 'shop_name'],
                    'items'  => [
                        '*' => ['id', 'product_name', 'quantity', 'price', 'subtotal'],
                    ],
                ],
            ],
            'meta',
            'stats' => ['total_volume', 'gcash_volume', 'cod_volume'],
        ]);
        $this->assertEquals($this->seller->id, $res->json('data.0.seller.id'));

        // Test filtering by method and search
        $searchRes = $this->getJson('/api/v1/admin/payments?method=gcash&search=Test');
        $searchRes->assertStatus(200);
        $this->assertCount(1, $searchRes->json('data'));
    }

    public function test_seller_confirms_cod_order_successfully(): void
    {
        Sanctum::actingAs($this->seller);

        $order = $this->createOrder(OrderStatus::PLACED, 'cod', 'pending');

        $res = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'CONFIRMED',
        ]);

        $res->assertStatus(200);
        $res->assertJsonPath('data.status', 'CONFIRMED');

        $orderFresh = $order->fresh();
        $this->assertEquals(OrderStatus::CONFIRMED, $orderFresh->status);
        $this->assertEquals('pending', $orderFresh->payment_status);

        $this->assertDatabaseHas('order_status_histories', [
            'order_id'    => $order->id,
            'from_status' => OrderStatus::PLACED->value,
            'to_status'   => OrderStatus::CONFIRMED->value,
            'actor_type'  => 'seller',
            'actor_id'    => $this->seller->id,
        ]);
    }

    public function test_seller_cannot_confirm_gcash_order_without_verified_payment(): void
    {
        Sanctum::actingAs($this->seller);

        $order = $this->createOrder(OrderStatus::PLACED, 'gcash', 'pending');

        $res = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'CONFIRMED',
        ]);

        $res->assertStatus(422);
        $this->assertEquals(OrderStatus::PLACED, $order->fresh()->status);
        $this->assertEquals('pending', $order->fresh()->payment_status);
    }

    public function test_seller_confirms_gcash_order_via_confirm_payment_endpoint(): void
    {
        Sanctum::actingAs($this->seller);

        $order = $this->createOrder(OrderStatus::PLACED, 'gcash', 'pending');

        $res = $this->postJson("/api/v1/seller/orders/{$order->id}/confirm-payment");

        $res->assertStatus(200);
        $res->assertJsonPath('data.status', 'CONFIRMED');

        $orderFresh = $order->fresh();
        $this->assertEquals(OrderStatus::CONFIRMED, $orderFresh->status);
        $this->assertEquals('paid', $orderFresh->payment_status);

        $this->assertDatabaseHas('order_status_histories', [
            'order_id'    => $order->id,
            'from_status' => OrderStatus::PLACED->value,
            'to_status'   => OrderStatus::CONFIRMED->value,
            'actor_type'  => 'seller',
            'actor_id'    => $this->seller->id,
        ]);
    }
}

