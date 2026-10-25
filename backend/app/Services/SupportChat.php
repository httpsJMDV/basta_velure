<?php

namespace App\Services;

use App\Events\ConversationUpdated;
use App\Events\MessageSent;
use App\Jobs\AnswerSupportMessage;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\Ai\AiModel;
use App\Services\Ai\SupportAssistant;
use Illuminate\Support\Facades\Log;

/**
 * The Loved-IT Support chat with the assistant in it (Amaru task 8). The assistant answers a buyer's Loved-IT Support
 * chat until it is handed to a person: by the buyer ("Talk to a person"), by the assistant, when the assistant cannot
 * answer, or when an admin replies. From then on only people answer, until an admin marks the chat resolved.
 *
 * While the assistant answers, the buyer's messages do not add to the admins' unread count; a handoff does.
 */
class SupportChat
{
    public const ASSISTANT_NAME = 'Loved-IT Assistant';

    /** Replies per chat per day before the assistant hands the chat to a person, so one chat cannot run up costs. */
    public const DAILY_REPLIES = 40;

    public const UNAVAILABLE = "Sorry, I can't answer right now. I've passed your message to the Loved-IT team, and a person will reply here.";

    public const HANDED_OVER = "Okay! I've passed this chat to the Loved-IT team. A person will reply here, so you can keep the chat open or come back later.";

    public function __construct(private readonly SupportAssistant $assistant)
    {
    }

    /** The assistant is switched on (AI_SUPPORT_BOT) and a key is set. */
    public static function enabled(): bool
    {
        return (bool) config('ai.support_bot.enabled') && app(AiModel::class)->available();
    }

    /** Whether the assistant answers this chat now: a Loved-IT Support chat that was not handed to a person. */
    public function answers(Conversation $conversation): bool
    {
        return $conversation->type === 'buyer_admin' && $conversation->support_mode !== 'human' && self::enabled();
    }

    /** "ai" while the assistant answers, "human" otherwise; null for chats that are not Loved-IT Support. */
    public function modeOf(Conversation $conversation): ?string
    {
        return $conversation->type === 'buyer_admin' ? ($this->answers($conversation) ? 'ai' : 'human') : null;
    }

    /** After a buyer's message is saved: the assistant answers it on the queue. */
    public function queueAnswer(Message $message): void
    {
        AnswerSupportMessage::dispatch($message->id);
    }

    /** The queued answer to a buyer's message. */
    public function answer(int $messageId): void
    {
        $message = Message::find($messageId);
        $conversation = $message?->conversation;
        if (! $conversation || ! $this->answers($conversation) || $this->answeredOrNewer($message)) {
            return;
        }
        if (Message::where('conversation_id', $conversation->id)->where('sender_kind', 'ai')->where('created_at', '>=', now()->subDay())->count() >= self::DAILY_REPLIES) {
            $this->handOff($conversation, 'The assistant reached its daily limit for this chat.', self::HANDED_OVER);

            return;
        }

        try {
            $result = $this->assistant->reply($conversation);
        } catch (\Throwable $e) {
            Log::warning('Support assistant failed; handing the chat to a person.', ['conversation_id' => $conversation->id, 'error' => $e->getMessage()]);
            $this->handOff($conversation->fresh(), 'The assistant could not answer.', self::UNAVAILABLE);

            return;
        }

        // The buyer wrote again while the AI was answering: the newer message's job answers both. An admin may have
        // stepped in meanwhile too.
        $conversation->refresh();
        if (! $this->answers($conversation) || $this->answeredOrNewer($message)) {
            return;
        }
        $this->post($conversation, $result['text'], $result['orders'] ?? []);
        if ($result['handoff'] !== null) {
            $this->handOff($conversation, $result['handoff']);
        }
    }

    /** When the assistant cannot answer at all (the job crashed or timed out): a person takes over. */
    public function giveUp(int $messageId): void
    {
        $conversation = Message::find($messageId)?->conversation;
        if ($conversation && $this->answers($conversation)) {
            $this->handOff($conversation, 'The assistant could not answer.', self::UNAVAILABLE);
        }
    }

