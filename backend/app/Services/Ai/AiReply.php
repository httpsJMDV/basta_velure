<?php

namespace App\Services\Ai;

/**
 * One answer from the model, reduced to what Loved-IT uses: why it stopped, its text, the tools it wants to run, and
 * the raw content to send back unchanged on the next turn of a tool loop.
 */
final class AiReply
{
    /**
     * @param  list<array{id: string, name: string, input: array<string, mixed>}>  $toolUses
     * @param  array<int, mixed>  $content  the assistant turn exactly as returned (thinking blocks included)
     */
    public function __construct(
        public readonly ?string $stopReason,
        public readonly string $text,
        public readonly array $toolUses = [],
        public readonly array $content = [],
        public readonly ?string $refusalCategory = null,
    ) {
    }

    public function refused(): bool
    {
        return $this->stopReason === 'refusal';
    }
}
