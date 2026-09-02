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
        return [
            'id' => $this->message->id,
            'conversation_id' => $this->message->conversation_id,
            'body' => $this->message->body,
            'sender_id' => $this->message->sender_id,
            'sender_role' => $sender?->role ?? 'buyer',
            'sender_name' => $sender ? ($sender->first_name.' '.$sender->last_name) : 'User',
            'attachment_type' => $this->message->attachment_type,
            'attachment_data' => $this->message->attachment_data,
            'read_at' => $this->message->read_at?->toISOString(),
            'created_at' => $this->message->created_at->toISOString(),
        ];
    }
}

