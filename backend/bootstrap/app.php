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
            'seller_applicant'        => \App\Http\Middleware\EnsureSellerApplicant::class,
            'approved_sorting_center' => \App\Http\Middleware\EnsureApprovedSortingCenter::class,
            'logistics_member'        => \App\Http\Middleware\EnsureLogisticsMember::class,
            'approved_rider'          => \App\Http\Middleware\EnsureApprovedRider::class,
            'active_account'          => \App\Http\Middleware\EnsureActiveAccount::class,
            'shopper'                 => \App\Http\Middleware\EnsureShopper::class,
        ]);
        $middleware->append(\Illuminate\Http\Middleware\HandleCors::class);
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        // The public site reaches PHP through a Cloudflare Tunnel (cloudflared on this machine), so every
        // request comes from 127.0.0.1. Trust it so $request->ip() is the visitor's address from
        // X-Forwarded-For and the per-IP rate limits apply per visitor, not to everyone at once.
        // On Laravel Cloud requests arrive through Cloud's own load balancer instead, so trust that hop
        // (otherwise links are built as http:// and every visitor shares one rate limit).
        $middleware->trustProxies(at: laravel_cloud() ? '*' : ['127.0.0.1', '::1']);

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

        // A list where the code expects a word (?search[]=a) is a malformed request, not a server fault. The exception is
        // still written to the log, so it can be fixed properly, but the person gets a refusal and not a 500.
        $exceptions->render(function (\ErrorException|\TypeError $e, Request $request) {
            $message = $e->getMessage();
            if ($request->is('api/*') && (str_contains($message, 'Array to string conversion') || str_contains($message, 'array given'))) {
                return response()->json(['message' => 'The request has a value in the wrong format.'], 422);
            }
        });

        // The framework's own text names the model class or the route, which tells an attacker how the code is laid
        // out. A message written on purpose, like abort(404, 'This shop is closed.'), still reaches the person.
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, Request $request) {
            $generated = $e->getPrevious() !== null || str_starts_with($e->getMessage(), 'The route ');
            if ($request->is('api/*') && $generated) {
                return response()->json(['message' => 'Not found.'], 404);
            }
        });
    })->create();
