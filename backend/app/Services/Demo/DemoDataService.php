<?php

namespace App\Services\Demo;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
use App\Models\Address;
use App\Models\Category;
use App\Models\Conversation;
use App\Models\DeliveryLog;
use App\Models\Dispute;
use App\Models\Message;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Rider;
use App\Models\Review;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\OrderStateMachine;
use App\Services\RiderChatService;
use Carbon\Carbon;
use Database\Seeders\CategorySeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Fills the database with a realistic demo dataset: every role, at least one order at every status, and a few reviews.
 *
 * It builds the data through the same code the app uses wherever that code is reusable: every status change goes
 * through OrderStateMachine (so history rows, parcels, tracking numbers, rider earnings and escrow dates are real), and
 * the extra parcel columns are written exactly as the endpoint for that step writes them (see the step methods, each of
 * which names its endpoint). Timestamps are spread over the last ten days by freezing the clock for each step.
 *
 * It sends no email and queues nothing. It changes no money rule: orders, commission and shipping are computed the way
 * BuyerOrderController::placeOrder does.
 *
 * Everything it creates hangs off users with an email on config('demo.email_domain'), which is what DemoCleaner uses to
 * remove it again. This class has no environment guard of its own beyond refusing production; the artisan commands add
 * the rest (see DemoGuard), so tests can run it on the _test database.
 */
class DemoDataService
{
    /** Minutes between a step and the one before it. */
    private const GAPS = [
        'confirm' => 40, 'prepare' => 120, 'ready' => 180, 'accept' => 60, 'pickup' => 90, 'intake' => 240,
        'sort' => 180, 'assign' => 600, 'start' => 540, 'deliver' => 180, 'complete' => 1560,
        'fail' => 200, 'reschedule' => 300, 'return' => 360, 'dispute' => 1200, 'cancel' => 90,
    ];

    /** The journey every parcel travels, in order. */
    private const JOURNEY = ['confirm', 'prepare', 'ready', 'accept', 'pickup', 'intake', 'sort', 'assign', 'start', 'deliver', 'complete'];

