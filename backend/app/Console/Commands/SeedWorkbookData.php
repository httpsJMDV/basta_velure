<?php

namespace App\Console\Commands;

use App\Models\Address;
use App\Models\Category;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Models\SortingCenter;
use App\Models\StoreCategory;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * The black-box workbooks' Test Data sheet as real records: Buyers 1 and 2 with ADDR-1 to ADDR-4, Sellers 1 to 3,
 * Seller 1's store categories, products P-01 to P-07, the vouchers, Logistics 1 and 2 with their zones and the test
 * rates, and Riders 1 to 3. Safe to run again: everything is found by email, code or name first, and nothing that
 * already exists is overwritten (passwords included). It only adds; it never deletes.
 *
 * The barangay codes are placeholders that agree with each other (the shop, the hub, the riders' areas and the
 * addresses), which is what pickup offers and zones compare; the city, province and region codes are the real ones.
 * The admin account and its PLAT100 / FREESHIP vouchers use the first admin found.
 */
class SeedWorkbookData extends Command
{
    protected $signature = 'workbook:seed {--force : Run without asking}';

    protected $description = 'Create the accounts, products, vouchers and courier rates of the black-box test workbooks';

    // [region, province, city, barangay]
    private const QC_COMMONWEALTH = ['130000000', '130000000', '137404000', '137404023'];
    private const QC_CENTRAL = ['130000000', '130000000', '137404000', '137404026'];
    private const QC_FAIRVIEW = ['130000000', '130000000', '137404000', '137404050'];
    private const MAKATI_SAN_LORENZO = ['130000000', '130000000', '137602000', '137602020'];
    private const CEBU_LAHUG = ['070000000', '072200000', '072217000', '072217040'];
    private const CEBU_CAPITOL = ['070000000', '072200000', '072217000', '072217010'];
    private const ITBAYAT_RAELE = ['020000000', '020900000', '020903000', '020903005'];

    public function handle(): int
    {
        $db = config('database.connections.' . config('database.default') . '.database');
        if (! $this->option('force') && ! $this->confirm("Add the workbook test data to the database \"{$db}\"?")) {
            return self::FAILURE;
        }

        DB::transaction(function () {
            $buyer1 = $this->user('Juan Miguel', 'Dela Cruz', 'juanmiguel.delacruz@example.com', 'Mamimili@2026', '09171234567');
            $buyer2 = $this->user('Ana Marie', 'Reyes', 'anamarie.reyes@example.com', 'Suki#2026Ana', '09173456789');
            $this->address($buyer1, 'home', true, '45 Kalayaan Ave.', 'Central', 'Quezon City', 'Metro Manila', self::QC_CENTRAL, 'Juan Miguel Dela Cruz', '09171234567');
            $this->address($buyer1, 'office', false, '12F Pacific Tower, 6750 Ayala Ave.', 'San Lorenzo', 'Makati City', 'Metro Manila', self::MAKATI_SAN_LORENZO, 'Juan Miguel Dela Cruz', '09171234567');
            $this->address($buyer2, 'home', true, '78 Osmeña Blvd.', 'Capitol Site', 'Cebu City', 'Cebu', self::CEBU_CAPITOL, 'Ana Marie Reyes', '09173456789');
            $this->address($buyer1, 'home', false, 'Purok 2', 'Raele', 'Itbayat', 'Batanes', self::ITBAYAT_RAELE, 'Juan Miguel Dela Cruz', '09171234567');

            $seller1 = $this->seller('Maria Clara', 'Santos', 'mariaclara.santos@example.com', 'Tindahan@2026', 'Maria Clara Handicrafts', 'approved', 'Commonwealth', 'Quezon City', 'Metro Manila', self::QC_COMMONWEALTH);
            $seller2 = $this->seller('Roberto', 'Villanueva', 'roberto.villanueva@example.com', 'Gadget#Hub26', 'RV Gadget Hub', 'approved', 'Lahug', 'Cebu City', 'Cebu', self::CEBU_LAHUG);
            $this->seller('Lola', 'Tester', 'seller.test01@example.com', 'Tindahan@2026', 'Tindahan ni Lola', 'pending', 'Commonwealth', 'Quezon City', 'Metro Manila', self::QC_COMMONWEALTH);

            $cats = $this->storeCategories($seller1);
            $this->products($seller1, $seller2, $cats);
            $this->vouchers($seller1, $seller2, $buyer2);

            $this->couriers();
        });

        $this->table(['Ref', 'Login', 'Password'], [
            ['Buyer 1', 'juanmiguel.delacruz@example.com', 'Mamimili@2026'],
            ['Buyer 2', 'anamarie.reyes@example.com', 'Suki#2026Ana'],
            ['Seller 1', 'mariaclara.santos@example.com', 'Tindahan@2026'],
            ['Seller 2', 'roberto.villanueva@example.com', 'Gadget#Hub26'],
            ['Seller 3 (pending)', 'seller.test01@example.com', 'Tindahan@2026'],
            ['Logistics 1', 'operations@bilishatid.example.com', 'Hatid@2026'],
            ['Logistics 2', 'admin@agilacargo.example.com', 'Agila#Cargo26'],
            ['Rider 1', 'pedrojose.garcia@example.com', 'Rider@2026'],
            ['Rider 2', 'markanthony.bautista@example.com', 'Hatid#Mark26'],
            ['Rider 3 (suspended)', 'rider.test01@example.com', 'Rider@2026'],
        ]);
        $this->info('workbook:seed: done. Existing records were kept as they were.');

        return self::SUCCESS;
    }

