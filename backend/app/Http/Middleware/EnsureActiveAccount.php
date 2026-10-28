<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every signed-in request: an account that is not active cannot use a token it still holds. That covers an account
 * whose email code was never entered (it should never have had a token), one an admin suspended after it signed in,
 * and a rider who has not activated yet. "Who am I" and "sign out" still answer, so the app can show the right screen
 * and drop the token.
 */
class EnsureActiveAccount
{
    private const ALWAYS_ALLOWED = ['api/v1/auth/me', 'api/v1/auth/logout'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $status = $user?->status;

        if (! $user || ! in_array($status, ['unverified', 'suspended', 'pending_activation'], true) || $request->is(...self::ALWAYS_ALLOWED)) {
            return $next($request);
        }

        return response()->json([
            'code'    => $status === 'unverified' ? 'email_unverified' : ($status === 'suspended' ? 'account_suspended' : 'pending_activation'),
            'message' => match ($status) {
                'unverified' => 'Verify your email first: enter the 6-digit code we sent you, or request a new one.',
                'suspended'  => 'Your account has been suspended due to a violation of our platform rules or policies. If you believe this is a mistake, please contact our support team for assistance.',
                default      => 'Activate your rider account from the email your courier company or hub sent you first.',
            },
        ], 403);
    }
}
