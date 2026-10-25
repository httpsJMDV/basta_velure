<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\Ai\AiModel;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeAiModel;
use Tests\TestCase;

/**
 * Amaru task 7: with the AI product check on, a published product waits in review until Claude answers. Approve puts
 * it live; send to admin, reject (while auto reject is off), a refusal or an unreachable API leave it for the admin.
 * The fake model stands in for Claude, so nothing here calls the real API.
 */
class AiProductCheckTest extends TestCase
{
    use DatabaseTransactions;

    private User $seller;

    private FakeAiModel $ai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');

        $this->ai = new FakeAiModel();
        $this->app->instance(AiModel::class, $this->ai);
        config(['ai.product_check.enabled' => true, 'ai.product_check.auto_reject' => false]);

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

    /** A draft that meets every publishing rule, with one real photo on the public disk. */
    private function draft(string $name = 'Classic White Tee'): Product
    {
        $category = Category::forceCreate(['slug' => 'ai-test-' . Str::random(8), 'name' => 'Shirts', 'is_active' => true, 'requires_fda' => false]);
        $product = Product::forceCreate([
            'seller_id' => $this->seller->id, 'category_id' => $category->id, 'name' => $name,
            'description' => 'Soft cotton shirt for everyday wear, pre-washed.', 'base_price' => 199, 'weight_kg' => 0.3, 'status' => 'draft',
        ]);
        $product->variants()->create(['label' => 'Standard', 'price' => 199, 'stock_quantity' => 5]);

        $image = imagecreatetruecolor(1600, 800);
        ob_start();
        imagejpeg($image);
        Storage::disk('public')->put('products/images/tee.jpg', (string) ob_get_clean());
        $product->images()->create(['path' => 'products/images/tee.jpg', 'is_primary' => true, 'sort_order' => 0]);

        return $product;
    }

    private function publish(Product $product)
    {
        return $this->patchJson("/api/v1/seller/products/{$product->id}/status", ['status' => 'active']);
    }

    public function test_an_approved_product_goes_live_and_the_ai_sees_its_details_and_a_shrunk_photo(): void
    {
        $product = $this->draft();
        $this->ai->queue(FakeAiModel::verdict('approve', 'An ordinary cotton shirt at a normal price.'));

        $this->publish($product)->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('message', 'Product is live.');

        $product->refresh();
        $this->assertSame('active', $product->status);
        $this->assertNotNull($product->published_at);
        $this->assertSame('approved', $product->ai_review_status);
        $this->assertSame('approve', $product->ai_review_verdict);

        $content = $this->ai->calls[0]['messages'][0]['content'];
        $this->assertSame('image', $content[0]['type']);
        $this->assertSame('image/jpeg', $content[0]['source']['mediaType']);
        [$w, $h] = getimagesizefromstring(base64_decode($content[0]['source']['data']));
        $this->assertSame([1024, 512], [$w, $h]);
        $this->assertStringContainsString('Name: Classic White Tee', end($content)['text']);
        $this->assertStringContainsString('PHP 199.00', end($content)['text']);
        $this->assertSame('json_schema', $this->ai->calls[0]['outputConfig']['format']['type']);
    }

    public function test_an_unsure_product_waits_for_the_admin_with_the_ai_reason(): void
    {
        $admin = User::forceCreate([
            'first_name' => 'Ana', 'last_name' => 'Admin', 'email' => 'admin.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'admin', 'status' => 'active',
        ]);
        $product = $this->draft('Brand New Smartphone');
        $this->ai->queue(FakeAiModel::verdict('send_to_admin', 'The price is far below what this phone usually costs.'));

        $this->publish($product)->assertOk()->assertJsonPath('data.status', 'pending_review');

        $product->refresh();
        $this->assertSame('pending_review', $product->status);
        $this->assertSame('flagged', $product->ai_review_status);
        $this->assertSame('The price is far below what this phone usually costs.', $product->ai_review_reason);
        $this->assertSame(1, $admin->notifications()->where('data->kind', 'product.flagged')->count());

        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/products/{$product->id}")
            ->assertJsonPath('data.ai_review.status', 'flagged')
            ->assertJsonPath('data.ai_review.verdict', 'send_to_admin');
        $this->postJson("/api/v1/admin/products/{$product->id}/approve")->assertOk();
        $this->assertSame('active', $product->fresh()->status);
        $this->assertNotNull($product->fresh()->published_at);
    }