    private function user(string $first, string $last, string $email, string $password, ?string $phone = null, string $role = 'buyer'): User
    {
        return User::where('email', $email)->first() ?? User::forceCreate([
            'first_name' => $first, 'last_name' => $last, 'email' => $email, 'phone' => $phone, 'password' => Hash::make($password),
            'role' => $role, 'status' => 'active', 'email_verified_at' => now(),
        ]);
    }

    private function address(User $u, string $label, bool $default, string $street, string $barangay, string $city, string $province, array $codes, string $name, string $phone): void
    {
        if (Address::where('user_id', $u->id)->where('address', $street)->exists()) {
            return;
        }
        Address::create([
            'user_id' => $u->id, 'full_name' => $name, 'phone' => $phone, 'address' => $street, 'province' => $province, 'district' => $city,
            'ward' => $barangay, 'region_code' => $codes[0], 'province_code' => $codes[1], 'city_code' => $codes[2], 'barangay_code' => $codes[3],
            'label' => $label, 'is_default' => $default && ! Address::where('user_id', $u->id)->where('is_default', true)->exists(),
        ]);
    }

    private function seller(string $first, string $last, string $email, string $password, string $shop, string $status, string $barangay, string $city, string $province, array $codes): User
    {
        $user = $this->user($first, $last, $email, $password, '0917' . random_int(1000000, 9999999));
        if (! $user->sellerProfile) {
            SellerProfile::create([
                'user_id' => $user->id, 'shop_name' => $shop, 'shop_category' => 'Home & Living', 'date_of_birth' => '1988-05-12',
                'government_id_type' => 'national_id', 'government_id_number' => '1234-5678-' . random_int(1000, 9999),
                'government_id_number_hash' => hash('sha256', Str::random(24)), 'government_id_image_path' => 'uploads/workbook-id.jpg',
                'payout_gcash_number' => '09171112222', 'application_status' => $status, 'address_street' => '1 Workbook St',
                'address_barangay' => $barangay, 'address_city' => $city, 'address_province' => $province, 'shop_contact_number' => '09171112222',
                'address_region_code' => $codes[0], 'address_province_code' => $codes[1], 'address_city_code' => $codes[2], 'address_barangay_code' => $codes[3],
            ]);
        }

        return $user->fresh('sellerProfile');
    }

