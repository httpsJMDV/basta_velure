<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Mail\WelcomeMail;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class GoogleAuthController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['credential' => ['required', 'string']]);

        // Verify the access token with Google and fetch the user's profile
        // withoutVerifying() is safe here: we're only reading public profile data,
        // and the token itself was already validated by Google's OAuth flow on the client.
        // On production, remove withoutVerifying() and ensure the server has a valid CA bundle.
        $client = app()->environment('local')
            ? Http::withoutVerifying()
            : Http::withOptions([]);

        try {
            $googleUser = $client->get('https://www.googleapis.com/oauth2/v3/userinfo', [
                'access_token' => $request->credential,
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Could not reach Google. Please try again.'], 502);
        }

        if (! $googleUser->successful() || empty($googleUser->json('email'))) {
            return response()->json(['message' => 'Invalid Google token.'], 401);
        }

        $payload      = $googleUser->json();
        $email        = $payload['email'];
        $firstName    = $payload['given_name'] ?? 'User';
        $lastName     = $payload['family_name'] ?? '';
        $googleAvatar = $payload['picture'] ?? null;

        $user = User::withTrashed()->where('email', $email)->first();

        if ($user && $user->trashed()) {
            return response()->json(['message' => 'This account has been deactivated.'], 403);
        }

        if (! $user) {
            // New Google user — create a stub account. A token IS issued so the frontend
            // can call the authenticated completeProfile endpoint. buyer_application_status
            // stays null until completeProfile sets it to 'pending' after collecting all info.
            $user = User::create([
                'first_name'               => $firstName,
                'last_name'                => $lastName ?: 'User',
                'email'                    => $email,
                'phone'                    => null,
                'password'                 => bcrypt(Str::random(32)),
                'email_verified_at'        => now(),
                'buyer_application_status' => null,
            ]);
            // email_verified_at is not mass-assignable, so create() above drops it: Google confirmed the address.
            $user->forceFill(['role' => 'buyer', 'email_verified_at' => now()])->save();

            Mail::to($user->email)->queue(new WelcomeMail($user));

            $token = $user->createToken('auth_token')->plainTextToken;

            return response()->json([
                'data'               => new UserResource($user->load(['sellerProfile', 'addresses'])),
                'token'              => $token,
                'profile_incomplete' => true,
                'google_avatar_url'  => $googleAvatar,
            ], 201);
        }

        if ($user->status === 'suspended') {
            return response()->json(['message' => 'Your account has been suspended.'], 403);
        }

        // An account made with the sign-up form whose email code was never entered: signing in with Google does not
        // skip that step (it used to hand out a token, so the account could shop unverified).
        if ($user->status === 'unverified') {
            return response()->json([
                'code'    => 'email_unverified',
                'email'   => $user->email,
                'message' => 'This email has a Loved-IT account that is not verified yet. Enter the 6-digit code we sent you, or request a new one.',
            ], 403);
        }
        // A rider sets a password from the activation email; Google sign-in does not stand in for it.
        if ($user->status === 'pending_activation') {
            return response()->json([
                'code'    => 'pending_activation',
                'message' => 'This rider account is not activated yet. Open the activation link we emailed you first.',
            ], 403);
        }

        // Returning Google user whose profile is still incomplete — let them finish it
        $profileIncomplete = empty($user->date_of_birth) || empty($user->sex) || empty($user->government_id_type);
        if ($profileIncomplete) {
            $user->update(['last_login_at' => now()]);
            $token = $user->createToken('auth_token')->plainTextToken;
            return response()->json([
                'data'               => new UserResource($user->load(['sellerProfile', 'addresses'])),
                'token'              => $token,
                'profile_incomplete' => true,
                'google_avatar_url'  => $googleAvatar,
            ], 200);
        }

        // A buyer whose ID is waiting or was not approved still signs in: they browse and fill a cart, and checkout
        // waits for the approved ID (User::orderBlockedByIdCheck), the same as for buyers who used the sign-up form.

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth_token')->plainTextToken;

        // Save Google avatar if user doesn't have one yet
        if (! $user->avatar_path && $googleAvatar) {
            try {
                $client2 = app()->environment('local') ? Http::withoutVerifying() : Http::withOptions([]);
                $imgContents = $client2->timeout(10)->get($googleAvatar)->body();
                $name = 'avatars/' . \Illuminate\Support\Str::uuid() . '.jpg';
                \Illuminate\Support\Facades\Storage::disk('public')->put($name, $imgContents);
                $user->update(['avatar_path' => $name]);
            } catch (\Throwable) {
                // Non-fatal
            }
        }

        return response()->json([
            'data'  => new UserResource($user->load(['sellerProfile', 'addresses'])),
            'token' => $token,
        ], 200);
    }
}
