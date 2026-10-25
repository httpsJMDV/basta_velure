<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // The AI for product checks and the support assistant: Groq (free plan) or Claude, by AI_PROVIDER. Tests
        // swap in a fake.
        $this->app->singleton(\App\Services\Ai\AiModel::class, fn ($app) => config('ai.provider') === 'claude'
            ? $app->make(\App\Services\Ai\ClaudeModel::class)
            : $app->make(\App\Services\Ai\GroqModel::class));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