    /** @var array<string, User> */
    private array $users = [];
    private SortingCenter $hub;
    /** @var array<string, Rider> */
    private array $riders = [];
    /** @var array<string, array<int, array{product: Product, variant: ProductVariant}>> */
    private array $catalog = [];
    /** @var array<string, Address> */
    private array $addresses = [];
    /** @var array<int, array<string, mixed>> */
    private array $created = [];
    private int $fileCounter = 0;
    private int $phoneCounter = 0;
    /** The real "now" when seeding began; every step's time is measured back from this, not from the frozen clock. */
    private Carbon $baseNow;
    /** @var array<string, string> plain password => its hash (hashing is slow on purpose, and five accounts share each one) */
    private array $passwordHashes = [];

    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly DemoCleaner $cleaner,
        private readonly RiderChatService $chat,
    ) {
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Removes any earlier demo data, then builds the dataset again, so running it twice never duplicates.
     *
     * @return array{removed: array<string, int>, categories_seeded: bool, statuses: array<string, int>, totals: array<string, int>, credentials: array<int, array{role: string, username: string, email: string, password: string}>}
     */
    public function seed(): array
    {
        $this->assertNotProduction();

        $removed = $this->cleaner->reset();
        $previousClock = Carbon::getTestNow();
        $this->baseNow = Carbon::now()->startOfSecond();
        $this->phoneCounter = 0;
        $this->fileCounter = 0;
        $this->passwordHashes = [];

        try {
            $categoriesSeeded = $this->ensureCategories();

            DB::transaction(function () {
                $this->users = [];
                $this->riders = [];
                $this->catalog = [];
                $this->addresses = [];
                $this->created = [];
                $this->createPeopleAndPlaces();
                $this->createCatalog();
                $this->runScenarios();
                $this->createReviews();
            });
        } catch (\Throwable $e) {
            // The transaction rolled the rows back; do not leave their files behind.
            $this->cleaner->reset();
            throw $e;
        } finally {
            Carbon::setTestNow($previousClock);
        }

        return [
            'removed'           => $removed,
            'categories_seeded' => $categoriesSeeded,
            'statuses'          => $this->statusCounts(),
            'totals'            => $this->totals(),
            'credentials'       => $this->credentials(),
        ];
    }

    /**
     * @return array<string, int> table => rows removed
     */
    public function reset(): array
    {
        $this->assertNotProduction();

        return $this->cleaner->reset();
    }

    /**
     * @return array<string, int> what a reset would remove
     */
    public function preview(): array
    {
        return $this->cleaner->preview();
    }

    private function assertNotProduction(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Demo data cannot be created or removed in production.');
        }
    }

    /**
     * Adds the standard category taxonomy when the database has none. Categories are shared data, not demo rows, so
     * demo:reset never removes them.
     *
     * @return bool whether it had to add them
     */
    public function ensureCategories(): bool
    {
        if (Category::query()->exists()) {
            return false;
        }

        (new CategorySeeder())->run();

        return true;
    }

    // ── People and places ────────────────────────────────────────────────────

    private function email(string $local): string
    {
        return $local . '@' . config('demo.email_domain');
    }

    /** The hash of this account's demo password (config 'demo.accounts'), computed once per distinct password. */
    private function passwordHashFor(string $key): string
    {
        $password = (string) config("demo.accounts.{$key}.password");

        return $this->passwordHashes[$password] ??= Hash::make($password);
    }

    /**
     * @param array<string, mixed> $extra more columns, forced on (the profile fields of a real buyer, for instance)
     */
    private function newUser(string $key, string $role, string $first, string $last, string $sex, array $extra = []): User
    {
        $user = new User();
        $user->forceFill([
            'first_name'        => $first,
            'last_name'         => $last,
            'email'             => $this->email($key),
            // The only place a username is ever written: it is not fillable and no request can reach it.
            'username'          => mb_strtolower((string) config("demo.accounts.{$key}.username")),
            'phone'             => sprintf('0999000%04d', ++$this->phoneCounter),
            'password'          => $this->passwordHashFor($key),
            'date_of_birth'     => '1990-05-15',
            'sex'               => $sex,
            'role'              => $role,
            'status'            => 'active',
            'email_verified_at' => now(),
        ] + $extra)->save();

        return $this->users[$key] = $user;
    }

    /**
     * The profile fields a buyer has after registration and admin approval. Without them the web app treats a buyer's
     * profile as incomplete and sends every visit to /complete-profile.
     *
     * @return array<string, string>
     */
    private function buyerProfile(string $key): array
    {
        return [
            'government_id_type'       => 'national_id',
            'government_id_image_path' => $this->storeFile('ids', 'ids', "{$key}-buyer-id", 90, 110, 160),
            'buyer_application_status' => 'approved',
        ];
    }

    private function storeFile(string $disk, string $folder, string $name, int $r, int $g, int $b, int $w = 320, int $h = 240): string
    {
        $path = trim((string) config('demo.storage_prefix'), '/') . "/{$folder}/{$name}.png";
        Storage::disk($disk)->put($path, PlaceholderImage::png($w, $h, [$r, $g, $b]));

        return $path;
    }

    private function createPeopleAndPlaces(): void
    {
        $this->at($this->daysAgo(11));

        $admin = $this->newUser('admin', 'admin', 'Demo', 'Admin', 'female');

        // Sellers: an approved shop each, with a pickup address in Area A and Area B. A seller is a buyer whose seller
        // application was approved, exactly as the real flow leaves the database: users.role stays "buyer" (nothing
        // ever sets "seller"), the buyer profile fields of registration are filled, there is a default address, and
        // the seller_profiles row below carries the approval. So the account can shop as well as sell.
        foreach (['s1' => ['seller1', 'Marco', 'Santos', 'Marco Gadgets', 'A', 'male', 'Electronics and accessories'],
                  's2' => ['seller2', 'Liza', 'Reyes', 'Liza Pantry & Home', 'B', 'female', 'Snacks, pantry and home goods']] as $key => [$local, $first, $last, $shop, $area, $sex, $category]) {
            $user = $this->newUser($local, 'buyer', $first, $last, $sex, $this->buyerProfile($local));
            $this->addresses[$key . $area] = $this->newAddress($user, $area, 'home', $key === 's1' ? '12 Rizal Street' : '48 Mabini Street', true);
            $place = DemoPlaces::area($area);

            SellerProfile::forceCreate([
                'user_id'                   => $user->id,
                'shop_name'                 => $shop,
                'shop_category'             => $category,
                'shop_description'          => "Demo shop: {$category}.",
                'date_of_birth'             => '1990-05-15',
                'government_id_type'        => 'national_id',
                'government_id_number'      => 'DEMO-' . strtoupper($key),
                'government_id_number_hash' => hash('sha256', 'DEMO_' . $user->id),
                'government_id_image_path'  => $this->storeFile('ids', 'ids', "{$key}-id", 90, 110, 160),
                'address_province'          => $place['province'],
                'address_city'              => $place['city'],
                'address_barangay'          => $place['barangay'],
                'address_street'            => $key === 's1' ? '12 Rizal Street' : '48 Mabini Street',
                'address_province_code'     => $place['province_code'],
                'address_city_code'         => $place['city_code'],
                'address_barangay_code'     => $place['barangay_code'],
                'shop_contact_number'       => $user->phone,
                'logo_path'                 => $this->storeFile('public', 'shops', "{$key}-logo", $key === 's1' ? 40 : 160, $key === 's1' ? 90 : 60, $key === 's1' ? 180 : 50, 160, 160),
                'payout_gcash_number'       => $user->phone,
                'application_status'        => 'approved',
                'reviewed_by'               => $admin->id,
                'reviewed_at'               => $this->daysAgo(10),
                'submitted_at'              => $this->daysAgo(11),
            ]);
        }

        // Buyers, each with saved addresses carrying PSGC codes.
        $b1 = $this->newUser('buyer1', 'buyer', 'Ana', 'Cruz', 'female', $this->buyerProfile('buyer1'));
        $b2 = $this->newUser('buyer2', 'buyer', 'Ben', 'Dela Cruz', 'male', $this->buyerProfile('buyer2'));
        $this->addresses['b1A'] = $this->newAddress($b1, 'A', 'home', '5 Sampaguita Street', true);
        $this->addresses['b1B'] = $this->newAddress($b1, 'B', 'home', '21 Narra Avenue', false);
        $this->addresses['b2A'] = $this->newAddress($b2, 'A', 'office', '9 Acacia Street', false);
        $this->addresses['b2B'] = $this->newAddress($b2, 'B', 'home', '33 Molave Street', true);
        $this->addresses['b2C'] = $this->newAddress($b2, 'C', 'home', '7 Gumamela Street', false);
        $this->addresses['b1C'] = $this->newAddress($b1, 'C', 'office', '2 Ipil Street', false);

        // The hub and its owner (a hub owner holds the buyer role, as in registration).
        $owner = $this->newUser('hub', 'buyer', 'Hector', 'Bautista', 'male', $this->buyerProfile('hub'));
        $home = DemoPlaces::area('A');
        $this->hub = SortingCenter::create([
            'user_id'            => $owner->id,
            'hub_name'           => 'Demo Sorting Hub - Santa Cruz',
            'address_province'   => $home['province'],
            'address_city'       => $home['city'],
            'address_barangay'   => $home['barangay'],
            'address_street'     => '100 Hub Road',
            'dti_permit_path'    => $this->storeFile('ids', 'ids', 'hub-dti', 120, 120, 120),
            'coverage_barangays' => DemoPlaces::barangayCodes(),
            'status'             => SortingCenter::STATUS_APPROVED,
            'reviewed_by'        => $admin->id,
            'reviewed_at'        => $this->daysAgo(10),
        ]);

        // Riders: two active with their areas, one applicant waiting for vetting.
        foreach (['r1' => ['rider1', 'Juan', 'Dela Rosa', 'Motorcycle', 'DEM-1001', 'A'],
                  'r2' => ['rider2', 'Pedro', 'Mendoza', 'Tricycle', 'DEM-2002', 'B']] as $key => [$local, $first, $last, $vehicle, $plate, $area]) {
            $user = $this->newUser($local, 'rider', $first, $last, 'male');
            $rider = $this->newRider($user, $vehicle, $plate, Rider::STATUS_ACTIVE, $key, $owner);
            $place = DemoPlaces::area($area);
            RiderAreaAssignment::create([
                'rider_id'           => $rider->id,
                'sorting_center_id'  => $this->hub->id,
                'area_label'         => $place['label'] . ' - ' . $place['city'],
                'coverage_barangays' => [$place['barangay_code']],
                'is_active'          => true,
            ]);
            $this->riders[$key] = $rider;
        }

        $applicant = $this->newUser('rider3', 'rider', 'Carlo', 'Navarro', 'male');
        $this->riders['r3'] = $this->newRider($applicant, 'Car', 'DEM-3003', Rider::STATUS_PENDING, 'r3', null);
    }

    private function newAddress(User $user, string $area, string $label, string $street, bool $default): Address
    {
        $place = DemoPlaces::area($area);

        return Address::create([
            'user_id'       => $user->id,
            'full_name'     => "{$user->first_name} {$user->last_name}",
            'phone'         => $user->phone,
            'address'       => $street,
            'province'      => $place['province'],
            'district'      => $place['city'],
            'ward'          => $place['barangay'],
            'province_code' => $place['province_code'],
            'city_code'     => $place['city_code'],
            'barangay_code' => $place['barangay_code'],
            'label'         => $label,
            'is_default'    => $default,
        ]);
    }

    private function newRider(User $user, string $vehicle, string $plate, string $status, string $key, ?User $reviewer): Rider
    {
        $active = $status === Rider::STATUS_ACTIVE;

        return Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $this->hub->id,
            'vehicle_type'         => $vehicle,
            'plate_number'         => $plate,
            'or_cr_path'           => $this->storeFile('ids', 'ids', "{$key}-orcr", 150, 120, 60),
            'drivers_license_path' => $this->storeFile('ids', 'ids', "{$key}-license", 60, 150, 120),
            'status'               => $status,
            'reviewed_by'          => $active ? $reviewer?->id : null,
            'reviewed_at'          => $active ? $this->daysAgo(10) : null,
            'submitted_at'         => $this->daysAgo($active ? 11 : 1),
        ]);
    }

    // ── Catalog ──────────────────────────────────────────────────────────────

    private function createCatalog(): void
    {
        $categoryId = fn (string $slug) => Category::where('slug', $slug)->value('id')
            ?? Category::whereNotNull('parent_id')->value('id');

        $items = [
            's1' => [
                ['USB-C Fast Charger 20W', 'chargers-powerbanks', 'Compact fast charger with USB-C cable.', [['White', 399], ['Black', 399]], [200, 120, 60]],
                ['Wireless Earbuds', 'earphones-audio', 'Bluetooth earbuds with charging case.', [['Standard', 899]], [60, 60, 200]],
                ['Phone Case (Clear)', 'phone-accessories', 'Shock-absorbing clear case.', [['iPhone 13', 249], ['Galaxy S22', 249]], [90, 180, 190]],
                ['Power Bank 10,000 mAh', 'chargers-powerbanks', 'Slim power bank with two ports.', [['Standard', 749]], [200, 80, 80]],
            ],
            's2' => [
                ['Kapeng Barako Ground Coffee 250g', 'beverages', 'Locally roasted Batangas coffee.', [['250g', 285]], [120, 80, 40]],
                ['Banana Chips (Family Pack)', 'snacks', 'Crunchy sweet banana chips.', [['300g', 165]], [220, 180, 50]],
                ['Bamboo Storage Basket', 'storage-organization', 'Hand-woven basket for the home.', [['Small', 320], ['Large', 480]], [160, 130, 80]],
                ['Cotton Throw Pillow Cover', 'home-decor', 'Soft cover, 18 x 18 inches.', [['Teal', 210], ['Mustard', 210]], [40, 160, 150]],
            ],
        ];

        foreach ($items as $sellerKey => $products) {
            $seller = $this->users['seller' . substr($sellerKey, 1)];
            foreach ($products as $i => [$name, $slug, $description, $variants, $rgb]) {
                $product = Product::forceCreate([
                    'seller_id'   => $seller->id,
                    'category_id' => $categoryId($slug),
                    'name'        => $name,
                    'description' => $description,
                    'base_price'  => $variants[0][1],
                    'status'      => 'active',
                    'weight_kg'   => 0.4,
                    'sku'         => strtoupper($sellerKey) . '-DEMO-' . ($i + 1),
                ]);

                ProductImage::create([
                    'product_id' => $product->id,
                    'path'       => $this->storeFile('public', 'products', "{$sellerKey}-p" . ($i + 1), $rgb[0], $rgb[1], $rgb[2]),
                    'is_primary' => true,
                    'sort_order' => 0,
                ]);

                foreach ($variants as [$label, $price]) {
                    $variant = ProductVariant::create([
                        'product_id'     => $product->id,
                        'label'          => $label,
                        'sku'            => $product->sku . '-' . strtoupper(Str::substr(Str::slug($label), 0, 4)),
                        'price'          => $price,
                        'stock_quantity' => 80,
                    ]);
                    $this->catalog[$sellerKey][] = ['product' => $product, 'variant' => $variant];
                }
            }
        }
    }

    // ── Scenarios ────────────────────────────────────────────────────────────

    /**
     * One entry per demo order. "steps" are run in order after placing the order; "ago" is how many minutes before now
     * the LAST step happened (earlier steps are spaced backwards from it, so nothing is ever in the future).
     * Riders: "pr" collects the pickup, "dr" delivers. "slow" stretches the wait at the hub past the 48 hour SLA.
     *
     * @return array<int, array<string, mixed>>
     */
    private function scenarios(): array
    {
        $to = fn (string $last) => array_slice(self::JOURNEY, 0, array_search($last, self::JOURNEY, true) + 1);

        $a = ['s' => 's1', 'pr' => 'r1', 'dr' => 'r1', 'dest' => 'A'];
        $b = ['s' => 's2', 'pr' => 'r2', 'dr' => 'r2', 'dest' => 'B'];

        $rows = [
            // One order at every status. The label says what it is for.
            ['PLACED, GCash awaiting verification', 'b1', 'gcash', [], 150] + $a,
            ['PLACED, COD', 'b2', 'cod', [], 300] + ['dest' => 'B'] + $b,
            ['CONFIRMED', 'b2', 'cod', $to('confirm'), 1500] + $a,
            ['PREPARING', 'b1', 'gcash', $to('prepare'), 2000] + $b,
            ['READY_FOR_PICKUP, unclaimed (rider 1 sees it under Available)', 'b1', 'cod', $to('ready'), 2800] + $a,
            ['READY_FOR_PICKUP, accepted by rider 1 (My pickups)', 'b2', 'gcash', $to('accept'), 2900] + ['dest' => 'B'] + $a,
            ['PICKED_UP, waiting for hub intake', 'b1', 'cod', $to('pickup'), 3400] + ['dest' => 'A'] + $b,
            ['AT_SORTING_CENTER, bound for Area C (no rider covers it)', 'b2', 'gcash', $to('intake'), 120] + ['dest' => 'C'] + $a,
            ['SORTED for Area B (1 of 2)', 'b1', 'cod', $to('sort'), 600] + $b,
            ['SORTED for Area B (2 of 2)', 'b2', 'gcash', $to('sort'), 900] + ['dest' => 'B'] + $a,
            ['ASSIGNED_TO_RIDER, rider 1', 'b1', 'cod', $to('assign'), 300] + $a,
            ['ASSIGNED_TO_RIDER, rider 2', 'b2', 'gcash', $to('assign'), 400] + $b,
            ['OUT_FOR_DELIVERY, rider 1, COD, with a chat', 'b1', 'cod', $to('start'), 90, 'chat' => true] + $a,
            ['OUT_FOR_DELIVERY, rider 2, GCash', 'b2', 'gcash', $to('start'), 200] + $b,
            ['DELIVERED awaiting confirmation, COD collected', 'b1', 'cod', $to('deliver'), 1300] + $a,
            ['DELIVERED awaiting confirmation, prepaid', 'b2', 'gcash', $to('deliver'), 2100] + $b,
            ['DELIVERY_FAILED, 1 attempt', 'b1', 'cod', [...$to('start'), 'fail'], 500] + $a,
            ['DELIVERY_FAILED, 3 attempts (the limit)', 'b2', 'gcash', [...$to('start'), 'fail', 'reschedule', 'start', 'fail', 'reschedule', 'start', 'fail'], 400] + $b,
            ['RETURNED to the seller after 2 failed attempts', 'b1', 'cod', [...$to('start'), 'fail', 'reschedule', 'start', 'fail', 'return'], 2600] + $a,
            ['DISPUTED, return requested after delivery', 'b2', 'gcash', [...$to('deliver'), 'dispute'], 900] + $b,
            ['CANCELLED by the buyer', 'b1', 'gcash', ['cancel'], 6000] + ['s' => 's2', 'dest' => 'B'],
            ['COMPLETED, escrow date set', 'b1', 'cod', $to('complete'), 1800] + $a,
            // Extra history so earnings, history and the hub reports have something to show.
            ['COMPLETED, rider 2', 'b2', 'gcash', $to('complete'), 3000] + $b,
            ['COMPLETED, late (waited at the hub past 48 hours)', 'b1', 'cod', $to('complete'), 4200, 'slow' => true] + $b,
            ['COMPLETED, rider 1', 'b2', 'cod', $to('complete'), 5400] + ['dest' => 'A'] + $a,
            ['COMPLETED, late, rider 2', 'b1', 'gcash', $to('complete'), 6600, 'slow' => true] + $b,
            ['COMPLETED, oldest', 'b2', 'cod', $to('complete'), 7400] + $a,
            ['DELIVERED, rider 1', 'b1', 'gcash', $to('deliver'), 700] + $a,
            ['DELIVERED after rider 1 failed it, delivered by rider 2', 'b2', 'cod', [...$to('start'), 'fail', 'reschedule:r2', 'start:r2', 'deliver:r2'], 1100] + ['dr' => 'r1'] + $b,
        ];

        return array_map(function (array $r) {
            $named = [
                'label' => $r[0], 'buyer' => $r[1], 'payment' => $r[2], 'steps' => $r[3], 'ago' => $r[4],
                'seller' => $r['s'], 'pr' => $r['pr'] ?? ($r['s'] === 's1' ? 'r1' : 'r2'), 'dr' => $r['dr'] ?? 'r1', 'dest' => $r['dest'],
                'chat' => $r['chat'] ?? false, 'slow' => $r['slow'] ?? false,
            ];

            return $named;
        }, $rows);
    }

    private function runScenarios(): void
    {
        foreach ($this->scenarios() as $index => $spec) {
            $this->runScenario($index, $spec);
        }
    }

    /**
     * @param array<string, mixed> $spec
     */
    private function runScenario(int $index, array $spec): void
    {
        $steps = $spec['steps'];

        // Work out when every step happens, counting back from the last one.
        $times = [];
        $cursor = $this->baseNow->copy()->subMinutes((int) $spec['ago']);
        for ($i = count($steps) - 1; $i >= 0; $i--) {
            $times[$i] = $cursor->copy();
            $cursor = $cursor->copy()->subMinutes($this->gap($steps[$i], $spec));
        }
        // With no steps the order was placed "ago" minutes back; otherwise just before the first step.
        $this->at($cursor);
        $order = $this->placeOrder($spec, $index);
        $parcel = null;

        foreach ($steps as $i => $token) {
            $this->at($times[$i]);
            [$step, $riderKey] = array_pad(explode(':', $token, 2), 2, null);
            $parcel = $this->performStep($step, $order, $parcel, $spec, $riderKey);
            $order = Order::find($order->id);
        }

        if ($spec['chat'] && $parcel) {
            $this->createChat(Parcel::find($parcel->id), $spec);
        }

        $this->created[] = ['label' => $spec['label'], 'order_id' => $order->id];
    }

    private function gap(string $token, array $spec): int
    {
        $step = explode(':', $token, 2)[0];
        $gap = self::GAPS[$step];

        // A "slow" parcel sits at the hub for about 2 extra days before it is handed to a rider.
        return ($step === 'assign' && $spec['slow']) ? $gap + 2400 : $gap;
    }

    private function at(Carbon $time): void
    {
        Carbon::setTestNow($time);
    }

    private function daysAgo(int $days): Carbon
    {
        return $this->baseNow->copy()->subDays($days);
    }

    // ── Placing an order (mirrors BuyerOrderController::placeOrder) ─────────

    /**
     * @param array<string, mixed> $spec
     */
    private function placeOrder(array $spec, int $index): Order
    {
        $buyer = $this->users['buyer' . substr($spec['buyer'], 1)];
        $address = $this->addresses[$spec['buyer'] . $spec['dest']] ?? throw new RuntimeException("No saved address for {$spec['buyer']} in Area {$spec['dest']}.");
        $options = $this->catalog[$spec['seller']];

        // One or two lines, chosen deterministically so the data is the same on every run.
        $lines = [$options[$index % count($options)]];
        if ($index % 3 === 0) {
            $lines[] = $options[($index + 2) % count($options)];
        }

        $subtotal = 0.0;
        $prepared = [];
        foreach ($lines as $n => $line) {
            /** @var Product $product */
            $product = $line['product'];
            /** @var ProductVariant $variant */
            $variant = $line['variant'];
            $qty = 1 + (($index + $n) % 2);

            $unit = (float) $variant->price;
            $lineSubtotal = round($unit * $qty, 2);
            $rate = PlatformSetting::getCommissionRateForCategory($product->category_id);
            $commission = round($lineSubtotal * $rate, 2);
            $image = $product->images()->first();

            $variant->decrement('stock_quantity', $qty);
            $product->increment('units_sold', $qty);

            $prepared[] = [
                'seller_id'         => $product->seller_id,
                'category_id'       => $product->category_id,
                'product_name'      => $product->name,
                'variant_label'     => $variant->label,
                'unit_price'        => $unit,
                'quantity'          => $qty,
                'subtotal'          => $lineSubtotal,
                'image_url'         => $image ? asset('storage/' . $image->path) : null,
                'commission_rate'   => $rate,
                'commission_amount' => $commission,
                'seller_earnings'   => round($lineSubtotal - $commission, 2),
                'payout_status'     => 'pending_release',
            ];
            $subtotal += $lineSubtotal;
        }

        $subtotal = round($subtotal, 2);
        $shipping = 99.00;
        $total = round($subtotal + $shipping, 2);
        $gcash = $spec['payment'] === 'gcash';

        $proof = $gcash ? $this->storeFile('public', 'payment-proofs', 'order-' . ++$this->fileCounter, 30, 110, 200) : null;

        $order = Order::create([
            'buyer_id'               => $buyer->id,
            'checkout_group_id'      => (string) Str::uuid(),
            'order_number'           => 'VEL-' . strtoupper(Str::random(4)) . '-' . now()->format('ymdHis'),
            'subtotal'               => $subtotal,
            'shipping_fee'           => $shipping,
            'total'                  => $total,
            'payment_method'         => $spec['payment'],
            // The column's enum has no "pending_verification" (see the report): an unverified GCash payment is "pending".
            'payment_status'         => 'pending',
            'status'                 => OrderStatus::PLACED->value,
            'payment_reference'      => $gcash ? 'GC' . (7000000000 + $index * 137) : null,
            'payment_proof_path'     => $proof,
            'shipping_name'          => $address->full_name,
            'shipping_phone'         => $address->phone,
            'shipping_address'       => $address->address,
            'shipping_province'      => $address->province,
            'shipping_city'          => $address->district,
            'shipping_barangay'      => $address->ward,
            'shipping_province_code' => $address->province_code,
            'shipping_city_code'     => $address->city_code,
            'shipping_barangay_code' => $address->barangay_code,
            'notes'                  => $index % 4 === 0 ? 'Please call on arrival.' : null,
        ]);

        DB::table('order_status_histories')->insert([
            'order_id'    => $order->id,
            'from_status' => null,
            'to_status'   => OrderStatus::PLACED->value,
            'actor_type'  => 'buyer',
            'actor_id'    => $buyer->id,
            'note'        => 'Order placed by customer',
            'created_at'  => now(),
        ]);

        foreach ($prepared as $item) {
            $order->items()->create($item);
        }

        Payment::create([
            'order_id'         => $order->id,
            'method'           => $spec['payment'],
            'reference_number' => $order->payment_reference,
            'amount'           => $total,
            'status'           => 'pending',
        ]);

        return $order;
    }

    // ── Steps (each mirrors the endpoint named in its comment) ──────────────

    /**
     * @param array<string, mixed> $spec
     */
    private function performStep(string $step, Order $order, ?Parcel $parcel, array $spec, ?string $riderKey): ?Parcel
    {
        $seller = $this->users['seller' . substr($spec['seller'], 1)];
        $buyer = $this->users['buyer' . substr($spec['buyer'], 1)];
        $hubUser = $this->users['hub'];
        $pickupRider = $this->riders[$spec['pr']];
        $deliveryRider = $this->riders[$riderKey ?? $spec['dr']];
        $parcel = $parcel ? Parcel::find($parcel->id) : Parcel::where('order_id', $order->id)->first();

        switch ($step) {
            case 'confirm': // SellerOrderController::confirmPayment
                if ($order->payment_method === 'gcash') {
                    $order->update(['payment_status' => 'paid', 'payment_verified_at' => now(), 'payment_verified_by' => $seller->id]);
                    Payment::where('order_id', $order->id)->update(['status' => 'paid', 'paid_at' => now()]);
                }
                $this->move($order, OrderStatus::CONFIRMED, 'seller', $seller, $order->payment_method === 'cod' ? 'COD order confirmed by merchant' : 'Payment verified and confirmed by merchant');
                break;

            case 'prepare':
                $this->move($order, OrderStatus::PREPARING, 'seller', $seller, 'Seller is preparing the order.');
                break;

            case 'ready': // creates the parcel, with its tracking number
                $this->move($order, OrderStatus::READY_FOR_PICKUP, 'seller', $seller, 'Ready for pickup.');
                $parcel = Parcel::where('order_id', $order->id)->firstOrFail();
                break;

            case 'accept': // RiderPickupController::accept
                $parcel->update(['pickup_rider_id' => $pickupRider->id, 'sorting_center_id' => $pickupRider->sorting_center_id, 'pickup_accepted_at' => now()]);
                break;

            case 'pickup': // RiderPickupController::confirm
                $this->move($order, OrderStatus::PICKED_UP, 'rider', $pickupRider->user, 'Picked up from the seller by the courier.', ['rider_id' => $pickupRider->id, 'tracking_number' => $parcel->tracking_number]);
                $parcel->update(['picked_up_at' => now()]);
                DeliveryLog::create(['parcel_id' => $parcel->id, 'rider_id' => $pickupRider->id, 'outcome' => DeliveryLog::OUTCOME_PICKED_UP, 'logged_at' => now()]);
                break;

            case 'intake': // HubParcelIntakeController::receive
                $this->move($order, OrderStatus::AT_SORTING_CENTER, 'hub', $hubUser, 'Received at the sorting center.', ['sorting_center_id' => $this->hub->id, 'tracking_number' => $parcel->tracking_number]);
                $parcel->update(['scanned_in_at' => now()]);
                break;

            case 'sort': // HubSortingController::sort
                $this->move($order, OrderStatus::SORTED, 'hub', $hubUser, 'Sorted at the sorting center.', ['sorting_center_id' => $this->hub->id, 'tracking_number' => $parcel->tracking_number, 'barangay_code' => $parcel->destination_barangay_code]);
                $parcel->update(['sorted_at' => now()]);
                break;

            case 'assign': // HubDispatchController::assign
            case 'reschedule': // HubDeliveryController::reschedule
                $this->move(
                    $order, OrderStatus::ASSIGNED_TO_RIDER, 'hub', $hubUser,
                    $step === 'assign' ? 'Assigned to a delivery rider.' : 'Rescheduled for another delivery attempt.',
                    ['sorting_center_id' => $this->hub->id, 'rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number]
                );
                $parcel->update(['assigned_rider_id' => $deliveryRider->id, 'assigned_at' => now()]);
                break;

            case 'start': // RiderDeliveryController::start
                $this->move($order, OrderStatus::OUT_FOR_DELIVERY, 'rider', $deliveryRider->user, 'Out for delivery with the courier.', ['rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number]);
                $parcel->update(['out_for_delivery_at' => now()]);
                break;

            case 'deliver': // RiderDeliveryController::delivered
                $this->move($order, OrderStatus::DELIVERED, 'rider', $deliveryRider->user, 'Delivered to the recipient by the courier.', ['rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number]);
                $receivedBy = $parcel->recipient_snapshot['name'] ?? 'Recipient';
                $parcel->update([
                    'delivered_at'        => now(),
                    'delivery_proof_path' => $this->storeFile('ids', 'delivery-proofs', $parcel->tracking_number, 70, 150, 90, 480, 320),
                    'received_by'         => $receivedBy,
                    'cod_collected_at'    => $parcel->cod_amount !== null ? now() : null,
                ]);
                DeliveryLog::create(['parcel_id' => $parcel->id, 'rider_id' => $deliveryRider->id, 'outcome' => DeliveryLog::OUTCOME_DELIVERED, 'logged_at' => now(), 'notes' => "Received by {$receivedBy}"]);
                break;

            case 'fail': // RiderDeliveryController::failed
                $attempts = (int) $parcel->delivery_attempts;
                $reason = [DeliveryFailureReason::RECIPIENT_UNAVAILABLE, DeliveryFailureReason::CANNOT_CONTACT, DeliveryFailureReason::ADDRESS_INACCESSIBLE][$attempts % 3];
                $note = $attempts === 0 ? 'Rang the bell twice, nobody answered.' : null;
                $this->move($order, OrderStatus::DELIVERY_FAILED, 'rider', $deliveryRider->user, 'Delivery failed: ' . $reason->label(), ['rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number, 'reason' => $reason->value]);
                $parcel->update(['failed_at' => now(), 'failure_reason' => $reason->value, 'failure_note' => $note, 'delivery_attempts' => $attempts + 1]);
                DeliveryLog::create(['parcel_id' => $parcel->id, 'rider_id' => $deliveryRider->id, 'outcome' => DeliveryLog::OUTCOME_DELIVERY_FAILED, 'logged_at' => now(), 'notes' => "{$reason->value}: {$reason->label()}" . ($note !== null ? " - {$note}" : '')]);
                break;

            case 'return': // HubDeliveryController::returnToSeller
                $this->move($order, OrderStatus::RETURNED, 'hub', $hubUser, 'Returned to the seller by the hub.', ['sorting_center_id' => $this->hub->id, 'tracking_number' => $parcel->tracking_number]);
                $parcel->update(['returned_at' => now(), 'return_note' => 'Recipient could not be reached after two attempts.']);
                break;

            case 'complete': // BuyerOrderController::confirmReceipt
                $this->move($order, OrderStatus::COMPLETED, 'buyer', $buyer, 'Buyer confirmed receipt');
                break;

            case 'dispute': // BuyerOrderController::requestReturn
                Dispute::updateOrCreate(
                    ['order_id' => $order->id],
                    ['buyer_id' => $buyer->id, 'reason' => 'Item not as described', 'description' => 'The case is cracked and does not match the photos.', 'status' => 'open']
                );
                $this->move($order, OrderStatus::DISPUTED, 'buyer', $buyer, 'Return requested: Item not as described');
                break;

            case 'cancel':
                $this->move($order, OrderStatus::CANCELLED, 'buyer', $buyer, 'Cancelled by the buyer.');
                break;

            default:
                throw new RuntimeException("Unknown demo step \"{$step}\".");
        }

        return $parcel;
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function move(Order $order, OrderStatus $to, string $actor, User $user, string $note, array $meta = []): void
    {
        $this->machine->transition(Order::find($order->id), $to, $actor, $user->id, $note, $meta);
    }

    // ── Reviews ──────────────────────────────────────────────────────────────

    /**
     * A few reviews on the COMPLETED demo orders, so the admin Reviews page has something to show.
     *
     * Buyers cannot submit reviews yet (there is no endpoint), so these rows are written straight into the Review
     * model the admin page reads. They are written here and nowhere else, they hang off demo buyers and demo products
     * (so demo:reset removes them), and they cover every rating band and moderation status, with one flagged review
     * waiting for moderation.
     */
    private function createReviews(): void
    {
        $buyerIds = collect($this->users)->only(['buyer1', 'buyer2'])->pluck('id');
        $orders = Order::whereIn('buyer_id', $buyerIds)
            ->where('status', OrderStatus::COMPLETED->value)
            ->with('items')
            ->orderBy('id')
            ->get();

        // rating, moderation status, flagged, days ago, comment, flag reason
        $plan = [
            [5, 'visible',        false, 6, 'Fast delivery and exactly as described. Will order again!', null],
            [4, 'visible',        false, 5, 'Good quality. The packaging could be a little better.', null],
            [5, 'visible',        false, 4, 'Great value for the price. The seller answered all my questions.', null],
            [3, 'pending_review', false, 3, 'The item is okay, but it arrived a day later than promised.', null],
            [2, 'pending_review', true,  2, 'Worst shop ever, total scam, do not buy from them!!!', 'Possible abusive language; reported by the seller.'],
            [1, 'hidden',         false, 1, 'This review was about a different product, so it was hidden.', null],
        ];

        foreach ($plan as $i => [$rating, $moderation, $flagged, $days, $comment, $flagReason]) {
            $order = $orders[$i] ?? null;
            $item = $order?->items->first();
            $product = $item ? Product::where('seller_id', $item->seller_id)->where('name', $item->product_name)->first() : null;
            if (! $order || ! $product) {
                continue;
            }

            $this->at($this->daysAgo($days));
            Review::forceCreate([
                'buyer_id'          => $order->buyer_id,
                'product_id'        => $product->id,
                'order_id'          => $order->id,
                'rating'            => $rating,
                'comment'           => $comment,
                'verified_purchase' => true,
                'flagged'           => $flagged,
                'flag_reason'       => $flagReason,
                'moderation_status' => $moderation,
            ]);
        }
    }

    // ── Chat ─────────────────────────────────────────────────────────────────

    /**
     * A rider-buyer thread on an out-for-delivery parcel: three messages, the last one unread by the buyer.
     *
     * @param array<string, mixed> $spec
     */
    private function createChat(Parcel $parcel, array $spec): void
    {
        $rider = $this->riders[$spec['dr']];
        $buyer = $this->users['buyer' . substr($spec['buyer'], 1)];

        [$thread] = $this->chat->openThread($rider, $parcel->tracking_number, RiderChatService::ROLE_BUYER);

        // Minutes after the delivery started (the clock is frozen at that moment).
        $startedAt = now()->copy();
        $lines = [
            [$rider->user, 'Hi! I have your parcel and I am heading to your area now.', 8],
            [$buyer, 'Great, thank you. I will be home all afternoon.', 12],
            [$rider->user, 'Arriving in about 10 minutes. Please prepare the payment.', 30],
        ];
        foreach ($lines as $n => [$sender, $body, $minutesAfter]) {
            $this->at($startedAt->copy()->addMinutes($minutesAfter));
            Message::forceCreate([
                'conversation_id' => $thread->id,
                'sender_id'       => $sender->id,
                'body'            => $body,
                'read_at'         => $n < 2 ? now() : null,
            ]);
        }

        // The buyer has not read the last message; the rider has read everything.
        Conversation::where('id', $thread->id)->update(['last_message_at' => $startedAt->copy()->addMinutes(30), 'buyer_unread' => 1, 'rider_unread' => 0]);
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    /** @return array<string, int> */
    private function statusCounts(): array
    {
        return DB::table('orders')
            ->whereIn('buyer_id', collect($this->users)->only(['buyer1', 'buyer2'])->pluck('id'))
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->map(fn ($n) => (int) $n)
            ->all();
    }

    /** @return array<string, int> */
    private function totals(): array
    {
        $demoUsers = collect($this->users)->pluck('id');
        $orderIds = DB::table('orders')->whereIn('buyer_id', $demoUsers)->pluck('id');

        return [
            'users'         => $demoUsers->count(),
            'products'      => DB::table('products')->whereIn('seller_id', $demoUsers)->count(),
            'orders'        => $orderIds->count(),
            'parcels'       => DB::table('parcels')->whereIn('order_id', $orderIds)->count(),
            'rider_earnings' => DB::table('rider_earnings')->whereIn('rider_id', collect($this->riders)->pluck('id'))->count(),
            'delivery_logs' => DB::table('delivery_logs')->whereIn('rider_id', collect($this->riders)->pluck('id'))->count(),
            'conversations' => DB::table('conversations')->whereIn('rider_id', $demoUsers)->count(),
            'disputes'      => DB::table('disputes')->whereIn('order_id', $orderIds)->count(),
            'reviews'       => DB::table('reviews')->whereIn('buyer_id', $demoUsers)->count(),
        ];
    }

    /** @return array<int, array{role: string, username: string, email: string, password: string}> */
    private function credentials(): array
    {
        $labels = [
            'admin' => 'Admin', 'seller1' => 'Seller 1 (Marco Gadgets, Area A)', 'seller2' => 'Seller 2 (Liza Pantry & Home, Area B)',
            'buyer1' => 'Buyer 1', 'buyer2' => 'Buyer 2', 'hub' => 'Hub (owner)',
            'rider1' => 'Rider 1 (active, Area A)', 'rider2' => 'Rider 2 (active, Area B)', 'rider3' => 'Rider 3 (applicant, PENDING)',
        ];

        return array_map(fn (string $key) => [
            'role'     => $labels[$key],
            'username' => (string) $this->users[$key]->username,
            'email'    => $this->users[$key]->email,
            'password' => (string) config("demo.accounts.{$key}.password"),
        ], array_keys($labels));
    }
}
