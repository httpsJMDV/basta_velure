<?php

namespace Tests\Support;

use App\Services\Ai\AiModel;
use App\Services\Ai\AiReply;

/**
 * Stands in for Claude in tests: hands out the queued replies in order (or throws a queued exception) and records every
 * request, so no test calls the real API or spends credits.
 */
class FakeAiModel implements AiModel
{
    /** @var list<AiReply|\Throwable> */
    public array $replies = [];

    /** @var list<array<string, mixed>> */
    public array $calls = [];

    public bool $available = true;

    public function available(): bool
    {
        return $this->available;
    }

    public function message(array $params): AiReply
    {
        $this->calls[] = $params;
        $next = array_shift($this->replies) ?? throw new \RuntimeException('No fake AI reply queued.');
        if ($next instanceof \Throwable) {
            throw $next;
        }

        return $next;
    }

    public function queue(AiReply|\Throwable ...$replies): static
    {
        array_push($this->replies, ...$replies);

        return $this;
    }

    public static function text(string $text, string $stopReason = 'end_turn'): AiReply
    {
        return new AiReply($stopReason, $text, [], [['type' => 'text', 'text' => $text]]);
    }

    public static function verdict(string $verdict, string $reason): AiReply
    {
        return self::text(json_encode(['verdict' => $verdict, 'reason' => $reason]));
    }

    public static function refusal(): AiReply
    {
        return new AiReply('refusal', '', [], [], 'cyber');
    }

    /** @param  array<string, mixed>  $input */
    public static function tool(string $name, array $input = [], string $id = 'toolu_test'): AiReply
    {
        return new AiReply('tool_use', '', [['id' => $id, 'name' => $name, 'input' => $input]],
            [['type' => 'tool_use', 'id' => $id, 'name' => $name, 'input' => $input]]);
    }
}
