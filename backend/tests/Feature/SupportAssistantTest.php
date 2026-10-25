<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\Ai\AiModel;
use App\Services\Ai\SupportAssistant;
use App\Services\SupportChat;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsEscrowOrders;
use Tests\Support\FakeAiModel;
use Tests\TestCase;

/**
 * Amaru task 8: the Loved-IT Assistant answers a buyer's Loved-IT Support chat. It reads only that buyer's orders,
 * has no tool that changes anything, and hands the chat to a person when asked or when it cannot answer. The fake model
 * stands in for Claude, so nothing here calls the real API.
 */
class SupportAssistantTest extends TestCase
{
    use BuildsEscrowOrders;
    use DatabaseTransactions;

    private FakeAiModel $ai;

    private User $buyer;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->ai = new FakeAiModel();
        $this->app->instance(AiModel::class, $this->ai);
        config(['ai.support_bot.enabled' => true]);

        $this->buyer = $this->makeUser('buyer', 'Bea');
        $this->admin = $this->makeUser('admin', 'Ana');
        Sanctum::actingAs($this->buyer);
    }

    private function supportChat(): Conversation
    {
        $id = $this->postJson('/api/v1/conversations/start', ['type' => 'buyer_admin'])->assertCreated()->json('data.id');

        return Conversation::findOrFail($id);
    }

    private function say(Conversation $chat, string $text)
    {
        return $this->postJson("/api/v1/conversations/{$chat->id}/messages", ['body' => $text])->assertCreated();
    }

    public function test_it_looks_up_the_buyers_own_order_and_answers_without_bothering_the_admins(): void
    {
        $order = $this->makeOrder(OrderStatus::PREPARING, buyer: $this->buyer);
        $chat = $this->supportChat();
        $this->assertSame('ai', $this->getJson("/api/v1/conversations/{$chat->id}")->json('data.support_mode'));

        $this->ai->queue(
            FakeAiModel::tool(SupportAssistant::GET_ORDER, ['order_number' => $order->order_number], 'toolu_1'),
            FakeAiModel::text('Your order is being packed. You can still cancel it from My Orders.'),
        );
        $this->say($chat, "Where is my order {$order->order_number}?");

        $reply = Message::where('conversation_id', $chat->id)->where('sender_kind', 'ai')->sole();
        $this->assertNull($reply->sender_id);
        $this->assertSame('Your order is being packed. You can still cancel it from My Orders.', $reply->body);
        // The one order it opened rides along as a card.
        $this->assertSame('order_list', $reply->attachment_type);
        $this->assertSame($order->order_number, $reply->attachment_data['orders'][0]['order_number']);
        $this->assertSame('PREPARING', $reply->attachment_data['orders'][0]['status']);
        $this->assertSame('Order packed', $reply->attachment_data['orders'][0]['status_label']);
        $this->assertSame(0, (int) $chat->fresh()->admin_unread);
        $this->assertSame(1, (int) $chat->fresh()->buyer_unread);

        // The lookup went back to Claude with the assistant turn unchanged and the order's facts.
        $second = $this->ai->calls[1]['messages'];
        $this->assertSame('assistant', $second[1]['role']);
        $this->assertSame('tool_use', $second[1]['content'][0]['type']);
        $result = $second[2]['content'][0];
        $this->assertSame('toolu_1', $result['toolUseID']);
        $facts = json_decode($result['content'], true);
        $this->assertSame($order->order_number, $facts['order_number']);
        $this->assertTrue($facts['can_cancel_now']);
        $this->assertArrayNotHasKey('delivery_otp', $facts);
        $this->assertArrayNotHasKey('payment_token', $facts);
        $this->assertStringNotContainsString('09998887777', $result['content']);

        $messages = $this->getJson("/api/v1/conversations/{$chat->id}/messages")->json('data');
        $this->assertSame('assistant', end($messages)['sender_role']);
        $this->assertSame('Loved-IT Assistant', end($messages)['sender_name']);
        $this->assertSame(0, (int) $chat->fresh()->buyer_unread);
    }

    public function test_cards_show_only_the_listed_orders_the_reply_names(): void
    {
        $packed = $this->makeOrder(OrderStatus::PREPARING, buyer: $this->buyer);
        $this->makeOrder(OrderStatus::COMPLETED, buyer: $this->buyer);
        $chat = $this->supportChat();
        // The model writes the number with Unicode non-breaking hyphens; it still matches.
        $named = str_replace('-', "\u{2011}", $packed->order_number);
        $this->ai->queue(FakeAiModel::tool(SupportAssistant::LIST_ORDERS, []), FakeAiModel::text("Order {$named} is still being packed."));

        $this->say($chat, 'Which order is not delivered yet?');

        $reply = Message::where('conversation_id', $chat->id)->where('sender_kind', 'ai')->sole();
        $this->assertSame("Order {$packed->order_number} is still being packed.", $reply->body);
        $this->assertSame([$packed->order_number], array_column($reply->attachment_data['orders'], 'order_number'));
        $this->assertSame('order_list', $this->getJson("/api/v1/conversations/{$chat->id}/messages")->json('data.1.attachment_type'));

        // A buyer cannot post a card like this themselves.
        $this->postJson("/api/v1/conversations/{$chat->id}/messages", ['body' => 'x', 'attachment_type' => 'order_list', 'attachment_data' => ['orders' => []]])
            ->assertStatus(422);
    }

    public function test_it_cannot_see_another_buyers_orders_and_has_no_tool_that_changes_anything(): void
    {
        $someoneElse = $this->makeOrder(OrderStatus::DELIVERED);
        $chat = $this->supportChat();
        $this->ai->queue(
            FakeAiModel::tool(SupportAssistant::GET_ORDER, ['order_number' => $someoneElse->order_number]),
            FakeAiModel::tool(SupportAssistant::LIST_ORDERS, []),
            FakeAiModel::text('I can only help with your own orders.'),
        );
        $this->say($chat, "Check order {$someoneElse->order_number} please");

        $this->assertStringContainsString('No order with that number', $this->ai->calls[1]['messages'][2]['content'][0]['content']);
        $this->assertSame(['orders' => []], json_decode($this->ai->calls[2]['messages'][4]['content'][0]['content'], true));

        $tools = array_column($this->ai->calls[0]['tools'], 'name');
        $this->assertSame([SupportAssistant::LIST_ORDERS, SupportAssistant::GET_ORDER, SupportAssistant::HANDOFF], $tools);
    }

    public function test_the_assistant_can_hand_the_chat_to_a_person_and_then_stays_quiet(): void
    {
        $chat = $this->supportChat();
        $this->ai->queue(
            FakeAiModel::tool(SupportAssistant::HANDOFF, ['reason' => 'Buyer says the GCash payment went to the wrong shop.']),
            FakeAiModel::text("I've passed this to the Loved-IT team. A person will reply here."),
        );
        $this->say($chat, 'I paid the wrong shop by GCash, help!');

        $chat->refresh();
        $this->assertSame('human', $chat->support_mode);
        $this->assertSame(1, (int) $chat->admin_unread);
        $this->assertSame(1, $this->admin->notifications()->where('data->kind', 'support.handoff')->count());

        $this->say($chat, 'Hello? Anyone there?');
        $this->assertCount(2, $this->ai->calls);
        $this->assertSame(2, (int) $chat->fresh()->admin_unread);
        $this->assertSame('human', $this->getJson("/api/v1/conversations/{$chat->id}")->json('data.support_mode'));
    }

    public function test_talk_to_a_person_button_hands_over_and_only_the_buyer_can_press_it(): void
    {
        $chat = $this->supportChat();

        Sanctum::actingAs($this->makeUser('buyer', 'Other'));
        $this->postJson("/api/v1/conversations/{$chat->id}/handoff")->assertForbidden();

        Sanctum::actingAs($this->buyer);
        $this->postJson("/api/v1/conversations/{$chat->id}/handoff")->assertOk()->assertJsonPath('data.support_mode', 'human');
        $this->assertSame(SupportChat::HANDED_OVER, Message::where('conversation_id', $chat->id)->latest('id')->value('body'));
        $this->assertSame(1, (int) $chat->fresh()->admin_unread);
        $this->assertSame([], $this->ai->calls);
    }

    public function test_the_buyer_can_ask_for_the_assistant_again_after_a_handoff(): void
    {
        $chat = $this->supportChat();
        $this->postJson("/api/v1/conversations/{$chat->id}/handoff")->assertOk()->assertJsonPath('data.assistant_available', true);

        // Their question while waiting for a person is answered once the assistant is back.
        $this->say($chat, 'Can you see my orders?');
        $this->assertSame([], $this->ai->calls);
        $this->ai->queue(FakeAiModel::text('Yes, I can check your orders for you.'));

        Sanctum::actingAs($this->makeUser('buyer', 'Other'));
        $this->postJson("/api/v1/conversations/{$chat->id}/assistant")->assertForbidden();

        Sanctum::actingAs($this->buyer);
        $this->postJson("/api/v1/conversations/{$chat->id}/assistant")->assertOk()->assertJsonPath('data.support_mode', 'ai');
        $this->assertSame('Yes, I can check your orders for you.', Message::where('conversation_id', $chat->id)->latest('id')->value('body'));

        // With nothing left to answer, it just says it is back.
        $this->postJson("/api/v1/conversations/{$chat->id}/handoff")->assertOk();
        $this->postJson("/api/v1/conversations/{$chat->id}/assistant")->assertOk();
        $this->assertSame(SupportChat::BACK, Message::where('conversation_id', $chat->id)->latest('id')->value('body'));

        config(['ai.support_bot.enabled' => false]);
        $this->postJson("/api/v1/conversations/{$chat->id}/assistant")->assertStatus(409);
    }

    public function test_when_claude_is_unreachable_or_declines_a_person_takes_over(): void
    {
        $chat = $this->supportChat();
        $this->ai->queue(new \RuntimeException('Connection timed out.'));
        $this->say($chat, 'Can I return my shoes?');

        $this->assertSame(SupportChat::UNAVAILABLE, Message::where('conversation_id', $chat->id)->latest('id')->value('body'));
        $this->assertSame('human', $chat->fresh()->support_mode);
        $this->assertSame(1, (int) $chat->fresh()->admin_unread);

        // An admin resolves it: the next question goes to the assistant again, which may decline.
        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/v1/conversations/{$chat->id}/status", ['status' => 'resolved'])->assertOk();
        Sanctum::actingAs($this->buyer);
        $this->ai->queue(FakeAiModel::refusal());
        $this->say($chat, 'Another question');
        $this->assertSame(SupportChat::UNAVAILABLE, Message::where('conversation_id', $chat->id)->latest('id')->value('body'));
        $this->assertSame('human', $chat->fresh()->support_mode);
    }

    public function test_an_admin_reply_takes_over_the_chat(): void
    {
        $chat = $this->supportChat();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/conversations/{$chat->id}/messages", ['body' => 'Hi Bea, Ana from Loved-IT here.'])->assertCreated();
        $this->assertSame('human', $chat->fresh()->support_mode);

        Sanctum::actingAs($this->buyer);
        $this->say($chat, 'Thanks Ana!');
        $this->assertSame([], $this->ai->calls);
    }

    public function test_with_the_assistant_off_support_chat_works_as_before(): void
    {
        config(['ai.support_bot.enabled' => false]);
        $chat = $this->supportChat();
        $this->assertSame('human', $this->getJson("/api/v1/conversations/{$chat->id}")->json('data.support_mode'));
        $this->say($chat, 'Hello');

        $this->assertSame([], $this->ai->calls);
        $this->assertSame(1, (int) $chat->fresh()->admin_unread);
        $this->assertSame(0, Message::where('conversation_id', $chat->id)->where('sender_kind', 'ai')->count());
    }
}