    /** Hands the chat to the Loved-IT team: admins are told, and the assistant stops answering. */
    public function handOff(Conversation $conversation, string $reason, ?string $note = null): void
    {
        if ($conversation->type !== 'buyer_admin' || $conversation->support_mode === 'human') {
            return;
        }
        $conversation->update(['support_mode' => 'human', 'support_handoff_at' => now()]);
        if ($note !== null) {
            $this->post($conversation, $note);
        }
        $conversation->increment('admin_unread');

        $buyer = $conversation->buyer;
        app(Notifier::class)->toAdmins('support.handoff', 'A buyer wants to talk to a person',
            trim(($buyer ? "{$buyer->first_name} {$buyer->last_name}" : 'A buyer') . ": {$reason}"),
            "/admin/messages?conversation={$conversation->id}", ['conversation_id' => $conversation->id]);
        $this->broadcast($conversation);
    }

    /** An admin replied, so a person has taken over; a resolved chat goes back to the assistant. */
    public function staffReplied(Conversation $conversation): void
    {
        if ($conversation->type === 'buyer_admin' && $conversation->support_mode !== 'human') {
            $conversation->update(['support_mode' => 'human', 'support_handoff_at' => $conversation->support_handoff_at ?? now()]);
        }
    }

    public function resolved(Conversation $conversation): void
    {
        if ($conversation->type === 'buyer_admin') {
            $conversation->update(['support_mode' => null, 'support_handoff_at' => null]);
        }
    }

    public const BACK = "I'm back! How can I help you with your Loved-IT orders today?";

    /**
     * The buyer asks for the assistant again after a handoff. If their last message is still unanswered, the
     * assistant answers it; otherwise it says it is back. Admins can still read and reply in the chat.
     */
    public function resume(Conversation $conversation): void
    {
        if ($conversation->type !== 'buyer_admin' || $conversation->support_mode !== 'human' || ! self::enabled()) {
            return;
        }
        $conversation->update(['support_mode' => null, 'support_handoff_at' => null]);

        $last = Message::where('conversation_id', $conversation->id)->latest('id')->first();
        if ($last && $last->sender_kind !== 'ai' && (int) $last->sender_id === (int) $conversation->buyer_id) {
            $this->queueAnswer($last);
        } else {
            $this->post($conversation, self::BACK);
        }
    }

    /**
     * A message from the assistant: no sender account, sender_kind "ai". Orders it talked about ride along as cards
     * (attachment type order_list).
     *
     * @param  list<array<string, mixed>>  $orders
     */
    public function post(Conversation $conversation, string $body, array $orders = []): Message
    {
        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id'       => null,
            'sender_kind'     => 'ai',
            'body'            => $body,
            'attachment_type' => $orders !== [] ? 'order_list' : null,
            'attachment_data' => $orders !== [] ? ['orders' => $orders] : null,
        ]);
        $conversation->increment('buyer_unread', 1, ['last_message_at' => now()]);

        $this->quietly(fn () => MessageSent::dispatch($message));
        $this->broadcast($conversation);

        return $message;
    }

    /** Anything after this message (a newer buyer message, or a reply) means there is nothing left for this job. */
    private function answeredOrNewer(Message $message): bool
    {
        return Message::where('conversation_id', $message->conversation_id)->where('id', '>', $message->id)->exists();
    }

    /** The buyer's and the admins' inboxes, as ConversationController does for a support chat. */
    private function broadcast(Conversation $conversation): void
    {
        $conversation->refresh()->load(['buyer', 'seller.sellerProfile', 'product.images', 'order.items', 'latestMessage.sender']);
        $recipients = $conversation->buyer_id ? [(int) $conversation->buyer_id => (int) $conversation->buyer_unread] : [];
        foreach (User::where('role', 'admin')->pluck('id') as $adminId) {
            $recipients[(int) $adminId] = (int) $conversation->admin_unread;
        }
        foreach ($recipients as $userId => $unread) {
            $this->quietly(fn () => ConversationUpdated::dispatch($userId, $conversation, $unread));
        }
    }

    private function quietly(callable $broadcast): void
    {
        try {
            $broadcast();
        } catch (\Throwable $e) {
            Log::warning('Broadcast skipped: ' . $e->getMessage());
        }
    }
}
