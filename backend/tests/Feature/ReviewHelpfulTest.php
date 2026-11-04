<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Review;
use App\Models\ReviewImage;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * "Helpful" on product reviews, and what the public review list says about it: one vote per account, PUT and DELETE
 * idempotent, never on one's own or a hidden review; the list counts the votes, tells the viewer theirs, filters to
 * reviews with photos and sorts the most helpful first.
 */
class ReviewHelpfulTest extends TestCase
{
    use DatabaseTransactions;

    private User $author;
    private User $reader;
    private User $seller;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->author = $this->user('buyer');
        $this->reader = $this->user('buyer');
        $this->seller = $this->user('buyer');
        SellerProfile::forceCreate([
            'user_id' => $this->seller->id, 'shop_name' => 'Helpful Shop ' . Str::random(6), 'shop_category' => 'x', 'shop_description' => 'x',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'helpful' . $this->seller->id), 'government_id_image_path' => 'x.png',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
        ]);
        $category = Category::create(['name' => 'Cat ' . Str::random(6), 'slug' => 'cat-' . Str::lower(Str::random(8)), 'is_active' => true, 'commission_rate' => 0.10]);
        $this->product = Product::create(['seller_id' => $this->seller->id, 'category_id' => $category->id, 'name' => 'Abaca Bag ' . Str::random(4), 'base_price' => 499, 'status' => 'active']);
    }

    private function user(string $role): User
    {
        return User::forceCreate([
            'first_name' => 'Lia', 'last_name' => 'Santos', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function review(User $buyer, int $rating = 5, array $extra = []): Review
    {
        $order = Order::create([
            'buyer_id' => $buyer->id, 'order_number' => 'VEL-H' . Str::upper(Str::random(8)), 'subtotal' => 499, 'shipping_fee' => 50, 'total' => 549,
            'payment_method' => 'cod', 'payment_status' => 'pending', 'status' => 'COMPLETED', 'completed_at' => now(),
            'shipping_name' => 'Lia', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St',
            'shipping_province_code' => '040340000', 'shipping_city_code' => '040342800', 'shipping_barangay_code' => '040342801',
        ]);
        $item = OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->seller->id, 'product_id' => $this->product->id,
            'product_name' => $this->product->name, 'unit_price' => 499, 'quantity' => 1, 'subtotal' => 499,
        ]);

        return Review::create([
            'buyer_id' => $buyer->id, 'product_id' => $this->product->id, 'order_id' => $order->id, 'order_item_id' => $item->id,
            'rating' => $rating, 'comment' => 'Maganda.', 'verified_purchase' => true, 'moderation_status' => 'visible', ...$extra,
        ]);
    }

    public function test_marking_helpful_counts_once_and_unmarking_is_idempotent(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->reader, 'sanctum');

        $this->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk()
            ->assertJsonPath('data.review_id', $review->id)
            ->assertJsonPath('data.helpful_count', 1)
            ->assertJsonPath('data.helped', true);
        // A double tap or a retried request does not count twice.
        $this->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk()->assertJsonPath('data.helpful_count', 1);
        $this->assertDatabaseCount('review_helpful_votes', 1);

        $this->deleteJson("/api/v1/reviews/{$review->id}/helpful")->assertOk()
            ->assertJsonPath('data.helpful_count', 0)
            ->assertJsonPath('data.helped', false);
        $this->deleteJson("/api/v1/reviews/{$review->id}/helpful")->assertOk()->assertJsonPath('data.helpful_count', 0);
    }

    public function test_the_count_adds_up_votes_from_different_accounts(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->reader, 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk();
        $this->actingAs($this->user('buyer'), 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")
            ->assertOk()->assertJsonPath('data.helpful_count', 2);
    }

    public function test_an_author_cannot_mark_their_own_review(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->author, 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")
            ->assertStatus(422)->assertJsonPath('message', 'You cannot mark your own review as helpful.');
        $this->assertDatabaseCount('review_helpful_votes', 0);
    }

    public function test_a_hidden_or_missing_review_is_not_found(): void
    {
        $hidden = $this->review($this->author, 5, ['moderation_status' => 'hidden']);
        $this->actingAs($this->reader, 'sanctum');

        $this->putJson("/api/v1/reviews/{$hidden->id}/helpful")->assertNotFound();
        $this->deleteJson("/api/v1/reviews/{$hidden->id}/helpful")->assertNotFound();
        $this->putJson('/api/v1/reviews/999999999/helpful')->assertNotFound();
    }

    public function test_a_guest_must_sign_in(): void
    {
        $review = $this->review($this->author);
        $this->putJson("/api/v1/reviews/{$review->id}/helpful")->assertUnauthorized();
        $this->deleteJson("/api/v1/reviews/{$review->id}/helpful")->assertUnauthorized();
    }

    public function test_the_product_list_shows_the_count_and_the_viewers_own_vote(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->reader, 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk();

        $this->getJson("/api/v1/products/{$this->product->id}/reviews")->assertOk()
            ->assertJsonPath('data.0.helpful_count', 1)
            ->assertJsonPath('data.0.helped', true)
            ->assertJsonPath('data.0.is_mine', false);

        $this->actingAs($this->author, 'sanctum');
        $this->getJson("/api/v1/products/{$this->product->id}/reviews")->assertOk()
            ->assertJsonPath('data.0.helped', false)
            ->assertJsonPath('data.0.is_mine', true);
    }

    public function test_a_guest_sees_the_count_without_a_vote(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->reader, 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk();
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/v1/products/{$this->product->id}/reviews")->assertOk()
            ->assertJsonPath('data.0.helpful_count', 1)
            ->assertJsonPath('data.0.helped', false)
            ->assertJsonPath('data.0.is_mine', false);
    }

    public function test_the_list_filters_to_photos_and_sorts_the_most_helpful_first(): void
    {
        $plain = $this->review($this->author, 5);
        $withPhoto = $this->review($this->user('buyer'), 3);
        ReviewImage::create(['review_id' => $withPhoto->id, 'path' => 'review_images/a.png', 'sort_order' => 0]);
        $liked = $this->review($this->user('buyer'), 4);
        $this->actingAs($this->reader, 'sanctum')->putJson("/api/v1/reviews/{$liked->id}/helpful")->assertOk();

        $url = "/api/v1/products/{$this->product->id}/reviews";
        $this->getJson("{$url}?with_photos=1")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $withPhoto->id)
            ->assertJsonPath('meta.photo_count', 1)
            ->assertJsonPath('meta.total', 1);

        // Most helpful first, then the one with a photo, then the rest.
        $ids = array_column($this->getJson("{$url}?sort=helpful")->assertOk()->json('data'), 'id');
        $this->assertSame([$liked->id, $withPhoto->id, $plain->id], $ids);

        // The star counts and the photo count describe every review, whatever the filter.
        $this->getJson("{$url}?with_photos=1&rating=5")->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.rating_counts.5', 1)
            ->assertJsonPath('meta.photo_count', 1);
    }

    public function test_the_author_sees_how_many_found_their_review_helpful(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->reader, 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk();

        $this->actingAs($this->author, 'sanctum')->getJson('/api/v1/buyer/reviews')->assertOk()
            ->assertJsonPath('data.0.id', $review->id)
            ->assertJsonPath('data.0.helpful_count', 1);
    }

    public function test_the_shop_review_list_carries_the_same_fields(): void
    {
        $review = $this->review($this->author);
        $this->actingAs($this->reader, 'sanctum')->putJson("/api/v1/reviews/{$review->id}/helpful")->assertOk();

        $this->getJson("/api/v1/shops/{$this->seller->id}/reviews")->assertOk()
            ->assertJsonPath('data.0.helpful_count', 1)
            ->assertJsonPath('data.0.helped', true)
            ->assertJsonPath('data.0.is_mine', false);
    }
}
