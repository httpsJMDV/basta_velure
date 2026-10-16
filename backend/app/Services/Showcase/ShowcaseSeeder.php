<?php

namespace App\Services\Showcase;

use App\Models\Address;
use App\Models\Category;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Demo\PlaceholderImage;
use App\Services\MailNotifier;
use Carbon\Carbon;
use Database\Seeders\CategorySeeder;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Fills a database with a realistic marketplace (php artisan showcase:seed):
 *
 *  - one admin (username "admin", a password the caller chooses);
 *  - 40 approved sellers whose shops sell about 300 real products with real photos (database/data/showcase);
 *  - 3 partner courier companies, each with a hub in East, South and West Laguna and 3 riders per hub;
 *  - 220 buyers with saved addresses.
 *
 * Every account is created the way the real flows leave it: a buyer account (users.role stays "buyer") with a
 * complete buyer profile, plus the approved seller, courier, hub or rider row. Places are real Laguna PSGC codes, so
 * checkout, pickup and delivery work across the whole network. It only adds rows and refuses to run twice.
 *
 * Photos are downloaded first, outside the database transaction; if anything fails, the transaction rolls back and
 * the downloaded files are removed.
 */
class ShowcaseSeeder
{
    private const USER_AGENT = 'LovedIT-Capstone/1.0 (showcase seeding; https://loved-it.shop)';

