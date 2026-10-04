<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureApprovedSortingCenter
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->sortingCenter || $user->sortingCenter->status !== 'APPROVED') {
            abort(403, 'Sorting center account not approved.');
        }

        return $next($request);
    }
}

