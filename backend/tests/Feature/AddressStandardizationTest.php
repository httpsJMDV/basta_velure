<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Address;
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
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AddressStandardizationTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $seller;
    private OrderStateMachine $stateMachine;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('ids');

        $this->buyer = User::forceCreate([
            'first_name'    => 'Buyer',
            'last_name'     => 'Test',
            'email'         => 'buyer.' . uniqid() . '@example.com',
            'password'      => Hash::make('Secret123!'),
            'role'          => 'buyer',
            'status'        => 'active',
            'date_of_birth' => '1992-02-02',
        ]);

        $this->seller = User::forceCreate([
            'first_name'    => 'Seller',
            'last_name'     => 'Test',
            'email'         => 'seller.' . uniqid() . '@example.com',
            'password'      => Hash::make('Secret123!'),
            'role'          => 'seller',
            'status'        => 'active',
            'date_of_birth' => '1990-01-01',
        ]);

        $this->stateMachine = new OrderStateMachine();
    }

    private function createSellerProfile(User $user, array $overrides = []): SellerProfile
    {
        return SellerProfile::create(array_merge([
            'user_id'                   => $user->id,
            'shop_name'                 => 'Shop ' . uniqid(),
            'date_of_birth'             => '1990-01-01',
            'government_id_type'        => 'national_id',
            'government_id_number'      => '1234-5678-9012',
            'government_id_number_hash' => hash('sha256', '1234-5678-9012-' . uniqid()),
            'government_id_image_path'  => 'uploads/id.jpg',
            'payout_gcash_number'       => '09171234567',
            'application_status'        => 'approved',
            'address_province'          => 'Metro Manila',
            'address_city'              => 'Makati',
            'address_barangay'          => 'Poblacion',
            'address_street'            => '123 Test St',
            'shop_contact_number'       => '09171112222',
        ], $overrides));
    }

    public function test_new_seller_registration_requires_psgc_codes(): void
    {
        $applicant = User::forceCreate([
            'first_name'    => 'Applicant',
            'last_name'     => 'User',
            'email'         => 'applicant.' . uniqid() . '@example.com',
            'password'      => Hash::make('Secret123!'),
            'role'          => 'buyer',
            'status'        => 'active',
            'date_of_birth' => '1995-05-05',
        ]);

        Sanctum::actingAs($applicant);

        $payload = [
            'shop_name'             => 'Boutique ' . substr(uniqid(), -8),
            'shop_description'      => 'Selling authentic fashion',
            'shop_category'         => \App\Models\Category::whereNull('parent_id')->value('name') ?? \App\Models\Category::create(['slug' => 'fashion-' . uniqid(), 'name' => 'Fashion', 'is_active' => true])->name,
            'seller_type'           => 'individual',
            'tin'                   => implode('-', str_split((string) random_int(100000000000, 999999999999), 3)),
            'address_region'        => 'National Capital Region (NCR)',
            'address_region_code'   => '130000000',
            'address_street'        => '12 Ayala Ave.',
            'address_postal_code'   => '1226',
            'accept_terms'          => true,
            'government_id_type'    => 'national_id',
            'government_id_image'   => UploadedFile::fake()->create('id.jpg', 500, 'image/jpeg'),
            'selfie_with_id'        => UploadedFile::fake()->create('selfie.jpg', 500, 'image/jpeg'),
            'business_permit'       => UploadedFile::fake()->create('permit.pdf', 500, 'application/pdf'),
            'dti_sec_registration'  => UploadedFile::fake()->create('dti.pdf', 500, 'application/pdf'),
            'address_province'      => 'Metro Manila',
            'address_city'          => 'Makati City',
            'address_barangay'      => 'Poblacion',
            // Missing codes
        ];

        $response = $this->postJson('/api/v1/auth/apply-seller', $payload);
        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                'address_province_code',
                'address_city_code',
                'address_barangay_code',
            ]);

        // Submit with invalid format (e.g. not 9-10 digits)
        $payload['address_province_code'] = '13000';
        $payload['address_city_code']     = '137602000';
        $payload['address_barangay_code'] = '137602015';

        $responseInvalid = $this->postJson('/api/v1/auth/apply-seller', $payload);
        $responseInvalid->assertStatus(422)
            ->assertJsonValidationErrors(['address_province_code']);

        // Submit with valid PSGC codes
        $payload['address_province_code'] = '130000000';
        $responseValid = $this->postJson('/api/v1/auth/apply-seller', $payload);
        $responseValid->assertStatus(201);

        $profile = SellerProfile::where('user_id', $applicant->id)->first();
        $this->assertNotNull($profile);
        $this->assertEquals('130000000', $profile->address_province_code);
        $this->assertEquals('137602000', $profile->address_city_code);
        $this->assertEquals('137602015', $profile->address_barangay_code);
        $this->assertFalse($profile->address_needs_update);
    }

    public function test_seller_shop_profile_update_validates_and_stores_psgc_codes(): void
    {
        $profile = $this->createSellerProfile($this->seller, [
            'address_province'      => 'Metro Manila',
            'address_city'          => 'Makati',
            'address_barangay'      => 'Poblacion',
            'address_barangay_code' => null, // legacy
        ]);

        $this->assertTrue($profile->address_needs_update);

        Sanctum::actingAs($this->seller);

        // Updating address without codes returns 422
        $resFail = $this->postJson('/api/v1/seller/shop-profile', [
            'address_province' => 'Metro Manila',
            'address_city'     => 'Taguig',
            'address_barangay' => 'Fort Bonifacio',
        ]);
        $resFail->assertStatus(422)
            ->assertJsonValidationErrors([
                'address_province_code',
                'address_city_code',
                'address_barangay_code',
            ]);

        // Updating with valid codes succeeds and clears address_needs_update
        $resSuccess = $this->postJson('/api/v1/seller/shop-profile', [
            'address_province'      => 'Metro Manila',
            'address_city'          => 'Taguig',
            'address_barangay'      => 'Fort Bonifacio',
            'address_street'        => '5th Avenue',
            'address_province_code' => '130000000',
            'address_city_code'     => '137607000',
            'address_barangay_code' => '137607005',
        ]);

        $resSuccess->assertStatus(200)
            ->assertJsonPath('data.address_province_code', '130000000')
            ->assertJsonPath('data.address_city_code', '137607000')
            ->assertJsonPath('data.address_barangay_code', '137607005')
            ->assertJsonPath('data.address_needs_update', false);

        $this->assertFalse($profile->fresh()->address_needs_update);
    }

    public function test_buyer_address_crud_validates_and_stores_psgc_codes(): void
    {
        Sanctum::actingAs($this->buyer);

        // Store fails without codes
        $storeFail = $this->postJson('/api/v1/addresses', [
            'full_name'  => 'Juan Dela Cruz',
            'phone'      => '09171234567',
            'address'    => '123 Rizal St',
            'province'   => 'Cebu',
            'district'   => 'Cebu City',
            'ward'       => 'Guadalupe',
            'label'      => 'home',
        ]);
        $storeFail->assertStatus(422)
            ->assertJsonValidationErrors(['province_code', 'city_code', 'barangay_code']);

        // Store succeeds with valid codes
        $storeSuccess = $this->postJson('/api/v1/addresses', [
            'full_name'     => 'Juan Dela Cruz',
            'phone'         => '09171234567',
            'address'       => '123 Rizal St',
            'province'      => 'Cebu',
            'district'      => 'Cebu City',
            'ward'          => 'Guadalupe',
            'province_code' => '070220000',
            'city_code'     => '070221700',
            'barangay_code' => '0702217015',
            'label'         => 'home',
        ]);
        $storeSuccess->assertStatus(201)
            ->assertJsonPath('data.province_code', '070220000')
            ->assertJsonPath('data.city_code', '070221700')
            ->assertJsonPath('data.barangay_code', '0702217015')
            ->assertJsonPath('data.address_needs_update', false);

        $addressId = $storeSuccess->json('data.id');

        // Update address location without codes fails
        $updateFail = $this->patchJson("/api/v1/addresses/{$addressId}", [
            'province' => 'Metro Manila',
            'district' => 'Quezon City',
            'ward'     => 'Batasan Hills',
        ]);
        $updateFail->assertStatus(422)
            ->assertJsonValidationErrors(['province_code', 'city_code', 'barangay_code']);

        // Update with valid codes succeeds
        $updateSuccess = $this->patchJson("/api/v1/addresses/{$addressId}", [
            'province'      => 'Metro Manila',
            'district'      => 'Quezon City',
            'ward'          => 'Batasan Hills',
            'province_code' => '130000000',
            'city_code'     => '137404000',
            'barangay_code' => '137404001',
        ]);
        $updateSuccess->assertStatus(200)
            ->assertJsonPath('data.barangay_code', '137404001')
            ->assertJsonPath('data.address_needs_update', false);
    }

    public function test_legacy_address_has_address_needs_update_true(): void
    {
        $legacyAddress = Address::create([
            'user_id'       => $this->buyer->id,
            'full_name'     => 'Old User',
            'phone'         => '09170000000',
            'address'       => 'Old St',
            'province'      => 'Laguna',
            'district'      => 'Calamba',
            'ward'          => 'Real',
            'province_code' => null,
            'city_code'     => null,
            'barangay_code' => null,
            'label'         => 'home',
            'is_default'    => true,
        ]);

        $this->assertTrue($legacyAddress->address_needs_update);

        Sanctum::actingAs($this->buyer);
        $res = $this->getJson('/api/v1/addresses');
        $res->assertStatus(200)
            ->assertJsonPath('data.0.address_needs_update', true);
    }

    public function test_checkout_fails_with_actionable_error_when_shipping_barangay_code_is_missing(): void
    {
        $cat = Category::create(['name' => 'Fashion', 'slug' => 'fashion-' . uniqid(), 'is_active' => true]);
        $prod = Product::create([
            'seller_id'   => $this->seller->id,
            'category_id' => $cat->id,
            'name'        => 'Linen Shirt',
            'slug'        => 'linen-shirt-' . uniqid(),
            'base_price'  => 300.00,
            'status'      => 'active',
        ]);
        $variant = ProductVariant::create([
            'product_id'     => $prod->id,
            'label'          => 'Standard',
            'price'          => 300.00,
            'stock_quantity' => 10,
        ]);

        Sanctum::actingAs($this->buyer);

        $payload = [
            'payment_method'         => 'cod',
            'shipping_name'          => 'Buyer Name',
            'shipping_phone'         => '09171234567',
            'shipping_address'       => '123 Main St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Quezon City',
            'shipping_barangay'      => 'Batasan Hills',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137404000',
            // Missing shipping_barangay_code
            'items' => [
                ['product_id' => $prod->id, 'variant_id' => $variant->id, 'quantity' => 1],
            ],
        ];

        $res = $this->postJson('/api/v1/checkout/place-order', $payload);
        $res->assertStatus(422)
            ->assertJsonValidationErrors(['shipping_barangay_code'])
            ->assertJsonFragment([
                'shipping_barangay_code' => [
                    'Selected delivery address is missing a barangay PSGC code. Please re-select or update your delivery address to proceed with checkout.'
                ],
            ]);
    }

    public function test_leading_zero_psgc_code_round_trips_unchanged_across_all_entities(): void
    {
        $leadingZeroCode = '0403428001';

        // 1. Seller Profile
        $profile = $this->createSellerProfile($this->seller, [
            'shop_name'             => 'Laguna Crafts',
            'address_province'      => 'Laguna',
            'address_city'          => 'Calamba',
            'address_barangay'      => 'Real',
            'address_province_code' => '040340000',
            'address_city_code'     => '040342800',
            'address_barangay_code' => $leadingZeroCode,
        ]);

        $freshProfile = $profile->fresh();
        $this->assertSame($leadingZeroCode, $freshProfile->address_barangay_code);
        $this->assertFalse($freshProfile->address_needs_update);

        // 2. Address
        $address = Address::create([
            'user_id'       => $this->buyer->id,
            'full_name'     => 'Maria Santos',
            'phone'         => '09172223333',
            'address'       => 'Lot 10 Block 5',
            'province'      => 'Laguna',
            'district'      => 'Calamba',
            'ward'          => 'Real',
            'province_code' => '040340000',
            'city_code'     => '040342800',
            'barangay_code' => $leadingZeroCode,
            'label'         => 'home',
            'is_default'    => true,
        ]);

        $freshAddress = $address->fresh();
        $this->assertSame($leadingZeroCode, $freshAddress->barangay_code);
        $this->assertFalse($freshAddress->address_needs_update);

        // 3. Order
        $order = Order::create([
            'buyer_id'               => $this->buyer->id,
            'order_number'           => 'VEL-ZERO-TEST',
            'subtotal'               => 500.00,
            'shipping_fee'           => 99.00,
            'total'                  => 599.00,
            'payment_method'         => 'cod',
            'payment_status'         => 'pending',
            'status'                 => OrderStatus::PREPARING,
            'shipping_name'          => 'Maria Santos',
            'shipping_phone'         => '09172223333',
            'shipping_address'       => 'Lot 10 Block 5',
            'shipping_province'      => 'Laguna',
            'shipping_city'          => 'Calamba',
            'shipping_barangay'      => 'Real',
            'shipping_province_code' => '040340000',
            'shipping_city_code'     => '040342800',
            'shipping_barangay_code' => $leadingZeroCode,
        ]);

        OrderItem::create([
            'order_id'     => $order->id,
            'seller_id'    => $this->seller->id,
            'product_name' => 'Handmade Basket',
            'unit_price'   => 500.00,
            'quantity'     => 1,
            'subtotal'     => 500.00,
        ]);

        $freshOrder = $order->fresh();
        $this->assertSame($leadingZeroCode, $freshOrder->shipping_barangay_code);

        // 4. Parcel creation via state machine
        $this->stateMachine->transition($order, OrderStatus::READY_FOR_PICKUP->value, 'seller', $this->seller->id);

        $parcel = Parcel::where('order_id', $order->id)->first();
        $this->assertNotNull($parcel);
        $this->assertSame($leadingZeroCode, $parcel->pickup_barangay_code);
        $this->assertSame($leadingZeroCode, $parcel->destination_barangay_code);
    }

    public function test_order_state_machine_guard_blocks_ready_for_pickup_if_seller_code_missing(): void
    {
        // Seller without barangay code
        $this->createSellerProfile($this->seller, [
            'shop_name'             => 'Incomplete Shop',
            'address_province'      => 'Metro Manila',
            'address_city'          => 'Manila',
            'address_barangay'      => 'Barangay 1',
            'address_barangay_code' => null, // missing code
        ]);

        $order = Order::create([
            'buyer_id'               => $this->buyer->id,
            'order_number'           => 'VEL-GUARD-1',
            'subtotal'               => 300.00,
            'shipping_fee'           => 99.00,
            'total'                  => 399.00,
            'payment_method'         => 'cod',
            'payment_status'         => 'pending',
            'status'                 => OrderStatus::PREPARING,
            'shipping_name'          => 'Buyer Name',
            'shipping_phone'         => '09171234567',
            'shipping_address'       => '123 Buyer St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Manila',
            'shipping_barangay'      => 'Barangay 2',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '133900000',
            'shipping_barangay_code' => '133901002',
        ]);

        OrderItem::create([
            'order_id'     => $order->id,
            'seller_id'    => $this->seller->id,
            'product_name' => 'Item',
            'unit_price'   => 300.00,
            'quantity'     => 1,
            'subtotal'     => 300.00,
        ]);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->expectExceptionMessage('Cannot mark order ready for pickup: Re-select your shop address so a barangay can be matched to a delivery area.');

        $this->stateMachine->transition($order, OrderStatus::READY_FOR_PICKUP->value, 'seller', $this->seller->id);
    }

    public function test_order_state_machine_guard_blocks_ready_for_pickup_if_destination_code_missing(): void
    {
        // Seller with complete code
        $this->createSellerProfile($this->seller, [
            'shop_name'             => 'Complete Shop',
            'address_province'      => 'Metro Manila',
            'address_city'          => 'Manila',
            'address_barangay'      => 'Barangay 1',
            'address_province_code' => '130000000',
            'address_city_code'     => '133900000',
            'address_barangay_code' => '133901001',
        ]);

        // Order missing destination code
        $order = Order::create([
            'buyer_id'               => $this->buyer->id,
            'order_number'           => 'VEL-GUARD-2',
            'subtotal'               => 300.00,
            'shipping_fee'           => 99.00,
            'total'                  => 399.00,
            'payment_method'         => 'cod',
            'payment_status'         => 'pending',
            'status'                 => OrderStatus::PREPARING,
            'shipping_name'          => 'Buyer Name',
            'shipping_phone'         => '09171234567',
            'shipping_address'       => '123 Buyer St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Manila',
            'shipping_barangay'      => 'Barangay 2',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '133900000',
            'shipping_barangay_code' => null, // missing code
        ]);

        OrderItem::create([
            'order_id'     => $order->id,
            'seller_id'    => $this->seller->id,
            'product_name' => 'Item',
            'unit_price'   => 300.00,
            'quantity'     => 1,
            'subtotal'     => 300.00,
        ]);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->expectExceptionMessage('Cannot mark order ready for pickup: Delivery address is missing a barangay code. Customer must re-select their address.');

        $this->stateMachine->transition($order, OrderStatus::READY_FOR_PICKUP->value, 'seller', $this->seller->id);
    }
}
