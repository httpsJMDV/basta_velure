<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\CourierAssigner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The buyer never picks a courier: like parcels handed to J&T or Flash, each shop's order goes to the courier whose
 * hubs cover where the parcel starts (the shop), preferring one that also covers where it ends (the buyer).
 */
class CourierAssignmentTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Mail::fake();
    }

    /** A barangay code no seeded hub covers. */
    private function code(): string
    {
        return '99' . str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
    }

    private function user(string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => 'Jose', 'last_name' => 'Rizal', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
            // A buyer whose ID passed the check can place orders.
            'buyer_application_status' => $role === 'buyer' ? 'approved' : null,
        ]);
    }

    private function company(): LogisticsCompany
    {
        $code = strtoupper(Str::random(5));

        return LogisticsCompany::create([
            'name' => 'Courier ' . $code, 'code' => $code, 'slug' => strtolower($code),
            'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
    }

    private function hub(LogisticsCompany $company, array $coverage, string $status = SortingCenter::STATUS_APPROVED): SortingCenter
    {
        return SortingCenter::create([
            'logistics_company_id' => $company->id, 'user_id' => $this->user()->id, 'hub_name' => 'Hub ' . Str::random(5),
            'address_province' => 'Laguna', 'address_city' => 'Santa Cruz', 'address_barangay' => 'Poblacion I', 'address_street' => '1 St',
            'dti_permit_path' => 'dti_permits/p.pdf', 'coverage_barangays' => $coverage, 'status' => $status,
        ]);
    }

    private function seller(string $pickupCode): User
    {
        $seller = $this->user('seller');
        SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'Shop ' . Str::random(6), 'shop_category' => 'Clothing',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', Str::random(20)), 'government_id_image_path' => 'uploads/id.jpg',
            'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
            'address_barangay' => 'Poblacion', 'address_barangay_code' => $pickupCode,
        ]);

        return $seller;
    }

    private function product(User $seller): array
    {
        $category = Category::create(['name' => 'Cat ' . Str::random(6), 'slug' => 'cat-' . Str::lower(Str::random(8)), 'is_active' => true, 'commission_rate' => 0.10]);
        $product = Product::create(['seller_id' => $seller->id, 'category_id' => $category->id, 'name' => 'Item ' . Str::random(6), 'base_price' => 100, 'status' => 'active']);
        $variant = ProductVariant::create(['product_id' => $product->id, 'label' => 'Standard', 'sku' => 'SKU-' . Str::random(8), 'price' => 100, 'stock_quantity' => 10]);

        return [$product, $variant];
    }

    public function test_each_shops_order_goes_to_the_courier_that_covers_the_shop(): void
    {
        [$shopA, $shopB, $buyerArea] = [$this->code(), $this->code(), $this->code()];
        $courierA = $this->company();
        $courierB = $this->company();
        $this->hub($courierA, [$shopA]);
        $this->hub($courierB, [$shopB, $buyerArea]);

        [$pA, $vA] = $this->product($this->seller($shopA));
        [$pB, $vB] = $this->product($this->seller($shopB));

        Sanctum::actingAs($this->user());
        $response = $this->postJson('/api/v1/checkout/place-order', [
            'payment_method' => 'cod', 'shipping_name' => 'Juan Dela Cruz', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 Sample St', 'shipping_barangay' => 'Somewhere',
            'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => $buyerArea,
            // Ignored: the courier is not the buyer's choice.
            'logistics_company_id' => $courierB->id,
            'items' => [
                ['product_id' => $pA->id, 'variant_id' => $vA->id, 'quantity' => 1],
                ['product_id' => $pB->id, 'variant_id' => $vB->id, 'quantity' => 1],
            ],
        ])->assertCreated();

        $bySeller = Order::whereIn('id', collect($response->json('orders'))->pluck('id'))->get()
            ->mapWithKeys(fn (Order $o) => [$o->seller->id => $o->logistics_company_id]);
        $this->assertSame($courierA->id, $bySeller[$pA->seller_id]);
        $this->assertSame($courierB->id, $bySeller[$pB->seller_id]);
        // The buyer sees which courier each order went to.
        foreach ($response->json('orders') as $o) {
            $this->assertSame(Order::find($o['id'])->logistics_company_id, $o['courier']['id']);
        }
    }

    public function test_covering_both_ends_beats_a_bigger_network_and_the_shop_end_beats_the_buyer_end(): void
    {
        [$shop, $buyer] = [$this->code(), $this->code()];
        $big = $this->company();
        foreach (range(1, 3) as $i) {
            $this->hub($big, [$shop]);
        }
        $both = $this->company();
        $this->hub($both, [$shop, $buyer]);

        $this->assertSame($both->id, app(CourierAssigner::class)->forRoute($shop, $buyer));

        // Only the buyer's end covered by a large network, the shop's end by a small one: the shop's end wins.
        [$shop2, $buyer2] = [$this->code(), $this->code()];
        $buyerSide = $this->company();
        foreach (range(1, 3) as $i) {
            $this->hub($buyerSide, [$buyer2]);
        }
        $shopSide = $this->company();
        $this->hub($shopSide, [$shop2]);
        $this->hub($this->company(), [$shop2], SortingCenter::STATUS_PENDING); // unapproved hubs do not count

        $this->assertSame($shopSide->id, app(CourierAssigner::class)->forRoute($shop2, $buyer2));
    }

    public function test_a_route_nobody_covers_goes_to_the_default_courier(): void
    {
        $this->hub($this->company(), [$this->code()]);

        $this->assertSame(LogisticsCompany::defaultId(), app(CourierAssigner::class)->forRoute($this->code(), $this->code()));
    }
}
