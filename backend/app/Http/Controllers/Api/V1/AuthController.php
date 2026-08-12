<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\SellerRegisterRequest;
use App\Http\Resources\UserResource;
use App\Mail\WelcomeMail;
use App\Models\User;
use App\Services\SellerRegistrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;

class AuthController extends Controller
{
    public function __construct(private SellerRegistrationService $registrationService) {}

    public function registerBuyer(BuyerRegisterRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request) {
            $user = User::create($request->validated());
            $user->role = 'buyer';
            $user->save();
            return $user;
        });

        Mail::to($user->email)->queue(new WelcomeMail($user));

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'data'  => new UserResource($user),
            'token' => $token,
        ], 201);
    }

    public function registerSeller(SellerRegisterRequest $request): JsonResponse
    {
        $user = $this->registrationService->register(
            $request->validated(),
            $request->file('government_id_image')
        );

        Mail::to($user->email)->queue(new WelcomeMail($user));

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'data'  => new UserResource($user),
            'token' => $token,
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        if (! Auth::attempt($request->only('email', 'password'))) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        $user = Auth::user();

        if ($user->status === 'suspended') {
            Auth::logout();
            return response()->json(['message' => 'Your account has been suspended.'], 403);
        }

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'data'  => new UserResource($user->load('sellerProfile')),
            'token' => $token,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => new UserResource($request->user()->load('sellerProfile')),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone'         => ['nullable', 'string', 'regex:/^\+[1-9]\d{6,14}$/', 'unique:users,phone,' . $request->user()->id],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'gender'        => ['nullable', 'in:male,female,prefer_not_to_say'],
        ]);

        $request->user()->update($validated);

        return response()->json([
            'data' => new UserResource($request->user()->fresh()->load('sellerProfile')),
        ]);
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', File::image()->max(5 * 1024)],
        ]);

        $user = $request->user();

        // Delete old avatar if exists
        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $path = $request->file('avatar')->store('avatars', 'public');
        $user->update(['avatar_path' => $path]);

        return response()->json([
            'data' => new UserResource($user->fresh()->load('sellerProfile')),
        ]);
    }
}
