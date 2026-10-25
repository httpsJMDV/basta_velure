<?php

namespace App\Jobs;

use App\Services\SupportChat;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** The Loved-IT Assistant's answer to a buyer's Loved-IT Support message (Amaru task 8). */
class AnswerSupportMessage implements ShouldQueue
{
    use Queueable;

    /** The SDK already retries a failed request; a person takes over instead of a second attempt. */
    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public readonly int $messageId)
    {
        $this->afterCommit();
    }

    public function handle(SupportChat $chat): void
    {
        $chat->answer($this->messageId);
    }

    public function failed(?\Throwable $e): void
    {
        app(SupportChat::class)->giveUp($this->messageId);
    }
}
