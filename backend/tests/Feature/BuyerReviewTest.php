<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Buyers review what they received: once per product per delivered order, as a verified purchase with up to five
 * photos, editable for 30 days. The product's stored rating follows.
 */
class BuyerReviewTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $seller;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');

        $this->buyer = $this->user('buyer');
        $this->seller = $this->user('seller');
        $category = Category::create(['name' => 'Cat ' . Str::random(6), 'slug' => 'cat-' . Str::lower(Str::random(8)), 'is_active' => true, 'commission_rate' => 0.10]);
        $this->product = Product::create(['seller_id' => $this->seller->id, 'category_id' => $category->id, 'name' => 'Rattan Basket ' . Str::random(4), 'base_price' => 499, 'status' => 'active']);
    }

    /** A real 1x1 PNG (the fake image() helper needs the GD extension, which CI may not have). */
    private function photo(string $name): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    }

    private function user(string $role): User
    {
        return User::forceCreate([
            'first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function order(User $buyer, string $status = 'COMPLETED'): Order
    {
        $order = Order::create([
            'buyer_id' => $buyer->id, 'order_number' => 'VEL-R' . Str::upper(Str::random(8)), 'subtotal' => 499, 'shipping_fee' => 50, 'total' => 549,
            'payment_method' => 'cod', 'payment_status' => 'pending', 'status' => $status,
            'completed_at' => $status === 'COMPLETED' ? now() : null,
            'shipping_name' => 'Ana', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St',
            'shipping_province_code' => '040340000', 'shipping_city_code' => '040342800', 'shipping_barangay_code' => '040342801',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->seller->id, 'product_id' => $this->product->id,
            'product_name' => $this->product->name, 'unit_price' => 499, 'quantity' => 1, 'subtotal' => 499,
        ]);

        return $order;
    }

    public function test_a_completed_order_product_is_reviewed_once_with_photos_and_the_rating_follows(): void
    {
        $order = $this->order($this->buyer);
        $this->actingAs($this->buyer, 'sanctum');

        $this->getJson('/api/v1/buyer/reviews/pending')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order_id', $order->id)
            ->assertJsonPath('data.0.product.id', $this->product->id);

        $res = $this->post('/api/v1/buyer/reviews', [
            'order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 4, 'comment' => '<b>Sturdy</b> and well made.',
            'photos' => [$this->photo('a.png'), $this->photo('b.png')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $res->assertJsonPath('data.comment', 'Sturdy and well made.')
            ->assertJsonPath('data.verified_purchase', true)
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonCount(2, 'data.images');
        $this->assertCount(2, Storage::disk('public')->files('review_images'));

        $fresh = $this->product->fresh();
        $this->assertSame(1, (int) $fresh->review_count);
        $this->assertEquals(4.0, (float) $fresh->avg_rating);

        // Nothing left to review, it shows under "My reviews", and the product page shows the photos.
        $this->getJson('/api/v1/buyer/reviews/pending')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/buyer/reviews')->assertOk()->assertJsonPath('data.0.product.id', $this->product->id);
        $this->getJson("/api/v1/products/{$this->product->id}/reviews")->assertOk()->assertJsonCount(2, 'data.0.images');

        // A second review of the same product for the same order is refused.
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 5])->assertStatus(422);
    }

    public function test_only_received_products_of_ones_own_orders_can_be_reviewed(): void
    {
        $placed = $this->order($this->buyer, 'PLACED');
        $someoneElses = $this->order($this->user('buyer'));
        $this->actingAs($this->buyer, 'sanctum');

        $this->getJson('/api/v1/buyer/reviews/pending')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $placed->id, 'product_id' => $this->product->id, 'rating' => 5])->assertStatus(422);
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $someoneElses->id, 'product_id' => $this->product->id, 'rating' => 5])->assertStatus(422);
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $placed->id, 'product_id' => $this->product->id, 'rating' => 9])->assertStatus(422)->assertJsonValidationErrors(['rating']);
        $this->assertSame(0, Review::where('buyer_id', $this->buyer->id)->count());
    }

    public function test_a_delivered_order_cannot_be_rated_before_it_is_completed(): void
    {
        $delivered = $this->order($this->buyer, 'DELIVERED');
        $this->actingAs($this->buyer, 'sanctum');

        $this->getJson('/api/v1/buyer/reviews/pending')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $delivered->id, 'product_id' => $this->product->id, 'rating' => 5])->assertStatus(422);
        $this->assertSame(0, Review::where('buyer_id', $this->buyer->id)->count());
    }

    public function test_text_is_at_most_500_characters_and_photos_at_most_five(): void
    {
        $order = $this->order($this->buyer);
        $this->actingAs($this->buyer, 'sanctum');

        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 0])->assertStatus(422)->assertJsonValidationErrors(['rating']);
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 5, 'comment' => str_repeat('a', 501)])
            ->assertStatus(422)->assertJsonValidationErrors(['comment']);
        $this->post('/api/v1/buyer/reviews', [
            'order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 5,
            'photos' => array_map(fn ($i) => $this->photo("p{$i}.png"), range(1, 6)),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['photos']);
        $this->post('/api/v1/buyer/reviews', [
            'order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 5, 'comment' => str_repeat('a', 500),
            'photos' => array_map(fn ($i) => $this->photo("p{$i}.png"), range(1, 5)),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonCount(5, 'data.images');
    }

    public function test_the_author_can_edit_once_within_thirty_days(): void
    {
        $order = $this->order($this->buyer);
        $this->actingAs($this->buyer, 'sanctum');
        $id = $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 2])->json('data.id');

        $this->actingAs($this->user('buyer'), 'sanctum')->patchJson("/api/v1/buyer/reviews/{$id}", ['rating' => 1])->assertForbidden();

        $this->actingAs($this->buyer, 'sanctum')->patchJson("/api/v1/buyer/reviews/{$id}", ['rating' => 5, 'comment' => 'Better than I thought'])->assertOk()
            ->assertJsonPath('data.rating', 5)->assertJsonPath('data.comment', 'Better than I thought')->assertJsonPath('data.can_edit', false);
        $this->assertEquals(5.0, (float) $this->product->fresh()->avg_rating);

        // A second edit is refused.
        $this->patchJson("/api/v1/buyer/reviews/{$id}", ['rating' => 1])->assertStatus(422);
        $this->assertSame(5, (int) Review::find($id)->rating);
    }

    public function test_an_edit_after_thirty_days_is_refused(): void
    {
        $order = $this->order($this->buyer);
        $this->actingAs($this->buyer, 'sanctum');
        $id = $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 2])->json('data.id');

        Review::whereKey($id)->update(['created_at' => now()->subDays(31)]);
        $this->patchJson("/api/v1/buyer/reviews/{$id}", ['rating' => 1])->assertStatus(422);
    }

    public function test_public_reviews_mask_the_buyer_name(): void
    {
        $order = $this->order($this->buyer);
        $this->actingAs($this->buyer, 'sanctum');
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $this->product->id, 'rating' => 5, 'comment' => 'Matibay at maganda!'])->assertCreated();

        $this->getJson("/api/v1/products/{$this->product->id}/reviews")->assertOk()
            ->assertJsonPath('data.0.buyer.name', 'A*a C.');
    }
}
