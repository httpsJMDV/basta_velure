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

        $payload = $this->verifiedProfile((string) $request->credential);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }

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

    /**
     * The Google profile behind the credential, or the response to send back. Google's tokeninfo says which OAuth
     * client the token was issued to, and only Loved-IT's own client IDs (`services.google.client_ids`) are accepted,
     * so a token that another app got from the same Google user can't sign in here.
     *
     * The mobile app sends an ID token (a JWT whose `aud` is the website's client ID it asked for); the website's
     * Google button sends an access token (`aud`/`azp` is the website's client ID) whose profile comes from userinfo.
     *
     * @return array<string, mixed>|JsonResponse
     */
    private function verifiedProfile(string $credential): array|JsonResponse
    {
        $allowed = config('services.google.client_ids', []);
        if ($allowed === []) {
            report(new \RuntimeException('GOOGLE_CLIENT_IDS is not set, so Google sign-in is refused.'));

            return response()->json(['message' => 'Google sign-in is not available right now. Sign in with your email.'], 503);
        }

        // Local development often lacks a CA bundle; everywhere else the certificate is checked.
        $client = app()->environment('local') ? Http::withoutVerifying() : Http::withOptions([]);
        $isIdToken = substr_count($credential, '.') === 2;

        try {
            $info = $client->timeout(10)->get('https://oauth2.googleapis.com/tokeninfo', [
                ($isIdToken ? 'id_token' : 'access_token') => $credential,
            ]);
            $profile = $info->successful() && ! $isIdToken
                ? $client->timeout(10)->get('https://www.googleapis.com/oauth2/v3/userinfo', ['access_token' => $credential])
                : null;
        } catch (\Exception) {
            return response()->json(['message' => 'Could not reach Google. Please try again.'], 502);
        }

        $invalid = response()->json(['message' => 'Invalid Google token.'], 401);
        if (! $info->successful()) {
            return $invalid;
        }

        $issuedTo = array_filter([$info->json('aud'), $info->json('azp')], 'is_string');
        if (array_intersect($issuedTo, $allowed) === []) {
            return $invalid;
        }

        if ($isIdToken) {
            $fromGoogle = in_array($info->json('iss'), ['accounts.google.com', 'https://accounts.google.com'], true);
            $verifiedEmail = filter_var($info->json('email_verified'), FILTER_VALIDATE_BOOLEAN);

            return $fromGoogle && $verifiedEmail && ! empty($info->json('email')) ? $info->json() : $invalid;
        }

        return $profile?->successful() && ! empty($profile->json('email')) ? $profile->json() : $invalid;
    }
}
