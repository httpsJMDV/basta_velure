<?php

namespace App\Http\Middleware;

use App\Models\Rider;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureApprovedRider
{
    /**
     * The rider pages. An Active rider uses all of them. A Suspended rider can still sign in and read their pages
     * (profile, earnings, history) to see why, but every action is refused with the suspension message (RID-PROF-006).
     * Each request also tells the dispatcher the rider's app is alive (presence for Online/Offline, A22).
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

        if ($rider->status === Rider::STATUS_SUSPENDED) {
            if (! $request->isMethod('GET')) {
                abort(403, 'Your rider account is suspended by your courier company, so you cannot go Online or take jobs. Reason: ' . ($rider->suspension_reason ?: 'not given') . '.');
            }

            return $next($request);
        }

        if ($rider->status === Rider::STATUS_PENDING) {
            abort(403, 'Your rider account is waiting for your courier company to verify it.');
        }

        if ($rider->status === Rider::STATUS_PENDING_ACTIVATION) {
            abort(403, 'Activate your rider account from the email your courier company sent you.');
        }

        if ($rider->status === Rider::STATUS_DISAPPROVED) {
            abort(403, 'Your rider account was not approved' . ($rider->rejection_reason ? ': ' . $rider->rejection_reason : '.'));
        }

        if ($rider->status !== Rider::STATUS_ACTIVE) {
            abort(403, 'Rider account is not active.');
        }

        // Presence: at most one write every 30 seconds.
        if (! $rider->last_seen_at || $rider->last_seen_at->lt(now()->subSeconds(30))) {
            Rider::whereKey($rider->id)->update(['last_seen_at' => now()]);
        }

        return $next($request);
    }
}