    public function test_a_reject_verdict_goes_to_the_admin_until_auto_reject_is_turned_on(): void
    {
        $first = $this->draft('Replica Pistol');
        $this->ai->queue(FakeAiModel::verdict('reject', 'Weapons are not allowed.'));
        $this->publish($first)->assertOk();
        $this->assertSame('pending_review', $first->fresh()->status);
        $this->assertSame('reject', $first->fresh()->ai_review_verdict);
        $this->assertNull($first->fresh()->rejection_reason);

        config(['ai.product_check.auto_reject' => true]);
        $second = $this->draft('Replica Rifle');
        $this->ai->queue(FakeAiModel::verdict('reject', 'Weapons are not allowed.'));
        $this->publish($second)->assertOk();
        $this->assertSame('rejected', $second->fresh()->status);
        $this->assertSame('Weapons are not allowed.', $second->fresh()->rejection_reason);
    }

    public function test_an_unreachable_api_or_a_refusal_sends_the_product_to_the_admin_instead_of_publishing(): void
    {
        $down = $this->draft();
        $this->ai->queue(new \RuntimeException('Your credit balance is too low.'));
        $this->publish($down)->assertOk()->assertJsonPath('data.status', 'pending_review');
        $this->assertSame('unavailable', $down->fresh()->ai_review_status);

        $refused = $this->draft();
        $this->ai->queue(FakeAiModel::refusal());
        $this->publish($refused)->assertOk();
        $this->assertSame('pending_review', $refused->fresh()->status);
        $this->assertSame('unavailable', $refused->fresh()->ai_review_status);

        $cut = $this->draft();
        $this->ai->queue(FakeAiModel::text('{"verdict":"appro', 'max_tokens'));
        $this->publish($cut)->assertOk();
        $this->assertSame('unavailable', $cut->fresh()->ai_review_status);
    }

    public function test_without_a_key_or_with_the_check_off_publishing_works_as_before(): void
    {
        $this->ai->available = false;
        $this->publish($this->draft())->assertOk()->assertJsonPath('data.status', 'active');

        $this->ai->available = true;
        config(['ai.product_check.enabled' => false]);
        $this->publish($this->draft())->assertOk()->assertJsonPath('data.status', 'active');

        $this->assertSame([], $this->ai->calls);
    }

    public function test_editing_a_live_product_rechecks_it_only_when_what_the_ai_saw_changes(): void
    {
        $product = $this->draft();
        $this->ai->queue(FakeAiModel::verdict('approve', 'Fine.'));
        $this->publish($product)->assertOk();
        $slug = $product->category->slug;
        $form = fn (string $name) => [
            'name' => $name, 'description' => $product->description, 'category_slug' => $slug, 'weight_kg' => 0.3,
            'variants' => [['id' => $product->variants->first()->id, 'label' => 'Standard', 'price' => 249, 'stock' => 9]],
        ];

        // A price and stock change: no new check.
        $this->postJson("/api/v1/seller/products/{$product->id}", $form('Classic White Tee'))->assertOk()->assertJsonPath('data.status', 'active');
        $this->assertCount(1, $this->ai->calls);

        // A new name is checked again.
        $this->ai->queue(FakeAiModel::verdict('send_to_admin', 'The new name does not match the photo.'));
        $this->postJson("/api/v1/seller/products/{$product->id}", $form('Vintage Leather Jacket'))->assertOk()->assertJsonPath('data.status', 'pending_review');
        $this->assertCount(2, $this->ai->calls);
        $this->assertSame('flagged', $product->fresh()->ai_review_status);
    }
}
