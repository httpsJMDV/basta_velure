<?php

namespace App\Services\Ai;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * Groq's free plan through its OpenAI-compatible chat API (POST {base_url}/chat/completions), with Laravel's HTTP
 * client and no extra package. The rest of the app speaks in the Claude-shaped requests and replies of AiModel, so
 * this class translates both ways:
 *
 * - out: the system prompt, image blocks (as data: URLs), tools (inputSchema becomes parameters), the assistant's
 *   earlier tool calls and their tool_result blocks (as role "tool" messages), and a JSON schema (as JSON mode plus
 *   the schema in the system prompt);
 * - back: the text (any <think> reasoning removed), tool calls, and finish_reason as Claude's stop reasons
 *   (stop = end_turn, tool_calls = tool_use, length = max_tokens, content_filter = refusal).
 *
 * A request with photos goes to the vision model; everything else to the text model.
 */
class GroqModel implements AiModel
{
    public function available(): bool
    {
        return (string) config('ai.groq.api_key') !== '';
    }

    public function message(array $params): AiReply
    {
        $messages = $this->messages($params);
        $images = $this->hasImages($messages);
        $model = (string) ($images ? config('ai.groq.vision_model') : config('ai.groq.model'));

        // On the free plan's rate limit (429) or a Groq hiccup (5xx, no connection): try the fallback text model, which
        // has its own limit, then wait as long as Groq asks (at most 20 seconds) and try the main model once more.
        $fallback = (string) config('ai.groq.fallback_model');
        $plan = ! $images && $fallback !== '' && $fallback !== $model ? [$model, $fallback, $model] : [$model, $model];
        $failure = null;
        foreach ($plan as $i => $tryModel) {
            if ($failure && $i === count($plan) - 1) {
                usleep($this->waitMs($failure) * 1000);
            }
            try {
                return $this->reply($this->send($this->body($params, $messages, $tryModel)));
            } catch (RequestException $e) {
                if (! in_array($e->response->status(), [429, 500, 502, 503, 504], true)) {
                    throw $e;
                }
                $failure = $e;
            } catch (ConnectionException $e) {
                $failure = $e;
            }
        }

        throw $failure;
    }

    /** @return array<string, mixed> */
    private function body(array $params, array $messages, string $model): array
    {
        return array_filter([
            'model'                 => $model,
            'messages'              => $messages,
            'max_completion_tokens' => (int) ($params['maxTokens'] ?? 2000),
            'tools'                 => isset($params['tools']) ? array_map(fn (array $tool) => ['type' => 'function', 'function' => array_filter([
                'name'        => $tool['name'],
                'description' => $tool['description'] ?? null,
                'parameters'  => $tool['inputSchema'] ?? ['type' => 'object', 'properties' => new \stdClass()],
            ])], $params['tools']) : null,
            'response_format'       => isset($params['outputConfig']['format']) ? ['type' => 'json_object'] : null,
            // Only the gpt-oss models take low / medium / high; others refuse the parameter.
            'reasoning_effort'      => str_starts_with($model, 'openai/gpt-oss') ? ($params['outputConfig']['effort'] ?? null) : null,
        ], fn ($value) => $value !== null);
    }

    /** @return array<string, mixed> the first choice of Groq's answer */
    private function send(array $body): array
    {
        return (array) Http::withToken((string) config('ai.groq.api_key'))
            ->acceptJson()
            ->timeout((int) ceil((float) config('ai.timeout')))
            ->post(rtrim((string) config('ai.groq.base_url'), '/') . '/chat/completions', $body)
            ->throw()
            ->json('choices.0');
    }

    /** How long to wait before the last try: Groq's retry-after for a rate limit (at most 20 s), else 1.5 s. */
    private function waitMs(\Throwable $failure): int
    {
        if ($failure instanceof RequestException && $failure->response->status() === 429) {
            return (int) min(20_000, max(0, (float) ($failure->response->header('retry-after') ?: 2)) * 1000);
        }

        return 1500;
    }

    /** @return list<array<string, mixed>> */
    private function messages(array $params): array
    {
        $system = trim((string) ($params['system'] ?? ''));
        if ($schema = $params['outputConfig']['format']['schema'] ?? null) {
            $system .= "\n\nAnswer with only a JSON object that matches this JSON schema, and nothing else:\n" . json_encode($schema);
        }
        $out = $system !== '' ? [['role' => 'system', 'content' => $system]] : [];

        foreach ($params['messages'] ?? [] as $message) {
            $content = $message['content'];
            if (is_string($content)) {
                $out[] = ['role' => $message['role'], 'content' => $content];
                continue;
            }

            if ($message['role'] === 'assistant') {
                $text = '';
                $calls = [];
                foreach ($content as $block) {
                    if (($block['type'] ?? null) === 'text') {
                        $text .= $block['text'];
                    } elseif (($block['type'] ?? null) === 'tool_use') {
                        $calls[] = ['id' => $block['id'], 'type' => 'function', 'function' => ['name' => $block['name'], 'arguments' => json_encode((object) $block['input'])]];
                    }
                }
                $out[] = ['role' => 'assistant', 'content' => $text !== '' ? $text : null] + ($calls ? ['tool_calls' => $calls] : []);
                continue;
            }

            $parts = [];
            foreach ($content as $block) {
                match ($block['type'] ?? null) {
                    'tool_result' => $out[] = ['role' => 'tool', 'tool_call_id' => $block['toolUseID'], 'content' => is_string($block['content']) ? $block['content'] : json_encode($block['content'])],
                    'text'        => $parts[] = ['type' => 'text', 'text' => $block['text']],
                    'image'       => $parts[] = ['type' => 'image_url', 'image_url' => ['url' => 'data:' . $block['source']['mediaType'] . ';base64,' . $block['source']['data']]],
                    default       => null,
                };
            }
            if ($parts !== []) {
                // Text alone goes as a plain string, which every model accepts.
                $onlyText = array_filter($parts, fn ($p) => $p['type'] !== 'text') === [];
                $out[] = ['role' => 'user', 'content' => $onlyText ? implode("\n\n", array_column($parts, 'text')) : $parts];
            }
        }

        return $out;
    }

    private function hasImages(array $messages): bool
    {
        foreach ($messages as $message) {
            foreach (is_array($message['content'] ?? null) ? $message['content'] : [] as $part) {
                if (($part['type'] ?? null) === 'image_url') {
                    return true;
                }
            }
        }

        return false;
    }

    private function reply(array $choice): AiReply
    {
        $message = (array) ($choice['message'] ?? []);
        $text = trim((string) preg_replace('/<think>.*?<\/think>/s', '', (string) ($message['content'] ?? '')));

        $blocks = $text !== '' ? [['type' => 'text', 'text' => $text]] : [];
        $toolUses = [];
        foreach ($message['tool_calls'] ?? [] as $call) {
            $input = json_decode((string) ($call['function']['arguments'] ?? '{}'), true);
            $use = ['id' => (string) $call['id'], 'name' => (string) ($call['function']['name'] ?? ''), 'input' => is_array($input) ? $input : []];
            $toolUses[] = $use;
            $blocks[] = ['type' => 'tool_use'] + $use;
        }

        $stop = match ($choice['finish_reason'] ?? null) {
            'tool_calls'     => 'tool_use',
            'length'         => 'max_tokens',
            'content_filter' => 'refusal',
            default          => $toolUses !== [] ? 'tool_use' : 'end_turn',
        };

        return new AiReply($stop, $text, $toolUses, $blocks, $stop === 'refusal' ? 'content_filter' : null);
    }
}
