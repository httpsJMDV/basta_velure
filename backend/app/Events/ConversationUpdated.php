<?php

namespace App\Events;

use App\Models\Conversation;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $userId,
        public Conversation $conversation,
        public int $unreadCount = 0
    ) {
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('user.'.$this->userId.'.conversations'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'ConversationUpdated';
    }

    public function broadcastWith(): array
    {
        $lastMessage = $this->conversation->latestMessage;

        return [
            'conversation' => [
                'id' => $this->conversation->id,
                'type' => $this->conversation->type,
                'status' => $this->conversation->status,
                'subject' => $this->conversation->subject,
                'buyer_id' => $this->conversation->buyer_id,
                'seller_id' => $this->conversation->seller_id,
                'buyer' => $this->conversation->buyer ? [
                    'id' => $this->conversation->buyer->id,
                    'first_name' => $this->conversation->buyer->first_name,
                    'last_name' => $this->conversation->buyer->last_name,
                    'email' => $this->conversation->buyer->email,
                    'avatar_url' => $this->conversation->buyer->avatar_url,
                ] : null,
                'seller' => $this->conversation->seller ? [
                    'id' => $this->conversation->seller->id,
                    'first_name' => $this->conversation->seller->first_name,
                    'last_name' => $this->conversation->seller->last_name,
                    'email' => $this->conversation->seller->email,
                    'avatar_url' => $this->conversation->seller->avatar_url,
                    'shop_name' => $this->conversation->seller->sellerProfile?->shop_name ?? $this->conversation->seller->first_name,
                    'shop_logo' => $this->conversation->seller->sellerProfile?->logo_url ?? $this->conversation->seller->avatar_url,
                ] : null,
                'product' => $this->conversation->product ? [
                    'id' => $this->conversation->product->id,
                    'name' => $this->conversation->product->name,
                    'price' => (float) $this->conversation->product->base_price,
                    'image' => $this->conversation->product->images->first()?->image_path,
                ] : null,
                'order' => $this->conversation->order ? [
                    'id' => $this->conversation->order->id,
                    'order_number' => $this->conversation->order->order_number,
                    'total' => (float) $this->conversation->order->total,
                    'status' => $this->conversation->order->status,
                ] : null,
                'last_message' => $lastMessage ? [
                    'id' => $lastMessage->id,
                    'body' => $lastMessage->body,
                    'sender_id' => $lastMessage->sender_id,
                    'created_at' => $lastMessage->created_at->toISOString(),
                ] : null,
                'last_message_at' => $this->conversation->last_message_at?->toISOString() ?? $this->conversation->created_at->toISOString(),
                'unread' => $this->unreadCount,
                'created_at' => $this->conversation->created_at->toISOString(),
            ],
            'unread_total' => $this->unreadCount,
        ];
    }
}

