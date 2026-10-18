<?php

namespace Tests\Feature;

use App\Models\AdminActivityLog;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PlatformSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Admin Platform Settings and Categories: commission overrides are real categories only (a parent's rate covers its
 * sub-categories), checkout charges what the settings say, the return policy's numbers drive the return flow, and every
 * category action saves without an error, logs, and refreshes the storefront menu.
 */
class AdminSettingsAndCategoriesTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']);
        PlatformSetting::updateOrCreate(['key' => 'base_commission_rate'], ['value' => '0.05']);
        Category::whereNotNull('commission_rate')->update(['commission_rate' => null]);
    }

    private function cat(string $name, ?Category $parent = null, array $extra = []): Category
    {
        return Category::create($extra + ['name' => $name, 'slug' => Str::slug($name) . '-' . Str::lower(Str::random(5)), 'parent_id' => $parent?->id, 'is_active' => true]);
    }

    public function test_overrides_are_real_categories_only_and_a_parent_rate_covers_its_sub_categories(): void
    {
        Sanctum::actingAs($this->admin);
        $food = $this->cat('Food & Grocery Test');
        $snacks = $this->cat('Snacks Test', $food);
        $drinks = $this->cat('Beverages Test', $food);
        $toys = $this->cat('Toys Test');

        // No made-up defaults: nothing saved means the base rate and no overrides.
        $this->getJson('/api/v1/admin/settings/commission')->assertOk()->assertJsonPath('data.base_rate_percent', 5)->assertJsonPath('data.overrides', []);

        // A free-text "category" is refused, and so are bad rates.
        $this->postJson('/api/v1/admin/settings/commission', ['base_rate_percent' => 5, 'overrides' => [['category_key' => 't', 'rate_percent' => 12]]])
            ->assertStatus(422)->assertJsonValidationErrors(['overrides.0.category_id']);
        $this->postJson('/api/v1/admin/settings/commission', ['base_rate_percent' => 5, 'overrides' => [['category_id' => 999999999, 'rate_percent' => 12]]])
            ->assertStatus(422)->assertJsonValidationErrors(['overrides.0.category_id']);
        foreach (['abc', -1, 101, 8.123] as $bad) {
            $this->postJson('/api/v1/admin/settings/commission', ['base_rate_percent' => 5, 'overrides' => [['category_id' => $food->id, 'rate_percent' => $bad]]])
                ->assertStatus(422)->assertJsonValidationErrors(['overrides.0.rate_percent']);
        }
        $this->postJson('/api/v1/admin/settings/commission', ['base_rate_percent' => 5, 'overrides' => [
            ['category_id' => $food->id, 'rate_percent' => 8], ['category_id' => $food->id, 'rate_percent' => 9],
        ]])->assertStatus(422);

        $res = $this->postJson('/api/v1/admin/settings/commission', ['base_rate_percent' => 5, 'overrides' => [
            ['category_id' => $food->id, 'rate_percent' => 8], ['category_id' => $drinks->id, 'rate_percent' => 6.5],
        ]])->assertOk();
        $names = collect($res->json('data.overrides'))->pluck('category_name')->all();
        $this->assertContains('Food & Grocery Test', $names); // the real name, "&" included
        $this->assertTrue(AdminActivityLog::where('action', 'update_commission')->exists());

        $this->assertEqualsWithDelta(0.08, PlatformSetting::commissionRateForCategory($food->id), 1e-9);
        $this->assertEqualsWithDelta(0.08, PlatformSetting::commissionRateForCategory($snacks->id), 1e-9);  // inherits
        $this->assertEqualsWithDelta(0.065, PlatformSetting::commissionRateForCategory($drinks->id), 1e-9); // its own
        $this->assertEqualsWithDelta(0.05, PlatformSetting::commissionRateForCategory($toys->id), 1e-9);    // base

        // The list is the whole set: leaving Food out removes its override.
        $this->postJson('/api/v1/admin/settings/commission', ['base_rate_percent' => 4.5, 'overrides' => [['category_id' => $drinks->id, 'rate_percent' => 6.5]]])->assertOk();
        $this->assertNull($food->fresh()->commission_rate);
        $this->assertEqualsWithDelta(0.045, PlatformSetting::commissionRateForCategory($snacks->id), 1e-9);
        $this->getJson('/api/v1/admin/settings/commission')->assertJsonPath('data.base_rate_percent', 4.5)->assertJsonCount(1, 'data.overrides');
    }

    public function test_checkout_charges_the_parent_override_on_a_sub_category_product(): void
    {
        $food = $this->cat('Food Checkout Test');
        $snacks = $this->cat('Snacks Checkout Test', $food);
        $food->update(['commission_rate' => 8]);

        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $product = Product::create(['seller_id' => $seller->id, 'category_id' => $snacks->id, 'name' => 'Banana Chips', 'description' => '<p>Crispy banana chips from Davao.</p>',
            'base_price' => 200, 'status' => 'active', 'weight_kg' => 0.5]);
        $variant = ProductVariant::create(['product_id' => $product->id, 'label' => 'Default', 'sku' => 'BC-' . Str::upper(Str::random(6)), 'price' => 200, 'stock_quantity' => 10]);

        Sanctum::actingAs($buyer);
        $id = $this->postJson('/api/v1/checkout/place-order', ['address_id' => $addr->id, 'items' => [['variant_id' => $variant->id, 'quantity' => 1]], 'payment_method' => 'cod'])
            ->assertCreated()->json('data.id');
        $item = OrderItem::where('order_id', $id)->firstOrFail();
        $this->assertEqualsWithDelta(0.08, (float) $item->commission_rate, 1e-9);
        $this->assertEqualsWithDelta(16.00, (float) $item->commission_amount, 0.001);
    }

    public function test_the_return_policy_numbers_drive_the_return_rules(): void
    {
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/v1/admin/settings/return-policy')->assertOk()
            ->assertJsonPath('data.return_window_days', 7)->assertJsonPath('data.seller_response_days', 3)->assertJsonPath('data.escalation_days', 3)
            ->assertJsonMissingPath('data.auto_escalation_hours');

        $this->postJson('/api/v1/admin/settings/return-policy', ['return_window_days' => 0, 'seller_response_days' => 3, 'escalation_days' => 3, 'summary' => 'Short', 'mediation_terms' => 'Mediation terms text.'])
            ->assertStatus(422)->assertJsonValidationErrors(['return_window_days', 'summary']);
        $this->postJson('/api/v1/admin/settings/return-policy', [
            'return_window_days' => 10, 'seller_response_days' => 2, 'escalation_days' => 5,
            'summary' => 'Return within 10 days with photos.', 'mediation_terms' => 'Escalate a rejected return within 5 days.',
        ])->assertOk()->assertJsonPath('data.return_window_days', 10);

        $this->assertSame(10, PlatformSetting::returnWindowDays());
        $this->assertSame(2, PlatformSetting::sellerResponseDays());
        $this->assertSame(5, PlatformSetting::escalationDays());
        // The buyer-facing policy has kept its exemptions.
        $this->assertNotEmpty($this->getJson('/api/v1/platform/policies')->json('data.return_policy.non_returnable_categories'));
    }

    public function test_category_actions_save_without_errors_log_and_refresh_the_storefront_menu(): void
    {
        Sanctum::actingAs($this->admin);
        Cache::put('storefront.categories', ['stale'], 300);

        $parent = $this->postJson('/api/v1/admin/categories', ['name' => 'Gardening Test', 'commission_rate' => 7])->assertCreated()->json('data');
        $this->assertNull(Cache::get('storefront.categories'));
        $this->assertEquals(7, $parent['commission_rate']); // a parent may carry the rate for its sub-categories
        $other = $this->postJson('/api/v1/admin/categories', ['name' => 'Outdoor Test'])->assertCreated()->json('data');
        $sub = $this->postJson('/api/v1/admin/categories', ['name' => 'Seeds Test', 'parent_id' => $parent['id'], 'requires_fda' => true])->assertCreated()->json('data');

        // Same name under the same parent, three levels, decimals and FDA on a parent are refused.
        $this->postJson('/api/v1/admin/categories', ['name' => 'seeds test', 'parent_id' => $parent['id']])->assertStatus(422)->assertJsonValidationErrors(['name']);
        $this->postJson('/api/v1/admin/categories', ['name' => 'Heirloom Test', 'parent_id' => $sub['id']])->assertStatus(422)->assertJsonValidationErrors(['parent_id']);
        $this->postJson('/api/v1/admin/categories', ['name' => 'Odd Rate Test', 'commission_rate' => 7.123])->assertStatus(422)->assertJsonValidationErrors(['commission_rate']);
        $this->postJson('/api/v1/admin/categories', ['name' => 'FDA Parent Test', 'requires_fda' => true])->assertStatus(422)->assertJsonValidationErrors(['requires_fda']);

        // Moving a sub-category to another parent works; a parent cannot become a sub-category.
        $this->putJson("/api/v1/admin/categories/{$sub['id']}", ['parent_id' => $other['id']])->assertOk()->assertJsonPath('data.parent_id', $other['id']);
        $this->putJson("/api/v1/admin/categories/{$parent['id']}", ['parent_id' => $other['id']])->assertStatus(422);
        $this->putJson("/api/v1/admin/categories/{$sub['id']}", ['is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);

        // A category with an archived product cannot be deleted, and the tree counts that product.
        $seller = $this->seller('Garden Shop', $this->qc);
        Product::create(['seller_id' => $seller->id, 'category_id' => $sub['id'], 'name' => 'Old Seeds', 'description' => '<p>Archived listing for the test.</p>', 'base_price' => 50, 'status' => 'archived']);
        $tree = collect($this->getJson('/api/v1/admin/categories')->assertOk()->json('data'));
        $this->assertSame(1, collect($tree->firstWhere('id', $other['id'])['children'])->firstWhere('id', $sub['id'])['products_count']);
        $this->deleteJson("/api/v1/admin/categories/{$sub['id']}")->assertStatus(422)->assertJsonPath('error_code', 'CATEGORY_HAS_PRODUCTS');
        $this->deleteJson("/api/v1/admin/categories/{$parent['id']}")->assertOk();

        $this->assertSame(['create_category', 'create_category', 'create_category', 'update_category', 'update_category', 'delete_category'],
            AdminActivityLog::where('admin_id', $this->admin->id)->orderBy('id')->pluck('action')->all());
    }

    public function test_sellers_list_only_in_active_categories_and_in_a_sub_category_when_there_are_some(): void
    {
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $parent = $this->cat('Decor Listing Test');
        $leaf = $this->cat('Lamps Listing Test', $parent);
        $closed = $this->cat('Closed Listing Test', $parent, ['is_active' => false]);
        Sanctum::actingAs($seller);

        $draft = fn (Category $c) => $this->postJson('/api/v1/seller/products', ['name' => 'Capiz Shell Lamp', 'category_slug' => $c->slug, 'publish' => false]);
        $draft($parent)->assertStatus(422)->assertJsonValidationErrors(['category_slug']);
        $draft($closed)->assertStatus(422)->assertJsonValidationErrors(['category_slug']);
        $draft($leaf)->assertJsonMissingValidationErrors(['category_slug']);
    }
}
