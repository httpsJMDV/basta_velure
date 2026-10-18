<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The storefront catalog: category filters by slug (what the web app sends), the shuffled "Discover" grid, the
 * category tree with covers, and the seller's own discounts (there are no platform vouchers).
 */
class StorefrontCatalogTest extends TestCase
{
    use DatabaseTransactions;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Cache::forget('storefront.categories');

        $this->seller = User::forceCreate([
            'first_name' => 'Marco', 'last_name' => 'Santos', 'email' => 'seller.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active',
        ]);
        SellerProfile::forceCreate([
            'user_id' => $this->seller->id, 'shop_name' => 'Shop ' . uniqid(), 'shop_category' => 'x', 'shop_description' => 'x',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'x' . $this->seller->id), 'government_id_image_path' => 'x.png',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
        ]);
    }

    private function category(string $slug, ?int $parentId = null): Category
    {
        return Category::updateOrCreate(['slug' => $slug], ['name' => ucwords(str_replace('-', ' ', $slug)), 'parent_id' => $parentId, 'sort_order' => 1, 'is_active' => true, 'requires_fda' => false]);
    }

    private function product(Category $category, string $name): Product
    {
        $product = Product::forceCreate(['seller_id' => $this->seller->id, 'category_id' => $category->id, 'name' => $name, 'base_price' => 100, 'status' => 'active']);
        ProductVariant::create(['product_id' => $product->id, 'label' => 'Standard', 'price' => 100, 'stock_quantity' => 5]);
        $product->images()->create(['path' => "products/images/{$product->id}.jpg", 'is_primary' => true, 'sort_order' => 0]);

        return $product;
    }

    public function test_category_filters_take_slugs_and_a_parent_includes_its_subcategories(): void
    {
        $parent = $this->category('storefront-test-parent');
        $phones = $this->category('storefront-test-phones', $parent->id);
        $laptops = $this->category('storefront-test-laptops', $parent->id);
        $phone = $this->product($phones, 'Test Phone');
        $laptop = $this->product($laptops, 'Test Laptop');

        $ids = fn (array $query) => collect($this->getJson('/api/v1/products?' . http_build_query($query + ['per_page' => 100]))->assertOk()->json('data'))->pluck('id');

        $this->assertEquals([$phone->id], $ids(['category_id' => 'storefront-test-phones'])->all());
        $this->assertEquals([$phone->id], $ids(['category_id' => $phones->id])->all());
        $this->assertEqualsCanonicalizing([$phone->id, $laptop->id], $ids(['parent_category_id' => 'storefront-test-parent'])->all());
        $this->assertCount(0, $ids(['category_id' => 'no-such-category']));
    }

    public function test_the_shuffled_grid_is_stable_for_a_seed_and_the_category_tree_has_covers(): void
    {
        $parent = $this->category('storefront-test-parent');
        $leaf = $this->category('storefront-test-leaf', $parent->id);
        $empty = $this->category('storefront-test-empty', $parent->id);
        foreach (range(1, 6) as $i) {
            $this->product($leaf, "Item {$i}");
        }

        $page = fn (int $n) => collect($this->getJson("/api/v1/products?sort=random&seed=7&per_page=3&page={$n}&category_id=storefront-test-leaf")->json('data'))->pluck('id');
        $this->assertEquals($page(1), $page(1));
        $this->assertCount(6, $page(1)->merge($page(2))->unique());

        $tree = collect($this->getJson('/api/v1/categories')->assertOk()->json('data'));
        $node = $tree->firstWhere('slug', 'storefront-test-parent');
        $this->assertSame(6, $node['product_count']);
        $this->assertNotNull($node['image_url']);
        $children = collect($node['children'])->keyBy('slug');
        $this->assertSame(6, $children['storefront-test-leaf']['product_count']);
        $this->assertNull($children['storefront-test-empty']['image_url']);
    }

    public function test_search_matches_word_by_word_forgives_typos_and_ranks_the_best_match_first(): void
    {
        Cache::forget('search.product-index.v1');
        $laptops = $this->category('storefront-test-laptops');
        $phones = $this->category('storefront-test-phones');
        $macbook = $this->product($laptops, 'Zyxqv MacBook Pro 14 Inch');
        $iphone = $this->product($phones, 'Zyxqv iPhone 13 Pro');
        $other = $this->product($phones, 'Plain Phone Case');

        $search = fn (string $q) => $this->getJson('/api/v1/products?' . http_build_query(['q' => $q, 'per_page' => 100]))->assertOk();
        $ids = fn (string $q) => collect($search($q)->json('data'))->pluck('id')->all();

        // A typo in one word: only the product matching every word, and the corrected spelling.
        $this->assertSame([$macbook->id], $ids('zyxqv mcbook'));
        $search('zyxqv mcbook')->assertJsonPath('search.corrected', 'zyxqv macbook');
        // One word shared by two products: both, and no correction for correctly spelt words.
        $this->assertEqualsCanonicalizing([$macbook->id, $iphone->id], $ids('zyxqv'));
        $search('zyxqv')->assertJsonPath('search.corrected', null);
        // Swapped letters, and a word that only appears in the category name.
        $this->assertSame([$iphone->id], $ids('zyxqv iphnoe'));
        $this->assertContains($other->id, $ids('storefront test phones case'));
        // Nothing alike: nothing.
        $this->assertSame([], $ids('qqqqzzzz'));
    }

    public function test_a_store_sale_discounts_regular_prices_while_it_runs_and_never_compounds(): void
    {
        Sanctum::actingAs($this->seller);
        $payload = fn (array $extra = []) => $extra + [
            'name' => 'Wireless Earbuds', 'description' => '<p>Earbuds</p>', 'status' => 'draft',
            'variants' => [['label' => 'Black', 'price' => 1000, 'stock' => 5], ['label' => 'White', 'price' => 1200, 'stock' => 5]],
        ];

        $id = $this->postJson('/api/v1/seller/products', $payload())->assertCreated()->json('data.id');
        $start = \Carbon\CarbonImmutable::now('Asia/Manila');
        $sale = $this->postJson('/api/v1/seller/sales', [
            'product_id' => $id, 'discount_type' => 'percent', 'discount_percent' => 20,
            'starts_at' => $start->format('Y-m-d H:i:s'), 'ends_at' => $start->addHours(2)->format('Y-m-d H:i:s'),
        ])->assertCreated()->assertJsonPath('data.status', 'ongoing')->json('data.id');

        $this->getJson("/api/v1/seller/products/{$id}")->assertOk()
            ->assertJsonPath('data.price_range.min', 800)
            ->assertJsonPath('data.price_range.max', 960)
            ->assertJsonPath('data.original_price', 1000)
            ->assertJsonPath('data.variants.0.regular_price', 1000);
        // Variant prices stay the regular price: saving the form again never discounts twice.
        $variants = $this->getJson("/api/v1/seller/products/{$id}")->json('data.variants');
        $this->postJson("/api/v1/seller/products/{$id}", $payload(['variants' => [
            ['id' => $variants[0]['id'], 'label' => 'Black', 'price' => 1000, 'stock' => 5],
            ['id' => $variants[1]['id'], 'label' => 'White', 'price' => 1200, 'stock' => 5],
        ]]))->assertOk()->assertJsonPath('data.price_range.min', 800);
        $this->assertSame([1000.0, 1200.0], ProductVariant::where('product_id', $id)->orderBy('price')->pluck('price')->all());

        // An overlapping second sale is refused; 100% is not a discount.
        $this->postJson('/api/v1/seller/sales', [
            'product_id' => $id, 'discount_type' => 'percent', 'discount_percent' => 10,
            'starts_at' => $start->addHour()->format('Y-m-d H:i:s'), 'ends_at' => $start->addHours(3)->format('Y-m-d H:i:s'),
        ])->assertStatus(422)->assertJsonValidationErrors(['starts_at']);
        $this->postJson('/api/v1/seller/sales', [
            'product_id' => $id, 'discount_type' => 'percent', 'discount_percent' => 100,
            'starts_at' => $start->addDay()->format('Y-m-d H:i:s'), 'ends_at' => $start->addDays(2)->format('Y-m-d H:i:s'),
        ])->assertStatus(422)->assertJsonValidationErrors(['discount_percent']);

        // Ending the sale brings the regular price back at once.
        $this->postJson("/api/v1/seller/sales/{$sale}/end")->assertOk()->assertJsonPath('data.status', 'ended');
        $this->getJson("/api/v1/seller/products/{$id}")->assertOk()
            ->assertJsonPath('data.price_range.min', 1000)
            ->assertJsonPath('data.original_price', null);
    }

    public function test_shops_to_know_lists_the_most_ordered_shops_with_their_best_sellers(): void
    {
        $category = $this->category('storefront-test-shops');
        foreach ([500000, 400000, 300000, 10] as $i => $sold) {
            $this->product($category, "Best seller {$i}")->forceFill(['units_sold' => $sold])->save();
        }
        // A shop with only two live products is not featured yet.
        $small = User::forceCreate(['first_name' => 'Small', 'last_name' => 'Shop', 'email' => 'small.' . uniqid() . '@example.com', 'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active']);
        SellerProfile::forceCreate([
            'user_id' => $small->id, 'shop_name' => 'Small ' . uniqid(), 'shop_category' => 'x', 'shop_description' => 'x',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'y' . $small->id), 'government_id_image_path' => 'x.png',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
        ]);
        foreach ([1, 2] as $i) {
            Product::forceCreate(['seller_id' => $small->id, 'category_id' => $category->id, 'name' => "Small {$i}", 'base_price' => 50, 'status' => 'active', 'units_sold' => 900000]);
        }

        $shops = $this->getJson('/api/v1/shops?limit=12')->assertOk()->json('data');

        $this->assertSame($this->seller->id, $shops[0]['seller_id']);
        $this->assertSame(4, $shops[0]['product_count']);
        $this->assertSame(['Best seller 0', 'Best seller 1', 'Best seller 2'], array_column($shops[0]['products'], 'name'));
        $this->assertStringEndsWith('.jpg', $shops[0]['products'][0]['image_url']);
        $this->assertNotContains($small->id, array_column($shops, 'seller_id'));
    }
}
