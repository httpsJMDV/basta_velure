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
 * Shop comments (Amaru task 6, "shop reviews" in the URLs): who can comment on a shop, one comment per buyer per shop,
 * two edits a day, the fields (a comment and quick tags, no stars), the seller's single reply, and where they show.
 * A shop's page, comments included, needs a signed-in account.
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

    public function test_only_a_buyer_with_a_completed_order_from_the_shop_can_comment(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);

        $this->getJson($this->url())->assertOk()->assertJsonPath('data.can_review', false)
            ->assertJsonPath('data.tags', ShopReview::TAGS);
        $this->postJson($this->url(), ['comment' => 'Maayos ang tindahan.'])->assertForbidden()
            ->assertJsonPath('message', 'You can comment on this shop after one of your orders from it is completed.');

        // A delivered order that is not completed yet does not count.
        $this->orderFrom($buyer, OrderStatus::DELIVERED->value);
        $this->postJson($this->url(), ['comment' => 'Maayos ang tindahan.'])->assertForbidden();

        $this->orderFrom($buyer);
        $this->getJson($this->url())->assertJsonPath('data.can_review', true)->assertJsonPath('data.review', null);
        $this->postJson($this->url(), ['comment' => 'Mabilis mag-reply at maayos ang balot.', 'tags' => ['Good packaging', 'Fast shipping']])
            ->assertCreated()
            ->assertJsonMissingPath('data.rating')
            ->assertJsonPath('data.tags', ['Fast shipping', 'Good packaging']);
        $this->assertNull(ShopReview::where('buyer_id', $buyer->id)->value('rating'));

        // The seller cannot comment on their own shop.
        Sanctum::actingAs($this->seller);
        $this->postJson($this->url(), ['comment' => 'Best shop ever'])->assertForbidden()->assertJsonPath('message', 'You cannot comment on your own shop.');
    }

    public function test_one_comment_per_buyer_per_shop_edited_at_most_twice_a_day(): void
    {
        $buyer = $this->buyer();
        $this->orderFrom($buyer);
        Sanctum::actingAs($buyer);
        \Illuminate\Support\Carbon::setTestNow('2026-10-24 09:00:00');

        $this->postJson($this->url(), ['comment' => 'Okay naman.'])->assertCreated();
        $this->postJson($this->url(), ['comment' => 'Second try'])->assertStatus(409);
        $this->assertSame(1, ShopReview::where('buyer_id', $buyer->id)->count());

        $this->patchJson($this->url(), ['comment' => 'Mabait ang seller.'])->assertOk()->assertJsonPath('edits_left_today', 1)->assertJsonPath('data.edited', true);
        $this->patchJson($this->url(), ['comment' => 'Mabait at mabilis.'])->assertOk()->assertJsonPath('edits_left_today', 0);
        $this->patchJson($this->url(), ['comment' => 'Isa pa'])->assertStatus(429)
            ->assertJsonPath('message', 'You can edit your comment twice a day. Try again tomorrow.');
        $this->assertSame('Mabait at mabilis.', ShopReview::where('buyer_id', $buyer->id)->value('comment'));

        // A new Manila day gives two more edits (16:00 UTC is midnight in Manila).
        \Illuminate\Support\Carbon::setTestNow('2026-10-24 16:30:00');
        $this->patchJson($this->url(), ['comment' => 'Bagong araw.'])->assertOk()->assertJsonPath('edits_left_today', 1);
    }

    public function test_fields_are_checked_on_the_server(): void
    {
        $buyer = $this->buyer();
        $this->orderFrom($buyer);
        Sanctum::actingAs($buyer);

        $this->postJson($this->url(), [])->assertStatus(422)->assertJsonPath('errors.comment.0', 'Write your comment about the shop.');
        $this->postJson($this->url(), ['comment' => str_repeat('a', 501)])->assertStatus(422)
            ->assertJsonPath('errors.comment.0', 'A comment can be at most 500 characters.');
        $this->postJson($this->url(), ['comment' => '!!!!'])->assertStatus(422)->assertJsonValidationErrors('comment');
        $this->postJson($this->url(), ['comment' => 'Good shop', 'tags' => ['Cheap']])->assertStatus(422)->assertJsonValidationErrors('tags.0');
        $this->postJson($this->url(), ['comment' => 'Good shop', 'tags' => ['Fast shipping', 'Fast shipping']])->assertStatus(422);

        // Stars are no longer asked for (one sent anyway is ignored), and a comment's HTML is stripped.
        $this->postJson($this->url(), ['rating' => 5, 'comment' => '<b>Salamat po</b>'])->assertCreated()->assertJsonPath('data.comment', 'Salamat po');
        $this->assertNull(ShopReview::where('buyer_id', $buyer->id)->value('rating'));
    }

    public function test_the_seller_replies_once_and_can_edit_the_reply(): void
    {
        $buyer = $this->buyer();
        $this->orderFrom($buyer);
        Sanctum::actingAs($buyer);
        $id = $this->postJson($this->url(), ['comment' => 'Matagal bago naipadala.'])->json('data.id');
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

    public function test_the_shop_page_shows_the_count_the_tags_and_three_latest_to_signed_in_accounts_only(): void
    {
        $tagSets = [['Fast shipping'], ['Fast shipping', 'Good packaging'], [], ['Fast shipping']];
        foreach ($tagSets as $i => $tags) {
            $buyer = $this->buyer();
            $this->orderFrom($buyer);
            ShopReview::create(['seller_id' => $this->seller->id, 'buyer_id' => $buyer->id, 'comment' => "Comment number {$i}", 'tags' => $tags])
                ->forceFill(['created_at' => now()->subDays(4 - $i)])->save();
        }

        // Signed out: the shop's page and its comments are closed.
        $this->getJson("/api/v1/shops/{$this->slug}")->assertUnauthorized();
        $this->getJson($this->url('shop-reviews'))->assertUnauthorized();
        $this->getJson($this->url('reviews'))->assertUnauthorized();

        Sanctum::actingAs($this->buyer());
        $this->getJson("/api/v1/shops/{$this->slug}")->assertOk()
            ->assertJsonPath('data.shop_reviews.count', 4)
            ->assertJsonPath('data.shop_reviews.tag_counts.0', ['tag' => 'Fast shipping', 'count' => 3])
            ->assertJsonPath('data.shop_reviews.tag_counts.1', ['tag' => 'Good packaging', 'count' => 1])
            ->assertJsonMissingPath('data.shop_reviews.average')
            ->assertJsonCount(3, 'data.shop_reviews.latest')
            ->assertJsonPath('data.shop_reviews.latest.0.comment', 'Comment number 3');

        $this->getJson($this->url('shop-reviews'))->assertOk()->assertJsonPath('meta.total', 4)->assertJsonPath('data.0.comment', 'Comment number 3');
        $this->getJson($this->url('shop-reviews') . '?tag=Good%20packaging')->assertOk()->assertJsonPath('meta.total', 1);

        $admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::random(6) . '@example.com', 'password' => 'x', 'role' => 'admin', 'status' => 'active']);
        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/reviews/shops/{$this->seller->id}/shop-reviews")->assertOk()->assertJsonPath('meta.total', 4)
            ->assertJsonPath('summary.count', 4);
    }
}