    /** @return array<string, StoreCategory> */
    private function storeCategories(User $seller): array
    {
        $make = fn (string $name, ?StoreCategory $parent, int $order) => StoreCategory::firstOrCreate(
            ['seller_id' => $seller->id, 'name' => $name],
            ['parent_id' => $parent?->id, 'sort_order' => $order, 'is_visible' => true],
        );
        $decor = $make('Home Decor', null, 2);

        return [
            'bags' => $make('Bags', null, 1), 'decor' => $decor, 'lamps' => $make('Lamps', $decor, 1),
            'baskets' => $make('Baskets', $decor, 2), 'kitchen' => $make('Kitchen & Dining', null, 3),
        ];
    }

    private function category(string $name): Category
    {
        return Category::where('name', $name)->first() ?? Category::create(['name' => $name, 'slug' => Str::slug($name) . '-' . Str::lower(Str::random(4)), 'is_active' => true]);
    }

    private function products(User $s1, User $s2, array $cats): void
    {
        $add = function (User $seller, string $name, string $category, float $kg, array $dims, array $variants, array $types = [], ?StoreCategory $storeCat = null, ?int $limit = null) {
            if (Product::where('seller_id', $seller->id)->where('name', $name)->exists()) {
                return;
            }
            $product = Product::create([
                'seller_id' => $seller->id, 'category_id' => $this->category($category)->id, 'name' => $name,
                'description' => "<p>{$name}. Test product of the black-box workbooks.</p>", 'base_price' => min(array_column($variants, 1)),
                'status' => 'active', 'weight_kg' => $kg, 'dimension_l_cm' => $dims[0], 'dimension_w_cm' => $dims[1], 'dimension_h_cm' => $dims[2],
                'variation_types' => $types ?: null, 'purchase_limit' => $limit,
            ]);
            foreach ($variants as [$label, $price, $stock, $sku]) {
                ProductVariant::create(['product_id' => $product->id, 'label' => $label, 'sku' => $sku, 'price' => $price, 'stock_quantity' => $stock]);
            }
            if ($storeCat) {
                $product->storeCategories()->syncWithoutDetaching([$storeCat->id]);
            }
        };

        $tote = [];
        foreach (['Natural' => [10, 8, 5], 'Black' => [10, 0, 3]] as $color => $stocks) {
            foreach (['S' => 199, 'M' => 249, 'L' => 299] as $size => $price) {
                $tote[] = ["{$color} / {$size}", $price, array_shift($stocks), 'MCH-TOTE-' . strtoupper($color) . "-{$size}"];
            }
        }
        $add($s1, 'Abaca Woven Tote Bag', "Women's Bags", 0.4, [40, 35, 5], $tote, ['Color', 'Size'], $cats['bags']);
        $add($s1, 'Rattan Fruit Basket', 'Home & Living', 0.8, [30, 30, 15], [['Default', 450, 20, 'MCH-BASKET']], [], $cats['baskets']);
        $add($s1, 'Capiz Shell Lamp', 'Home & Living', 1.5, [30, 30, 40], [['Default', 1250, 1, 'MCH-LAMP']], [], $cats['lamps']);
        $add($s1, 'Banig Placemat Set of 4', 'Home & Living', 0.5, [40, 30, 2], [['Default', 350, 0, 'MCH-BANIG']], [], $cats['kitchen']);
        $add($s2, 'USB-C Fast Charger 20W', 'Mobile Accessories', 0.2, [10, 8, 5], [['Default', 399, 50, 'RV-CHARGER-20W']]);
        $add($s2, 'Wireless Earbuds X2', 'Mobile Accessories', 0.3, [10, 8, 4], [['Black', 1499, 10, 'RV-EARBUDS-BLK'], ['White', 1499, 10, 'RV-EARBUDS-WHT']], ['Color']);
        $add($s2, 'Power Bank 10000mAh', 'Mobile Accessories', 0.4, [14, 7, 2], [['Default', 899, 5, 'RV-POWERBANK']], [], null, 2);
    }

