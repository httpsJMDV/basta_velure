<?php

namespace App\Services\Ai;

use Anthropic\Client;
use Anthropic\Messages\TextBlock;
use Anthropic\Messages\ToolUseBlock;

/**
 * Claude through Anthropic's official PHP SDK (anthropic-ai/sdk). The key comes from ANTHROPIC_API_KEY in .env and
 * the model from config/ai.php (Claude Haiku 5.5 by default).
 */
class ClaudeModel implements AiModel
{
    private ?Client $client = null;

    public function available(): bool
    {
        return (string) config('ai.api_key') !== '';
    }

    public function message(array $params): AiReply
    {
        $message = $this->client()->messages->create(
            ...$params,
            model: (string) config('ai.model'),
            requestOptions: ['timeout' => (float) config('ai.timeout'), 'maxRetries' => (int) config('ai.max_retries')],
        );

        $text = '';
        $toolUses = [];
        foreach ($message->content as $block) {
            if ($block instanceof TextBlock) {
                $text .= $block->text;
            } elseif ($block instanceof ToolUseBlock) {
                $toolUses[] = ['id' => $block->id, 'name' => $block->name, 'input' => $block->input];
            }
        }

        return new AiReply(
            stopReason: $message->stopReason,
            text: trim($text),
            toolUses: $toolUses,
            content: $message->content,
            refusalCategory: $message->stopReason === 'refusal' ? $message->stopDetails?->category : null,
        );
    }

    private function client(): Client
    {
        return $this->client ??= new Client(apiKey: (string) config('ai.api_key'));
    }
}
