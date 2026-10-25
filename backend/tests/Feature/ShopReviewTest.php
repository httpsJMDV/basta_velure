<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ShopReview;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Shop reviews (Amaru task 6): who can review a shop, one review per buyer per shop, two edits a day, the fields,
 * the seller's single reply, and where the reviews show.
 */
class ShopReviewTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private User $seller;
    private string $slug;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $this->slug = Str::slug($this->seller->sellerProfile->shop_name);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
    }

    private function orderFrom(User $buyer, string $status = 'COMPLETED'): Order
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(Str::random(8)), 'buyer_id' => $buyer->id, 'status' => $status,
            'subtotal' => 500, 'shipping_fee' => 60, 'total' => 560, 'payment_method' => 'cod',
            'shipping_name' => 'Ana', 'shipping_phone' => '09171234567', 'shipping_address' => '1 Rizal St',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->seller->id, 'product_name' => 'Abaca Tote', 'unit_price' => 500,
            'quantity' => 1, 'subtotal' => 500, 'commission_rate' => 0.05, 'commission_amount' => 25, 'seller_earnings' => 475,
        ]);

        return $order;
    }

    private function url(string $suffix = 'my-shop-review'): string
    {
        return "/api/v1/shops/{$this->slug}/{$suffix}";
    }

    public function test_only_a_buyer_with_a_completed_order_from_the_shop_can_review_it(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);

        $this->getJson($this->url())->assertOk()->assertJsonPath('data.can_review', false)
            ->assertJsonPath('data.tags', ShopReview::TAGS);
        $this->postJson($this->url(), ['rating' => 5])->assertForbidden()
            ->assertJsonPath('message', 'You can review this shop after one of your orders from it is completed.');

        // A delivered order that is not completed yet does not count.
        $this->orderFrom($buyer, OrderStatus::DELIVERED->value);
        $this->postJson($this->url(), ['rating' => 5])->assertForbidden();

        $this->orderFrom($buyer);
        $this->getJson($this->url())->assertJsonPath('data.can_review', true)->assertJsonPath('data.review', null);
        $this->postJson($this->url(), ['rating' => 4, 'comment' => 'Mabilis mag-reply at maayos ang balot.', 'tags' => ['Good packaging', 'Fast shipping']])
            ->assertCreated()
            ->assertJsonPath('data.rating', 4)
            ->assertJsonPath('data.tags', ['Fast shipping', 'Good packaging']);

        // The seller cannot review their own shop.
        Sanctum::actingAs($this->seller);
        $this->postJson($this->url(), ['rating' => 5])->assertForbidden()->assertJsonPath('message', 'You cannot review your own shop.');
    }

    public function test_one_review_per_buyer_per_shop_edited_at_most_twice_a_day(): void
    {
        $buyer = $this->buyer();
        $this->orderFrom($buyer);
        Sanctum::actingAs($buyer);
        \Illuminate\Support\Carbon::setTestNow('2026-10-24 09:00:00');

        $this->postJson($this->url(), ['rating' => 3])->assertCreated();
        $this->postJson($this->url(), ['rating' => 5])->assertStatus(409);
        $this->assertSame(1, ShopReview::where('buyer_id', $buyer->id)->count());

        $this->patchJson($this->url(), ['rating' => 4])->assertOk()->assertJsonPath('edits_left_today', 1)->assertJsonPath('data.edited', true);
        $this->patchJson($this->url(), ['rating' => 5])->assertOk()->assertJsonPath('edits_left_today', 0);
        $this->patchJson($this->url(), ['rating' => 1])->assertStatus(429)
            ->assertJsonPath('message', 'You can edit your shop review twice a day. Try again tomorrow.');
        $this->assertSame(5, ShopReview::where('buyer_id', $buyer->id)->value('rating'));

        // A new Manila day gives two more edits (16:00 UTC is midnight in Manila).
        \Illuminate\Support\Carbon::setTestNow('2026-10-24 16:30:00');
        $this->patchJson($this->url(), ['rating' => 2])->assertOk()->assertJsonPath('edits_left_today', 1);
    }

    public function test_fields_are_checked_on_the_server(): void
    {
        $buyer = $this->buyer();
        $this->orderFrom($buyer);
        Sanctum::actingAs($buyer);

        $this->postJson($this->url(), [])->assertStatus(422)->assertJsonPath('errors.rating.0', 'Choose from 1 to 5 stars.');
        $this->postJson($this->url(), ['rating' => 6])->assertStatus(422)->assertJsonValidationErrors('rating');
        $this->postJson($this->url(), ['rating' => 5, 'comment' => str_repeat('a', 501)])->assertStatus(422)
            ->assertJsonPath('errors.comment.0', 'A comment can be at most 500 characters.');
        $this->postJson($this->url(), ['rating' => 5, 'comment' => '!!!!'])->assertStatus(422)->assertJsonValidationErrors('comment');
        $this->postJson($this->url(), ['rating' => 5, 'tags' => ['Cheap']])->assertStatus(422)->assertJsonValidationErrors('tags.0');
        $this->postJson($this->url(), ['rating' => 5, 'tags' => ['Fast shipping', 'Fast shipping']])->assertStatus(422);

        // Stars alone are enough; a comment's HTML is stripped.
        $this->postJson($this->url(), ['rating' => 5, 'comment' => '<b>Salamat po</b>'])->assertCreated()->assertJsonPath('data.comment', 'Salamat po');
    }

    public function test_the_seller_replies_once_and_can_edit_the_reply(): void
    {
        $buyer = $this->buyer();
        $this->orderFrom($buyer);
        Sanctum::actingAs($buyer);
        $id = $this->postJson($this->url(), ['rating' => 2, 'comment' => 'Matagal bago naipadala.'])->json('data.id');
        $this->assertSame(1, $this->seller->notifications()->where('data->kind', 'shop_review.new')->count());

        Sanctum::actingAs($this->seller);
        $this->getJson('/api/v1/seller/shop-reviews')->assertOk()->assertJsonPath('meta.unreplied', 1)->assertJsonPath('data.0.id', $id);
        $this->postJson("/api/v1/seller/shop-reviews/{$id}/reply", ['body' => 'Pasensya na po, babawi kami.'])->assertCreated();
        $this->postJson("/api/v1/seller/shop-reviews/{$id}/reply", ['body' => 'Again'])->assertStatus(409);
        $this->patchJson("/api/v1/seller/shop-reviews/{$id}/reply", ['body' => 'Pasensya na po talaga.'])->assertOk()
            ->assertJsonPath('data.seller_reply.body', 'Pasensya na po talaga.');

        // Another shop cannot reply to it.
        Sanctum::actingAs($this->seller('RV Gadget Hub', $this->cebu));
        $this->postJson("/api/v1/seller/shop-reviews/{$id}/reply", ['body' => 'Hello there'])->assertNotFound();
    }

    public function test_the_shop_page_shows_the_average_and_three_latest_and_the_list_filters_by_stars(): void
    {
        foreach ([5, 4, 5, 2] as $i => $stars) {
            $buyer = $this->buyer();
            $this->orderFrom($buyer);
            ShopReview::create(['seller_id' => $this->seller->id, 'buyer_id' => $buyer->id, 'rating' => $stars])
                ->forceFill(['created_at' => now()->subDays(4 - $i)])->save();
        }

        $this->getJson("/api/v1/shops/{$this->slug}")->assertOk()
            ->assertJsonPath('data.shop_reviews.average', 4)
            ->assertJsonPath('data.shop_reviews.count', 4)
            ->assertJsonPath('data.shop_reviews.rating_counts.5', 2)
            ->assertJsonCount(3, 'data.shop_reviews.latest')
            ->assertJsonPath('data.shop_reviews.latest.0.rating', 2);

        $this->getJson($this->url('shop-reviews'))->assertOk()->assertJsonPath('meta.total', 4)->assertJsonPath('data.0.rating', 2);
        $this->getJson($this->url('shop-reviews') . '?rating=5')->assertOk()->assertJsonPath('meta.total', 2);

        $admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::random(6) . '@example.com', 'password' => 'x', 'role' => 'admin', 'status' => 'active']);
        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/reviews/shops/{$this->seller->id}/shop-reviews")->assertOk()->assertJsonPath('meta.total', 4)
            ->assertJsonPath('summary.count', 4);
    }
}
