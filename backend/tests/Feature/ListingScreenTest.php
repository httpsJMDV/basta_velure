<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\Ai\AiModel;
use App\Services\Catalog\ListingScreen;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeAiModel;
use Tests\TestCase;

/**
 * Loved-IT sells no medicine, vitamins or supplements, and "Others" is the catch-all for products that fit no other
 * category. A listing filed under Others, or one that mentions medicine, waits for an admin before buyers see it,
 * whether or not the AI product check is on.
 */
class ListingScreenTest extends TestCase
{
    use DatabaseTransactions;

    private User $seller;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        config(['ai.product_check.enabled' => false]);

        $this->admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']);
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
        Sanctum::actingAs($this->seller);
    }

    /** A draft that meets every publishing rule, in the given category (an ordinary one by default). */
    private function draft(string $name = 'Classic White Tee', ?Category $category = null, string $description = 'Soft cotton shirt for everyday wear, pre-washed.'): Product
    {
        $category ??= Category::forceCreate(['slug' => 'screen-test-' . Str::random(8), 'name' => 'Shirts', 'is_active' => true, 'requires_fda' => false]);
        $product = Product::forceCreate([
            'seller_id' => $this->seller->id, 'category_id' => $category->id, 'name' => $name,
            'description' => $description, 'base_price' => 199, 'weight_kg' => 0.3, 'status' => 'draft',
        ]);
        $product->variants()->create(['label' => 'Standard', 'price' => 199, 'stock_quantity' => 5]);
        Storage::disk('public')->put('products/images/item.jpg', 'x');
        $product->images()->create(['path' => 'products/images/item.jpg', 'is_primary' => true, 'sort_order' => 0]);

        return $product;
    }

    private function publish(Product $product)
    {
        return $this->patchJson("/api/v1/seller/products/{$product->id}/status", ['status' => 'active']);
    }

    private function otherItems(): Category
    {
        return Category::where('slug', Category::OTHER_ITEMS_SLUG)->firstOrFail();
    }

    public function test_the_catalog_has_others_last_no_supplements_and_first_aid_supplies(): void
    {
        // The seeded catalog (the migration makes the same changes on a database that already has it).
        (new \Database\Seeders\CategorySeeder())->run();
        \Illuminate\Support\Facades\Cache::forget('storefront.categories');

        $others = Category::where('slug', Category::OTHERS_SLUG)->firstOrFail();
        $this->assertNull($others->parent_id);
        $this->assertTrue($others->is_active);
        $this->assertSame($others->id, $this->otherItems()->parent_id);
        $this->assertSame(Category::OTHERS_SLUG, Category::whereNull('parent_id')->where('is_active', true)->orderBy('sort_order')->orderBy('name')->get()->last()->slug);

        $this->assertFalse(Category::where('slug', 'supplements')->firstOrFail()->is_active);
        $this->assertSame('First Aid & Medical Supplies', Category::where('slug', 'medical-supplies')->firstOrFail()->name);

        $names = collect($this->getJson('/api/v1/categories')->assertOk()->json('data'))->pluck('name')->all();
        $this->assertSame('Others', end($names));
    }

    public function test_medicine_words_are_found_without_catching_gadgets_or_coffee(): void
    {
        $screen = app(ListingScreen::class);

        $this->assertSame(['biogesic', 'paracetamol', '500mg'], $screen->medicineWords('Biogesic Paracetamol 500mg, 20 tablets'));
        $this->assertSame(['vitamin', 'glutathione', 'injection'], $screen->medicineWords('<p>Vitamin C and Glutathione <b>injection</b> kit</p>'));
        $this->assertSame(['250 mg'], $screen->medicineWords('Each sachet has 250 mg'));
        $this->assertSame([], $screen->medicineWords('iPad Air 11-inch tablet, 128GB, with case'));
        $this->assertSame([], $screen->medicineWords('Coffee capsules, pancake syrup and a digital thermometer'));
        $this->assertSame([], $screen->medicineWords('Band-aid strips, gauze and a blood pressure monitor'));
    }

    public function test_an_ordinary_product_still_goes_live_at_once(): void
    {
        $product = $this->draft();
        $this->publish($product)->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('data.held_for_review', false);
        $this->assertNull($product->fresh()->hold_reason);
    }

    public function test_a_product_in_others_waits_for_an_admin_who_approves_it(): void
    {
        $product = $this->draft('Handmade Rattan Wind Chime', $this->otherItems(), 'Hand-woven rattan wind chime with bamboo tubes, 60 cm long.');

        $this->publish($product)->assertOk()
            ->assertJsonPath('data.status', 'pending_review')
            ->assertJsonPath('data.held_for_review', true)
            ->assertJsonPath('message', 'The Loved-IT team checks it before it goes live, usually within 1 business day.');
        $this->assertStringContainsString('Others', (string) $product->fresh()->hold_reason);
        $this->assertTrue($this->admin->notifications()->where('data->kind', 'product.flagged')->exists());

        // Buyers cannot see it yet.
        $this->getJson("/api/v1/products/{$product->id}")->assertNotFound();

        Sanctum::actingAs($this->admin);
        $this->getJson("/api/v1/admin/products/{$product->id}")->assertOk()->assertJsonPath('data.hold_reason', $product->fresh()->hold_reason);
        $this->postJson("/api/v1/admin/products/{$product->id}/approve")->assertOk();
        $fresh = $product->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertNull($fresh->hold_reason);
    }

    public function test_a_product_that_mentions_medicine_waits_in_any_category(): void
    {
        $product = $this->draft('Biogesic Paracetamol 500mg', null, 'For fever and headache, one box of 20 tablets.');

        $this->publish($product)->assertOk()->assertJsonPath('data.status', 'pending_review');
        $reason = (string) $product->fresh()->hold_reason;
        $this->assertStringContainsString('"biogesic"', $reason);
        $this->assertStringContainsString('does not sell medicine', $reason);

        // An admin rejects it; the seller sees the admin's reason, not the keyword list.
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/admin/products/{$product->id}/reject", ['reason' => 'Loved-IT does not sell medicine.'])->assertOk();
        $this->assertSame('rejected', $product->fresh()->status);
    }

    public function test_with_the_ai_on_a_held_product_that_passes_still_goes_to_an_admin(): void
    {
        Storage::disk('public')->put('products/images/item.jpg', $this->jpeg());
        $ai = new FakeAiModel();
        $this->app->instance(AiModel::class, $ai);
        config(['ai.product_check.enabled' => true, 'ai.product_check.auto_reject' => false]);
        $ai->queue(FakeAiModel::verdict('approve', 'A wind chime at a normal price.'));

        $product = $this->draft('Handmade Rattan Wind Chime', $this->otherItems(), 'Hand-woven rattan wind chime with bamboo tubes, 60 cm long.');
        Storage::disk('public')->put('products/images/item.jpg', $this->jpeg());
        $this->publish($product)->assertOk();

        $fresh = $product->fresh();
        $this->assertSame('pending_review', $fresh->status);
        $this->assertSame('approved', $fresh->ai_review_status);
        $this->assertNotNull($fresh->hold_reason);
    }

    public function test_supplements_take_no_new_listings(): void
    {
        $product = $this->draft();
        $this->postJson("/api/v1/seller/products/{$product->id}", ['name' => $product->name, 'category_slug' => 'supplements', 'status' => 'draft'])
            ->assertStatus(422)->assertJsonValidationErrors('category_slug');
    }

    public function test_the_admin_cannot_remove_close_or_move_others_but_can_rename_it(): void
    {
        Sanctum::actingAs($this->admin);
        $others = Category::where('slug', Category::OTHERS_SLUG)->firstOrFail();
        $leaf = $this->otherItems();
        $food = Category::forceCreate(['slug' => 'screen-parent-' . Str::random(8), 'name' => 'Parent ' . Str::random(4), 'is_active' => true]);

        $this->deleteJson("/api/v1/admin/categories/{$others->id}")->assertStatus(422)->assertJsonPath('error_code', 'CATEGORY_LOCKED');
        $this->deleteJson("/api/v1/admin/categories/{$leaf->id}")->assertStatus(422)->assertJsonPath('error_code', 'CATEGORY_LOCKED');
        $this->putJson("/api/v1/admin/categories/{$others->id}", ['is_active' => false])->assertStatus(422)->assertJsonValidationErrors('is_active');
        $this->putJson("/api/v1/admin/categories/{$others->id}", ['sort_order' => 1])->assertStatus(422)->assertJsonValidationErrors('sort_order');
        $this->putJson("/api/v1/admin/categories/{$leaf->id}", ['parent_id' => $food->id])->assertStatus(422)->assertJsonValidationErrors('parent_id');
        $this->putJson("/api/v1/admin/categories/{$leaf->id}", ['slug' => 'misc'])->assertStatus(422)->assertJsonValidationErrors('slug');

        $this->putJson("/api/v1/admin/categories/{$others->id}", ['name' => 'Others & Misc', 'is_active' => true, 'sort_order' => Category::OTHERS_SORT_ORDER])->assertOk();
        $this->assertSame('Others & Misc', $others->fresh()->name);
        $this->assertSame(Category::OTHERS_SLUG, $others->fresh()->slug);
    }

    private function jpeg(): string
    {
        $image = imagecreatetruecolor(400, 400);
        ob_start();
        imagejpeg($image);

        return (string) ob_get_clean();
    }
}
