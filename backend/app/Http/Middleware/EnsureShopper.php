<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Buying is for buyer and seller accounts. A hub, courier company, rider or truck driver account runs deliveries and
 * never shops (User::isWorkAccount), so the cart, checkout, wishlist and the other buyer actions refuse it with 403
 * and the code "work_account". Reading what the account already has (an old order, an empty cart) stays open.
 */
class EnsureShopper
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();

        if ($user && $user->isWorkAccount()) {
            return response()->json(['message' => User::WORK_ACCOUNT_MESSAGE, 'code' => 'work_account'], 403);
        }

        return $next($request);
    }
}
