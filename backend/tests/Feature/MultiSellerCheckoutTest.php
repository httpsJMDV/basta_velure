<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiSellerCheckoutTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $sellerA;
    private User $sellerB;
    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buyer = User::forceCreate([
            'first_name' => 'Test',
            'last_name'  => 'Buyer',
            'email'      => 'buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
            'buyer_application_status' => 'approved',
        ]);

        $this->sellerA = User::forceCreate([
            'first_name' => 'Seller',
            'last_name'  => 'Alpha',
            'email'      => 'seller.a.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

        SellerProfile::create([
            'user_id'                    => $this->sellerA->id,
            'shop_name'                  => 'Alpha Shop ' . uniqid(),
            'shop_category'              => 'Clothing',
            'date_of_birth'              => '1990-01-01',
            'government_id_type'         => 'national_id',
            'government_id_number'       => '1111-2222-3333',
            'government_id_number_hash'  => hash('sha256', '1111-2222-3333-' . uniqid()),
            'government_id_image_path'   => 'uploads/id_a.jpg',
            'payout_gcash_number'        => '09171111111',
            'application_status'         => 'approved',
        ]);

        $this->sellerB = User::forceCreate([
            'first_name' => 'Seller',
            'last_name'  => 'Beta',
            'email'      => 'seller.b.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'seller',
            'status'     => 'active',
        ]);

        SellerProfile::create([
            'user_id'                    => $this->sellerB->id,
            'shop_name'                  => 'Beta Shop ' . uniqid(),
            'shop_category'              => 'Electronics',
            'date_of_birth'              => '1992-02-02',
            'government_id_type'         => 'national_id',
            'government_id_number'       => '4444-5555-6666',
            'government_id_number_hash'  => hash('sha256', '4444-5555-6666-' . uniqid()),
            'government_id_image_path'   => 'uploads/id_b.jpg',
            'payout_gcash_number'        => '09172222222',
            'application_status'         => 'approved',
        ]);

        $this->category = Category::create([
            'name'            => 'Test Category ' . uniqid(),
            'slug'            => 'test-cat-' . uniqid(),
            'is_active'       => true,
            'commission_rate' => 0.10,
        ]);
    }

    private function createProductWithVariant(User $seller, float $price, int $stock): array
    {
        $product = Product::create([
            'seller_id'   => $seller->id,
            'category_id' => $this->category->id,
            'name'        => 'Product for ' . $seller->first_name . ' ' . uniqid(),
            'base_price'  => $price,
            'status'      => 'active',
        ]);

        $variant = ProductVariant::create([
            'product_id'     => $product->id,
            'label'          => 'Standard',
            'sku'            => 'SKU-' . uniqid(),
            'price'          => $price,
            'stock_quantity' => $stock,
        ]);

        return [$product, $variant];
    }

    public function test_gcash_checkout_needs_a_13_digit_reference_and_a_receipt(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');
        Sanctum::actingAs($this->buyer);
        [$product, $variant] = $this->createProductWithVariant($this->sellerA, 200.00, 10);
        // A real 1x1 PNG (the fake image() helper needs the GD extension).
        $receipt = fn () => \Illuminate\Http\UploadedFile::fake()->createWithContent('receipt.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
        $payload = fn (array $extra) => array_merge([
            'payment_method' => 'gcash', 'shipping_name' => 'Juan Dela Cruz', 'shipping_phone' => '09171234567', 'shipping_address' => '1 Sample St',
            'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => '137404001',
            'items' => [['product_id' => $product->id, 'variant_id' => $variant->id, 'quantity' => 1]],
        ], $extra);

        // GCash goes to the shop's own account, so the shop must have set one up.
        $this->post('/api/v1/checkout/place-order', $payload(['payment_reference' => '1234567890123', 'payment_proof' => $receipt()]), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['gcash']);
        $this->sellerA->sellerProfile->update(['gcash_number' => '09171112222', 'gcash_account_name' => 'Alpha Shop']);

        $this->post('/api/v1/checkout/place-order', $payload(['payment_reference' => '12345']), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['payment_reference', 'payment_proof']);
        $this->post('/api/v1/checkout/place-order', $payload(['payment_reference' => '12345678901234', 'payment_proof' => $receipt()]), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['payment_reference']);

        // Spaces as printed on the receipt are fine; the digits are stored.
        $res = $this->post('/api/v1/checkout/place-order', $payload(['payment_reference' => '1234 567 890123', 'payment_proof' => $receipt()]), ['Accept' => 'application/json'])
            ->assertCreated();
        $this->assertSame('1234567890123', Order::find($res->json('data.id'))->payment_reference);
    }

    public function test_multi_seller_checkout_creates_one_order_per_seller(): void
    {
        Sanctum::actingAs($this->buyer);

        [$productA, $variantA] = $this->createProductWithVariant($this->sellerA, 200.00, 10);
        [$productB, $variantB] = $this->createProductWithVariant($this->sellerB, 300.00, 5);

        $payload = [
            'payment_method'    => 'cod',
            'shipping_name'     => 'Juan Dela Cruz',
            'shipping_phone'    => '09171234567',
            'shipping_address'  => 'Block 1 Lot 2, Sample St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            'shipping_barangay_code' => '137404001',
            'items' => [
                [
                    'product_id' => $productA->id,
                    'variant_id' => $variantA->id,
                    'quantity'   => 2, // 400.00
                ],
                [
                    'product_id' => $productB->id,
                    'variant_id' => $variantB->id,
                    'quantity'   => 1, // 300.00
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/checkout/place-order', $payload);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'data' => ['id', 'order_number', 'status', 'total', 'checkout_group_id'],
                'orders' => [
                    ['id', 'order_number', 'status', 'total', 'checkout_group_id'],
                ],
                'checkout_group_id',
            ]);

        $orders = $response->json('orders');
        $this->assertCount(2, $orders);

        $checkoutGroupId = $response->json('checkout_group_id');
        $this->assertNotEmpty($checkoutGroupId);

        $orderA = Order::find($orders[0]['id']);
        $orderB = Order::find($orders[1]['id']);

        $this->assertEquals($checkoutGroupId, $orderA->checkout_group_id);
        $this->assertEquals($checkoutGroupId, $orderB->checkout_group_id);

        // Verify order numbers have suffixes
        $this->assertStringEndsWith('-1', $orderA->order_number);
        $this->assertStringEndsWith('-2', $orderB->order_number);

        // Verify Order A totals (subtotal 400 + 50 shipping = 450)
        $this->assertEquals(400.00, (float) $orderA->subtotal);
        $this->assertEquals(50.00, (float) $orderA->shipping_fee);
        $this->assertEquals(450.00, (float) $orderA->total);
        $this->assertCount(1, $orderA->items);
        $this->assertEquals($this->sellerA->id, $orderA->items->first()->seller_id);
        // The line remembers which product and variant it was (reviews need it).
        $this->assertEquals($productA->id, $orderA->items->first()->product_id);
        $this->assertEquals($variantA->id, $orderA->items->first()->product_variant_id);

        // Verify Order B totals (subtotal 300 + 50 shipping = 350)
        $this->assertEquals(300.00, (float) $orderB->subtotal);
        $this->assertEquals(50.00, (float) $orderB->shipping_fee);
        $this->assertEquals(350.00, (float) $orderB->total);
        $this->assertCount(1, $orderB->items);
        $this->assertEquals($this->sellerB->id, $orderB->items->first()->seller_id);

        // Verify stock decremented
        $this->assertEquals(8, $variantA->fresh()->stock_quantity);
        $this->assertEquals(4, $variantB->fresh()->stock_quantity);

        // Verify Order::seller() resolves correctly
        $this->assertEquals($this->sellerA->id, $orderA->seller->id);
        $this->assertEquals($this->sellerB->id, $orderB->seller->id);

        // Verify payments created
        $this->assertDatabaseHas('payments', ['order_id' => $orderA->id, 'amount' => 450.00]);
        $this->assertDatabaseHas('payments', ['order_id' => $orderB->id, 'amount' => 350.00]);
    }

    public function test_single_seller_checkout_is_unchanged_with_no_order_number_suffix(): void
    {
        Sanctum::actingAs($this->buyer);

        [$productA, $variantA] = $this->createProductWithVariant($this->sellerA, 250.00, 10);

        $payload = [
            'payment_method'    => 'cod',
            'shipping_name'     => 'Single Buyer',
            'shipping_phone'    => '09171234567',
            'shipping_address'  => '123 Single St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Manila',
            'shipping_barangay'      => 'Barangay 1',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '133900000',
            'shipping_barangay_code' => '133901001',
            'items' => [
                [
                    'product_id' => $productA->id,
                    'variant_id' => $variantA->id,
                    'quantity'   => 2, // 500.00
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/checkout/place-order', $payload);

        $response->assertStatus(201);
        $orders = $response->json('orders');
        $this->assertCount(1, $orders);

        $createdOrder = Order::find($orders[0]['id']);
        // No per-shop suffix: VEL-{key}-{timestamp}, not VEL-{key}-{timestamp}-1 (the key itself may contain digits).
        $this->assertMatchesRegularExpression('/^VEL-[A-Z0-9]+-\d+$/', $createdOrder->order_number);
        $this->assertEquals(500.00, (float) $createdOrder->subtotal);
        $this->assertEquals(50.00, (float) $createdOrder->shipping_fee);
        $this->assertEquals(550.00, (float) $createdOrder->total);
        $this->assertNotEmpty($createdOrder->checkout_group_id);
    }

    public function test_checkout_rolls_back_all_orders_and_stock_on_failure(): void
    {
        Sanctum::actingAs($this->buyer);

        [$productA, $variantA] = $this->createProductWithVariant($this->sellerA, 200.00, 10);
        [$productB, $variantB] = $this->createProductWithVariant($this->sellerB, 300.00, 2); // only 2 in stock

        $orderCountBefore = Order::count();

        $payload = [
            'payment_method'    => 'cod',
            'shipping_name'     => 'Juan Dela Cruz',
            'shipping_phone'    => '09171234567',
            'shipping_address'  => 'Block 1 Lot 2, Sample St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            'shipping_barangay_code' => '137404001',
            'items' => [
                [
                    'product_id' => $productA->id,
                    'variant_id' => $variantA->id,
                    'quantity'   => 2,
                ],
                [
                    'product_id' => $productB->id,
                    'variant_id' => $variantB->id,
                    'quantity'   => 5, // exceeds stock!
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/checkout/place-order', $payload);

        $response->assertStatus(422);

        // Verify no orders were created
        $this->assertEquals($orderCountBefore, Order::count());

        // Verify stock was not decremented
        $this->assertEquals(10, $variantA->fresh()->stock_quantity);
        $this->assertEquals(2, $variantB->fresh()->stock_quantity);
    }

    public function test_each_seller_sees_only_their_own_order_with_group_metadata(): void
    {
        Sanctum::actingAs($this->buyer);

        [$productA, $variantA] = $this->createProductWithVariant($this->sellerA, 150.00, 10);
        [$productB, $variantB] = $this->createProductWithVariant($this->sellerB, 250.00, 10);

        $payload = [
            'payment_method'    => 'cod',
            'shipping_name'     => 'Juan Dela Cruz',
            'shipping_phone'    => '09171234567',
            'shipping_address'  => 'Block 1 Lot 2, Sample St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            'shipping_barangay_code' => '137404001',
            'items' => [
                [
                    'product_id' => $productA->id,
                    'variant_id' => $variantA->id,
                    'quantity'   => 1, // 150 + 50 = 200
                ],
                [
                    'product_id' => $productB->id,
                    'variant_id' => $variantB->id,
                    'quantity'   => 1, // 250 + 50 = 300
                ],
            ],
        ];

        $res = $this->postJson('/api/v1/checkout/place-order', $payload);
        $res->assertStatus(201);
        $orderAId = $res->json('orders.0.id');
        $orderBId = $res->json('orders.1.id');

        // Check Seller A's view
        Sanctum::actingAs($this->sellerA);
        $sellerAResponse = $this->getJson('/api/v1/seller/orders');
        $sellerAResponse->assertStatus(200);

        $sellerAOrders = collect($sellerAResponse->json('data'));
        $this->assertTrue($sellerAOrders->contains('id', $orderAId));
        $this->assertFalse($sellerAOrders->contains('id', $orderBId));

        $orderAData = $sellerAOrders->firstWhere('id', $orderAId);
        $this->assertEquals(2, $orderAData['checkout_orders_count']);
        $this->assertEquals(500.00, (float) $orderAData['checkout_group_total']); // 200 + 300

        // Check Seller B's view
        Sanctum::actingAs($this->sellerB);
        $sellerBResponse = $this->getJson('/api/v1/seller/orders');
        $sellerBResponse->assertStatus(200);

        $sellerBOrders = collect($sellerBResponse->json('data'));
        $this->assertTrue($sellerBOrders->contains('id', $orderBId));
        $this->assertFalse($sellerBOrders->contains('id', $orderAId));

        $orderBData = $sellerBOrders->firstWhere('id', $orderBId);
        $this->assertEquals(2, $orderBData['checkout_orders_count']);
        $this->assertEquals(500.00, (float) $orderBData['checkout_group_total']);
    }
}
