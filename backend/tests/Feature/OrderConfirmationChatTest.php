<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Order;
use App\Services\Commerce\OrderConfirmationMessenger;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * The shop's order confirmation in the buyer's chat: placing an order sends a thank-you and an address card from
 * each shop; the buyer confirms the address once and the shop thanks them.
 */
class OrderConfirmationChatTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    /** @return array{0: \App\Models\User, 1: list<\App\Models\User>, 2: list<int>} */
    private function placeTwoShopOrder(string $method = 'cod'): array
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        $s2 = $this->seller('RV Gadget Hub', $this->cebu);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        [, $charger] = $this->product($s2, 'USB-C Fast Charger 20W', ['Default' => [399, 50]], 0.2);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);

        $ids = $this->postJson('/api/v1/checkout/place-order', [
            'address_id' => $addr->id, 'payment_method' => $method,
            'items' => [['variant_id' => $basket['Default']->id, 'quantity' => 2], ['variant_id' => $charger['Default']->id, 'quantity' => 1]],
        ])->assertCreated()->json('orders.*.id');

        return [$buyer, [$s1, $s2], $ids];
    }

    private function cardFor(int $orderId): Message
    {
        return Message::where('attachment_type', OrderConfirmationMessenger::TYPE)->get()
            ->firstOrFail(fn (Message $m) => (int) ($m->attachment_data['id'] ?? 0) === $orderId);
    }

    public function test_each_shop_sends_a_thank_you_and_an_address_card_when_the_order_is_placed(): void
    {
        [$buyer, $sellers, $ids] = $this->placeTwoShopOrder();

        foreach ($sellers as $seller) {
            $conversation = Conversation::where('buyer_id', $buyer->id)->where('seller_id', $seller->id)->where('type', 'buyer_seller')->firstOrFail();
            $messages = $conversation->messages()->orderBy('id')->get();
            $this->assertCount(2, $messages);
            $this->assertSame(OrderConfirmationMessenger::GREETING, $messages[0]->body);
            $this->assertSame($seller->id, $messages[0]->sender_id);
            $this->assertSame(OrderConfirmationMessenger::TYPE, $messages[1]->attachment_type);
            $this->assertSame(2, $conversation->buyer_unread);
        }

        $order = Order::with('items')->find($ids[0]);
        $card = $this->cardFor($order->id)->attachment_data;
        $this->assertSame($order->order_number, $card['order_number']);
        $this->assertSame($order->shipping_phone, $card['phone']);
        $this->assertStringContainsString($order->shipping_address, $card['address']);
        $this->assertSame((int) $order->items->sum('quantity'), $card['items_count']);
        $this->assertNull($card['confirmed_at']);
    }

    public function test_the_buyer_confirms_the_address_once_and_the_shop_thanks_them(): void
    {
        [, , $ids] = $this->placeTwoShopOrder();
        $card = $this->cardFor($ids[0]);
        $url = "/api/v1/conversations/{$card->conversation_id}/messages/{$card->id}/confirm-address";

        $res = $this->postJson($url)->assertOk()->json('data');
        $this->assertCount(2, $res);
        $this->assertNotNull($res[0]['attachment_data']['confirmed_at']);
        $this->assertSame(OrderConfirmationMessenger::THANKS, $res[1]['body']);

        // A second tap changes nothing and sends no second thank-you.
        $this->postJson($url)->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(1, Message::where('conversation_id', $card->conversation_id)->where('body', OrderConfirmationMessenger::THANKS)->count());
    }

    public function test_only_the_buyer_can_confirm_and_not_after_the_order_is_cancelled(): void
    {
        [, $sellers, $ids] = $this->placeTwoShopOrder();
        $card = $this->cardFor($ids[0]);
        $url = "/api/v1/conversations/{$card->conversation_id}/messages/{$card->id}/confirm-address";
        $seller = collect($sellers)->firstWhere('id', $card->sender_id);

        Sanctum::actingAs($seller);
        $this->postJson($url)->assertForbidden();

        Sanctum::actingAs(Conversation::find($card->conversation_id)->buyer);
        Order::whereKey($ids[0])->update(['status' => OrderStatus::CANCELLED->value]);
        $this->postJson($url)->assertStatus(409);

        // A plain message cannot be "confirmed".
        $greeting = Message::where('conversation_id', $card->conversation_id)->where('body', OrderConfirmationMessenger::GREETING)->first();
        $this->postJson("/api/v1/conversations/{$card->conversation_id}/messages/{$greeting->id}/confirm-address")->assertNotFound();
    }

    public function test_an_e_wallet_order_waits_until_it_is_paid(): void
    {
        [$buyer] = $this->placeTwoShopOrder('e_wallet');

        $this->assertSame(0, Message::whereHas('conversation', fn ($q) => $q->where('buyer_id', $buyer->id))->count());
    }
}
