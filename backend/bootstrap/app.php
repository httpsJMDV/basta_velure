<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role'                    => \App\Http\Middleware\EnsureRole::class,
            'approved_seller'         => \App\Http\Middleware\EnsureApprovedSeller::class,
            'approved_sorting_center' => \App\Http\Middleware\EnsureApprovedSortingCenter::class,
            'approved_rider'          => \App\Http\Middleware\EnsureApprovedRider::class,
        ]);
        $middleware->append(\Illuminate\Http\Middleware\HandleCors::class);

        // The public site reaches PHP through a Cloudflare Tunnel (cloudflared on this machine), so every
        // request comes from 127.0.0.1. Trust it so $request->ip() is the visitor's address from
        // X-Forwarded-For and the per-IP rate limits apply per visitor, not to everyone at once.
        $middleware->trustProxies(at: ['127.0.0.1', '::1']);

        // The framework default sends guests to route('login'), which this API-only app does not have, so any
        // /api/* request without "Accept: application/json" crashed with a 500 instead of a 401.
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*') || ! Route::has('login') ? null : route('login'),
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
