<?php

namespace App\Events;

use App\Models\Message;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Message $message)
    {
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('conversation.'.$this->message->conversation_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'MessageSent';
    }

    public function broadcastWith(): array
    {
        $sender = $this->message->sender;
        $conversation = $this->message->conversation;

        // Rider delivery threads (feature 2.10): everyone on the channel sees a rider by first name only, and the
        // sender's account role (a hub owner may be a buyer) is replaced by their role in the thread.
        $isRiderThread = $conversation?->isRiderThread() ?? false;
        $riderSender = $isRiderThread && (int) $conversation->rider_id === (int) $this->message->sender_id;
        $senderRole = $isRiderThread
            ? ($riderSender ? 'rider' : app(\App\Services\RiderChatService::class)->counterpartOf($conversation))
            : ($sender?->role ?? 'buyer');
        $senderName = $sender
            ? ($riderSender ? $sender->first_name : $sender->first_name.' '.$sender->last_name)
            : 'User';
        // The Loved-IT Assistant (Amaru task 8) has no sender account.
        if ($this->message->sender_kind === 'ai') {
            $senderRole = 'assistant';
            $senderName = \App\Services\SupportChat::ASSISTANT_NAME;
        }

        return [
            'id' => $this->message->id,
            'conversation_id' => $this->message->conversation_id,
            'body' => $this->message->body,
            'sender_id' => $this->message->sender_id,
            'sender_role' => $senderRole,
            'sender_name' => $senderName,
            'attachment_type' => $this->message->attachment_type,
            'attachment_data' => $this->message->attachment_data,
            'read_at' => $this->message->read_at?->toISOString(),
            'created_at' => $this->message->created_at->toISOString(),
        ];
    }
}