    private function vouchers(User $s1, User $s2, User $buyer2): void
    {
        $admin = User::where('role', 'admin')->orderBy('id')->first();
        $month = now()->endOfMonth();
        $rows = [
            ['MCH50', $s1, 'store', 'fixed', 50, null, 300, 100, true, now()->startOfMonth(), $month],
            ['MCH10', $s1, 'store', 'percent', 10, 100, 500, 50, true, now()->startOfMonth(), $month],
            ['RVSECRET', $s2, 'store', 'fixed', 100, null, 1000, 20, false, now()->startOfMonth(), now()->addMonths(2)],
            ['MCHOLD', $s1, 'store', 'fixed', 30, null, 200, null, true, now()->subMonth(), now()->subDay()->endOfDay()],
            ['MCHSOON', $s1, 'store', 'fixed', 30, null, 200, null, true, now()->addDay()->startOfDay(), now()->addMonth()],
            ['MCHMAX', $s1, 'store', 'fixed', 20, null, 100, 1, true, now()->startOfMonth(), $month],
            ['PLAT100', null, 'platform', 'fixed', 100, null, 1000, null, true, now()->startOfMonth(), now()->addMonths(2)],
            ['FREESHIP', null, 'shipping', 'fixed', 50, null, 300, null, true, now()->startOfMonth(), now()->addMonths(2)],
        ];
        foreach ($rows as [$code, $seller, $scope, $type, $amount, $cap, $min, $total, $claimable, $from, $to]) {
            if (Voucher::where('code', $code)->exists()) {
                continue;
            }
            Voucher::create([
                'seller_id' => $seller?->id, 'code' => $code, 'name' => $code, 'scope' => $scope, 'discount_type' => $type, 'amount' => $amount,
                'max_discount' => $cap, 'min_spend' => $min, 'total_limit' => $total, 'per_buyer_limit' => 1, 'claimable' => $claimable,
                'applies_to' => 'all', 'starts_at' => $from, 'ends_at' => $to, 'created_by' => $seller?->id ?? $admin?->id,
                // MCHMAX: its only use was taken by Buyer 2.
                'used_count' => $code === 'MCHMAX' ? 1 : 0,
            ]);
        }
    }

    private function couriers(): void
    {
        $bilis = $this->company('Bilis Hatid Express Inc.', 'bilis-hatid-express', 'BILIS', 'operations@bilishatid.example.com', 'Carlos Antonio', 'Mendoza', 'Hatid@2026', 'Quezon City', 'Metro Manila');
        $agila = $this->company('Agila Cargo Movers Corp.', 'agila-cargo-movers', 'AGILA', 'admin@agilacargo.example.com', 'Liza Mae', 'Fernandez', 'Agila#Cargo26', 'Davao City', 'Davao del Sur');

        // Logistics 1 covers the shop, ADDR-1 and ADDR-2, so checkout hands Seller 1's orders to it.
        $hub = SortingCenter::where('logistics_company_id', $bilis->id)->first() ?? SortingCenter::create([
            'logistics_company_id' => $bilis->id, 'user_id' => $this->user('Hub', 'Lead', 'hub.qc@bilishatid.example.com', 'Hatid@2026')->id,
            'hub_name' => 'Bilis Hatid QC Hub', 'address_province' => 'Metro Manila', 'address_city' => 'Quezon City', 'address_barangay' => 'Commonwealth',
            'address_street' => '88 Commonwealth Ave.', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => [self::QC_COMMONWEALTH[3], self::QC_CENTRAL[3], self::QC_FAIRVIEW[3], self::MAKATI_SAN_LORENZO[3]],
        ]);

        $zones = [];
        foreach (['NCR' => [['region', '130000000']], 'CALABARZON' => [['region', '040000000']], 'Visayas' => [['region', '060000000'], ['region', '070000000'], ['region', '080000000']]] as $name => $areas) {
            $zones[$name] = $this->zone($bilis, $name, $areas);
        }
        foreach ([['NCR', 'NCR', 50, 15], ['NCR', 'CALABARZON', 70, 20], ['CALABARZON', 'NCR', 70, 20], ['CALABARZON', 'CALABARZON', 55, 15],
            ['Visayas', 'NCR', 120, 40], ['NCR', 'Visayas', 120, 40], ['Visayas', 'Visayas', 60, 20]] as [$from, $to, $first, $extra]) {
            ShippingRate::firstOrCreate(
                ['origin_zone_id' => $zones[$from]->id, 'destination_zone_id' => $zones[$to]->id],
                ['logistics_company_id' => $bilis->id, 'first_kg' => $first, 'additional_kg' => $extra],
            );
        }
        $davao = $this->zone($agila, 'Davao Region', [['region', '110000000']]);
        ShippingRate::firstOrCreate(['origin_zone_id' => $davao->id, 'destination_zone_id' => $davao->id], ['logistics_company_id' => $agila->id, 'first_kg' => 55, 'additional_kg' => 15]);

        $this->rider($bilis, $hub, 'Pedro Jose', 'Garcia', 'pedrojose.garcia@example.com', 'Rider@2026', 'Motorcycle', '123ABC', 'N01-23-456789', [self::QC_COMMONWEALTH[3]], Rider::STATUS_ACTIVE);
        $this->rider($bilis, $hub, 'Mark Anthony', 'Bautista', 'markanthony.bautista@example.com', 'Hatid#Mark26', 'Van', 'NBC1234', 'N02-24-112233', [self::QC_FAIRVIEW[3]], Rider::STATUS_ACTIVE);
        $this->rider($bilis, $hub, 'Ramon', 'Cruz', 'rider.test01@example.com', 'Rider@2026', 'Motorcycle', '456DEF', 'N03-22-445566', [self::QC_CENTRAL[3]], Rider::STATUS_SUSPENDED);
    }

