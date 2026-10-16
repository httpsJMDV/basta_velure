<?php

namespace App\Http\Middleware;

use App\Models\Rider;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureApprovedRider
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // A courier is a buyer (or an older role "rider" account) with a riders row; the row decides, not the role.
        if (! $user || ! in_array($user->role, ['rider', 'buyer'], true)) {
            abort(403, 'Access denied. Rider account required.');
        }

        // Direct database query on each request to prevent stale token/memory state
        $rider = Rider::where('user_id', $user->id)->first();

        if (! $rider) {
            abort(403, 'Rider profile not found.');
        }

        if ($rider->status === Rider::STATUS_PENDING) {
            abort(403, 'Your rider application is currently pending hub approval.');
        }

        if ($rider->status === Rider::STATUS_DISAPPROVED) {
            abort(403, 'Your rider application was not approved.');
        }

        if ($rider->status !== Rider::STATUS_ACTIVE) {
            abort(403, 'Rider account is not active.');
        }

        return $next($request);
    }
}

