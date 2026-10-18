<?php

namespace Tests\Support;

use App\Models\Address;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SellerProfile;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * The workbook's Test Data sheet as fixtures: Seller 1 in Quezon City (NCR), Seller 2 in Cebu City (Visayas), the
 * buyer addresses ADDR-1 (Quezon City), ADDR-3 (Cebu City) and ADDR-4 (Itbayat, Batanes, not serviceable), and the
 * products and vouchers of the worked checkout example.
 */
trait BuildsCommerce
{
    /** PSGC codes of the test addresses: [region, province, city, barangay]. */
    protected array $qc = ['130000000', '130000000', '137404000', '137404001'];
    protected array $cebu = ['070000000', '072200000', '072217000', '072217001'];
    protected array $itbayat = ['020000000', '020900000', '020903000', '020903001'];

    private ?Category $commerceCategory = null;

    protected function buyer(): User
    {
        return User::forceCreate([
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'buyer.' . Str::lower(Str::random(10)) . '@example.com',
            'password' => Hash::make('Mamimili@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    protected function seller(string $name, array $codes, array $profile = []): User
    {
        $user = User::forceCreate([
            'first_name' => 'Seller', 'last_name' => Str::random(5), 'email' => 'seller.' . Str::lower(Str::random(10)) . '@example.com',
            'password' => Hash::make('Tindahan@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
        SellerProfile::create($profile + [
            'user_id' => $user->id, 'shop_name' => $name . ' ' . Str::random(4), 'shop_category' => 'Home & Living',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', Str::random(20)), 'government_id_image_path' => 'uploads/id.jpg', 'payout_gcash_number' => '09171112222',
            'application_status' => 'approved', 'address_street' => '1 Sample St', 'address_barangay' => 'Central',
            'address_city' => 'City', 'address_province' => 'Province',
            'address_region_code' => $codes[0], 'address_province_code' => $codes[1], 'address_city_code' => $codes[2], 'address_barangay_code' => $codes[3],
        ]);

        return $user->fresh('sellerProfile');
    }

    /**
     * @param  array<string, array{0: float, 1: int}>  $variants  label => [price, stock]
     * @return array{0: Product, 1: array<string, ProductVariant>}
     */
    protected function product(User $seller, string $name, array $variants, float $weightKg, array $extra = []): array
    {
        $this->commerceCategory ??= Category::create(['name' => 'Commerce ' . Str::random(6), 'slug' => 'commerce-' . Str::lower(Str::random(8)), 'is_active' => true]);
        $product = Product::create($extra + [
            'seller_id' => $seller->id, 'category_id' => $this->commerceCategory->id, 'name' => $name,
            'description' => '<p>A product used by the commerce tests.</p>', 'base_price' => min(array_column($variants, 0)),
            'status' => 'active', 'weight_kg' => $weightKg,
        ]);
        $rows = [];
        foreach ($variants as $label => [$price, $stock]) {
            $rows[$label] = ProductVariant::create(['product_id' => $product->id, 'label' => $label, 'sku' => 'SKU-' . Str::upper(Str::random(8)), 'price' => $price, 'stock_quantity' => $stock]);
        }

        return [$product, $rows];
    }

    protected function address(User $buyer, array $codes, bool $default = true): Address
    {
        return Address::create([
            'user_id' => $buyer->id, 'full_name' => 'Juan Miguel Dela Cruz', 'phone' => '+639171234567', 'address' => '45 Kalayaan Ave.',
            'province' => 'Province', 'district' => 'City', 'ward' => 'Barangay', 'region_code' => $codes[0],
            'province_code' => $codes[1], 'city_code' => $codes[2], 'barangay_code' => $codes[3], 'label' => 'home', 'is_default' => $default,
        ]);
    }

    protected function voucher(string $code, string $scope, ?User $seller, string $type, float $amount, float $minSpend, array $extra = []): Voucher
    {
        return Voucher::create($extra + [
            'seller_id' => $seller?->id, 'code' => $code, 'name' => $code, 'scope' => $scope, 'discount_type' => $type,
            'amount' => $amount, 'min_spend' => $minSpend, 'per_buyer_limit' => 1, 'claimable' => true, 'applies_to' => 'all',
            'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(),
        ]);
    }

    /** A unique code: the codes of the Test Data sheet with a random tail, since codes are unique platform-wide. */
    protected function code(string $base): string
    {
        return substr($base . Str::upper(Str::random(12)), 0, 12);
    }
}
