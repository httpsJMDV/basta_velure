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
            $validated = $request->validated();

            // Store government ID on private disk (not publicly accessible)
            $idPath = $request->file('government_id_image')
                ->store('buyer-ids', 'local');

            $idBackPath = $request->hasFile('government_id_image_back')
                ? $request->file('government_id_image_back')->store('buyer-ids', 'local')
                : null;

            $avatarPath = $request->hasFile('avatar')
                ? $request->file('avatar')->store('avatars', 'public')
                : null;

            $user = User::create([
                'first_name'                     => $validated['first_name'],
                'middle_name'                    => $validated['middle_name'] ?? null,
                'last_name'                      => $validated['last_name'],
                'sex'                            => $validated['sex'],
                'email'                          => $validated['email'],
                'phone'                          => $validated['phone'],
                'password'                       => $validated['password'],
                'date_of_birth'                  => $validated['date_of_birth'],
                'government_id_type'             => $validated['government_id_type'],
                'government_id_image_path'       => $idPath,
                'government_id_image_back_path'  => $idBackPath,
                'avatar_path'                    => $avatarPath,
                'buyer_application_status'       => 'pending',
            ]);
            $user->role = 'buyer';
            $user->save();

            // Create default address from registration data
            $user->addresses()->create([
                'full_name'  => $user->first_name . ' ' . $user->last_name,
                'phone'      => $user->phone,
                'address'    => $validated['street_address'] ?? '',
                'province'   => $validated['province'],
                'district'   => $validated['city_municipality'],
                'ward'       => $validated['barangay'],
                'label'      => 'home',
                'is_default' => true,
            ]);

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
            $request->file('government_id_image'),
            $request->file('government_id_image_back'),
            $request->file('business_permit'),
        );

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
            return response()->json([
                'message' => 'Your account has been suspended due to a violation of our platform rules or policies. If you believe this is a mistake, please contact our support team for assistance.',
            ], 403);
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

    public function completeProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        // Only needed if profile is still incomplete
        if ($user->date_of_birth && $user->sex && $user->government_id_type) {
            return response()->json(['data' => new UserResource($user->load('sellerProfile'))]);
        }

        $validated = $request->validate([
            'sex'                  => ['required', 'in:male,female,prefer_not_to_say'],
            'phone'                => ['required', 'string', 'regex:/^\+[1-9]\d{6,14}$/', 'unique:users,phone,' . $user->id],
            'date_of_birth'        => ['required', 'date', 'before:today', function ($attr, $value, $fail) {
                if (\Carbon\Carbon::parse($value)->age < 18) {
                    $fail('You must be at least 18 years old.');
                }
            }],
            'province'             => ['required', 'string', 'max:100'],
            'city_municipality'    => ['required', 'string', 'max:100'],
            'barangay'             => ['required', 'string', 'max:100'],
            'street_address'       => ['required', 'string', 'max:255'],
            'government_id_type'   => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id'],
            'government_id_image'  => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'government_id_image_back' => [
                \App\Http\Requests\Auth\BuyerRegisterRequest::requiresBack($request->input('government_id_type')) ? 'required' : 'nullable',
                'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120',
            ],
            'avatar'            => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'google_avatar_url'  => ['nullable', 'url', 'max:500'],
        ]);

        DB::transaction(function () use ($user, $validated, $request) {
            $idPath = $request->file('government_id_image')->store('buyer-ids', 'local');
            $idBackPath = $request->hasFile('government_id_image_back')
                ? $request->file('government_id_image_back')->store('buyer-ids', 'local')
                : null;

            $avatarPath = null;
            if ($request->hasFile('avatar')) {
                $avatarPath = $request->file('avatar')->store('avatars', 'public');
            } elseif (! empty($validated['google_avatar_url'])) {
                // Download the Google profile picture and store it locally
                try {
                    $imgContents = \Illuminate\Support\Facades\Http::timeout(10)->get($validated['google_avatar_url'])->body();
                    $ext  = 'jpg';
                    $name = 'avatars/' . \Illuminate\Support\Str::uuid() . '.' . $ext;
                    \Illuminate\Support\Facades\Storage::disk('public')->put($name, $imgContents);
                    $avatarPath = $name;
                } catch (\Throwable) {
                    // Non-fatal — user just won't have an avatar
                }
            }

            $user->update([
                'sex'                            => $validated['sex'],
                'phone'                          => $validated['phone'],
                'date_of_birth'                  => $validated['date_of_birth'],
                'government_id_type'             => $validated['government_id_type'],
                'government_id_image_path'       => $idPath,
                'government_id_image_back_path'  => $idBackPath,
                'avatar_path'                    => $avatarPath,
                'buyer_application_status'       => 'pending',
            ]);

            $user->addresses()->create([
                'full_name'  => $user->first_name . ' ' . $user->last_name,
                'phone'      => $validated['phone'],
                'address'    => $validated['street_address'],
                'province'   => $validated['province'],
                'district'   => $validated['city_municipality'],
                'ward'       => $validated['barangay'],
                'label'      => 'home',
                'is_default' => true,
            ]);
        });

        return response()->json(['data' => new UserResource($user->fresh()->load('sellerProfile'))]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'first_name'    => ['nullable', 'string', 'max:50'],
            'middle_name'   => ['nullable', 'string', 'max:50'],
            'last_name'     => ['nullable', 'string', 'max:50'],
            'phone'         => ['nullable', 'string', 'regex:/^\+[1-9]\d{6,14}$/', 'unique:users,phone,' . $request->user()->id],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'sex'           => ['nullable', 'in:male,female,prefer_not_to_say'],
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
