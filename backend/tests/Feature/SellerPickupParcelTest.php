<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SellerPickupParcelTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $seller;
    private User $otherSeller;
    private User $admin;
    private Category $category;
    private OrderStateMachine $stateMachine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->stateMachine = app(OrderStateMachine::class);

        $this->buyer = User::forceCreate([
            'first_name' => 'Buyer',
            'last_name'  => 'User',
            'email'      => 'buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->seller = User::forceCreate([
            'first_name' => 'Seller',
            'last_name'  => 'One',
            'email'      => 'seller1.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

        SellerProfile::create([
            'user_id'                    => $this->seller->id,
            'shop_name'                  => 'Main Shop ' . uniqid(),
            'shop_category'              => 'Fashion',
            'date_of_birth'              => '1990-01-01',
            'government_id_type'         => 'national_id',
            'government_id_number'       => '1111-2222-3333',
            'government_id_number_hash'  => hash('sha256', '1111-2222-3333-' . uniqid()),
            'government_id_image_path'   => 'uploads/id1.jpg',
            'payout_gcash_number'        => '09171111111',
            'application_status'         => 'approved',
            'address_province'           => 'Metro Manila',
            'address_city'               => 'Makati City',
            'address_barangay'           => 'Poblacion',
            'address_street'             => '456 Burgos St',
            'address_province_code'      => '130000000',
            'address_city_code'          => '137602000',
            'address_barangay_code'      => '137602015',
            'shop_contact_number'        => '09171112222',
        ]);

        $this->otherSeller = User::forceCreate([
            'first_name' => 'Seller',
            'last_name'  => 'Two',
            'email'      => 'seller2.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

        SellerProfile::create([
            'user_id'                    => $this->otherSeller->id,
            'shop_name'                  => 'Other Shop ' . uniqid(),
            'shop_category'              => 'Electronics',
            'date_of_birth'              => '1991-01-01',
            'government_id_type'         => 'national_id',
            'government_id_number'       => '4444-5555-6666',
            'government_id_number_hash'  => hash('sha256', '4444-5555-6666-' . uniqid()),
            'government_id_image_path'   => 'uploads/id2.jpg',
            'payout_gcash_number'        => '09172223333',
            'application_status'         => 'approved',
            'address_province'           => 'Metro Manila',
            'address_city'               => 'Taguig',
            'address_barangay'           => 'Fort Bonifacio',
            'address_street'             => '789 High St',
            'address_province_code'      => '130000000',
            'address_city_code'          => '137607000',
            'address_barangay_code'      => '137607005',
            'shop_contact_number'        => '09173334444',
        ]);

        $this->admin = User::forceCreate([
            'first_name' => 'Admin',
            'last_name'  => 'User',
            'email'      => 'admin.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'admin',
            'status'     => 'active',
        ]);

        $this->category = Category::create([
            'name'            => 'Test Category ' . uniqid(),
            'slug'            => 'cat-' . uniqid(),
            'is_active'       => true,
            'commission_rate' => 0.10,
        ]);
    }

    private function createOrder(string $paymentMethod = 'cod', OrderStatus $status = OrderStatus::PREPARING, array $shippingOverrides = []): Order
    {
        $order = Order::create(array_merge([
            'buyer_id'          => $this->buyer->id,
            'order_number'      => 'VEL-TEST-' . substr(uniqid(), -8),
            'subtotal'          => 500.00,
            'shipping_fee'      => 50.00,
            'total'             => 550.00,
            'payment_method'    => $paymentMethod,
            'payment_status'    => $paymentMethod === 'gcash' ? 'paid' : 'pending',
            'status'            => $status,
            'shipping_name'     => 'Maria Santos',
            'shipping_phone'    => '09187654321',
            'shipping_address'  => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            'shipping_barangay_code' => '137404001',
        ], $shippingOverrides));

        OrderItem::create([
            'order_id'          => $order->id,
            'seller_id'         => $this->seller->id,
            'product_name'      => 'Floral Summer Dress',
            'variant_label'     => 'Medium / Red',
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

    public function test_transition_to_ready_for_pickup_creates_parcel_with_tracking_number_and_snapshots(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(paymentMethod: 'cod', status: OrderStatus::PREPARING);

        $response = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ]);

        $response->assertStatus(200);

        // Verify Parcel in DB
        $parcel = Parcel::where('order_id', $order->id)->first();
        $this->assertNotNull($parcel);
        $this->assertStringStartsWith('LIT-', $parcel->tracking_number);
        $this->assertEquals(OrderStatus::READY_FOR_PICKUP->value, $parcel->status);
        $this->assertEquals($this->seller->id, $parcel->seller_id);
        $this->assertEquals('Poblacion', $parcel->pickup_barangay);
        $this->assertEquals('Batasan Hills', $parcel->destination_barangay);
        $this->assertEquals(550.00, (float) $parcel->cod_amount);
        $this->assertNotNull($parcel->ready_at);

        // Check snapshots
        $pickupSnap = $parcel->pickup_address_snapshot;
        $this->assertEquals('456 Burgos St', $pickupSnap['street']);
        $this->assertEquals('Poblacion', $pickupSnap['barangay']);
        $this->assertEquals('09171112222', $pickupSnap['contact_phone']);

        $recipientSnap = $parcel->recipient_snapshot;
        $this->assertEquals('Maria Santos', $recipientSnap['name']);
        $this->assertEquals('09187654321', $recipientSnap['phone']);
        $this->assertEquals('Batasan Hills', $recipientSnap['barangay']);

        // Check response includes tracking number
        $this->assertEquals($parcel->tracking_number, $response->json('data.tracking_number'));
    }

    public function test_gcash_order_creates_parcel_with_null_cod_amount(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(paymentMethod: 'gcash', status: OrderStatus::PREPARING);

        $response = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ]);

        $response->assertStatus(200);

        $parcel = Parcel::where('order_id', $order->id)->first();
        $this->assertNotNull($parcel);
        $this->assertNull($parcel->cod_amount);
    }

    public function test_missing_seller_pickup_barangay_aborts_transition_and_rolls_back(): void
    {
        // Clear seller's pickup barangay
        $this->seller->sellerProfile->update(['address_barangay' => '']);

        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING);

        $response = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ]);

        $response->assertStatus(422);

        // Order remains in PREPARING
        $this->assertEquals(OrderStatus::PREPARING, $order->fresh()->status);
        $this->assertNull(Parcel::where('order_id', $order->id)->first());
    }

    public function test_missing_order_destination_barangay_aborts_transition(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING, shippingOverrides: [
            'shipping_barangay' => '',
        ]);

        $response = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ]);

        $response->assertStatus(422);
        $this->assertEquals(OrderStatus::PREPARING, $order->fresh()->status);
        $this->assertNull(Parcel::where('order_id', $order->id)->first());
    }

    public function test_parcel_creation_is_idempotent(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING);

        $res1 = $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ]);
        $res1->assertStatus(200);

        $parcelCount = Parcel::where('order_id', $order->id)->count();
        $this->assertEquals(1, $parcelCount);

        // Transition through stateMachine directly again to verify idempotency
        $order = $order->fresh();
        $parcel = $order->parcel;
        $this->stateMachine->transition($order, OrderStatus::PICKED_UP, 'rider', null);
        $this->assertEquals(1, Parcel::where('order_id', $order->id)->count());
        $this->assertEquals(Parcel::STATUS_PICKED_UP, $parcel->fresh()->status);
    }

    public function test_order_transitions_sync_parcel_status(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING);

        $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ])->assertStatus(200);

        $parcel = Parcel::where('order_id', $order->id)->first();
        $this->assertEquals(Parcel::STATUS_READY_FOR_PICKUP, $parcel->status);

        // Transition through logistics steps via admin
        Sanctum::actingAs($this->admin);

        $steps = [
            'PICKED_UP'         => Parcel::STATUS_PICKED_UP,
            'AT_SORTING_CENTER' => Parcel::STATUS_AT_SORTING_CENTER,
            'SORTED'            => Parcel::STATUS_SORTED,
            'ASSIGNED_TO_RIDER' => Parcel::STATUS_ASSIGNED_TO_RIDER,
            'OUT_FOR_DELIVERY'  => Parcel::STATUS_OUT_FOR_DELIVERY,
            'DELIVERED'         => Parcel::STATUS_DELIVERED,
        ];

        foreach ($steps as $orderStatus => $expectedParcelStatus) {
            $this->patchJson("/api/v1/admin/orders/{$order->id}/status", [
                'status' => $orderStatus,
            ])->assertStatus(200);

            $this->assertEquals($expectedParcelStatus, $parcel->fresh()->status);
        }
    }

    public function test_waybill_endpoint_returns_409_before_ready_for_pickup(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING);

        $response = $this->getJson("/api/v1/seller/orders/{$order->id}/waybill");
        $response->assertStatus(409)
            ->assertJsonStructure(['message']);
    }

    public function test_waybill_endpoint_returns_403_for_unauthorized_seller(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING);

        $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ])->assertStatus(200);

        // Other seller attempts to view waybill
        Sanctum::actingAs($this->otherSeller);
        $response = $this->getJson("/api/v1/seller/orders/{$order->id}/waybill");
        $response->assertStatus(403);
    }

    public function test_waybill_endpoint_returns_full_data_for_seller_and_admin(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(paymentMethod: 'cod', status: OrderStatus::PREPARING);

        $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ])->assertStatus(200);

        // 1. Seller access
        $sellerRes = $this->getJson("/api/v1/seller/orders/{$order->id}/waybill");
        $sellerRes->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'order' => ['id', 'order_number', 'created_at', 'payment_method', 'total'],
                    'parcel' => ['id', 'tracking_number', 'status', 'ready_at', 'pickup_barangay', 'destination_barangay', 'cod_amount'],
                    'sender' => ['shop_name', 'contact_phone', 'street', 'barangay', 'city', 'province', 'full_address'],
                    'recipient' => ['name', 'phone', 'street', 'barangay', 'city', 'province', 'full_address'],
                    'items' => [
                        ['id', 'product_name', 'variant_label', 'quantity', 'unit_price', 'subtotal'],
                    ],
                    'cod' => ['is_cod', 'amount'],
                    'barcode' => ['format', 'value'],
                ],
            ]);

        $this->assertTrue($sellerRes->json('data.cod.is_cod'));
        $this->assertEquals(550.00, $sellerRes->json('data.cod.amount'));
        $this->assertEquals('CODE128', $sellerRes->json('data.barcode.format'));
        $this->assertNotEmpty($sellerRes->json('data.barcode.value'));

        // 2. Admin access
        Sanctum::actingAs($this->admin);
        $adminRes = $this->getJson("/api/v1/seller/orders/{$order->id}/waybill");
        $adminRes->assertStatus(200);
        $this->assertEquals($order->order_number, $adminRes->json('data.order.order_number'));
    }

    public function test_tracking_number_is_exposed_on_buyer_seller_and_admin_order_views(): void
    {
        Sanctum::actingAs($this->seller);
        $order = $this->createOrder(status: OrderStatus::PREPARING);

        $this->patchJson("/api/v1/seller/orders/{$order->id}/status", [
            'status' => 'READY_FOR_PICKUP',
        ])->assertStatus(200);

        $trackingNumber = Parcel::where('order_id', $order->id)->value('tracking_number');

        // Seller view
        $sellerOrderRes = $this->getJson("/api/v1/seller/orders/{$order->id}");
        $sellerOrderRes->assertStatus(200);
        $this->assertEquals($trackingNumber, $sellerOrderRes->json('data.tracking_number'));

        // Buyer view
        Sanctum::actingAs($this->buyer);
        $buyerOrderRes = $this->getJson("/api/v1/buyer/orders/{$order->id}");
        $buyerOrderRes->assertStatus(200);
        $this->assertEquals($trackingNumber, $buyerOrderRes->json('data.tracking_number'));

        // Admin view
        Sanctum::actingAs($this->admin);
        $adminOrderRes = $this->getJson("/api/v1/admin/orders/{$order->id}");
        $adminOrderRes->assertStatus(200);
        $this->assertEquals($trackingNumber, $adminOrderRes->json('data.tracking_number'));
    }

    public function test_two_shop_order_creates_two_orders_and_each_seller_confirms_cod_and_generates_waybill(): void
    {
        // 1. Setup products for Seller 1 and Seller 2
        $productA = Product::create([
            'seller_id'   => $this->seller->id,
            'category_id' => $this->category->id,
            'name'        => 'Item from Seller 1',
            'base_price'  => 300.00,
            'status'      => 'active',
        ]);
        $variantA = ProductVariant::create([
            'product_id'     => $productA->id,
            'label'          => 'Default',
            'sku'            => 'SKU-A-' . uniqid(),
            'price'          => 300.00,
            'stock_quantity' => 10,
        ]);

        $productB = Product::create([
            'seller_id'   => $this->otherSeller->id,
            'category_id' => $this->category->id,
            'name'        => 'Item from Seller 2',
            'base_price'  => 400.00,
            'status'      => 'active',
        ]);
        $variantB = ProductVariant::create([
            'product_id'     => $productB->id,
            'label'          => 'Default',
            'sku'            => 'SKU-B-' . uniqid(),
            'price'          => 400.00,
            'stock_quantity' => 10,
        ]);

        // 2. Buyer places a 2-shop COD order
        Sanctum::actingAs($this->buyer);
        $checkoutPayload = [
            'payment_method'    => 'cod',
            'shipping_name'     => 'Maria Santos',
            'shipping_phone'    => '09187654321',
            'shipping_address'  => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            'shipping_barangay_code' => '137404001',
            'items' => [
                ['product_id' => $productA->id, 'variant_id' => $variantA->id, 'quantity' => 1],
                ['product_id' => $productB->id, 'variant_id' => $variantB->id, 'quantity' => 1],
            ],
        ];

        $checkoutRes = $this->postJson('/api/v1/checkout/place-order', $checkoutPayload);
        $checkoutRes->assertStatus(201);

        $createdOrders = $checkoutRes->json('orders');
        $this->assertCount(2, $createdOrders);

        $order1Id = $createdOrders[0]['id'];
        $order2Id = $createdOrders[1]['id'];
        $this->assertNotEquals($order1Id, $order2Id);

        // 3. Verify Seller 1 only sees Order 1, confirms COD, prepares, and marks ready for pickup
        Sanctum::actingAs($this->seller);
        $seller1OrdersRes = $this->getJson('/api/v1/seller/orders');
        $seller1OrdersRes->assertStatus(200);
        $seller1OrderIds = collect($seller1OrdersRes->json('data'))->pluck('id');
        $this->assertTrue($seller1OrderIds->contains($order1Id));
        $this->assertFalse($seller1OrderIds->contains($order2Id));

        // Confirm COD (PLACED -> CONFIRMED)
        $this->patchJson("/api/v1/seller/orders/{$order1Id}/status", ['status' => 'CONFIRMED'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'CONFIRMED');

        // Start Preparing (CONFIRMED -> PREPARING)
        $this->patchJson("/api/v1/seller/orders/{$order1Id}/status", ['status' => 'PREPARING'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'PREPARING');

        // Mark Ready for Pickup (PREPARING -> READY_FOR_PICKUP) -> Creates Parcel
        $readyRes1 = $this->patchJson("/api/v1/seller/orders/{$order1Id}/status", ['status' => 'READY_FOR_PICKUP'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'READY_FOR_PICKUP');

        $tracking1 = $readyRes1->json('data.tracking_number');
        $this->assertNotEmpty($tracking1);
        $this->assertStringStartsWith('LIT-', $tracking1);

        // Seller 1 fetches Waybill 1
        $waybill1Res = $this->getJson("/api/v1/seller/orders/{$order1Id}/waybill");
        $waybill1Res->assertStatus(200);
        $this->assertEquals($tracking1, $waybill1Res->json('data.parcel.tracking_number'));
        $this->assertEquals(350.00, $waybill1Res->json('data.cod.amount')); // 300 + 50 shipping

        // 4. Verify Seller 2 only sees Order 2, confirms COD, prepares, and marks ready for pickup
        Sanctum::actingAs($this->otherSeller);
        $seller2OrdersRes = $this->getJson('/api/v1/seller/orders');
        $seller2OrdersRes->assertStatus(200);
        $seller2OrderIds = collect($seller2OrdersRes->json('data'))->pluck('id');
        $this->assertTrue($seller2OrderIds->contains($order2Id));
        $this->assertFalse($seller2OrderIds->contains($order1Id));

        // Confirm COD (PLACED -> CONFIRMED)
        $this->patchJson("/api/v1/seller/orders/{$order2Id}/status", ['status' => 'CONFIRMED'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'CONFIRMED');

        // Start Preparing (CONFIRMED -> PREPARING)
        $this->patchJson("/api/v1/seller/orders/{$order2Id}/status", ['status' => 'PREPARING'])
            ->assertStatus(200);

        // Mark Ready for Pickup (PREPARING -> READY_FOR_PICKUP) -> Creates Parcel
        $readyRes2 = $this->patchJson("/api/v1/seller/orders/{$order2Id}/status", ['status' => 'READY_FOR_PICKUP'])
            ->assertStatus(200);

        $tracking2 = $readyRes2->json('data.tracking_number');
        $this->assertNotEmpty($tracking2);
        $this->assertNotEquals($tracking1, $tracking2);

        // Seller 2 fetches Waybill 2
        $waybill2Res = $this->getJson("/api/v1/seller/orders/{$order2Id}/waybill");
        $waybill2Res->assertStatus(200);
        $this->assertEquals($tracking2, $waybill2Res->json('data.parcel.tracking_number'));
        $this->assertEquals(450.00, $waybill2Res->json('data.cod.amount')); // 400 + 50 shipping

        // Seller 2 CANNOT access Seller 1's waybill
        $this->getJson("/api/v1/seller/orders/{$order1Id}/waybill")->assertStatus(403);
    }
}
