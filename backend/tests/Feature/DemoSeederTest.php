<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Review;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Demo\DemoDataService;
use App\Services\Demo\DemoPlaces;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

/**
 * The demo seeder (php artisan demo:seed / demo:reset). The seeder class is run directly on the _test database; the
 * artisan commands are exercised only for what they must REFUSE to do there.
 *
 * One full seed takes several seconds (it drives the real state machine through ~200 transitions), so the tests that
 * need a seeded database are few and each makes many assertions.
 */
class DemoSeederTest extends TestCase
{
    use DatabaseTransactions;

    private DemoDataService $demo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        Storage::fake('ids');
        $this->demo = app(DemoDataService::class);

        // The test database may have no categories; a few are enough and keep each seed fast. (The seeder adding the
        // full taxonomy when none exist has its own test.)
        foreach (['chargers-powerbanks', 'earphones-audio', 'phone-accessories', 'beverages', 'snacks', 'storage-organization', 'home-decor'] as $i => $slug) {
            Category::updateOrCreate(['slug' => $slug], ['name' => ucfirst(str_replace('-', ' ', $slug)), 'sort_order' => $i, 'is_active' => true, 'requires_fda' => false]);
        }
    }

    private function email(string $local): string
    {
        return $local . '@' . config('demo.email_domain');
    }

    private function user(string $local): User
    {
        return User::where('email', $this->email($local))->firstOrFail();
    }

    private function as(string $local)
    {
        return $this->actingAs($this->user($local), 'sanctum');
    }

    /** @return array<string, int> every table the demo touches, plus the files on both disks */
    private function rowCounts(): array
    {
        $counts = [];
        foreach (['users', 'seller_profiles', 'sorting_centers', 'riders', 'rider_area_assignments', 'addresses', 'products', 'product_variants', 'product_images',
                  'orders', 'order_items', 'order_status_histories', 'payments', 'parcels', 'delivery_logs', 'rider_earnings', 'disputes', 'reviews', 'conversations', 'messages',
                  'personal_access_tokens', 'categories'] as $table) {
            $counts[$table] = DB::table($table)->count();
        }
        $counts['files_public'] = count(Storage::disk('public')->allFiles());
        $counts['files_ids'] = count(Storage::disk('ids')->allFiles());

        return $counts;
    }

    private function demoUserIds()
    {
        return DB::table('users')->where('email', 'like', '%@demo.loved-it.test')->select('id');
    }

    private function realUser(string $local, string $role): User
    {
        return User::forceCreate(['first_name' => 'Real', 'last_name' => ucfirst($local), 'email' => "{$local}@example.com", 'phone' => '0917' . random_int(1000000, 9999999), 'password' => 'x', 'role' => $role]);
    }

    // ── 1. The data itself ───────────────────────────────────────────────────

    public function test_the_dataset_is_complete_consistent_and_real_and_seeding_twice_changes_nothing(): void
    {
        Mail::fake();
        Queue::fake();
        $clockBefore = Carbon::getTestNow();

        $result = $this->demo->seed();

        // Side effects: none beyond the database and the disks, and the frozen clock is put back.
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Queue::assertNothingPushed();
        $this->assertEquals($clockBefore, Carbon::getTestNow());

        // An order at every status, in both payment methods.
        foreach (OrderStatus::cases() as $status) {
            $this->assertGreaterThanOrEqual(1, $result['statuses'][$status->value] ?? 0, "no demo order at {$status->value}");
        }
        $this->assertSame(2, $result['statuses']['SORTED']);
        $this->assertGreaterThanOrEqual(5, $result['statuses']['COMPLETED']);
        $orders = Order::whereIn('buyer_id', [$this->user('buyer1')->id, $this->user('buyer2')->id]);
        $this->assertGreaterThan(0, (clone $orders)->where('payment_method', 'gcash')->count());
        $this->assertGreaterThan(0, (clone $orders)->where('payment_method', 'cod')->count());
        $this->assertSame($result['totals']['orders'], (clone $orders)->count());
        $this->assertGreaterThanOrEqual(25, $result['totals']['orders']);

        // One failed parcel at a single attempt and one at the limit.
        $limit = (int) config('logistics.max_delivery_attempts');
        $this->assertSame([1, $limit], Parcel::where('status', 'DELIVERY_FAILED')->orderBy('delivery_attempts')->pluck('delivery_attempts')->map(fn ($n) => (int) $n)->all());

        // Every order and its parcel agree.
        $withParcel = ['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED'];
        foreach ((clone $orders)->get() as $order) {
            $status = $order->status->value;
            $parcel = Parcel::where('order_id', $order->id)->first();
            if (in_array($status, $withParcel, true)) {
                $this->assertNotNull($parcel, "{$status} order has no parcel");
                $this->assertSame($status, $parcel->status, "parcel and order disagree for {$order->order_number}");
            } elseif (in_array($status, ['COMPLETED', 'DISPUTED'], true)) {
                $this->assertSame('DELIVERED', $parcel->status, "{$status} keeps a DELIVERED parcel");
            } else {
                $this->assertNull($parcel, "{$status} order should not have a parcel yet");
            }
        }

        // The parcel columns match the stage reached, as the real endpoints would leave them.
        $order = ['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
        foreach (Parcel::all() as $parcel) {
            $stage = array_search($parcel->status, $order, true);
            if ($stage !== false && $stage >= 1) {
                $this->assertNotNull($parcel->picked_up_at, "{$parcel->status}: picked_up_at");
                $this->assertNotNull($parcel->pickup_rider_id, "{$parcel->status}: pickup_rider_id");
                $this->assertNotNull($parcel->sorting_center_id, "{$parcel->status}: sorting_center_id");
            }
            if ($stage !== false && $stage >= 2) {
                $this->assertNotNull($parcel->scanned_in_at, "{$parcel->status}: scanned_in_at");
            }
            if ($stage !== false && $stage >= 3) {
                $this->assertNotNull($parcel->sorted_at, "{$parcel->status}: sorted_at");
            }
            if ($stage !== false && $stage >= 4) {
                $this->assertNotNull($parcel->assigned_rider_id, "{$parcel->status}: assigned_rider_id");
                $this->assertNotNull($parcel->assigned_at, "{$parcel->status}: assigned_at");
            }
            if ($stage !== false && $stage >= 5) {
                $this->assertNotNull($parcel->out_for_delivery_at, "{$parcel->status}: out_for_delivery_at");
            }
            if ($parcel->status === 'DELIVERED') {
                $this->assertNotNull($parcel->delivered_at);
                $this->assertTrue(Storage::disk('ids')->exists($parcel->delivery_proof_path), 'the proof photo is on the private disk');
                $this->assertSame($parcel->cod_amount !== null, $parcel->cod_collected_at !== null, 'COD cash is collected exactly on COD parcels');
            }
            if ($parcel->status === 'DELIVERY_FAILED') {
                $this->assertNotNull($parcel->failed_at);
                $this->assertNotNull($parcel->failure_reason);
            }
            if ($parcel->status === 'RETURNED') {
                $this->assertNotNull($parcel->returned_at);
                $this->assertSame(2, (int) $parcel->delivery_attempts);
            }
            $this->assertMatchesRegularExpression('/^LIT-\d{6}-[A-Z0-9]{6}$/', $parcel->tracking_number);
        }

        // Escrow: COMPLETED has its release date, DELIVERED is still waiting for the buyer.
        foreach (Order::where('status', 'COMPLETED')->whereIn('id', (clone $orders)->select('id'))->get() as $completed) {
            $this->assertNotNull($completed->completed_at);
            foreach (OrderItem::where('order_id', $completed->id)->get() as $item) {
                $this->assertNotNull($item->escrow_release_at);
            }
        }
        foreach (Order::where('status', 'DELIVERED')->whereIn('id', (clone $orders)->select('id'))->get() as $delivered) {
            foreach (OrderItem::where('order_id', $delivered->id)->get() as $item) {
                $this->assertNull($item->escrow_release_at);
                $this->assertNotNull($item->delivered_at);
            }
        }

        // Places: the real PSGC codes, as strings, everywhere.
        $valid = DemoPlaces::barangayCodes();
        $this->assertSame(['043426002', '043419001', '043411004'], $valid);
        foreach (DB::table('addresses')->get() as $address) {
            $this->assertContains($address->barangay_code, $valid);
            $this->assertSame('043400000', $address->province_code);
            $this->assertMatchesRegularExpression('/^\d{9}$/', $address->city_code);
        }
        foreach (DB::table('seller_profiles')->get() as $profile) {
            $this->assertContains($profile->address_barangay_code, $valid);
        }
        foreach (Parcel::all() as $parcel) {
            $this->assertContains($parcel->pickup_barangay_code, $valid);
            $this->assertContains($parcel->destination_barangay_code, $valid);
        }
        $this->assertEqualsCanonicalizing($valid, SortingCenter::where('user_id', $this->user('hub')->id)->firstOrFail()->coverage_barangays);

        // Timestamps: spread over about ten days, none in the future.
        $now = Carbon::now()->addSeconds(5)->toDateTimeString();
        $oldest = Carbon::parse((clone $orders)->min('created_at'));
        $this->assertGreaterThanOrEqual(7, $oldest->diffInDays(Carbon::now()));
        $this->assertLessThanOrEqual(11, $oldest->diffInDays(Carbon::now()));
        $this->assertLessThanOrEqual($now, DB::table('order_status_histories')->max('created_at'));
        $this->assertLessThanOrEqual($now, (clone $orders)->max('created_at'));
        foreach (['picked_up_at', 'scanned_in_at', 'sorted_at', 'assigned_at', 'out_for_delivery_at', 'delivered_at', 'failed_at', 'returned_at'] as $column) {
            $max = DB::table('parcels')->max($column);
            $this->assertTrue($max === null || $max <= $now, "{$column} is in the future");
        }

        // Catalog, dispute, GCash order awaiting verification, and the chat.
        foreach (Product::all() as $product) {
            $this->assertSame('active', $product->status);
            $this->assertNotNull($product->category_id);
            $this->assertGreaterThan(0, $product->images()->count());
            $this->assertGreaterThan(0, ProductVariant::where('product_id', $product->id)->count());
        }
        $this->assertSame(1, DB::table('disputes')->where('status', 'open')->count());
        $gcash = Order::where('status', 'PLACED')->where('payment_method', 'gcash')->firstOrFail();
        $this->assertNotNull($gcash->payment_proof_path);
        $this->assertNull($gcash->payment_verified_at);
        $this->assertTrue(Storage::disk('public')->exists($gcash->payment_proof_path));
        $this->assertSame(1, DB::table('conversations')->where('type', 'rider_buyer')->count());
        $this->assertSame(3, DB::table('messages')->count());

        // Seeding again removes the first run and builds the same shape: no duplicates.
        $first = $this->rowCounts();
        $second = $this->demo->seed();
        $this->assertSame($first, $this->rowCounts());
        $this->assertNotEmpty($second['removed']);
        $this->assertSame($result['statuses'], $second['statuses']);
    }

    // ── 2. The seeded accounts work through the real endpoints ──────────────

    public function test_every_role_can_sign_in_and_every_screen_has_data(): void
    {
        $result = $this->demo->seed();

        // Credentials: nine accounts on the demo domain, each with its own simple username and password; the active
        // ones can sign in with the email or the username.
        $this->assertCount(9, $result['credentials']);
        foreach ($result['credentials'] as $credential) {
            $this->assertStringEndsWith('@demo.loved-it.test', $credential['email']);
            $this->assertTrue(Hash::check($credential['password'], User::where('email', $credential['email'])->value('password')));
        }
        foreach (['admin', 'seller1', 'seller2', 'buyer1', 'buyer2', 'hub', 'rider1', 'rider2'] as $local) {
            $password = config("demo.accounts.{$local}.password");
            $this->postJson('/api/v1/auth/login', ['email' => $this->email($local), 'password' => $password])->assertOk();
            $this->postJson('/api/v1/auth/login', ['identifier' => config("demo.accounts.{$local}.username"), 'password' => $password])->assertOk();
        }

        // Rider: her assigned and out-for-delivery parcels come back through the real endpoint, and they are hers.
        $assigned = $this->as('rider1')->getJson('/api/v1/rider/deliveries?view=assigned')->assertOk();
        $this->assertGreaterThanOrEqual(1, $assigned->json('meta.assigned_count'));
        $trackings = collect($assigned->json('data'))->pluck('parcels')->flatten(1)->pluck('tracking_number');
        $this->assertNotEmpty($trackings);
        foreach ($trackings as $tracking) {
            $this->assertSame($this->user('rider1')->rider->id, Parcel::where('tracking_number', $tracking)->value('assigned_rider_id'));
        }
        $out = $this->as('rider1')->getJson('/api/v1/rider/deliveries?view=out_for_delivery')->assertOk();
        $this->assertGreaterThanOrEqual(1, $out->json('meta.out_for_delivery_count'));
        $this->as('rider2')->getJson('/api/v1/rider/deliveries?view=assigned')->assertOk()->assertJsonPath('meta.assigned_count', 1);
        $this->assertNotEmpty($this->as('rider1')->getJson('/api/v1/rider/pickups?view=available')->assertOk()->json('data'));
        $this->assertNotEmpty($this->as('rider1')->getJson('/api/v1/rider/pickups?view=mine')->assertOk()->json('data'));
        foreach (['rider1', 'rider2'] as $rider) {
            $this->assertGreaterThan(0, (float) $this->as($rider)->getJson('/api/v1/rider/earnings/summary?period=month')->assertOk()->json('data.lifetime_total'), "{$rider} earned");
            $this->assertNotEmpty($this->as($rider)->getJson('/api/v1/rider/history')->assertOk()->json('data'));
        }
        $threads = $this->as('rider1')->getJson('/api/v1/rider/chat/threads')->assertOk();
        $this->assertCount(1, $threads->json('data'));
        $this->assertFalse($threads->json('data.0.is_closed'));

        // Hub: dashboard numbers, every operational board, reports, and the applicant waiting for vetting.
        $metrics = $this->as('hub')->getJson('/api/v1/hub/dashboard/metrics')->assertOk()->json('data');
        $this->assertSame(1, $metrics['in_sorting']);
        $this->assertSame(2, $metrics['out_for_delivery']);
        $this->assertSame(2, $metrics['failed_deliveries']);
        $this->assertSame(2, $metrics['active_riders']);
        foreach (['deliveries/out', 'deliveries/failed', 'sorting/groups', 'dispatch/batches'] as $path) {
            $this->assertNotEmpty($this->as('hub')->getJson("/api/v1/hub/{$path}")->assertOk()->json('data'), $path);
        }
        $this->as('hub')->getJson('/api/v1/hub/intake/expected')->assertOk();
        $this->assertCount(1, $this->as('hub')->getJson('/api/v1/hub/riders?status=PENDING')->assertOk()->json('data'));

        $summary = $this->as('hub')->getJson('/api/v1/hub/reports/summary')->assertOk()->json('data');
        $this->assertGreaterThan(0, $summary['totals']['received']);
        $this->assertGreaterThan(5, $summary['totals']['delivered']);
        $this->assertGreaterThan(0, $summary['totals']['failed_attempts']);
        $this->assertGreaterThan(0, $summary['totals']['on_time_deliveries']);
        $this->assertLessThan(1, $summary['totals']['on_time_rate'], 'some deliveries are late');
        $this->assertSame(0, $summary['excluded']['delivered_without_time']);
        $this->assertGreaterThan(0, collect($summary['daily'])->where('delivered', '>', 0)->count());
        $riders = $this->as('hub')->getJson('/api/v1/hub/reports/riders')->assertOk()->json('data');
        $this->assertCount(2, $riders['riders']);
        $this->assertSame(0, $riders['unattributed_deliveries']);
        $this->assertSame($summary['totals']['delivered'], collect($riders['riders'])->sum('delivered'));
        $byName = collect($riders['riders'])->keyBy('name');
        $this->assertGreaterThan(0, $byName['Juan Dela Rosa']['failed_attempts'], 'rider 1 made failed attempts');
        $this->assertGreaterThan(0, $byName['Pedro Mendoza']['delivered'], 'rider 2 delivered');

        // Sellers, buyers, admin.
        foreach (['seller1', 'seller2'] as $seller) {
            $this->assertNotEmpty($this->as($seller)->getJson('/api/v1/seller/orders')->assertOk()->json('data'), "{$seller} orders");
            $this->assertNotEmpty($this->as($seller)->getJson('/api/v1/seller/products')->assertOk()->json('data'), "{$seller} products");
            $this->as($seller)->getJson('/api/v1/seller/earnings')->assertOk();
            $this->assertNotEmpty($this->as($seller)->getJson('/api/v1/seller/earnings/orders')->assertOk()->json('data'), "{$seller} earnings rows");
        }
        foreach (['buyer1', 'buyer2'] as $buyer) {
            $this->assertNotEmpty($this->as($buyer)->getJson('/api/v1/buyer/orders')->assertOk()->json('data'), "{$buyer} orders");
            $this->assertNotEmpty($this->as($buyer)->getJson('/api/v1/addresses')->assertOk()->json('data'), "{$buyer} addresses");
        }
        $thread = collect($this->as('buyer1')->getJson('/api/v1/conversations')->assertOk()->json('data'))->firstWhere('type', 'rider_buyer');
        $this->assertSame(1, $thread['unread']);
        $this->assertNotEmpty($this->as('admin')->getJson('/api/v1/admin/orders')->assertOk()->json('data'));
        $this->assertNotEmpty($this->as('admin')->getJson('/api/v1/admin/disputes')->assertOk()->json('data'));

        // The delivery proof opens through the real, authorized endpoint.
        $parcel = Parcel::where('status', 'DELIVERED')->whereNotNull('delivery_proof_path')->firstOrFail();
        $response = $this->actingAs(User::find($parcel->order->buyer_id), 'sanctum')
            ->get("/api/v1/parcels/{$parcel->tracking_number}/delivery-proof", ['Accept' => 'application/json']);
        $response->assertOk();
        $this->assertStringStartsWith('image/', (string) $response->headers->get('Content-Type'));
    }

    public function test_every_demo_username_exists_and_a_demo_seller_is_a_real_buyer_who_can_also_shop(): void
    {
        $result = $this->demo->seed();

        $expected = [
            'admin'   => ['admin', 'admin123'],
            'buyer1'  => ['buyer1', 'buyer123'], 'buyer2' => ['buyer2', 'buyer123'],
            'seller1' => ['seller1', 'seller123'], 'seller2' => ['seller2', 'seller123'],
            'hub'     => ['hub1', 'hub123'],
            'rider1'  => ['rider1', 'rider123'], 'rider2' => ['rider2', 'rider123'], 'rider3' => ['rider3', 'rider123'],
        ];
        $this->assertEqualsCanonicalizing(
            collect($expected)->map(fn ($pair, $local) => ['username' => $pair[0], 'email' => $this->email($local), 'password' => $pair[1]])->values()->all(),
            collect($result['credentials'])->map(fn ($c) => collect($c)->only(['username', 'email', 'password'])->all())->all(),
            'the credentials table lists every username with its password',
        );
        foreach ($expected as $local => [$username, $password]) {
            $user = $this->user($local);
            $this->assertSame($username, $user->username);
            $this->assertTrue(Hash::check($password, $user->password));
            // The three riders and the admin etc. sign in by username in any case, except the pending applicant.
            $status = $local === 'rider3' ? 403 : 200;
            $this->postJson('/api/v1/auth/login', ['identifier' => strtoupper($username), 'password' => $password])->assertStatus($status);
        }
        $this->postJson('/api/v1/auth/login', ['identifier' => 'rider3', 'password' => 'rider123'])
            ->assertStatus(403)->assertJsonPath('message', 'Your rider application is currently pending hub approval. You will receive an email notification once reviewed.');

        // A demo seller is what a real approved seller is: a buyer account (role never becomes "seller") with an
        // approved seller profile, a complete buyer profile and a default address.
        foreach (['seller1', 'seller2'] as $local) {
            $seller = $this->user($local);
            $this->assertSame('buyer', $seller->role);
            $this->assertSame('approved', $seller->sellerProfile->application_status);
            $this->assertSame('approved', $seller->buyer_application_status);
            $this->assertNotNull($seller->government_id_type);
            $this->assertNotNull($seller->date_of_birth);
            $this->assertNotNull($seller->sex);
            $this->assertNotNull($seller->addresses()->where('is_default', true)->whereNotNull('barangay_code')->first());
        }
        // The same goes for the demo buyers and the hub owner: nothing sends them to /complete-profile.
        foreach (['buyer1', 'buyer2', 'hub'] as $local) {
            $this->assertNotNull($this->user($local)->government_id_type, "{$local} profile is complete");
        }

        // ... so the seller can also shop: seller 1 buys seller 2's product.
        $seller = $this->user('seller1');
        $product = Product::where('seller_id', $this->user('seller2')->id)->firstOrFail();
        $variant = ProductVariant::where('product_id', $product->id)->firstOrFail();
        $address = $seller->addresses()->where('is_default', true)->firstOrFail();
        $login = $this->postJson('/api/v1/auth/login', ['identifier' => 'seller1', 'password' => 'seller123'])->assertOk();
        $this->assertSame('buyer', $login->json('data.role'));
        $this->assertSame('approved', $login->json('data.seller_profile.application_status'));

        $order = $this->as('seller1')->postJson('/api/v1/checkout/place-order', [
            'payment_method'         => 'cod',
            'shipping_name'          => $address->full_name,
            'shipping_phone'         => $address->phone,
            'shipping_address'       => $address->address,
            'shipping_province_code' => $address->province_code,
            'shipping_city_code'     => $address->city_code,
            'shipping_barangay_code' => $address->barangay_code,
            'items'                  => [['product_id' => $product->id, 'variant_id' => $variant->id, 'quantity' => 1]],
        ])->assertCreated();
        $this->assertSame($seller->id, Order::where('order_number', $order->json('data.order_number'))->value('buyer_id'));
        $this->as('seller1')->getJson('/api/v1/buyer/orders')->assertOk();

        // And a seller can still use the seller side.
        $this->as('seller1')->getJson('/api/v1/seller/orders')->assertOk();
    }

    public function test_the_seeder_creates_demo_reviews_for_the_admin_page_and_nothing_else_makes_them(): void
    {
        $result = $this->demo->seed();

        // Six reviews, all on demo products by demo buyers, from COMPLETED demo orders.
        $this->assertSame(6, $result['totals']['reviews']);
        $reviews = Review::with(['product', 'order'])->get();
        $this->assertCount(6, $reviews);
        $demoIds = $this->demoUserIds()->pluck('id');
        foreach ($reviews as $review) {
            $this->assertTrue($demoIds->contains($review->buyer_id), 'a demo buyer wrote it');
            $this->assertTrue($demoIds->contains($review->product->seller_id), 'on a demo seller\'s product');
            $this->assertSame('COMPLETED', $review->order->status->value, 'from a completed order');
            $this->assertSame($review->buyer_id, $review->order->buyer_id);
            $this->assertTrue($review->verified_purchase);
        }

        // Every rating from one to five, all simply published: nothing flags, hides or approves a review.
        $this->assertSame([1, 2, 3, 4, 5, 5], $reviews->pluck('rating')->sort()->values()->all());
        $this->assertSame(['visible' => 6], $reviews->countBy('moderation_status')->all());
        $this->assertSame(0, $reviews->where('flagged', true)->count());

        // The admin page reads them through the real endpoints, shop first.
        $summary = $this->as('admin')->getJson('/api/v1/admin/reviews/summary')->assertOk()->json('data');
        $this->assertSame(6, $summary['total']);
        $this->assertEquals(3.33, $summary['average_rating']);
        $this->assertSame(['1' => 1, '2' => 1, '3' => 1, '4' => 1, '5' => 2], $summary['rating_distribution']);
        $this->assertSame(2, $summary['shops']);
        $shops = collect($this->as('admin')->getJson('/api/v1/admin/reviews/shops')->assertOk()->json('data'));
        $this->assertSame(2, $shops->count());
        $this->assertSame(6, $shops->sum('review_count'), 'every demo review belongs to one of the two demo shops');
        foreach ($shops as $shop) {
            $this->assertNotNull($shop['logo_url'], 'a demo shop has a logo image');
            $this->assertNotEmpty($shop['shop_slug']);
        }
        $list = $this->as('admin')->getJson('/api/v1/admin/reviews?per_page=100')->assertOk();
        $this->assertSame(6, $list->json('meta.total'));
        foreach ($list->json('data') as $row) {
            $this->assertNotNull($row['product']);
            $this->assertNotNull($row['shop']);
            $this->assertNotNull($row['order']);
        }
        // Seeding again gives the same six, not twelve; a reset removes them all.
        $this->demo->seed();
        $this->assertSame(6, Review::count());
        $this->demo->reset();
        $this->assertSame(0, Review::count());
        $this->assertSame(0, DB::table('reviews')->count(), 'soft-deleted rows included');
    }

    // ── 3. Reset removes the demo and only the demo ─────────────────────────

    public function test_reset_removes_every_demo_row_and_file_refuses_when_real_data_depends_on_it_and_leaves_everything_else(): void
    {
        // Real data that exists before the demo.
        $realBuyer = $this->realUser('real.buyer', 'buyer');
        $realSeller = $this->realUser('real.seller', 'seller');
        $realProduct = Product::forceCreate(['seller_id' => $realSeller->id, 'name' => 'Real thing', 'base_price' => 10, 'status' => 'active']);
        $realOrder = Order::forceCreate(['buyer_id' => $realBuyer->id, 'order_number' => 'VEL-REAL-1', 'subtotal' => 10, 'total' => 10, 'payment_method' => 'cod', 'status' => 'DELIVERED']);
        $realParcel = Parcel::create(['tracking_number' => 'LIT-260101-REAL01', 'order_id' => $realOrder->id, 'seller_id' => $realSeller->id, 'status' => 'DELIVERED', 'delivery_proof_path' => 'delivery-proofs/real.png']);
        Storage::disk('ids')->put('delivery-proofs/real.png', 'real-proof');
        Storage::disk('public')->put('products/real.png', 'real-image');
        $before = $this->rowCounts();

        $this->demo->seed();
        $this->assertGreaterThan($before['users'], DB::table('users')->count());

        // Soft-deleted demo rows are demo rows too.
        $this->user('buyer1')->delete();
        Parcel::where('seller_id', $this->user('seller1')->id)->first()->delete();
        Product::where('seller_id', $this->user('seller2')->id)->first()->delete();

        // 1. A real order on a demo seller's item blocks the reset, and not one row changes.
        $blocker = Order::forceCreate(['buyer_id' => $realBuyer->id, 'order_number' => 'VEL-REAL-2', 'subtotal' => 10, 'total' => 10, 'payment_method' => 'cod', 'status' => 'PLACED']);
        OrderItem::create(['order_id' => $blocker->id, 'seller_id' => $this->user('seller1')->id, 'product_name' => 'Demo thing', 'unit_price' => 10, 'quantity' => 1, 'subtotal' => 10, 'payout_status' => 'pending_release']);
        $blocked = $this->rowCounts();
        try {
            $this->demo->reset();
            $this->fail('reset should have refused');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Nothing was deleted', $e->getMessage());
        }
        $this->assertSame($blocked, $this->rowCounts(), 'nothing at all was deleted');
        OrderItem::where('order_id', $blocker->id)->delete();
        $blocker->forceDelete();

        // 2. In production it refuses too, even though demo rows are there.
        $users = DB::table('users')->count();
        $this->app->detectEnvironment(fn () => 'production');
        try {
            $this->demo->reset();
            $this->fail('reset must refuse in production');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('production', $e->getMessage());
        }
        $this->assertSame($users, DB::table('users')->count());
        $this->app->detectEnvironment(fn () => 'testing');

        // 3. Now it removes everything demo: every table and both disks are exactly as before the demo.
        $deleted = $this->demo->reset();
        $this->assertSame(9, $deleted['users']);
        $this->assertArrayHasKey('files', $deleted);
        $this->assertSame(0, $this->demoUserIds()->count());
        $this->assertSame($before, $this->rowCounts());
        $this->assertSame([], Storage::disk('public')->allFiles('demo'));
        $this->assertSame([], Storage::disk('ids')->allFiles('demo'));

        // The real rows and files are untouched.
        $this->assertTrue($realBuyer->fresh()->exists);
        $this->assertSame('Real thing', $realProduct->fresh()->name);
        $this->assertSame('VEL-REAL-1', $realOrder->fresh()->order_number);
        $this->assertSame('delivery-proofs/real.png', $realParcel->fresh()->delivery_proof_path);
        $this->assertSame('real-proof', Storage::disk('ids')->get('delivery-proofs/real.png'));
        $this->assertSame('real-image', Storage::disk('public')->get('products/real.png'));

        // A second reset has nothing to do.
        $this->assertSame([], $this->demo->reset());
        $this->assertSame([], $this->demo->preview());
    }

    // ── 4. Safety and small pieces (no full seed needed) ────────────────────

    public function test_with_no_categories_the_standard_taxonomy_is_added_and_a_reset_leaves_it(): void
    {
        Category::query()->delete();
        $this->assertTrue($this->demo->ensureCategories());
        $this->assertGreaterThan(50, Category::count());
        $this->assertFalse($this->demo->ensureCategories(), 'nothing to add the second time');

        $this->demo->reset();
        $this->assertGreaterThan(50, Category::count(), 'demo:reset never removes categories');
    }

    public function test_both_commands_refuse_on_a_test_database_and_touch_nothing(): void
    {
        $this->assertStringEndsWith('_test', DB::connection()->getDatabaseName());
        $users = User::count();

        $this->artisan('demo:seed')->expectsOutputToContain('test database')->assertFailed();
        $this->artisan('demo:reset')->expectsOutputToContain('test database')->assertFailed();

        $this->assertSame($users, User::count());
        $this->assertSame(0, $this->demoUserIds()->count());
    }

    public function test_both_commands_and_the_seeder_refuse_in_production(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        $this->artisan('demo:seed')->expectsOutputToContain('production')->assertFailed();
        $this->artisan('demo:reset')->expectsOutputToContain('production')->assertFailed();
        $this->assertSame(0, $this->demoUserIds()->count());

        $this->expectException(RuntimeException::class);
        $this->demo->seed();
    }
}
