<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The admin product detail carries the seller's shop profile, and its storefront slug is the slugged shop name
 * (the shop_slug used to read a column that does not exist, so it was always null).
 */
class AdminProductShopProfileTest extends TestCase
{
    use DatabaseTransactions;

    public function test_product_detail_includes_the_shop_profile_and_a_working_slug(): void
    {
        $admin = User::forceCreate([
            'first_name' => 'Super', 'last_name' => 'Admin', 'email' => 'admin.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'admin', 'status' => 'active',
        ]);
        $seller = User::forceCreate([
            'first_name' => 'Romulo', 'last_name' => 'Jules', 'email' => 'seller.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active',
        ]);
        SellerProfile::forceCreate([
            'user_id' => $seller->id, 'shop_name' => 'Basta Cellphone', 'shop_category' => 'Electronics', 'shop_description' => 'Phones and drinks',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'x' . $seller->id), 'government_id_image_path' => 'x.png',
            'address_province' => 'Laguna', 'address_city' => 'Santa Cruz', 'address_barangay' => 'Poblacion I',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
            'logo_path' => 'shops/logo.png', 'shop_contact_number' => '09171234567', 'reviewed_at' => now(),
        ]);
        $product = Product::forceCreate([
            'seller_id' => $seller->id, 'name' => 'Koka Tota', 'base_price' => 42, 'status' => 'pending_review',
        ]);

        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/products/{$product->id}")
            ->assertOk()
            ->assertJsonPath('data.seller.shop_name', 'Basta Cellphone')
            ->assertJsonPath('data.seller.shop_slug', 'basta-cellphone')
            ->assertJsonPath('data.seller.shop.category', 'Electronics')
            ->assertJsonPath('data.seller.shop.bio', 'Phones and drinks')
            ->assertJsonPath('data.seller.shop.city', 'Santa Cruz')
            ->assertJsonPath('data.seller.shop.province', 'Laguna')
            ->assertJsonPath('data.seller.shop.contact_number', '09171234567')
            ->assertJsonPath('data.seller.shop.banner_url', null)
            ->assertJson(fn ($json) => $json->where('data.seller.shop.logo_url', fn ($url) => str_ends_with($url, '/storage/shops/logo.png'))->etc());
    }
}
