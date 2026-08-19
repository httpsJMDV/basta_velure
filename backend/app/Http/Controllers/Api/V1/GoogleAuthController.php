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
        $isNew        = false;

        $user = User::withTrashed()->where('email', $email)->first();

        if ($user && $user->trashed()) {
            return response()->json(['message' => 'This account has been deactivated.'], 403);
        }

        if (! $user) {
            // New Google user — create a stub account; they must complete their profile
            // (DOB, sex, address, gov ID) before buyer_application_status is set
            $user = User::create([
                'first_name'        => $firstName,
                'last_name'         => $lastName ?: 'User',
                'email'             => $email,
                'phone'             => null,
                'password'          => bcrypt(Str::random(32)),
                'email_verified_at' => now(),
            ]);
            $user->role = 'buyer';
            $user->save();
            $isNew = true;
        }

        if ($user->status === 'suspended') {
            return response()->json(['message' => 'Your account has been suspended.'], 403);
        }

        if ($isNew) {
            Mail::to($user->email)->queue(new WelcomeMail($user));
        }

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth_token')->plainTextToken;

        // If the user has no DOB/sex/gov ID yet, signal the frontend to show the completion form
        $profileIncomplete = empty($user->date_of_birth) || empty($user->sex) || empty($user->government_id_type);

        return response()->json([
            'data'               => new UserResource($user->load('sellerProfile')),
            'token'              => $token,
            'profile_incomplete' => $profileIncomplete,
            'google_avatar_url'  => ($profileIncomplete && $googleAvatar) ? $googleAvatar : null,
        ], $isNew ? 201 : 200);
    }
}
