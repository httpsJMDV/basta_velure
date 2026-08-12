<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\PasswordResetMail;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class PasswordController extends Controller
{
    public function forgot(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $user = User::where('email', $request->email)->first();

        // Always return 200 — never reveal whether the email exists
        if ($user) {
            $token = Str::random(64);
            $user->reset_token         = hash('sha256', $token);
            $user->reset_token_expires_at = now()->addMinutes(60);
            $user->save();

            $resetUrl = env('FRONTEND_URL', 'http://localhost:5173')
                . '/reset-password?token=' . $token
                . '&email=' . urlencode($user->email);

            Mail::to($user->email)->queue(new PasswordResetMail($user->first_name, $resetUrl));
        }

        return response()->json(['message' => 'If that email exists, a reset link has been sent.']);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token'                 => ['required', 'string'],
            'email'                 => ['required', 'email'],
            'password'              => ['required', 'confirmed', \Illuminate\Validation\Rules\Password::min(8)->mixedCase()->numbers()->symbols()->uncompromised()],
        ]);

        $user = User::where('email', $request->email)->first();

        if (
            ! $user
            || ! $user->reset_token
            || ! hash_equals($user->reset_token, hash('sha256', $request->token))
            || now()->isAfter($user->reset_token_expires_at)
        ) {
            return response()->json(['message' => 'This reset link is invalid or has expired.'], 422);
        }

        $user->password               = Hash::make($request->password);
        $user->reset_token            = null;
        $user->reset_token_expires_at = null;
        $user->save();

        // Revoke all existing tokens for security
        $user->tokens()->delete();

        return response()->json(['message' => 'Password reset successfully. Please sign in.']);
    }
}