    private const MALE = ['Juan', 'Jose', 'Mark', 'John Paul', 'Christian', 'Carlo', 'Miguel', 'Rafael', 'Paolo', 'Angelo', 'Gabriel', 'Joshua', 'Kenneth', 'Jerome', 'Ramon', 'Antonio', 'Francis', 'Vincent', 'Emmanuel', 'Patrick', 'Ryan', 'Noel', 'Rodel', 'Arnel', 'Jericho', 'Bryan', 'Dennis', 'Marvin', 'Ronald', 'Raymond', 'Joel', 'Allan', 'Elmer', 'Rogelio', 'Danilo', 'Enrico', 'Lorenzo', 'Nathaniel', 'Adrian', 'Kevin', 'Renz', 'Aldrin', 'Ian', 'Jomar', 'Kristoffer', 'Luis', 'Marco', 'Nico', 'Oliver', 'Reynaldo'];
    private const FEMALE = ['Maria', 'Ana', 'Kristine', 'Angelica', 'Mary Grace', 'Jasmine', 'Camille', 'Patricia', 'Nicole', 'Bea', 'Andrea', 'Joy', 'Rowena', 'Maricel', 'Lorna', 'Elena', 'Teresa', 'Carmela', 'Liza', 'Rosalie', 'Cristina', 'Janine', 'Princess', 'Hazel', 'Shiela', 'Mylene', 'Arlene', 'Marites', 'Divina', 'Gemma', 'Jocelyn', 'Kimberly', 'Lovely', 'Mae', 'Pauline', 'Queenie', 'Riza', 'Sofia', 'Trisha', 'Venus', 'Abegail', 'Bernadette', 'Clarissa', 'Danica', 'Erika', 'Faith', 'Grace', 'Irene', 'Katrina', 'Leah'];
    private const LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Tomas', 'Andrada', 'Castillo', 'Flores', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar', 'Mercado', 'Aguilar', 'Pascual', 'Gonzales', 'Lopez', 'Hernandez', 'Dela Cruz', 'De Leon', 'Del Rosario', 'Manalo', 'Soriano', 'Valdez', 'Domingo', 'Gutierrez', 'Marquez', 'Fernandez', 'Javier', 'Dizon', 'Sison', 'Evangelista', 'Mallari', 'Lim', 'Tan', 'Go', 'Sy', 'Panganiban', 'Bernardo', 'Corpuz', 'Esguerra', 'Ilagan', 'Lacson', 'Macaraeg', 'Natividad', 'Pangilinan', 'Quiambao', 'Robles', 'Samonte', 'Tolentino', 'Umali', 'Vergara', 'Zamora', 'Abad', 'Belmonte', 'Cabrera', 'Datu', 'Espiritu', 'Fajardo', 'Galang', 'Hidalgo', 'Ignacio', 'Jimenez', 'Katigbak', 'Laurel', 'Magsaysay', 'Nepomuceno', 'Ortega', 'Perez', 'Quizon', 'Rosales', 'Sarmiento', 'Tiongson'];
    private const STREETS = ['Rizal', 'Mabini', 'Bonifacio', 'Burgos', 'Luna', 'Del Pilar', 'Quezon', 'Aguinaldo', 'Gomez', 'Zamora', 'Sampaguita', 'Ilang-Ilang', 'Narra', 'Acacia', 'Molave', 'Kamagong', 'Mangga', 'Santol', 'Kalachuchi', 'Gumamela', 'Jasmin', 'Dama de Noche', 'P. Burgos', 'National Highway', 'Maharlika', 'San Roque', 'Sto. Niño', 'Bagong Silang', 'Malvar', 'Lakeshore'];
    private const PREFIXES = ['0917', '0918', '0919', '0927', '0935', '0939', '0945', '0947', '0956', '0961', '0966', '0975', '0977', '0995', '0998', '0999'];

    /** Partner couriers (fictional names; none imitates a real courier). */
    private const COURIERS = [
        ['Lakbay Express', 'LKX', 'Same-day and next-day parcel delivery across Laguna, from Santa Cruz to Santa Rosa.'],
        ['Agos Logistics', 'AGS', 'Door-to-door delivery for online sellers in Laguna, with cash-on-delivery remitted every day.'],
        ['Tulay Parcel Co.', 'TPC', 'Neighbourhood couriers who collect from your shop and bring it to your buyer anywhere in Laguna.'],
    ];

    /** The 40 shops: [name, product group, what they sell, short bio]. Products go to the shops of their group. */
    private const SHOPS = [
        ['ByteBox Gadgets', 'gadgets', 'Phones, tablets and laptops', 'Brand-new, sealed units with official warranty.'],
        ['Lakeside Electronics', 'gadgets', 'Phones, tablets and laptops', 'Your neighbourhood gadget store since 2015.'],
        ['PixelPoint Store', 'gadgets', 'Phones, tablets and laptops', 'Fair prices on phones and computers, shipped from Calamba.'],
        ['Kalye Tech Center', 'gadgets', 'Computers and accessories', 'Laptops, monitors and storage for work and school.'],
        ['Silangan Mobile', 'gadgets', 'Phones and tablets', 'Unlocked phones and tablets, checked before shipping.'],
        ['Case & Charge', 'mobile', 'Phone accessories', 'Chargers, cases and earbuds that last.'],
        ['Plug & Play Accessories', 'mobile', 'Phone accessories', 'Everything your phone needs, under one roof.'],
        ['Glow Getter Beauty', 'beauty', 'Makeup and skincare', 'Authentic makeup and skincare, never repacked.'],
        ['Bloom Skin & Scents', 'beauty', 'Fragrances and skincare', 'Perfumes and body care for every day.'],
        ["Aling Nena's Sari-Sari", 'grocery', 'Snacks and groceries', 'The sari-sari store of Santa Cruz, now online.'],
        ['Tindahan ni Mang Ben', 'grocery', 'Snacks and groceries', 'Merienda favourites and pantry staples.'],
        ['Santa Cruz Pantry', 'grocery', 'Groceries', 'Pantry staples delivered to your door.'],
        ['Los Baños Grocery Mart', 'grocery', 'Groceries', 'Groceries for students and families in Los Baños.'],
        ['Pagsanjan Snack Corner', 'grocery', 'Snacks and drinks', 'Chips, biscuits and drinks for every barkada.'],
        ['Bayan Mart', 'grocery', 'Groceries', 'Everyday groceries at palengke prices.'],
        ['Pinoy Pantry Express', 'grocery', 'Groceries', 'Filipino pantry favourites, fast.'],
        ['Kusina Supplies Co.', 'grocery', 'Cooking essentials', 'Sauces, seasonings and canned goods.'],
        ['Merienda House', 'grocery', 'Snacks and drinks', 'Sweet and salty snacks for merienda time.'],
        ['Lakeview Grocers', 'grocery', 'Groceries', 'Fresh stock every week from trusted suppliers.'],
        ["Kape't Kakanin Store", 'grocery', 'Coffee and snacks', 'Coffee, milk and kakanin-inspired treats.'],
        ['Suki Grocery', 'grocery', 'Groceries', 'Treating every buyer like a suki.'],
        ['Calamba Food Depot', 'grocery', 'Groceries and pet food', 'Bulk groceries and pet food for the whole household.'],
        ['Barrio Basics', 'grocery', 'Groceries', 'The basics, delivered to every barangay.'],
        ['Kitchen Kaibigan', 'kitchen', 'Kitchenware', 'Tools for every home cook.'],
        ['Cook & Co. Housewares', 'kitchen', 'Kitchenware', 'Durable kitchenware for busy kitchens.'],
        ['Lutong Bahay Kitchenware', 'kitchen', 'Kitchenware', 'Everything for home-cooked meals.'],
        ['Casa Laguna Home', 'home', 'Furniture and home decor', 'Furniture and decor for Filipino homes.'],
        ['Narra & Nook Furniture', 'home', 'Furniture and home decor', 'Solid furniture and cosy decor.'],
        ['Sportzone Laguna', 'sports', 'Sports equipment', 'Gear for ballers, runners and weekend warriors.'],
        ['Active Pinoy Sports', 'sports', 'Sports equipment', 'Sports equipment for school and play.'],
        ["Kuya's Closet", 'mens', "Men's fashion", "Men's shirts, jackets and shoes."],
        ['Ginoo Menswear', 'mens', "Men's fashion", 'Smart-casual menswear and footwear.'],
        ['Dalaga Boutique', 'womens', "Women's fashion", 'Tops and dresses for every occasion.'],
        ['Bestida Fashion', 'womens', "Women's fashion", 'Dresses and outerwear, true to size.'],
        ['Miss Laguna Closet', 'womens', "Women's fashion", 'Trendy pieces at friendly prices.'],
        ['Ate Style Shop', 'womens', "Women's fashion and shoes", 'Shoes and everyday wear for women.'],
        ['Timepiece Corner', 'accessories', 'Watches', 'Authentic watches with warranty.'],
        ['Shades & Gems', 'accessories', 'Sunglasses and jewelry', 'Sunglasses and jewelry that stand out.'],
        ['Bag It PH', 'accessories', 'Bags and wallets', 'Bags and wallets for work and travel.'],
        ['Luxe Lane Accessories', 'accessories', 'Watches and jewelry', 'Luxury watches and fine jewelry.'],
    ];

    /** @var array<string, mixed> */
    private array $places;

    /** @var array<int, array<string, mixed>> */
    private array $catalog;

    /** @var array<string, string> password hash per kind */
    private array $hashes = [];

    /** @var array<string, true> */
    private array $usedPhones = [];

    /** @var array<string, true> */
    private array $usedNames = [];

    /** @var array<string, array<int, string>> disk => files written by this run */
    private array $written = ['public' => [], 'ids' => [], 'local' => []];

    private ?\Closure $progress = null;

    private User $admin;

    private Carbon $now;

    /**
     * @return array{accounts: array<string, int>, products: int, photos: int, skipped_products: array<int, string>, couriers: array<int, string>}
     */
    public function run(string $adminPassword, ?callable $progress = null): array
    {
        if (User::whereIn('username', ['admin', 'buyer1', 'seller1', 'courier1', 'hub1', 'rider1'])->exists()) {
            throw new RuntimeException('Showcase accounts already exist (one of the usernames admin, buyer1, seller1, courier1, hub1 or rider1 is taken). Nothing was changed.');
        }
        if (mb_strlen($adminPassword) < 12) {
            throw new RuntimeException('The admin password must be at least 12 characters.');
        }

        $this->progress = $progress ? \Closure::fromCallable($progress) : null;
        $this->now = Carbon::now()->startOfMinute();
        mt_srand(20261016);
        $this->places = $this->load('places.json');
        $this->catalog = $this->load('products.json')['products'];
        $this->usedPhones = array_fill_keys(User::whereNotNull('phone')->pluck('phone')->all(), true);
        $this->ensureCategories();

        $this->say('Downloading product photos...');
        $photos = $this->downloadPhotos();

        try {
            return MailNotifier::muted(fn () => DB::transaction(fn () => $this->seed($adminPassword, $photos)));
        } catch (\Throwable $e) {
            foreach ($this->written as $disk => $paths) {
                Storage::disk($disk)->delete($paths);
            }
            throw $e;
        }
    }

    /**
     * @param array<int, array<int, string>> $photos product index => stored photo paths
     */
    private function seed(string $adminPassword, array $photos): array
    {
        $this->say('Creating the admin, couriers, hubs and riders...');
        $this->admin = $this->newUser('admin', 'admin', ['first' => 'Loved-IT', 'last' => 'Admin', 'sex' => null, 'dob' => null], $this->daysAgo(150), password: $adminPassword);
        $counts = ['admin' => 1, 'sellers' => 0, 'couriers' => 0, 'hubs' => 0, 'riders' => 0, 'buyers' => 0];
        $courierNames = [];

        $hubNo = 0;
        $riderNo = 0;
        foreach (self::COURIERS as $c => [$name, $code, $description]) {
            $owner = $this->newUser('courier' . ($c + 1), 'courier', $this->person(), $this->daysAgo(120 - $c));
            $company = $this->courierCompany($c, $name, $code, $description, $owner);
            LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $owner->id, 'role' => 'owner']);
            $courierNames[] = "{$company->name} ({$company->code})";
            $counts['couriers']++;

            foreach (array_keys($this->places['clusters']) as $k => $clusterKey) {
                $cluster = $this->places['clusters'][$clusterKey];
                $town = $cluster['towns'][($c + $k) % count($cluster['towns'])];
                $hubOwner = $this->newUser('hub' . (++$hubNo), 'hub', $this->person(), $this->daysAgo(110 - $hubNo));
                $hub = SortingCenter::create([
                    'logistics_company_id' => $company->id,
                    'user_id'              => $hubOwner->id,
                    'hub_name'             => "{$company->name} {$this->shortTown($town['name'])} Hub",
                    'address_province'     => $this->places['province'],
                    'address_city'         => $town['name'],
                    'address_barangay'     => $town['barangays'][0]['name'],
                    'address_street'       => mt_rand(10, 300) . ' ' . $this->pick(self::STREETS) . ' Street',
                    'dti_permit_path'      => $this->document('ids', "hub{$hubNo}-dti"),
                    'coverage_barangays'   => $this->clusterCodes($clusterKey),
                    'status'               => SortingCenter::STATUS_APPROVED,
                    'reviewed_by'          => $owner->id,
                    'reviewed_at'          => $this->daysAgo(100 - $hubNo),
                ]);
                $counts['hubs']++;

                // Riders: the cluster's towns are shared out among the hub's riders.
                $perHub = (int) config('showcase.counts.riders_per_hub', 3);
                for ($r = 0; $r < $perHub; $r++) {
                    $towns = array_values(array_filter($cluster['towns'], fn ($t, $i) => $i % $perHub === $r, ARRAY_FILTER_USE_BOTH));
                    $towns = $towns ?: [$cluster['towns'][$r % count($cluster['towns'])]];
                    $riderUser = $this->newUser('rider' . (++$riderNo), 'rider', $this->person('male'), $this->daysAgo(95 - $riderNo % 30));
                    $vehicle = $this->pick([Rider::VEHICLE_MOTORCYCLE, Rider::VEHICLE_MOTORCYCLE, Rider::VEHICLE_MOTORCYCLE, Rider::VEHICLE_TRICYCLE, Rider::VEHICLE_CAR]);
                    $rider = Rider::create([
                        'user_id'              => $riderUser->id,
                        'sorting_center_id'    => $hub->id,
                        'vehicle_type'         => $vehicle,
                        'plate_number'         => $this->plate($vehicle),
                        'or_cr_path'           => $this->document('ids', "rider{$riderNo}-orcr"),
                        'drivers_license_path' => $this->document('ids', "rider{$riderNo}-license"),
                        'status'               => Rider::STATUS_ACTIVE,
                        'reviewed_by'          => $hubOwner->id,
                        'reviewed_at'          => $this->daysAgo(90 - $riderNo % 30),
                        'submitted_at'         => $this->daysAgo(92 - $riderNo % 30),
                    ]);
                    RiderAreaAssignment::create([
                        'rider_id'           => $rider->id,
                        'sorting_center_id'  => $hub->id,
                        'area_label'         => implode(' & ', array_map(fn ($t) => $this->shortTown($t['name']), $towns)),
                        'coverage_barangays' => array_merge(...array_map(fn ($t) => array_column($t['barangays'], 'code'), $towns)),
                        'is_active'          => true,
                    ]);
                    $counts['riders']++;
                }
            }
        }

        $this->say('Creating the sellers and their products...');
        $shopsByGroup = [];
        foreach (self::SHOPS as $s => [$shopName, $group, $category, $bio]) {
            $seller = $this->newUser('seller' . ($s + 1), 'seller', $this->person(), $this->daysAgo(140 - $s));
            $place = $this->place();
            $street = mt_rand(1, 250) . ' ' . $this->pick(self::STREETS) . ' Street';
            $this->address($seller, $place, $street, 'home', true);
            SellerProfile::forceCreate([
                'user_id'                   => $seller->id,
                'shop_name'                 => $shopName,
                'shop_category'             => $category,
                'shop_description'          => "{$shopName}: {$category}, shipped from {$place['town']}, Laguna. {$bio}",
                'shop_bio'                  => $bio,
                'date_of_birth'             => $seller->date_of_birth,
                'government_id_type'        => 'national_id',
                'government_id_number'      => sprintf('%04d-%04d-%04d-%04d', mt_rand(1000, 9999), mt_rand(0, 9999), mt_rand(0, 9999), mt_rand(0, 9999)),
                'government_id_number_hash' => hash('sha256', 'SHOWCASE_' . $seller->id),
                'government_id_image_path'  => $this->document('ids', 'seller' . ($s + 1) . '-id'),
                'business_permit_path'      => $this->document('ids', 'seller' . ($s + 1) . '-permit'),
                'dti_sec_registration_path' => $this->document('ids', 'seller' . ($s + 1) . '-dti'),
                'fda_lto_path'              => $group === 'grocery' ? $this->document('ids', 'seller' . ($s + 1) . '-fda-lto') : null,
                'address_province'          => $place['province'],
                'address_city'              => $place['town'],
                'address_barangay'          => $place['barangay'],
                'address_street'            => $street,
                'address_province_code'     => $place['province_code'],
                'address_city_code'         => $place['town_code'],
                'address_barangay_code'     => $place['barangay_code'],
                'shop_contact_number'       => $seller->phone,
                'return_policy'             => 'Returns accepted within 7 days of delivery for items that arrive damaged or not as described.',
                'shipping_policy'           => 'Orders are packed within 1 to 2 days and handed to the courier you chose at checkout.',
                'business_hours'            => 'Mon to Sat, 8:00 AM to 6:00 PM',
                'payout_gcash_number'       => $seller->phone,
                'application_status'        => 'approved',
                'reviewed_by'               => $this->admin->id,
                'reviewed_at'               => $this->daysAgo(130 - $s),
                'submitted_at'              => $this->daysAgo(132 - $s),
            ]);
            $shopsByGroup[$group][] = ['user' => $seller, 'no' => $s + 1, 'count' => 0];
            $counts['sellers']++;
        }

        $categories = Category::pluck('id', 'slug');
        $fdaSlugs = Category::where('requires_fda', true)->pluck('slug')->flip();
        $turn = [];
        $products = 0;
        $photoCount = 0;
        $skipped = [];
        foreach ($this->catalog as $i => $item) {
            $paths = $photos[$i] ?? [];
            $categoryId = $categories[$item['category']] ?? null;
            $shops = $shopsByGroup[$item['group']] ?? [];
            if ($paths === [] || ! $categoryId || $shops === []) {
                $skipped[] = $item['name'];
                continue;
            }
            $turn[$item['group']] = ($turn[$item['group']] ?? -1) + 1;
            $shop = &$shopsByGroup[$item['group']][$turn[$item['group']] % count($shops)];
            $shop['count']++;
            $isFood = isset($fdaSlugs[$item['category']]);
            $created = $this->daysAgo(mt_rand(3, 90));
            $sku = sprintf('LIT-S%02d-%03d', $shop['no'], $shop['count']);

            $product = Product::forceCreate([
                'seller_id'            => $shop['user']->id,
                'category_id'          => $categoryId,
                'name'                 => Str::limit($item['name'], 250, ''),
                'description'          => $item['description'] . ($item['credit'] ? "\n\n{$item['credit']}" : ''),
                'base_price'           => $item['price'],
                'original_price'       => $item['original_price'],
                'status'               => 'active',
                'weight_kg'            => $this->weight($item),
                'dimension_l_cm'       => $item['dimensions']['l'] ?? null ?: null,
                'dimension_w_cm'       => $item['dimensions']['w'] ?? null ?: null,
                'dimension_h_cm'       => $item['dimensions']['h'] ?? null ?: null,
                'sku'                  => $sku,
                'fda_lto_path'         => $isFood ? $this->document('local', "{$sku}-fda-lto") : null,
                'fda_cpr_path'         => $isFood ? $this->document('local', "{$sku}-fda-cpr") : null,
                'net_weight_volume'    => $isFood ? ($item['food']['net'] ?? null) : null,
                'expiry_best_before'   => $isFood ? 'Best before date printed on the pack' : null,
                'ingredients'          => $isFood && ! empty($item['food']['ingredients']) ? Str::limit($item['food']['ingredients'], 495) : null,
                'storage_instructions' => $isFood ? 'Store in a cool, dry place away from direct sunlight. Once opened, keep sealed.' : null,
                'allergen_info'        => $isFood ? ($item['food']['allergens'] ?? null) : null,
                'created_at'           => $created,
                'updated_at'           => $created,
            ]);
            unset($shop);

            foreach ($paths as $n => $path) {
                ProductImage::create(['product_id' => $product->id, 'path' => $path, 'is_primary' => $n === 0, 'sort_order' => $n]);
                $photoCount++;
            }
            $labels = $item['variants'];
            foreach ($labels as $label) {
                ProductVariant::create([
                    'product_id'     => $product->id,
                    'label'          => $label,
                    'sku'            => $sku . ($label === 'Standard' ? '' : '-' . strtoupper(Str::slug($label, ''))),
                    'price'          => $item['price'],
                    'original_price' => $item['original_price'],
                    'stock_quantity' => max(5, intdiv((int) $item['stock'], count($labels))),
                ]);
            }
            $products++;
        }

        $this->say('Creating the buyers...');
        $buyers = (int) config('showcase.counts.buyers', 220);
        for ($b = 1; $b <= $buyers; $b++) {
            $buyer = $this->newUser("buyer{$b}", 'buyer', $this->person(), $this->daysAgo(mt_rand(1, 120)));
            $home = $this->place();
            $this->address($buyer, $home, mt_rand(1, 400) . ' ' . $this->pick(self::STREETS) . ' Street', 'home', true);
            if (mt_rand(1, 4) === 1) {
                $this->address($buyer, $this->place(), 'Unit ' . mt_rand(1, 30) . ', ' . $this->pick(self::STREETS) . ' Building', 'office', false);
            }
            $counts['buyers']++;
        }

        return [
            'accounts'         => $counts,
            'products'         => $products,
            'photos'           => $photoCount,
            'skipped_products' => $skipped,
            'couriers'         => $courierNames,
        ];
    }

    // ── Accounts ─────────────────────────────────────────────────────────────

    /**
     * @param array{first: string, last: string, sex: ?string, dob: ?string} $person
     */
    private function newUser(string $username, string $kind, array $person, Carbon $created, ?string $password = null): User
    {
        $isAdmin = $kind === 'admin';
        $user = new User();
        $user->forceFill([
            'first_name'        => $person['first'],
            'last_name'         => $person['last'],
            'email'             => $username . '@' . config('showcase.email_domain'),
            'username'          => $username,
            'phone'             => $this->phone(),
            'password'          => $password !== null ? Hash::make($password) : ($this->hashes[$kind] ??= Hash::make((string) config("showcase.passwords.{$kind}"))),
            'date_of_birth'     => $person['dob'],
            'sex'               => $person['sex'],
            'role'              => $isAdmin ? 'admin' : 'buyer',
            'status'            => 'active',
            'email_verified_at' => $created,
            'created_at'        => $created,
            'updated_at'        => $created,
        ] + ($isAdmin ? [] : [
            // The buyer profile every account has after registration and approval, so nothing sends it to
            // /complete-profile. The ID photo is a placeholder.
            'government_id_type'       => $this->pick(['national_id', 'national_id', 'drivers_license', 'umid', 'postal_id', 'passport']),
            'government_id_image_path' => $this->document('ids', "{$username}-id"),
            'buyer_application_status' => 'approved',
        ]))->save();

        return $user;
    }

    /** A unique, plausible Filipino name, sex and birth date. */
    private function person(?string $sex = null): array
    {
        $sex ??= mt_rand(0, 1) ? 'male' : 'female';
        for ($try = 0; $try < 50; $try++) {
            $first = $this->pick($sex === 'male' ? self::MALE : self::FEMALE);
            $last = $this->pick(self::LAST);
            if (! isset($this->usedNames["{$first} {$last}"])) {
                break;
            }
        }
        $this->usedNames["{$first} {$last}"] = true;

        return ['first' => $first, 'last' => $last, 'sex' => $sex, 'dob' => sprintf('%04d-%02d-%02d', mt_rand(1972, 2005), mt_rand(1, 12), mt_rand(1, 28))];
    }

    private function phone(): string
    {
        do {
            $phone = $this->pick(self::PREFIXES) . str_pad((string) mt_rand(0, 9999999), 7, '0', STR_PAD_LEFT);
        } while (isset($this->usedPhones[$phone]));
        $this->usedPhones[$phone] = true;

        return $phone;
    }

    private function courierCompany(int $index, string $name, string $code, string $description, User $owner): LogisticsCompany
    {
        $town = $this->places['clusters']['west']['towns'][$index % 3];
        $fields = [
            'name'                 => $name,
            'code'                 => $code,
            'slug'                 => Str::slug($name),
            'owner_user_id'        => $owner->id,
            'description'          => $description,
            'contact_email'        => $owner->email,
            'contact_phone'        => $owner->phone,
            'address_province'     => $this->places['province'],
            'address_city'         => $town['name'],
            'address_barangay'     => $town['barangays'][1]['name'] ?? $town['barangays'][0]['name'],
            'address_street'       => mt_rand(100, 900) . ' National Highway',
            'business_permit_path' => $this->document('ids', 'courier' . ($index + 1) . '-permit'),
            'status'               => LogisticsCompany::STATUS_APPROVED,
            'rejection_reason'     => null,
            'reviewed_by'          => $this->admin->id,
            'reviewed_at'          => $this->daysAgo(115 - $index),
            'submitted_at'         => $this->daysAgo(118 - $index),
        ];

        // The first partner takes over the default courier row (the courier of every hub, order and parcel recorded
        // before couriers existed) when nobody runs it yet, so older orders belong to a real partner too.
        $default = LogisticsCompany::find(LogisticsCompany::defaultId());
        if ($index === 0 && $default && ! $default->members()->exists()) {
            $default->forceFill($fields)->save();

            return $default;
        }

        return LogisticsCompany::forceCreate($fields + ['is_default' => false]);
    }

    // ── Places ───────────────────────────────────────────────────────────────

    /** A random real place: province, town and barangay with their PSGC codes. */
    private function place(): array
    {
        $cluster = $this->pick(array_values($this->places['clusters']));
        $town = $this->pick($cluster['towns']);
        $barangay = $this->pick($town['barangays']);

        return [
            'province' => $this->places['province'], 'province_code' => $this->places['province_code'],
            'town' => $town['name'], 'town_code' => $town['code'],
            'barangay' => $barangay['name'], 'barangay_code' => $barangay['code'],
        ];
    }

    /** @return array<int, string> every barangay code of the cluster's towns */
    private function clusterCodes(string $clusterKey): array
    {
        return array_merge(...array_map(fn ($t) => array_column($t['barangays'], 'code'), $this->places['clusters'][$clusterKey]['towns']));
    }

    private function address(User $user, array $place, string $street, string $label, bool $default): Address
    {
        return Address::create([
            'user_id'       => $user->id,
            'full_name'     => "{$user->first_name} {$user->last_name}",
            'phone'         => $user->phone,
            'address'       => $street,
            'province'      => $place['province'],
            'district'      => $place['town'],
            'ward'          => $place['barangay'],
            'province_code' => $place['province_code'],
            'city_code'     => $place['town_code'],
            'barangay_code' => $place['barangay_code'],
            'label'         => $label,
            'is_default'    => $default,
        ]);
    }

    private function shortTown(string $name): string
    {
        return preg_replace('/^City of /', '', $name);
    }

    // ── Files ────────────────────────────────────────────────────────────────

    /**
     * Downloads every product photo (a few at a time, retrying), keyed by product index. An Open Food Facts product has
     * one photo with a full-size and a smaller fallback; a full-size photo over 1.5 MB uses the fallback instead.
     *
     * @return array<int, array<int, string>>
     */
    private function downloadPhotos(): array
    {
        $slots = [];
        foreach ($this->catalog as $i => $item) {
            if ($item['source'] === 'openfoodfacts') {
                $slots["{$i}:0"] = array_values($item['images']);
            } else {
                foreach (array_values($item['images']) as $n => $url) {
                    $slots["{$i}:{$n}"] = [$url];
                }
            }
        }

        $stored = [];
        $pending = array_map(fn () => 0, $slots);
        for ($round = 1; $pending !== [] && $round <= 4; $round++) {
            $retry = [];
            foreach (array_chunk(array_keys($pending), 12) as $keys) {
                $responses = Http::pool(fn (Pool $pool) => array_map(
                    fn (string $key) => $pool->as($key)->withHeaders(['User-Agent' => self::USER_AGENT])->timeout(60)->get($slots[$key][$pending[$key]]),
                    $keys
                ));
                foreach ($keys as $key) {
                    $response = $responses[$key] ?? null;
                    $candidate = $pending[$key];
                    $hasFallback = isset($slots[$key][$candidate + 1]);
                    $ok = $response instanceof Response && $response->successful()
                        && str_starts_with(strtolower((string) $response->header('Content-Type')), 'image/') && strlen($response->body()) > 300;
                    if ($ok && ! ($hasFallback && strlen($response->body()) > 1_500_000)) {
                        $stored[$key] = $this->storePhoto($key, $this->catalog[(int) $key], $response);
                    } else {
                        $retry[$key] = $hasFallback ? $candidate + 1 : $candidate;
                    }
                }
            }
            $pending = $retry;
            $this->say('  ' . count($stored) . ' photos saved' . ($pending ? ', ' . count($pending) . ' to retry' : ''));
        }

        $photos = [];
        ksort($stored, SORT_NATURAL);
        foreach ($stored as $key => $path) {
            [$i] = explode(':', $key);
            $photos[(int) $i][] = $path;
        }

        return $photos;
    }

    private function storePhoto(string $key, array $item, Response $response): string
    {
        $type = strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0]));
        $ext = ['image/webp' => 'webp', 'image/png' => 'png', 'image/gif' => 'gif'][$type] ?? 'jpg';
        $n = (int) explode(':', $key)[1];
        $path = trim((string) config('showcase.storage_prefix'), '/') . '/products/' . Str::slug($item['source'] . '-' . $item['source_id'] . '-' . Str::limit($item['name'], 40, '')) . "-{$n}.{$ext}";
        Storage::disk('public')->put($path, $response->body());
        $this->written['public'][] = $path;

        return $path;
    }

    /** A placeholder document image (ID photo, permit, FDA licence) on a private disk. */
    private function document(string $disk, string $name): string
    {
        $path = trim((string) config('showcase.storage_prefix'), '/') . "/documents/{$name}.png";
        $shade = crc32($name);
        Storage::disk($disk)->put($path, PlaceholderImage::png(320, 220, [90 + $shade % 100, 100 + intdiv($shade, 100) % 100, 120 + intdiv($shade, 10000) % 100]));
        $this->written[$disk][] = $path;

        return $path;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function ensureCategories(): void
    {
        $needed = array_unique(array_column($this->catalog, 'category'));
        if (Category::whereIn('slug', $needed)->count() < count($needed)) {
            (new CategorySeeder())->run();
        }
    }

    private function weight(array $item): float
    {
        if (! empty($item['food']['net']) && preg_match('/([\d.]+)\s*(kg|l|g|ml)\b/i', (string) $item['food']['net'], $m)) {
            $grams = (float) $m[1] * (in_array(strtolower($m[2]), ['kg', 'l'], true) ? 1000 : 1);

            return round(max(0.05, $grams / 1000 * 1.1), 2);
        }

        return ['laptops' => 2.2, 'smartphones' => 0.5, 'furniture' => 18.0, 'home-decor' => 1.5, 'kitchenware' => 0.8, 'fitness-equipment' => 1.2,
            'mens-footwear' => 1.0, 'womens-footwear' => 0.9, 'bags-wallets' => 0.8, 'pet-food' => 2.0, 'pantry-staples' => 1.0][$item['category']] ?? 0.4;
    }

    private function plate(string $vehicle): string
    {
        $letters = chr(mt_rand(65, 90)) . chr(mt_rand(65, 90)) . chr(mt_rand(65, 90));

        return in_array($vehicle, [Rider::VEHICLE_MOTORCYCLE, Rider::VEHICLE_TRICYCLE], true)
            ? mt_rand(100, 999) . ' ' . $letters
            : $letters . ' ' . mt_rand(1000, 9999);
    }

    private function daysAgo(int $days): Carbon
    {
        return $this->now->copy()->subDays(max(0, $days))->subMinutes(mt_rand(0, 600));
    }

    /**
     * @template T
     * @param array<int, T> $items
     * @return T
     */
    private function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }

    private function load(string $file): array
    {
        $path = database_path("data/showcase/{$file}");
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (! is_array($data)) {
            throw new RuntimeException("Missing or unreadable showcase data: {$path}");
        }

        return $data;
    }

    private function say(string $line): void
    {
        if ($this->progress) {
            ($this->progress)($line);
        }
    }
}
