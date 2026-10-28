<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\CommissionPayment;
use App\Models\HubEarning;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Direct payments: buyers pay each shop's own GCash (or the rider in cash), shops can offer free delivery, couriers
 * and shops settle COD cash against delivery fees each week, couriers pay their riders and hubs, and shops pay
 * Loved-IT its commission each month.
 */
class DirectPaymentsTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        Mail::fake();
        $this->buyer = $this->user('buyer');
        $this->category = Category::create(['name' => 'Cat ' . Str::random(6), 'slug' => 'cat-' . Str::lower(Str::random(8)), 'is_active' => true, 'commission_rate' => 0.10]);
    }

    private function user(string $role): User
    {
        return User::forceCreate([
            'first_name' => 'Juan', 'last_name' => 'Cruz', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active', 'phone' => '0917' . random_int(1000000, 9999999),
            // A buyer whose ID passed the check can place orders.
            'buyer_application_status' => $role === 'buyer' ? 'approved' : null,
        ]);
    }

    private function seller(array $profile = []): User
    {
        $seller = $this->user('seller');
        SellerProfile::create(array_merge([
            'user_id' => $seller->id, 'shop_name' => 'Shop ' . Str::random(6), 'shop_category' => 'General',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', Str::random(20)), 'government_id_image_path' => 'uploads/id.jpg',
            'payout_gcash_number' => 'N/A', 'application_status' => 'approved',
        ], $profile));

        return $seller;
    }

    private function variant(User $seller, float $price): ProductVariant
    {
        $product = Product::create(['seller_id' => $seller->id, 'category_id' => $this->category->id, 'name' => 'Item ' . Str::random(5), 'base_price' => $price, 'status' => 'active']);

        return ProductVariant::create(['product_id' => $product->id, 'label' => 'Standard', 'sku' => 'SKU-' . Str::random(8), 'price' => $price, 'stock_quantity' => 20]);
    }

    private function receipt(string $name = 'r.png'): UploadedFile
    {
        // A real 1x1 PNG (the fake image() helper needs the GD extension).
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    }

    private function checkout(array $variants, array $extra): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->buyer);

        return $this->post('/api/v1/checkout/place-order', array_merge([
            'shipping_name' => 'Juan', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St',
            'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => '137404001',
            'items' => array_map(fn ($v) => ['product_id' => $v->product_id, 'variant_id' => $v->id, 'quantity' => 1], $variants),
        ], $extra), ['Accept' => 'application/json']);
    }

    public function test_each_shop_is_paid_on_its_own_gcash_and_orders_are_settled_directly(): void
    {
        $a = $this->seller(['gcash_number' => '09171110000', 'gcash_account_name' => 'Ana Shop']);
        $b = $this->seller(['gcash_number' => '09182220000', 'gcash_account_name' => 'Ben Shop']);
        $va = $this->variant($a, 200);
        $vb = $this->variant($b, 300);

        // One reference and receipt per shop.
        $this->checkout([$va, $vb], ['payment_method' => 'gcash', "gcash[{$a->id}][reference]" => '1111111111111'])
            ->assertStatus(422)->assertJsonValidationErrors(["gcash_proof.{$a->id}", "gcash.{$b->id}.reference", "gcash_proof.{$b->id}"]);

        $res = $this->checkout([$va, $vb], [
            'payment_method' => 'gcash',
            'gcash' => [$a->id => ['reference' => '1111 111 111111'], $b->id => ['reference' => '2222222222222']],
            'gcash_proof' => [$a->id => $this->receipt('a.png'), $b->id => $this->receipt('b.png')],
        ])->assertCreated();

        $orders = Order::whereIn('id', collect($res->json('orders'))->pluck('id'))->with('items')->get()->keyBy(fn ($o) => $o->items->first()->seller_id);
        $this->assertSame('1111111111111', $orders[$a->id]->payment_reference);
        $this->assertSame('2222222222222', $orders[$b->id]->payment_reference);
        $this->assertNotSame($orders[$a->id]->payment_proof_path, $orders[$b->id]->payment_proof_path);
        foreach ($orders as $order) {
            $this->assertSame(Order::SETTLEMENT_DIRECT, $order->settlement);
            $this->assertSame('50.00', (string) $order->courier_fee);
            $this->assertSame('direct', $order->items->first()->payout_status);
        }
    }

    public function test_a_shop_can_give_free_delivery_from_a_minimum_and_the_courier_still_earns_the_fee(): void
    {
        $shop = $this->seller(['free_delivery_min' => 500]);
        $cheap = $this->variant($shop, 300);
        $dear = $this->variant($shop, 650);

        $below = Order::find($this->checkout([$cheap], ['payment_method' => 'cod'])->assertCreated()->json('data.id'));
        $this->assertSame('50.00', (string) $below->shipping_fee);
        $this->assertFalse($below->free_delivery);
        $this->assertSame('350.00', (string) $below->total);

        $above = Order::find($this->checkout([$dear], ['payment_method' => 'cod'])->assertCreated()->json('data.id'));
        $this->assertSame('0.00', (string) $above->shipping_fee);
        $this->assertTrue($above->free_delivery);
        $this->assertSame('650.00', (string) $above->total);
        $this->assertSame('50.00', (string) $above->courier_fee);
    }

    public function test_the_shop_sets_its_gcash_and_only_signed_in_buyers_see_it(): void
    {
        $shop = $this->seller();
        Sanctum::actingAs($shop);

        $this->postJson('/api/v1/seller/payment-settings', ['gcash_number' => '+63 917 555 1234'])
            ->assertStatus(422)->assertJsonValidationErrors(['gcash_account_name']);
        $this->postJson('/api/v1/seller/payment-settings', ['gcash_number' => '12345', 'gcash_account_name' => 'Rosa D.'])
            ->assertStatus(422)->assertJsonValidationErrors(['gcash_number']);
        // The name on the account follows the account-name rule: "X" or digits are not a name.
        foreach (['X', '12345', 'Rosa <b>'] as $bad) {
            $this->postJson('/api/v1/seller/payment-settings', ['gcash_number' => '0917 555 1234', 'gcash_account_name' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors(['gcash_account_name']);
        }
        $this->postJson('/api/v1/seller/payment-settings', ['free_delivery_min' => '999.505'])
            ->assertStatus(422)->assertJsonValidationErrors(['free_delivery_min']);
        $this->postJson('/api/v1/seller/payment-settings', ['gcash_number' => '+63 917 555 1234', 'gcash_account_name' => 'Rosa D.', 'free_delivery_min' => 999])
            ->assertOk()->assertJsonPath('data.gcash_number', '0917 555 1234')->assertJsonPath('data.accepts_gcash', true)->assertJsonPath('data.free_delivery_min', 999);

        $this->app['auth']->forgetGuards();
        $guest = $this->getJson("/api/v1/checkout/shops?seller_ids={$shop->id}")->assertOk();
        $guest->assertJsonPath('data.0.accepts_gcash', true)->assertJsonPath('data.0.gcash', null);

        Sanctum::actingAs($this->buyer);
        $this->getJson("/api/v1/checkout/shops?seller_ids={$shop->id}")->assertOk()
            ->assertJsonPath('data.0.gcash.number', '0917 555 1234')->assertJsonPath('data.0.gcash.name', 'Rosa D.');
    }

    // ── Settlements ──

    private function courier(): array
    {
        $owner = $this->user('buyer');
        $code = strtoupper(Str::random(4));
        $company = LogisticsCompany::create(['name' => 'Courier ' . $code, 'code' => $code, 'slug' => strtolower($code), 'owner_user_id' => $owner->id, 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(), 'gcash_number' => '09190000000', 'gcash_name' => 'Courier Co']);
        LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $owner->id, 'role' => 'owner']);
        $hub = SortingCenter::create([
            'logistics_company_id' => $company->id, 'user_id' => $this->user('buyer')->id, 'hub_name' => 'Hub ' . Str::random(4),
            'address_province' => 'Laguna', 'address_city' => 'Bay', 'address_barangay' => 'Poblacion', 'address_street' => '1 St',
            'dti_permit_path' => 'dti_permits/p.pdf', 'coverage_barangays' => ['043404001'], 'status' => SortingCenter::STATUS_APPROVED,
        ]);

        return [$company, $owner, $hub];
    }

    /** A direct order of the shop, delivered at $deliveredAt by the courier. */
    private function deliveredOrder(LogisticsCompany $company, User $shop, string $method, float $subtotal, CarbonImmutable $deliveredAt, string $status = 'DELIVERED', float $shipping = 50): Order
    {
        $order = Order::create([
            'logistics_company_id' => $company->id, 'buyer_id' => $this->buyer->id, 'order_number' => 'VEL-D' . Str::upper(Str::random(8)),
            'subtotal' => $subtotal, 'shipping_fee' => $shipping, 'courier_fee' => 50, 'total' => $subtotal + $shipping,
            'payment_method' => $method, 'payment_status' => 'paid', 'settlement' => Order::SETTLEMENT_DIRECT, 'status' => $status,
            'shipping_name' => 'Juan', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St',
            'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => '137404001',
        ]);
        if ($status === 'COMPLETED') {
            $order->forceFill(['completed_at' => $deliveredAt->utc()])->save(); // set by the order state machine, not mass assignment
        }
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $shop->id, 'product_name' => 'Item', 'unit_price' => $subtotal, 'quantity' => 1,
            'subtotal' => $subtotal, 'commission_rate' => 0.10, 'commission_amount' => round($subtotal * 0.10, 2), 'seller_earnings' => round($subtotal * 0.9, 2), 'payout_status' => 'direct',
        ]);
        Parcel::create(['tracking_number' => 'LIT' . Str::upper(Str::random(10)), 'order_id' => $order->id, 'seller_id' => $shop->id, 'logistics_company_id' => $company->id, 'status' => $status, 'delivered_at' => $deliveredAt->utc()]);

        return $order;
    }

    public function test_the_courier_pays_the_shop_the_cash_it_collected_minus_its_fees_and_the_shop_confirms(): void
    {
        [$company, $owner] = $this->courier();
        $shop = $this->seller(['gcash_number' => '09171110000', 'gcash_account_name' => 'Ana Shop']);
        $lastWeek = CarbonImmutable::now('Asia/Manila')->subWeek()->startOfWeek()->addDays(2)->setTime(14, 0);
        $this->deliveredOrder($company, $shop, 'cod', 500, $lastWeek);   // the rider collected 550
        $this->deliveredOrder($company, $shop, 'gcash', 300, $lastWeek); // the shop got 350 by GCash
        $weekStart = $lastWeek->startOfWeek()->toDateString();

        Sanctum::actingAs($owner);
        $res = $this->getJson('/api/v1/logistics/settlements')->assertOk();
        $line = collect($res->json('data.weeks'))->firstWhere('start', $weekStart)['lines'][0];
        // 550 collected − 2 × 50 in fees = 450 owed to the shop.
        $this->assertEquals([2, 550, 100, 450, 'courier_pays'], [$line['orders_count'], $line['cod_collected'], $line['courier_fees'], $line['net'], $line['direction']]);
        $this->assertSame('0917 111 0000', $line['seller']['gcash']['number']);

        $this->postJson('/api/v1/logistics/settlements', ['seller_id' => $shop->id, 'week_start' => $weekStart, 'reference' => '12345'])
            ->assertStatus(422)->assertJsonValidationErrors(['reference']);
        $paid = $this->postJson('/api/v1/logistics/settlements', ['seller_id' => $shop->id, 'week_start' => $weekStart, 'reference' => '9876 543 210123'])
            ->assertCreated()->assertJsonPath('data.paid_by', 'courier')->assertJsonPath('data.amount', 450);
        $this->postJson('/api/v1/logistics/settlements', ['seller_id' => $shop->id, 'week_start' => $weekStart, 'reference' => '9876543210123'])->assertStatus(422);

        Sanctum::actingAs($shop);
        $mine = collect($this->getJson('/api/v1/seller/settlements')->assertOk()->json('data.weeks'))->firstWhere('start', $weekStart)['lines'][0];
        $this->assertSame('9876543210123', $mine['settlement']['reference']);
        $this->postJson("/api/v1/seller/settlements/{$paid->json('data.id')}/confirm")->assertOk();
        $this->assertNotNull(\App\Models\CourierSettlement::find($paid->json('data.id'))->confirmed_at);
    }

    public function test_the_shop_pays_the_courier_the_fees_of_gcash_and_free_delivery_orders(): void
    {
        [$company, $owner] = $this->courier();
        $shop = $this->seller();
        $lastWeek = CarbonImmutable::now('Asia/Manila')->subWeek()->startOfWeek()->addDay()->setTime(10, 0);
        $this->deliveredOrder($company, $shop, 'gcash', 300, $lastWeek);
        $this->deliveredOrder($company, $shop, 'gcash', 800, $lastWeek, 'DELIVERED', 0); // free delivery
        $weekStart = $lastWeek->startOfWeek()->toDateString();

        Sanctum::actingAs($shop);
        $res = $this->getJson('/api/v1/seller/settlements')->assertOk();
        $this->assertEquals(100, $res->json('data.totals.to_pay'));
        $line = collect($res->json('data.weeks'))->firstWhere('start', $weekStart)['lines'][0];
        $this->assertEquals(['seller_pays', 100, '0919 000 0000'], [$line['direction'], $line['net'], $line['company']['gcash']['number']]);

        $paid = $this->postJson('/api/v1/seller/settlements', ['company_id' => $company->id, 'week_start' => $weekStart, 'reference' => '1212121212121'])
            ->assertCreated()->assertJsonPath('data.paid_by', 'seller');

        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/logistics/settlements/{$paid->json('data.id')}/confirm")->assertOk();
        // The shop cannot confirm its own payment.
        Sanctum::actingAs($shop);
        $this->postJson("/api/v1/seller/settlements/{$paid->json('data.id')}/confirm")->assertStatus(422);
    }

    public function test_the_courier_pays_its_riders_and_hubs_their_shares(): void
    {
        [$company, $owner, $hub] = $this->courier();
        $rider = Rider::create([
            'user_id' => $this->user('buyer')->id, 'sorting_center_id' => $hub->id, 'vehicle_type' => Rider::VEHICLE_MOTORCYCLE, 'plate_number' => 'AB-1234',
            'or_cr_path' => 'rider_or_cr/x.pdf', 'drivers_license_path' => 'rider_licenses/x.pdf', 'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        $parcel = Parcel::create(['tracking_number' => 'LIT' . Str::upper(Str::random(10)), 'logistics_company_id' => $company->id, 'status' => 'DELIVERED']);
        RiderEarning::create(['rider_id' => $rider->id, 'parcel_id' => $parcel->id, 'kind' => 'delivery', 'amount' => 32.50, 'earned_at' => now()]);
        HubEarning::create(['sorting_center_id' => $hub->id, 'parcel_id' => $parcel->id, 'amount' => 7.50, 'earned_at' => now()]);

        // The rider sets where to be paid.
        Sanctum::actingAs($rider->user);
        $this->patchJson('/api/v1/rider/gcash', ['gcash_number' => '0917 333 4444', 'gcash_name' => 'Rico R.'])->assertOk()->assertJsonPath('data.gcash_number', '0917 333 4444');

        Sanctum::actingAs($owner);
        $payouts = $this->getJson('/api/v1/logistics/payouts')->assertOk();
        $row = collect($payouts->json('data.riders'))->firstWhere('id', $rider->id);
        $this->assertEquals([32.5, 1, '0917 333 4444'], [$row['unpaid'], $row['unpaid_count'], $row['gcash']['number']]);
        $this->assertEquals(7.5, collect($payouts->json('data.hubs'))->firstWhere('id', $hub->id)['unpaid']);

        // The hub sees what it is still owed.
        Sanctum::actingAs($hub->user);
        $this->assertEquals(7.5, (float) $this->getJson('/api/v1/hub/earnings')->assertOk()->json('data.unpaid_total'));

        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/logistics/payouts/riders/{$rider->id}", ['reference' => '3434343434343'])->assertOk()->assertJsonPath('data.paid_count', 1);
        $this->postJson("/api/v1/logistics/payouts/riders/{$rider->id}", ['reference' => '3434343434343'])->assertStatus(422);
        $this->postJson("/api/v1/logistics/payouts/hubs/{$hub->id}", ['reference' => '5656565656565'])->assertOk();
        $this->assertSame(0, RiderEarning::where('rider_id', $rider->id)->whereNull('paid_at')->count());

        Sanctum::actingAs($hub->user);
        $hubEarnings = $this->getJson('/api/v1/hub/earnings')->assertOk();
        $this->assertEquals(0, (float) $hubEarnings->json('data.unpaid_total'));
        $this->assertNotNull($hubEarnings->json('data.recent.0.paid_at'));
        Sanctum::actingAs($owner);

        // Another courier cannot pay this rider.
        [, $otherOwner] = $this->courier();
        Sanctum::actingAs($otherOwner);
        $this->postJson("/api/v1/logistics/payouts/riders/{$rider->id}", ['reference' => '3434343434343'])->assertNotFound();
    }

    public function test_the_shop_pays_last_months_commission_and_an_admin_confirms_it(): void
    {
        [$company] = $this->courier();
        $shop = $this->seller();
        $lastMonth = CarbonImmutable::now('Asia/Manila')->subMonthNoOverflow()->startOfMonth()->addDays(9)->setTime(12, 0);
        $this->deliveredOrder($company, $shop, 'cod', 500, $lastMonth, 'COMPLETED');   // commission 50
        $this->deliveredOrder($company, $shop, 'gcash', 300, $lastMonth, 'COMPLETED'); // commission 30
        $this->deliveredOrder($company, $shop, 'gcash', 900, $lastMonth, 'DELIVERED'); // not completed yet: not counted
        $period = $lastMonth->startOfMonth()->toDateString();

        $admin = $this->user('admin');
        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/settings/payments', ['platform_gcash_number' => '09995556666', 'platform_gcash_name' => 'Loved-IT Commission'])->assertOk();

        Sanctum::actingAs($shop);
        $res = $this->getJson('/api/v1/seller/commission')->assertOk();
        $month = collect($res->json('data.months'))->firstWhere('period', $period);
        $this->assertEquals([2, 80], [$month['orders_count'], $month['amount']]);
        $this->assertSame('0999 555 6666', $res->json('data.platform_gcash.number'));

        $pay = $this->postJson('/api/v1/seller/commission', ['period' => $period, 'reference' => '7878787878787'])->assertCreated();
        $this->postJson('/api/v1/seller/commission', ['period' => $period, 'reference' => '7878787878787'])->assertStatus(422);
        // The month in progress cannot be paid yet.
        $this->postJson('/api/v1/seller/commission', ['period' => now()->toDateString(), 'reference' => '7878787878787'])->assertStatus(422);

        Sanctum::actingAs($admin);
        $list = $this->getJson('/api/v1/admin/commission?period=' . substr($period, 0, 7))->assertOk();
        $this->assertEquals(80, collect($list->json('data.rows'))->firstWhere('seller_id', $shop->id)['amount']);
        $this->postJson("/api/v1/admin/commission/{$pay->json('data.id')}/confirm")->assertOk();
        $this->assertNotNull(CommissionPayment::find($pay->json('data.id'))->confirmed_at);
    }
}
