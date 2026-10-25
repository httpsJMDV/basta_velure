<?php

/*
 * AI features (Amaru tasks 7 and 8). Both are off until the provider's key is set and the feature is switched on, so
 * the site behaves exactly as before without a key: products publish at once and Loved-IT Support is answered by
 * people only.
 *
 * AI_PROVIDER picks who answers:
 * - groq (default): Groq's free plan (console.groq.com), limited to about 30 requests a minute plus daily caps. Text
 *   goes to GROQ_MODEL; a product check with photos goes to GROQ_VISION_MODEL, which can read images.
 * - claude: Anthropic's API (Claude Haiku 5.5). Paid per use; a Claude Pro subscription does not include API credits.
 */
return [
    'provider' => env('AI_PROVIDER', 'groq'),

    'groq' => [
        'api_key'      => env('GROQ_API_KEY'),
        'model'        => env('GROQ_MODEL', 'openai/gpt-oss-120b'),
        'vision_model' => env('GROQ_VISION_MODEL', 'qwen/qwen3.8-27b'),
        // Tried when the text model hits the free plan's rate limit; each model has its own limit.
        'fallback_model' => env('GROQ_FALLBACK_MODEL', 'openai/gpt-oss-20b'),
        'base_url'     => env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
    ],

    'api_key' => env('ANTHROPIC_API_KEY'),
    'model'   => env('ANTHROPIC_MODEL', 'claude-haiku-5-5'),

    // Seconds to wait for one answer, and how many times a 429 or 5xx is retried.
    'timeout'     => (float) env('AI_TIMEOUT', env('ANTHROPIC_TIMEOUT', 30)),
    'max_retries' => (int) env('AI_MAX_RETRIES', env('ANTHROPIC_MAX_RETRIES', 2)),

    // Task 7: the AI checks a product when a seller publishes it.
    'product_check' => [
        'enabled'     => (bool) env('AI_PRODUCT_CHECK', false),
        // At first the AI only approves or flags; a "reject" goes to the admin with the AI's reason. Set to true once
        // the team trusts it, and a clear reject is applied at once.
        'auto_reject' => (bool) env('AI_PRODUCT_AUTO_REJECT', false),
        // Photos sent with each check (the first ones in the gallery). Groq's vision model takes at most 3.
        'max_images'  => 3,
    ],

    // Task 8: the Loved-IT Support assistant in the buyer's Messages.
    'support_bot' => [
        'enabled' => (bool) env('AI_SUPPORT_BOT', false),
        // How many earlier messages of the chat it reads, and how many tool calls one answer may make.
        'history'   => 20,
        'max_steps' => 5,
    ],
];
