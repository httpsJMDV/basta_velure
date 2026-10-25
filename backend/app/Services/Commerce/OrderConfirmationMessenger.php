<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Events\ConversationUpdated;
use App\Events\MessageSent;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The shop's order confirmation in the buyer's chat, like TikTok Shop. When an order is placed, the shop's thread with
 * the buyer gets a thank-you line and an order card that asks the buyer to confirm the delivery address. When the
 * buyer confirms, the card is marked and the shop answers with a thank-you. These messages are sent automatically in
 * the shop's name (`attachment_data.auto`); nobody at the shop types them.
 */
class OrderConfirmationMessenger
{
    public const TYPE = 'order_confirmation';

    public const GREETING = 'Thanks for your order! Please confirm that your shipping address is correct.';

    public const THANKS = 'Thank you for confirming your address.';

    /** Once the parcel has left the shop, confirming the address no longer changes anything. */
    private const CONFIRMABLE = [OrderStatus::PLACED, OrderStatus::CONFIRMED, OrderStatus::PREPARING, OrderStatus::READY_FOR_PICKUP];

    /**
     * Sends the confirmation for each order once the checkout has committed. A chat problem never fails the order.
     *
     * @param  iterable<Order>  $orders
     */
    public function ordersPlaced(iterable $orders): void
    {
        $orders = collect($orders)->values();
        if ($orders->isEmpty()) {
            return;
        }

        DB::afterCommit(function () use ($orders) {
            foreach ($orders as $order) {
                try {
                    $this->send($order);
                } catch (\Throwable $e) {
                    Log::warning("Order confirmation chat skipped for order {$order->id}: {$e->getMessage()}");
                }
            }
        });
    }

    public function send(Order $order): void
    {
        $order->loadMissing('items');
        $sellerId = (int) $order->items->first()?->seller_id;
        if (! $sellerId || ! $order->buyer_id) {
            return;
        }

        $conversation = Conversation::firstOrCreate(
            ['buyer_id' => $order->buyer_id, 'seller_id' => $sellerId, 'type' => 'buyer_seller'],
            ['status' => 'open', 'order_id' => $order->id, 'last_message_at' => now()],
        );

        $sent = [
            $this->post($conversation, $sellerId, self::GREETING),
            $this->post($conversation, $sellerId, 'Order confirmation · #' . $order->order_number, self::TYPE, $this->card($order)),
        ];
        $this->broadcast($conversation, $sent);
    }

    /**
     * The buyer confirms the address on a confirmation card. Returns the updated card and, the first time, the shop's
     * thank-you. Confirming twice changes nothing.
     *
     * @return array{card: Message, reply: ?Message}
     */
    public function confirm(Conversation $conversation, Message $card): array
    {
        $data = $card->attachment_data ?? [];
        if (! empty($data['confirmed_at'])) {
            return ['card' => $card, 'reply' => null];
        }

        $order = Order::where('id', $data['id'] ?? 0)->where('buyer_id', $conversation->buyer_id)->first();
        if (! $order) {
            abort(404, 'This order was not found.');
        }
        if (! in_array($order->status, self::CONFIRMABLE, true)) {
            abort(409, $order->status === OrderStatus::CANCELLED
                ? 'This order was cancelled, so there is no address to confirm.'
                : 'This order has already left the shop, so the address can no longer be confirmed here.');
        }

        $reply = DB::transaction(function () use ($card, $data, $conversation) {
            $card->update(['attachment_data' => [...$data, 'confirmed_at' => now()->toISOString()]]);

            return $this->post($conversation, (int) $conversation->seller_id, self::THANKS);
        });
        $this->broadcast($conversation, [$reply]);

        return ['card' => $card->fresh(), 'reply' => $reply];
    }

    /** A snapshot of the order for the card: what was bought, the total and where it goes. */
    private function card(Order $order): array
    {
        $items = $order->items;
        $first = $items->first();
        $place = array_filter([$order->shipping_address, $order->shipping_barangay, $order->shipping_city, $order->shipping_province]);

        return [
            'id'            => $order->id,
            'order_number'  => $order->order_number,
            'total'         => (float) $order->total,
            'items_count'   => (int) $items->sum('quantity'),
            'items_summary' => $first?->product_name,
            'image'         => $first?->image_url,
            'recipient'     => $order->shipping_name,
            'phone'         => $order->shipping_phone,
            'address'       => implode(', ', $place),
            'payment_method' => $order->payment_method,
            'confirmed_at'  => null,
            'auto'          => true,
        ];
    }

    private function post(Conversation $conversation, int $senderId, string $body, ?string $type = null, ?array $data = null): Message
    {
        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id'       => $senderId,
            'body'            => $body,
            'attachment_type' => $type,
            'attachment_data' => $data,
        ]);
        $conversation->increment('buyer_unread', 1, ['last_message_at' => now()]);

        return $message;
    }

    /** @param  list<Message>  $messages */
    private function broadcast(Conversation $conversation, array $messages): void
    {
        try {
            foreach ($messages as $message) {
                MessageSent::dispatch($message->load('sender.sellerProfile'));
            }
            $conversation->refresh()->load(['buyer', 'seller.sellerProfile', 'product.images', 'order.items', 'latestMessage.sender']);
            ConversationUpdated::dispatch((int) $conversation->buyer_id, $conversation, (int) $conversation->buyer_unread);
            ConversationUpdated::dispatch((int) $conversation->seller_id, $conversation, (int) $conversation->seller_unread);
        } catch (\Throwable $e) {
            Log::warning('Broadcast skipped: ' . $e->getMessage());
        }
    }
}
