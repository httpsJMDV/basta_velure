<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The seller's own input is checked on the server, not only in the page: names are words, SKUs and option names have
 * a shape, the shop's line of business is a real main category, and a food product publishes only with its FDA
 * papers, from the form or from the Products list.
 */
class SellerInputRulesTest extends TestCase
{
    use DatabaseTransactions;

    private User $seller;
    private Category $leaf;
    private Category $foodLeaf;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        Storage::fake('local');

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

        $parent = Category::create(['slug' => 'rules-parent-' . uniqid(), 'name' => 'Rules Parent ' . uniqid(), 'sort_order' => 1, 'is_active' => true, 'requires_fda' => false]);
        $this->leaf = Category::create(['slug' => 'rules-leaf-' . uniqid(), 'name' => 'Rules Leaf', 'parent_id' => $parent->id, 'sort_order' => 1, 'is_active' => true, 'requires_fda' => false]);
        $this->foodLeaf = Category::create(['slug' => 'rules-food-' . uniqid(), 'name' => 'Rules Snacks', 'parent_id' => $parent->id, 'sort_order' => 2, 'is_active' => true, 'requires_fda' => true]);

        Sanctum::actingAs($this->seller);
    }

    /** A real 1x1 JPEG: the test machine has no GD, so UploadedFile::fake()->image() is not available. */
    private function jpeg(string $name): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
    }

    /** @param array<string, mixed> $overrides */
    private function product(array $overrides = []): array
    {
        return array_merge([
            'name'          => 'Classic White Tee',
            'description'   => '<p>Soft cotton shirt for everyday wear.</p>',
            'category_slug' => $this->leaf->slug,
            'status'        => 'active',
            'weight_kg'     => 0.3,
            'variants'      => [['label' => 'Default', 'price' => 199, 'stock' => 5]],
            'images'        => [$this->jpeg('tee.jpg')],
        ], $overrides);
    }

    private function send(string $uri, array $data)
    {
        return $this->post($uri, $data, ['Accept' => 'application/json']);
    }

    public function test_a_product_name_needs_letters_and_skus_and_options_have_a_shape(): void
    {
        foreach (['12345', '!!!!!', '1 2 3 4 5'] as $name) {
            $this->send('/api/v1/seller/products', $this->product(['name' => $name, 'status' => 'draft']))
                ->assertStatus(422)->assertJsonValidationErrors(['name']);
        }
        $this->send('/api/v1/seller/products', $this->product(['sku' => 'SKU 001!', 'status' => 'draft']))
            ->assertStatus(422)->assertJsonValidationErrors(['sku']);
        $this->send('/api/v1/seller/products', $this->product(['weight_kg' => 1001, 'status' => 'draft']))
            ->assertStatus(422)->assertJsonValidationErrors(['weight_kg' => 'The weight must be 1,000 kg or less.']);

        // Option names: 1 to 20 characters with a letter or a number.
        foreach (['Extraordinarily Long Color', '!!!'] as $option) {
            $this->send('/api/v1/seller/products', $this->product([
                'status' => 'draft', 'variation_types' => ['Color'],
                'variants' => [['label' => $option, 'price' => 199, 'stock' => 5], ['label' => 'Red', 'price' => 199, 'stock' => 5]],
            ]))->assertStatus(422)->assertJsonValidationErrors(['variants.0.label']);
        }

        $this->send('/api/v1/seller/products', $this->product(['name' => '2-in-1 Phone Stand', 'sku' => 'STAND-2IN1_v2']))->assertCreated();
    }

    public function test_a_food_product_publishes_only_with_its_fda_papers(): void
    {
        $food = ['category_slug' => $this->foodLeaf->slug, 'name' => 'Banana Chips 250g'];

        $this->send('/api/v1/seller/products', $this->product($food))
            ->assertStatus(422)->assertJsonValidationErrors(['fda_lto', 'fda_cpr']);

        // A draft is fine without them; publishing it from the Products list is not.
        $draftId = $this->send('/api/v1/seller/products', $this->product($food + ['status' => 'draft']))->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/seller/products/{$draftId}/status", ['status' => 'active'])
            ->assertStatus(422)->assertJsonValidationErrors(['fda_lto', 'fda_cpr']);
        $this->postJson('/api/v1/seller/products/bulk', ['action' => 'activate', 'ids' => [$draftId]])
            ->assertOk()->assertJsonPath('skipped.0.id', $draftId);
        $this->assertSame('draft', Product::find($draftId)->status);

        // With both papers it goes live, and the shop's LTO then counts for its next food product.
        $this->send('/api/v1/seller/products', $this->product($food + [
            'fda_lto' => UploadedFile::fake()->create('lto.pdf', 50, 'application/pdf'),
            'fda_cpr' => UploadedFile::fake()->create('cpr.pdf', 50, 'application/pdf'),
        ]))->assertCreated()->assertJsonPath('data.status', 'active');
        $this->getJson('/api/v1/seller/shop-profile')->assertJsonPath('data.fda_lto_on_file', true);
        $this->send('/api/v1/seller/products', $this->product(['category_slug' => $this->foodLeaf->slug, 'name' => 'Cassava Chips 250g',
            'fda_cpr' => UploadedFile::fake()->create('cpr2.pdf', 50, 'application/pdf')]))->assertCreated();

        // Editing a live food product does not ask for the CPR again.
        $live = Product::where('seller_id', $this->seller->id)->where('name', 'Banana Chips 250g')->where('status', 'active')->firstOrFail();
        $this->send("/api/v1/seller/products/{$live->id}", ['name' => 'Banana Chips 300g', 'status' => 'active', 'category_slug' => $this->foodLeaf->slug,
            'description' => '<p>Crispy banana chips from Laguna.</p>', 'weight_kg' => 0.3,
            'variants' => [['id' => $live->variants()->value('id'), 'label' => 'Default', 'price' => 99, 'stock' => 10]]])->assertOk();
    }

    public function test_the_shop_profile_takes_a_real_name_category_and_response_time(): void
    {
        foreach (['!!!', '123', 'A1'] as $bad) {
            $this->postJson('/api/v1/seller/shop-profile', ['shop_name' => $bad])->assertStatus(422)->assertJsonValidationErrors(['shop_name']);
        }
        $this->postJson('/api/v1/seller/shop-profile', ['shop_category' => 'Electronics & Gadgets'])
            ->assertStatus(422)->assertJsonValidationErrors(['shop_category']);
        $this->postJson('/api/v1/seller/shop-profile', ['response_time' => 'whenever'])
            ->assertStatus(422)->assertJsonValidationErrors(['response_time']);

        $main = Category::whereNull('parent_id')->where('is_active', true)->value('name');
        $this->postJson('/api/v1/seller/shop-profile', ['shop_name' => "Marco's Gadgets & Co. " . substr(uniqid(), -4), 'shop_category' => $main, 'response_time' => 'within_1_hour'])
            ->assertOk()->assertJsonPath('data.shop_category', $main)->assertJsonPath('data.response_time', 'within_1_hour');
    }

    public function test_a_store_category_name_is_words(): void
    {
        foreach (['!!', '12', 'A'] as $bad) {
            $this->postJson('/api/v1/seller/store-categories', ['name' => $bad])->assertStatus(422)->assertJsonValidationErrors(['name']);
        }
        $this->postJson('/api/v1/seller/store-categories', ['name' => 'New Arrivals'])->assertCreated();
    }
}