    private function company(string $name, string $slug, string $code, string $email, string $first, string $last, string $password, string $city, string $province): LogisticsCompany
    {
        $company = LogisticsCompany::where('slug', $slug)->first() ?? LogisticsCompany::create([
            'name' => $name, 'slug' => $slug, 'code' => $code, 'contact_email' => $email, 'contact_first_name' => $first, 'contact_last_name' => $last,
            'address_city' => $city, 'address_province' => $province, 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
            'reviewed_at' => now(), 'is_default' => false,
        ]);
        $owner = $this->user($first, $last, $email, $password);
        LogisticsCompanyMember::firstOrCreate(['logistics_company_id' => $company->id, 'user_id' => $owner->id], ['role' => 'owner']);
        if (! $company->owner_user_id) {
            $company->forceFill(['owner_user_id' => $owner->id])->save();
        }

        return $company;
    }

    private function zone(LogisticsCompany $company, string $name, array $areas): ShippingZone
    {
        $zone = ShippingZone::firstOrCreate(['logistics_company_id' => $company->id, 'name' => $name]);
        if (! $zone->areas()->exists()) {
            foreach ($areas as [$level, $code]) {
                $zone->areas()->create(['level' => $level, 'psgc_code' => $code, 'name' => $name]);
            }
        }

        return $zone;
    }

    private function rider(LogisticsCompany $company, SortingCenter $hub, string $first, string $last, string $email, string $password, string $vehicle, string $plate, string $license, array $areas, string $status): void
    {
        $user = $this->user($first, $last, $email, $password, '0918' . random_int(1000000, 9999999), 'rider');
        if (Rider::where('user_id', $user->id)->exists()) {
            return;
        }
        $rider = Rider::forceCreate([
            'user_id' => $user->id, 'logistics_company_id' => $company->id, 'sorting_center_id' => $hub->id, 'vehicle_type' => $vehicle,
            'plate_number' => $plate, 'license_number' => $license, 'license_expiry' => '2030-03-22', 'or_cr_path' => 'ids/workbook/or-cr.pdf',
            'drivers_license_path' => 'ids/workbook/license.jpg', 'status' => $status, 'submitted_at' => now(), 'activated_at' => now(),
            'reviewed_at' => now(), 'suspended_at' => $status === Rider::STATUS_SUSPENDED ? now() : null,
            'suspension_reason' => $status === Rider::STATUS_SUSPENDED ? 'Repeated late deliveries this week.' : null,
        ]);
        RiderAreaAssignment::create(['rider_id' => $rider->id, 'sorting_center_id' => $hub->id, 'area_label' => "{$first}'s area", 'coverage_barangays' => $areas, 'is_active' => true]);
    }
}
