<?php

namespace Tests\Feature;

use App\Services\Ai\AiModel;
use App\Services\Ai\ClaudeModel;
use App\Services\Ai\GroqModel;
use App\Services\Ai\SupportAssistant;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The Groq connection (AI_PROVIDER=groq): it turns the Claude-shaped requests the app builds into Groq's
 * OpenAI-style chat request and the answer back into an AiReply. Groq is faked, so nothing leaves the machine.
 */
class GroqModelTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'ai.provider' => 'groq', 'ai.groq.api_key' => 'gsk_test', 'ai.groq.model' => 'openai/gpt-oss-120b',
            'ai.groq.vision_model' => 'qwen/qwen3.8-27b', 'ai.groq.base_url' => 'https://api.groq.com/openai/v1', 'ai.max_retries' => 0,
        ]);
    }

    private function answer(array $message, string $finish = 'stop'): array
    {
        return ['choices' => [['index' => 0, 'message' => ['role' => 'assistant'] + $message, 'finish_reason' => $finish]]];
    }

    public function test_the_provider_setting_picks_groq_or_claude(): void
    {
        $this->app->forgetInstance(AiModel::class);
        $this->assertInstanceOf(GroqModel::class, $this->app->make(AiModel::class));
        $this->assertTrue($this->app->make(AiModel::class)->available());

        config(['ai.provider' => 'claude']);
        $this->app->forgetInstance(AiModel::class);
        $this->assertInstanceOf(ClaudeModel::class, $this->app->make(AiModel::class));

        config(['ai.groq.api_key' => '']);
        $this->assertFalse((new GroqModel())->available());
    }

    public function test_a_product_check_with_a_photo_goes_to_the_vision_model_in_json_mode(): void
    {
        Http::fake(['api.groq.com/*' => Http::response($this->answer(['content' => "<think>Looks fine.</think>\n{\"verdict\":\"approve\",\"reason\":\"Normal shirt.\"}"]))]);

        $reply = (new GroqModel())->message([
            'maxTokens' => 2000,
            'system' => 'You review listings.',
            'messages' => [['role' => 'user', 'content' => [
                ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => 'image/jpeg', 'data' => 'QUJD']],
                ['type' => 'text', 'text' => 'Name: Tee'],
            ]]],
            'outputConfig' => ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => ['type' => 'object']]],
        ]);

        $this->assertSame('end_turn', $reply->stopReason);
        $this->assertSame('{"verdict":"approve","reason":"Normal shirt."}', $reply->text);
        Http::assertSent(function (Request $request) {
            $body = $request->data();

            return $request->url() === 'https://api.groq.com/openai/v1/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer gsk_test')
                && $body['model'] === 'qwen/qwen3.8-27b'
                && $body['response_format'] === ['type' => 'json_object']
                && ! isset($body['reasoning_effort'])
                && $body['messages'][0]['role'] === 'system'
                && str_contains($body['messages'][0]['content'], 'JSON schema')
                && $body['messages'][1]['content'][0] === ['type' => 'image_url', 'image_url' => ['url' => 'data:image/jpeg;base64,QUJD']]
                && $body['messages'][1]['content'][1] === ['type' => 'text', 'text' => 'Name: Tee'];
        });
    }

    public function test_the_support_tool_loop_round_trips_tool_calls_and_results(): void
    {
        Http::fake(['api.groq.com/*' => Http::sequence()
            ->push($this->answer(['content' => null, 'tool_calls' => [['id' => 'call_1', 'type' => 'function', 'function' => ['name' => 'get_order', 'arguments' => '{"order_number":"LIT-1"}']]]], 'tool_calls'))
            ->push($this->answer(['content' => 'Your order is packed.']))]);
        $groq = new GroqModel();
        $tools = [['name' => 'get_order', 'description' => 'Get an order.', 'inputSchema' => ['type' => 'object', 'properties' => ['order_number' => ['type' => 'string']]]]];
        $messages = [['role' => 'user', 'content' => 'Where is LIT-1?']];

        $first = $groq->message(['maxTokens' => 500, 'system' => 'Help.', 'tools' => $tools, 'messages' => $messages, 'outputConfig' => ['effort' => 'low']]);
        $this->assertSame('tool_use', $first->stopReason);
        $this->assertSame([['id' => 'call_1', 'name' => 'get_order', 'input' => ['order_number' => 'LIT-1']]], $first->toolUses);

        $messages[] = ['role' => 'assistant', 'content' => $first->content];
        $messages[] = ['role' => 'user', 'content' => [['type' => 'tool_result', 'toolUseID' => 'call_1', 'content' => '{"status":"Order packed"}']]];
        $second = $groq->message(['maxTokens' => 500, 'system' => 'Help.', 'tools' => $tools, 'messages' => $messages]);
        $this->assertSame('Your order is packed.', $second->text);

        $sent = Http::recorded()->map(fn ($pair) => $pair[0]->data())->values();
        $this->assertSame('openai/gpt-oss-120b', $sent[0]['model']);
        $this->assertSame('low', $sent[0]['reasoning_effort']);
        $this->assertSame(['type' => 'function', 'function' => ['name' => 'get_order', 'description' => 'Get an order.', 'parameters' => $tools[0]['inputSchema']]], $sent[0]['tools'][0]);
        $this->assertSame('Where is LIT-1?', $sent[0]['messages'][1]['content']);
        $this->assertSame(['role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call_1', 'type' => 'function', 'function' => ['name' => 'get_order', 'arguments' => '{"order_number":"LIT-1"}']]]], $sent[1]['messages'][2]);
        $this->assertSame(['role' => 'tool', 'tool_call_id' => 'call_1', 'content' => '{"status":"Order packed"}'], $sent[1]['messages'][3]);
    }

    public function test_a_rate_limited_model_falls_back_to_the_smaller_one(): void
    {
        config(['ai.groq.fallback_model' => 'openai/gpt-oss-20b']);
        Http::fake(['api.groq.com/*' => Http::sequence()
            ->push(['error' => ['message' => 'Rate limit reached']], 429, ['retry-after' => '0'])
            ->push($this->answer(['content' => 'Hello po!']))]);

        $reply = (new GroqModel())->message(['messages' => [['role' => 'user', 'content' => 'Hi']]]);

        $this->assertSame('Hello po!', $reply->text);
        $this->assertSame(['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], Http::recorded()->map(fn ($pair) => $pair[0]->data()['model'])->values()->all());
    }

    public function test_finish_reasons_and_errors_reach_the_callers_fallbacks(): void
    {
        $limited = fn () => Http::response(['error' => ['message' => 'Rate limit reached']], 429, ['retry-after' => '0']);
        Http::fake(['api.groq.com/*' => Http::sequence()
            ->push($this->answer(['content' => 'cut'], 'length'))
            ->push($this->answer(['content' => ''], 'content_filter'))
            ->pushResponse($limited())->pushResponse($limited())->pushResponse($limited())
            ->push(['error' => ['message' => 'Invalid request']], 400)]);
        $groq = new GroqModel();
        $ask = fn () => $groq->message(['messages' => [['role' => 'user', 'content' => 'Hi']]]);

        $this->assertSame('max_tokens', $ask()->stopReason);
        $this->assertTrue($ask()->refused());
        try {
            $ask();
            $this->fail('A rate limit on every try should throw.');
        } catch (RequestException $e) {
            $this->assertSame(429, $e->response->status());
        }
        // A bad request is not retried.
        $before = Http::recorded()->count();
        $this->expectException(RequestException::class);
        try {
            $ask();
        } finally {
            $this->assertSame($before + 1, Http::recorded()->count());
        }
    }

    public function test_a_long_or_cut_off_reply_ends_at_a_whole_sentence(): void
    {
        $short = 'Loved-IT is a marketplace. Vouchers must be claimed first.';
        $this->assertSame($short, SupportAssistant::fit($short, 2000));

        // Too long: it ends at the last full sentence that fits, with no half word and no "...".
        $long = str_repeat('Shops sell to buyers across the Philippines. ', 50) . 'Vouchers must be claimed first.';
        $fitted = SupportAssistant::fit($long, 2000);
        $this->assertLessThanOrEqual(2000, mb_strlen($fitted));
        $this->assertStringEndsWith('Philippines.', $fitted);

        // Cut off by the model's token limit: the unfinished last sentence is dropped.
        $this->assertSame("- Returns within 7 days.\n- Vouchers are claimed first.", SupportAssistant::fit("- Returns within 7 days.\n- Vouchers are claimed first.\n- Vouchers must be cla", 2000, cutOff: true));
    }

    public function test_markdown_the_model_adds_is_shown_as_plain_text(): void
    {
        $this->assertSame("Status\nYour order is Order packed.\n- Open My Orders", SupportAssistant::plain("## Status\nYour order is **Order packed**.  \n- Open __My Orders__"));
    }
}
