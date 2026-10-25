<?php

namespace App\Services\Ai;

/**
 * The one call Loved-IT makes to an AI model: GroqModel or ClaudeModel (AI_PROVIDER); tests bind a fake.
 */
interface AiModel
{
    /** Whether a key is configured, so the features can fall back when it is not. */
    public function available(): bool;

    /**
     * POST /v1/messages with these named arguments (the PHP SDK's camelCase names: maxTokens, system, messages,
     * tools, outputConfig). The model is added by the implementation.
     *
     * @param  array<string, mixed>  $params
     *
     * @throws \Throwable when the API cannot be reached or answers with an error
     */
    public function message(array $params): AiReply;
}
