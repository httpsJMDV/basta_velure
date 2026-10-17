<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Characterization tests for the existing buyer-seller / support chat (written before the rider chat
 * was added, so they pin the behaviour that feature 2.10 must leave unchanged).
 */
class ConversationChatTest extends TestCase
{
    use DatabaseTransactions;

    protected function makeUser(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name' => $first,
            'last_name'  => 'Tester',
            'email'      => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone'      => '0917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => $role,
            'status'     => 'active',
        ]);
    }

    protected function startChat(User $buyer, User $seller, string $initial = 'Hi, is this available?')
    {
        return $this->actingAs($buyer, 'sanctum')->postJson('/api/v1/conversations/start', [
            'type'            => 'buyer_seller',
            'seller_id'       => $seller->id,
            'initial_message' => $initial,
        ]);
    }

    public function test_buyer_starts_a_conversation_and_the_seller_sees_it_unread(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');

        $response = $this->startChat($buyer, $seller)->assertCreated();
        $conversationId = $response->json('data.id');
        $response->assertJsonPath('data.type', 'buyer_seller')
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.buyer_id', $buyer->id)
            ->assertJsonPath('data.seller_id', $seller->id)
            ->assertJsonPath('data.last_message.body', 'Hi, is this available?');

        $this->assertDatabaseHas('conversations', ['id' => $conversationId, 'seller_unread' => 1, 'buyer_unread' => 0]);

        $sellerList = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/conversations?scope=seller')->assertOk();
        $this->assertSame([$conversationId], collect($sellerList->json('data'))->pluck('id')->all());
        $this->assertSame(1, $sellerList->json('data.0.unread'));

        $this->actingAs($seller, 'sanctum')->getJson('/api/v1/conversations/unread-count?scope=seller')
            ->assertOk()->assertJsonPath('data.unread_count', 1);

        // Starting again finds the same conversation instead of creating a second one.
        $again = $this->startChat($buyer, $seller, 'Another question')->assertCreated();
        $this->assertSame($conversationId, $again->json('data.id'));
        $this->assertSame(1, Conversation::where('buyer_id', $buyer->id)->where('seller_id', $seller->id)->count());
    }

    public function test_fetching_messages_marks_them_read_and_clears_that_sides_unread(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');
        $id = $this->startChat($buyer, $seller)->json('data.id');

        $this->actingAs($seller, 'sanctum')->getJson("/api/v1/conversations/{$id}/messages")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.body', 'Hi, is this available?')
            ->assertJsonPath('data.0.sender_id', $buyer->id);

        $this->assertDatabaseHas('conversations', ['id' => $id, 'seller_unread' => 0]);
        $this->assertNotNull(Message::where('conversation_id', $id)->first()->read_at);
    }

    public function test_seller_reply_raises_the_buyers_unread_and_strips_html(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');
        $id = $this->startChat($buyer, $seller)->json('data.id');

        $this->actingAs($seller, 'sanctum')->postJson("/api/v1/conversations/{$id}/messages", [
            'body' => '<b>Yes</b>, in stock!',
        ])->assertCreated()->assertJsonPath('data.body', 'Yes, in stock!')->assertJsonPath('data.sender_id', $seller->id);

        $this->assertDatabaseHas('conversations', ['id' => $id, 'buyer_unread' => 1]);

        $buyerList = $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/conversations')->assertOk();
        $this->assertSame(1, $buyerList->json('data.0.unread'));

        // The incremental "since" parameter returns only newer messages.
        $first = Message::where('conversation_id', $id)->orderBy('id')->first();
        $first->forceFill(['created_at' => now()->subMinutes(10)])->save();
        $this->actingAs($buyer, 'sanctum')
            ->getJson("/api/v1/conversations/{$id}/messages?since=" . urlencode(now()->subMinutes(5)->toDateTimeString()))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.body', 'Yes, in stock!');
    }

    public function test_both_inboxes_are_told_live_when_a_message_arrives(): void
    {
        \Illuminate\Support\Facades\Event::fake([\App\Events\ConversationUpdated::class, \App\Events\MessageSent::class]);
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');
        $id = $this->startChat($buyer, $seller)->json('data.id');

        $this->actingAs($seller, 'sanctum')->postJson("/api/v1/conversations/{$id}/messages", ['body' => 'Yes, in stock!'])->assertCreated();

        \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\MessageSent::class, fn ($e) => $e->message->body === 'Yes, in stock!');
        // The raised counter reaches the buyer as a number (a raw SQL increment used to break this broadcast).
        \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\ConversationUpdated::class, fn ($e) => $e->userId === $buyer->id && $e->unreadCount === 1);
        \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\ConversationUpdated::class, fn ($e) => $e->userId === $seller->id);
    }

    public function test_attachment_pickers_list_real_prices_photos_and_the_shops_orders(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');
        $other = $this->makeUser('seller', 'Other');
        $id = $this->startChat($buyer, $seller)->json('data.id');

        $category = \App\Models\Category::create(['name' => 'Cat ' . uniqid(), 'slug' => 'cat-' . uniqid(), 'is_active' => true, 'commission_rate' => 0.10]);
        $product = \App\Models\Product::create(['seller_id' => $seller->id, 'category_id' => $category->id, 'name' => 'Rattan Basket ' . uniqid(), 'base_price' => 499, 'status' => 'active']);
        \App\Models\ProductImage::create(['product_id' => $product->id, 'path' => 'products/basket.jpg', 'is_primary' => true, 'sort_order' => 0]);

        $order = function (User $shop, string $item) use ($buyer) {
            $o = \App\Models\Order::create([
                'buyer_id' => $buyer->id, 'order_number' => 'VEL-T' . uniqid(), 'subtotal' => 499, 'shipping_fee' => 50, 'total' => 549,
                'payment_method' => 'cod', 'payment_status' => 'pending', 'status' => 'PLACED',
                'shipping_name' => 'Ana', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St',
                'shipping_province_code' => '040340000', 'shipping_city_code' => '040342800', 'shipping_barangay_code' => '040342801',
            ]);
            \App\Models\OrderItem::create(['order_id' => $o->id, 'seller_id' => $shop->id, 'product_name' => $item, 'unit_price' => 499, 'quantity' => 1, 'subtotal' => 499]);

            return $o;
        };
        $mine = $order($seller, 'Rattan Basket');
        $order($other, 'Somebody else');

        $products = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/conversations/{$id}/attachable-products")->assertOk();
        $this->assertSame(499.0, (float) collect($products->json('data'))->firstWhere('id', $product->id)['price']);
        $this->assertStringEndsWith('storage/products/basket.jpg', collect($products->json('data'))->firstWhere('id', $product->id)['image']);

        // Only this shop's orders, for the buyer and for the seller.
        foreach ([$buyer, $seller] as $viewer) {
            $orders = $this->actingAs($viewer, 'sanctum')->getJson("/api/v1/conversations/{$id}/attachable-orders")->assertOk();
            $this->assertSame([$mine->id], collect($orders->json('data'))->pluck('id')->all());
        }
        $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/conversations/{$id}/attachable-orders?q=nothing-like-this")
            ->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_empty_message_is_rejected(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');
        $id = $this->startChat($buyer, $seller)->json('data.id');

        $this->actingAs($buyer, 'sanctum')->postJson("/api/v1/conversations/{$id}/messages", ['body' => '   '])
            ->assertStatus(422);
    }

    public function test_an_outsider_cannot_read_or_write_a_conversation_but_an_admin_can_read_it(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $seller = $this->makeUser('seller', 'Maria');
        $outsider = $this->makeUser('buyer', 'Eve');
        $admin = $this->makeUser('admin', 'Root');
        $id = $this->startChat($buyer, $seller)->json('data.id');

        $this->actingAs($outsider, 'sanctum')->getJson("/api/v1/conversations/{$id}/messages")->assertForbidden();
        $this->actingAs($outsider, 'sanctum')->postJson("/api/v1/conversations/{$id}/messages", ['body' => 'hi'])->assertForbidden();
        $this->actingAs($outsider, 'sanctum')->getJson("/api/v1/conversations/{$id}")->assertForbidden();
        $this->actingAs($outsider, 'sanctum')->getJson('/api/v1/conversations')->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($admin, 'sanctum')->getJson("/api/v1/conversations/{$id}/messages")->assertOk()->assertJsonCount(1, 'data');
        $this->assertContains($id, collect(
            $this->actingAs($admin, 'sanctum')->getJson('/api/v1/conversations')->json('data')
        )->pluck('id')->all());
    }

    public function test_buyer_support_conversation_is_listed_for_the_buyer_and_the_admin(): void
    {
        $buyer = $this->makeUser('buyer', 'Ana');
        $admin = $this->makeUser('admin', 'Root');

        $id = $this->actingAs($buyer, 'sanctum')->postJson('/api/v1/conversations/start', [
            'type'            => 'buyer_admin',
            'initial_message' => 'I need help',
        ])->assertCreated()->assertJsonPath('data.type', 'buyer_admin')->json('data.id');

        $this->assertContains($id, collect($this->actingAs($buyer, 'sanctum')->getJson('/api/v1/conversations')->json('data'))->pluck('id')->all());
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/conversations/unread-count')->assertOk()->assertJsonStructure(['data' => ['unread_count']]);
        $this->assertContains($id, collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/conversations?type=buyer_admin')->json('data'))->pluck('id')->all());
    }
}
