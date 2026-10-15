<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Http\Controllers\Api\V1\AdminOrderController;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Product;
use App\Models\Review;
use App\Models\SellerProfile;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The redesigned admin Orders and Reviews pages: the list filters and sorting, and the summaries that feed the KPI row,
 * the chips and the rating distribution, reconciled against raw counts. The clock is fixed at 2026-10-16 03:00 UTC.
 */
class AdminOrdersReviewsTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private User $buyerA;
    private User $buyerB;
    private User $sellerOne;
    private User $sellerTwo;

    /** @var array<int, array<string, mixed>> */
    private array $orders = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Carbon::setTestNow(CarbonImmutable::parse('2026-10-16 03:00:00', 'UTC'));

        $this->admin = $this->makeUser('admin', 'Ada', 'Admin');
        $this->buyerA = $this->makeUser('buyer', 'Ana', 'Alcantara');
        $this->buyerB = $this->makeUser('buyer', 'Ben', 'Bautista');
        $this->sellerOne = $this->makeSeller('Gadget Garage', 'Gil', 'Santos');
        $this->sellerTwo = $this->makeSeller('Pantry Plus', 'Pia', 'Reyes');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private function makeUser(string $role, string $first, string $last): User
    {
        $user = new User([
            'first_name' => $first, 'last_name' => $last, 'email' => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone' => '+63917' . random_int(1000000, 9999999), 'password' => Hash::make('Password123!'),
            'date_of_birth' => '1990-01-01', 'sex' => 'male',
        ]);
        $user->role = $role;
        $user->status = 'active';
        $user->save();

        return $user;
    }

    private function makeSeller(string $shop, string $first, string $last): User
    {
        $user = $this->makeUser('buyer', $first, $last);
        SellerProfile::forceCreate([
            'user_id' => $user->id, 'shop_name' => $shop, 'shop_category' => 'x', 'shop_description' => 'x',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'x' . $user->id), 'government_id_image_path' => 'x.png',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
        ]);

        return $user;
    }

    /** @return array<string, mixed> the fixture row, with the created order's id */
    private function order(string $number, string $status, string $at, User $buyer, User $seller, string $method, string $payment, float $total, ?string $tracking = null): array
    {
        $order = Order::forceCreate([
            'buyer_id' => $buyer->id, 'checkout_group_id' => (string) Str::uuid(), 'order_number' => $number,
            'subtotal' => $total - 99, 'shipping_fee' => 99, 'total' => $total, 'payment_method' => $method,
            'payment_status' => $payment, 'status' => $status, 'created_at' => $at, 'updated_at' => $at,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'category_id' => '1', 'product_name' => 'Thing', 'unit_price' => $total - 99,
            'quantity' => 1, 'subtotal' => $total - 99, 'commission_rate' => 0.1, 'commission_amount' => 1, 'seller_earnings' => 1, 'payout_status' => 'pending_release',
        ]);
        if ($tracking) {
            Parcel::create(['tracking_number' => $tracking, 'order_id' => $order->id, 'seller_id' => $seller->id, 'status' => 'READY_FOR_PICKUP']);
        }

        return $this->orders[] = compact('number', 'status', 'at', 'buyer', 'seller', 'method', 'payment', 'total', 'tracking') + ['id' => $order->id];
    }

    private function seedOrders(): void
    {
        // One order at every status (15), spread over October, mixed payment, two buyers and two shops.
        $statuses = OrderStatus::cases();
        foreach ($statuses as $i => $case) {
            $this->order(
                'VEL-ADM-' . str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT),
                $case->value,
                CarbonImmutable::parse('2026-10-01 05:00:00', 'UTC')->addDays($i)->format('Y-m-d H:i:s'),
                $i % 2 === 0 ? $this->buyerA : $this->buyerB,
                $i % 3 === 0 ? $this->sellerOne : $this->sellerTwo,
                $i % 2 === 0 ? 'gcash' : 'cod',
                $i % 4 === 0 ? 'paid' : 'pending',
                100 + $i * 10 + 99,
                $i < 8 ? sprintf('LIT-261001-%06d', $i + 1) : null,
            );
        }
        // Two more outside the October window and one soft-deleted order, which must never appear.
        $this->order('VEL-ADM-OLD', 'COMPLETED', '2026-08-02 05:00:00', $this->buyerA, $this->sellerOne, 'cod', 'paid', 5000.00);
        $gone = $this->order('VEL-ADM-GONE', 'PLACED', '2026-10-05 05:00:00', $this->buyerA, $this->sellerOne, 'cod', 'pending', 777.00);
        Order::find($gone['id'])->delete();
    }

    /** @return array<int, array<string, mixed>> the fixtures a plain-PHP recount works from (soft-deleted left out) */
    private function live(): array
    {
        return array_values(array_filter($this->orders, fn ($o) => $o['number'] !== 'VEL-ADM-GONE'));
    }

    // ── Orders summary ───────────────────────────────────────────────────────

    public function test_the_orders_summary_reconciles_with_raw_counts_for_a_fixed_range(): void
    {
        $this->seedOrders();
        Sanctum::actingAs($this->admin);

        $in = array_values(array_filter($this->live(), fn ($o) => substr($o['at'], 0, 10) >= '2026-10-01' && substr($o['at'], 0, 10) <= '2026-10-31'));
        $this->assertCount(15, $in);

        $summary = $this->getJson('/api/v1/admin/orders/summary?from=2026-10-01&to=2026-10-31')->assertOk()->json('data');

        // total == raw count == the sum of the groups == the sum of the statuses.
        $this->assertSame(15, $summary['total']);
        $this->assertSame(array_sum($summary['groups']), $summary['total']);
        $this->assertSame(array_sum($summary['by_status']), $summary['total']);
        $this->assertSame(Order::whereBetween('created_at', ['2026-10-01 00:00:00', '2026-10-31 23:59:59'])->count(), $summary['total']);

        foreach (OrderStatus::cases() as $case) {
            $raw = count(array_filter($in, fn ($o) => $o['status'] === $case->value));
            $this->assertSame($raw, $summary['by_status'][$case->value], $case->value);
        }
        foreach (AdminOrderController::statusGroups() as $key => $statuses) {
            $raw = count(array_filter($in, fn ($o) => in_array($o['status'], $statuses, true)));
            $this->assertSame($raw, $summary['groups'][$key], $key);
        }
        // The groups partition the statuses: every status is in exactly one.
        $all = collect(AdminOrderController::statusGroups())->flatten();
        $this->assertEqualsCanonicalizing(OrderStatus::values(), $all->all());
        $this->assertSame([4, 5, 2, 3, 1], array_values($summary['groups']), 'awaiting action, in transit, delivered or completed, problem, cancelled');

        // GMV: the orders that count (not CANCELLED or RETURNED), the same figure the dashboard and reports give.
        $gmv = array_sum(array_map(fn ($o) => $o['total'], array_filter($in, fn ($o) => ! in_array($o['status'], ['CANCELLED', 'RETURNED'], true))));
        $this->assertEquals(round($gmv, 2), $summary['gmv']);
        $report = $this->getJson('/api/v1/admin/reports/summary?from=2026-10-01&to=2026-10-31')->json('data');
        $this->assertEquals($report['total_gmv'], $summary['gmv']);
        $this->assertSame($report['orders_placed'], $summary['total']);

        // No range: every live order (the soft-deleted one is never counted).
        $all = $this->getJson('/api/v1/admin/orders/summary')->assertOk()->json('data');
        $this->assertSame(16, $all['total']);
    }

    public function test_the_summary_follows_the_filters_but_not_the_status_filter(): void
    {
        $this->seedOrders();
        Sanctum::actingAs($this->admin);

        $gcash = array_values(array_filter($this->live(), fn ($o) => $o['method'] === 'gcash' && $o['number'] !== 'VEL-ADM-OLD'));
        $summary = $this->getJson('/api/v1/admin/orders/summary?from=2026-10-01&to=2026-10-31&payment_method=gcash')->assertOk()->json('data');
        $this->assertSame(count($gcash), $summary['total']);
        $this->assertSame(array_sum($summary['groups']), $summary['total']);

        // A status or group filter changes the list, never the chip counts.
        $withGroup = $this->getJson('/api/v1/admin/orders/summary?from=2026-10-01&to=2026-10-31&group=problem')->assertOk()->json('data');
        $without = $this->getJson('/api/v1/admin/orders/summary?from=2026-10-01&to=2026-10-31')->assertOk()->json('data');
        $this->assertSame($without, $withGroup);

        $paid = array_values(array_filter($this->live(), fn ($o) => $o['payment'] === 'paid' && $o['number'] !== 'VEL-ADM-OLD'));
        $this->assertSame(count($paid), $this->getJson('/api/v1/admin/orders/summary?from=2026-10-01&to=2026-10-31&payment_status=paid')->json('data.total'));

        // The search narrows it too: one shop, one buyer, one tracking number.
        $shop = array_filter($this->live(), fn ($o) => $o['seller']->id === $this->sellerTwo->id && $o['number'] !== 'VEL-ADM-OLD');
        $this->assertSame(count($shop), $this->getJson('/api/v1/admin/orders/summary?from=2026-10-01&to=2026-10-31&search=Pantry')->json('data.total'));
    }

    // ── Orders list ──────────────────────────────────────────────────────────

    public function test_the_list_filters_by_status_group_date_payment_and_search(): void
    {
        $this->seedOrders();
        Sanctum::actingAs($this->admin);
        $numbers = fn ($response) => collect($response->json('data'))->pluck('order_number')->sort()->values()->all();
        $expect = fn (callable $keep) => collect($this->live())->filter($keep)->pluck('number')->sort()->values()->all();

        // Status: the OrderStatus value, and the legacy lower-case names the endpoint always took.
        $this->assertSame($expect(fn ($o) => $o['status'] === 'DELIVERED'), $numbers($this->getJson('/api/v1/admin/orders?status=DELIVERED')));
        $this->assertSame($expect(fn ($o) => $o['status'] === 'PLACED'), $numbers($this->getJson('/api/v1/admin/orders?status=pending')));

        // Group.
        foreach (AdminOrderController::statusGroups() as $key => $statuses) {
            $this->assertSame($expect(fn ($o) => in_array($o['status'], $statuses, true)), $numbers($this->getJson("/api/v1/admin/orders?group={$key}&per_page=100")), $key);
        }

        // Date range: inclusive Manila days. 05:00 UTC is 13:00 in Manila, the same calendar day.
        $range = $this->getJson('/api/v1/admin/orders?from=2026-10-03&to=2026-10-05&per_page=100');
        $this->assertSame($expect(fn ($o) => substr($o['at'], 0, 10) >= '2026-10-03' && substr($o['at'], 0, 10) <= '2026-10-05'), $numbers($range));
        $this->assertSame(3, $range->json('meta.total'));

        // Payment.
        $this->assertSame($expect(fn ($o) => $o['method'] === 'cod' && $o['payment'] === 'paid'), $numbers($this->getJson('/api/v1/admin/orders?payment_method=cod&payment_status=paid&per_page=100')));

        // Search: order number, tracking number, buyer, shop, seller name.
        $this->assertSame(['VEL-ADM-03'], $numbers($this->getJson('/api/v1/admin/orders?search=ADM-03')));
        $this->assertSame(['VEL-ADM-05'], $numbers($this->getJson('/api/v1/admin/orders?search=LIT-261001-000005')));
        $this->assertSame($expect(fn ($o) => $o['buyer']->id === $this->buyerB->id), $numbers($this->getJson('/api/v1/admin/orders?search=Bautista&per_page=100')));
        $this->assertSame($expect(fn ($o) => $o['seller']->id === $this->sellerOne->id), $numbers($this->getJson('/api/v1/admin/orders?search=Gadget&per_page=100')));
        $this->assertSame($expect(fn ($o) => $o['seller']->id === $this->sellerTwo->id), $numbers($this->getJson('/api/v1/admin/orders?search=Reyes&per_page=100')));
        $this->assertSame([], $numbers($this->getJson('/api/v1/admin/orders?search=zzz-nothing')));
        // LIKE wildcards in the search are text, not patterns.
        $this->assertSame([], $numbers($this->getJson('/api/v1/admin/orders?search=%25')));

        // The soft-deleted order is in no list.
        $this->assertNotContains('VEL-ADM-GONE', $numbers($this->getJson('/api/v1/admin/orders?per_page=100')));
    }

    public function test_the_list_sorts_by_date_and_total_and_paginates(): void
    {
        $this->seedOrders();
        Sanctum::actingAs($this->admin);

        $dates = collect($this->getJson('/api/v1/admin/orders?per_page=100')->json('data'))->pluck('order_number')->all();
        $this->assertSame('VEL-ADM-15', $dates[0], 'newest first by default');
        $this->assertSame('VEL-ADM-OLD', end($dates));

        $oldest = $this->getJson('/api/v1/admin/orders?sort=date&direction=asc&per_page=100')->json('data.0.order_number');
        $this->assertSame('VEL-ADM-OLD', $oldest);

        $byTotal = collect($this->getJson('/api/v1/admin/orders?sort=total&direction=desc&per_page=100')->json('data'))->pluck('total')->all();
        $sorted = $byTotal;
        rsort($sorted);
        $this->assertSame($sorted, $byTotal);
        $this->assertEquals(5000.0, $byTotal[0]);
        $asc = collect($this->getJson('/api/v1/admin/orders?sort=total&direction=asc&per_page=100')->json('data'))->pluck('total')->all();
        $ascSorted = $asc;
        sort($ascSorted);
        $this->assertSame($ascSorted, $asc);

        $page = $this->getJson('/api/v1/admin/orders?per_page=5&page=2')->assertOk();
        $this->assertSame(5, count($page->json('data')));
        $this->assertSame(['current_page' => 2, 'last_page' => 4, 'total' => 16, 'per_page' => 5, 'from' => 6, 'to' => 10], $page->json('meta'));
    }

    public function test_the_list_rows_carry_the_shop_and_the_original_keys_and_bad_input_is_rejected(): void
    {
        $this->seedOrders();
        Sanctum::actingAs($this->admin);

        $row = collect($this->getJson('/api/v1/admin/orders?search=VEL-ADM-01')->assertOk()->json('data'))->first();
        foreach (['id', 'order_number', 'tracking_number', 'status', 'payment_method', 'payment_status', 'subtotal', 'shipping_fee', 'total', 'created_at', 'buyer', 'items', 'status_history'] as $key) {
            $this->assertArrayHasKey($key, $row, $key);
        }
        $this->assertSame('Gadget Garage', $row['shop']['name']);
        $this->assertSame($this->sellerOne->id, $row['shop']['id']);
        $this->assertSame('LIT-261001-000001', $row['tracking_number']);

        $this->getJson('/api/v1/admin/orders?from=2026-10-10&to=2026-10-01')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/admin/orders?from=2026-10-10')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/admin/orders?group=nope')->assertStatus(422)->assertJsonValidationErrors('group');
        $this->getJson('/api/v1/admin/orders?payment_method=bitcoin')->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->getJson('/api/v1/admin/orders?per_page=1000')->assertStatus(422)->assertJsonValidationErrors('per_page');
        $this->getJson('/api/v1/admin/orders/summary?sort=total&direction=sideways')->assertStatus(422);

        // The detail drawer endpoint and the status action still work.
        $id = $this->orders[0]['id'];
        $detail = $this->getJson("/api/v1/admin/orders/{$id}")->assertOk()->json('data');
        $this->assertArrayHasKey('status_history', $detail);
        $this->assertSame('Gadget Garage', $detail['shop']['name']);

        Sanctum::actingAs($this->buyerA);
        $this->getJson('/api/v1/admin/orders')->assertForbidden();
        $this->getJson('/api/v1/admin/orders/summary')->assertForbidden();
    }

    // ── Reviews ──────────────────────────────────────────────────────────────

    private function makeProduct(User $seller, string $name): Product
    {
        $category = Category::updateOrCreate(['slug' => 'test-reviews'], ['name' => 'Test Reviews', 'sort_order' => 95, 'is_active' => true, 'requires_fda' => false]);

        return Product::forceCreate(['seller_id' => $seller->id, 'category_id' => $category->id, 'name' => $name, 'description' => 'x', 'base_price' => 100, 'status' => 'active', 'weight_kg' => 0.2, 'sku' => strtoupper(Str::random(8))]);
    }

    private function review(Product $product, User $buyer, int $rating, string $status, bool $flagged = false, string $comment = 'ok', ?Order $order = null): Review
    {
        return Review::forceCreate([
            'buyer_id' => $buyer->id, 'product_id' => $product->id, 'order_id' => $order?->id, 'rating' => $rating, 'comment' => $comment,
            'verified_purchase' => true, 'flagged' => $flagged, 'flag_reason' => $flagged ? 'Abusive language' : null, 'moderation_status' => $status,
        ]);
    }

    private function seedReviews(): void
    {
        $charger = $this->makeProduct($this->sellerOne, 'USB-C Charger');
        $basket = $this->makeProduct($this->sellerTwo, 'Bamboo Basket');
        $order = Order::forceCreate(['buyer_id' => $this->buyerA->id, 'order_number' => 'VEL-REV-1', 'subtotal' => 1, 'total' => 1, 'payment_method' => 'cod', 'status' => 'COMPLETED']);

        // ratings: 5,5,4,3,2,1,5 => 25 / 7 = 3.57; statuses: visible 4, pending 2 (one flagged), hidden 1 (flagged too)
        $this->review($charger, $this->buyerA, 5, 'visible', false, 'Works great', $order);
        $this->review($charger, $this->buyerB, 5, 'visible', false, 'Fast charging');
        $this->review($basket, $this->buyerA, 4, 'visible', false, 'Sturdy basket');
        $this->review($basket, $this->buyerB, 3, 'pending_review', false, 'It is fine');
        $this->review($charger, $this->buyerB, 2, 'pending_review', true, 'Terrible, scam shop!!!');
        $this->review($basket, $this->buyerB, 1, 'hidden', true, 'Spam spam spam');
        $this->review($charger, $this->buyerA, 5, 'visible', false, 'Would buy again');
        $gone = $this->review($charger, $this->buyerA, 1, 'visible', false, 'deleted review');
        $gone->delete();
    }

    public function test_the_reviews_summary_has_the_right_average_counts_and_distribution(): void
    {
        Sanctum::actingAs($this->admin);

        // No reviews yet: null, not 0.
        $empty = $this->getJson('/api/v1/admin/reviews/summary')->assertOk()->json('data');
        $this->assertSame(0, $empty['total']);
        $this->assertNull($empty['average_rating']);
        $this->assertSame(['1' => 0, '2' => 0, '3' => 0, '4' => 0, '5' => 0], $empty['rating_distribution']);

        $this->seedReviews();
        $summary = $this->getJson('/api/v1/admin/reviews/summary')->assertOk()->json('data');

        $this->assertSame(7, $summary['total'], 'the soft-deleted review is not counted');
        $this->assertEquals(3.57, $summary['average_rating']);
        $this->assertSame(['1' => 1, '2' => 1, '3' => 1, '4' => 1, '5' => 3], $summary['rating_distribution']);
        $this->assertSame(7, array_sum($summary['rating_distribution']));
        $this->assertSame(['pending_review' => 2, 'visible' => 4, 'hidden' => 1], $summary['by_status']);
        $this->assertSame(7, array_sum($summary['by_status']));
        $this->assertSame(2, $summary['flagged'], 'flagged in any status');

        // It agrees with a raw recount.
        $raw = Review::all();
        $this->assertEquals(round($raw->avg('rating'), 2), $summary['average_rating']);
        $this->assertSame($raw->where('flagged', true)->count(), $summary['flagged']);
        $this->assertSame($raw->where('moderation_status', 'pending_review')->count(), $summary['by_status']['pending_review']);

        // Moderating moves the counts.
        $pending = Review::where('moderation_status', 'pending_review')->where('flagged', false)->firstOrFail();
        $this->patchJson("/api/v1/admin/reviews/{$pending->id}/moderate", ['moderation_status' => 'visible'])->assertOk();
        $after = $this->getJson('/api/v1/admin/reviews/summary')->json('data');
        $this->assertSame(['pending_review' => 1, 'visible' => 5, 'hidden' => 1], $after['by_status']);
    }

    public function test_the_reviews_list_filters_and_carries_the_product_shop_and_order(): void
    {
        $this->seedReviews();
        Sanctum::actingAs($this->admin);
        $comments = fn ($r) => collect($r->json('data'))->pluck('comment')->sort()->values()->all();

        $all = $this->getJson('/api/v1/admin/reviews?per_page=100')->assertOk();
        $this->assertSame(7, $all->json('meta.total'));
        $this->assertSame(['current_page' => 1, 'last_page' => 1, 'total' => 7, 'per_page' => 100, 'from' => 1, 'to' => 7], $all->json('meta'));

        $this->assertSame(['It is fine', 'Terrible, scam shop!!!'], $comments($this->getJson('/api/v1/admin/reviews?moderation_status=pending_review')));
        $this->assertSame(['Spam spam spam'], $comments($this->getJson('/api/v1/admin/reviews?moderation_status=hidden')));
        $this->assertSame(['Spam spam spam', 'Terrible, scam shop!!!'], $comments($this->getJson('/api/v1/admin/reviews?flagged=true')));
        $this->assertSame(['Fast charging', 'Works great', 'Would buy again'], $comments($this->getJson('/api/v1/admin/reviews?rating=5')));
        // Search: comment, product, shop, buyer.
        $this->assertSame(['Sturdy basket'], $comments($this->getJson('/api/v1/admin/reviews?search=sturdy')));
        $this->assertSame(['Fast charging', 'Terrible, scam shop!!!', 'Works great', 'Would buy again'], $comments($this->getJson('/api/v1/admin/reviews?search=Charger&per_page=100')));
        $this->assertSame(['It is fine', 'Spam spam spam', 'Sturdy basket'], $comments($this->getJson('/api/v1/admin/reviews?search=Pantry+Plus&per_page=100')));
        $this->assertSame(['Fast charging', 'It is fine', 'Spam spam spam', 'Terrible, scam shop!!!'], $comments($this->getJson('/api/v1/admin/reviews?search=Bautista&per_page=100')));

        $row = collect($this->getJson('/api/v1/admin/reviews?search=Works+great')->json('data'))->first();
        $this->assertSame('USB-C Charger', $row['product']['name']);
        $this->assertSame('Gadget Garage', $row['shop']['name']);
        $this->assertSame('VEL-REV-1', $row['order']['order_number']);
        foreach (['id', 'product_id', 'rating', 'comment', 'verified_purchase', 'flagged', 'flag_reason', 'moderation_status', 'created_at', 'buyer'] as $key) {
            $this->assertArrayHasKey($key, $row, $key);
        }
        $noOrder = collect($this->getJson('/api/v1/admin/reviews?search=Fast+charging')->json('data'))->first();
        $this->assertNull($noOrder['order']);

        $this->getJson('/api/v1/admin/reviews?rating=9')->assertStatus(422);
        $this->getJson('/api/v1/admin/reviews?moderation_status=approved')->assertStatus(422);

        Sanctum::actingAs($this->buyerA);
        $this->getJson('/api/v1/admin/reviews')->assertForbidden();
        $this->getJson('/api/v1/admin/reviews/summary')->assertForbidden();
    }

    public function test_buyers_cannot_create_reviews_through_the_api_yet(): void
    {
        $product = $this->makeProduct($this->sellerOne, 'USB-C Charger');
        Sanctum::actingAs($this->buyerA);

        foreach (['/api/v1/reviews', "/api/v1/products/{$product->id}/reviews", '/api/v1/buyer/reviews', '/api/v1/admin/reviews'] as $url) {
            $status = $this->postJson($url, ['product_id' => $product->id, 'rating' => 5, 'comment' => 'x'])->getStatusCode();
            $this->assertContains($status, $url === '/api/v1/admin/reviews' ? [403, 405] : [404, 405], "{$url} answered {$status}");
        }
        $this->assertSame(0, Review::count());
    }
}
