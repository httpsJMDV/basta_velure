<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Product drafts are open to a seller whose application is still waiting (A18): they can prepare products, but only
 * an approved store can publish them (checked where a product goes live).
 */
class EnsureSellerApplicant
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $status = $user?->sellerProfile?->application_status;

        if (! $user || ! in_array($status, ['pending', 'approved'], true)) {
            abort(403, 'Seller account required.');
        }

        return $next($request);
    }
}
