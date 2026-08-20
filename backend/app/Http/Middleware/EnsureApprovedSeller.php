<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureApprovedSeller
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $user->sellerProfile?->application_status !== 'approved') {
            abort(403, 'Seller account not approved.');
        }

        return $next($request);
    }
}
