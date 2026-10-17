<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\SellerRegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\EmailOtp;
use App\Models\User;
use App\Services\AccountRegistrar;
use App\Services\EmailOtpService;
use App\Services\SellerRegistrationService;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private const USER_RELATIONS = ['sellerProfile', 'sortingCenter', 'rider', 'addresses', 'logisticsMembership.company'];

    public function __construct(
        private SellerRegistrationService $registrationService,
        private AccountRegistrar $registrar,
        private EmailOtpService $otp,
    ) {}

    /**
     * POST /auth/register: creates an unverified buyer account and emails a 6-digit code. No token is issued: the
     * account cannot be used until the code is entered on the verification page (A9, A12).
     */
    public function registerBuyer(BuyerRegisterRequest $request): JsonResponse
    {
        $user = DB::transaction(fn () => $this->registrar->createUnverified($request->validated()));

        $this->otp->issue($user, EmailOtp::PURPOSE_REGISTER);

        return response()->json([
            'message'               => "Account created. We sent a 6-digit code to {$user->email}. Enter it to verify your email.",
            'verification_required' => true,
            'email'                 => $user->email,
            'data'                  => ['email' => $user->email, 'status' => $user->status],
        ], 201);
    }

    /**
     * POST /auth/register-seller (a visitor: account and shop in one form, then the emailed code) and
     * POST /auth/apply-seller (a signed-in buyer: the shop only).
     */
    public function applyAsSeller(SellerRegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        $files = array_filter([
            'government_id_image'      => $request->file('government_id_image'),
            'government_id_image_back' => $request->file('government_id_image_back'),
            'dti_certificate'          => $request->file('dti_certificate'),
            'sec_certificate'          => $request->file('sec_certificate'),
            'dti_sec_registration'     => $request->file('dti_sec_registration'),
            'bir_2303'                 => $request->file('bir_2303'),
            'business_permit'          => $request->file('business_permit'),
            'selfie_with_id'           => $request->file('selfie_with_id'),
            'fda_lto'                  => $request->file('fda_lto'),
        ]);

        if ($request->isGuest()) {
            $user = DB::transaction(function () use ($data, $files) {
                $user = $this->registrar->createUnverified($data);
                $this->registrationService->apply($user, $data, $files, notify: false);

                return $user;
            });

            $this->otp->issue($user, EmailOtp::PURPOSE_REGISTER);

            return response()->json([
                'message'               => "Application saved. We sent a 6-digit code to {$user->email}. Enter it to verify your email and send the application for review.",
                'verification_required' => true,
                'email'                 => $user->email,
            ], 201);
        }

        $user = $this->registrationService->apply($request->user('sanctum'), $data, $files);

        return response()->json(['data' => new UserResource($user->load(self::USER_RELATIONS))], 201);
    }

    /**
     * POST /auth/verify-email {email, code}: the code from the registration email. On success the account is active
     * (a seller or courier applicant moves to Pending Approval) and the person is signed in.
     */
    public function verifyEmail(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'string', 'max:150']], ['email.required' => 'Enter the email you registered with.']);
        $user = User::where('email', mb_strtolower(trim((string) $request->input('email'))))->first();

        if (! $user) {
            throw ValidationException::withMessages(['email' => 'No account is waiting for verification with this email.']);
        }
        if ($user->status !== 'unverified') {
            return response()->json(['message' => 'This email is already verified. Please sign in.', 'already_verified' => true], 409);
        }

        $this->otp->consume($user, EmailOtp::PURPOSE_REGISTER, $request->input('code'));
        $message = $this->registrar->completeVerification($user);

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => $message,
            'data'    => new UserResource($user->fresh()->load(self::USER_RELATIONS)),
            'token'   => $token,
        ]);
    }

    /** POST /auth/resend-verification {email}: a new code; the previous one stops working. */
    public function resendVerification(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'string', 'max:150']]);
        $user = User::where('email', mb_strtolower(trim((string) $request->input('email'))))->first();

        if (! $user || $user->status !== 'unverified') {
            return response()->json(['message' => 'If an account is waiting for verification with this email, a new code has been sent.']);
        }

        $this->otp->issue($user, EmailOtp::PURPOSE_REGISTER);

        return response()->json([
            'message'    => "A new 6-digit code was sent to {$user->email}. The previous code no longer works.",
            'expires_in' => $this->otp->minutes() * 60,
        ]);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        // The identifier is an email or a username, matched case-insensitively. Unknown identifiers fall through to the
        // same attempt() as a wrong password, so the response (and the work done) is the same.
        $identifier = $request->identifier();
        $account = User::findByLoginIdentifier($identifier);

        // A rider added by a courier company has no password until they open the activation link (A13).
        if ($account && $account->status === 'pending_activation') {
            return response()->json([
                'code'    => 'pending_activation',
                'message' => 'This rider account is not activated yet. Open the activation link we emailed you to set your password, or ask your courier company to resend it.',
            ], 403);
        }

        if (! Auth::guard('web')->attempt(['email' => $account?->email ?? $identifier, 'password' => $request->input('password')])) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        /** @var \App\Models\User $user */
        $user = Auth::guard('web')->user();

        if ($user->status === 'unverified') {
            Auth::guard('web')->logout();
            return response()->json([
                'code'    => 'email_unverified',
                'email'   => $user->email,
                'message' => 'Please verify your email before signing in. Enter the 6-digit code we sent you, or request a new one.',
            ], 403);
        }

        if ($user->status === 'suspended') {
            Auth::guard('web')->logout();
            return response()->json([
                'message' => 'Your account has been suspended due to a violation of our platform rules or policies. If you believe this is a mistake, please contact our support team for assistance.',
            ], 403);
        }

        // Hub and courier applicants apply from their buyer account, so a pending, rejected or disapproved application
        // never blocks sign-in: they keep shopping and see the application status on the hub or courier page. The hub
        // and rider routes stay closed to them (approved_sorting_center, approved_rider). Only a suspended hub is
        // refused here, as an admin action.
        if ($user->sortingCenter) {
            $hubStatus = $user->sortingCenter->status;
            if ($hubStatus === \App\Models\SortingCenter::STATUS_SUSPENDED) {
                Auth::guard('web')->logout();
                return response()->json([
                    'message' => 'Your sorting center hub account has been suspended. Please contact platform administration.',
                ], 403);
            }
        }

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'data'  => new UserResource($user->load(['sellerProfile', 'sortingCenter', 'rider', 'logisticsMembership.company'])),
            'token' => $token,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();
        /** @var \Laravel\Sanctum\PersonalAccessToken|null $token */
        $token = $user->currentAccessToken();
        $token?->delete();

        // A rider who signs out stops receiving job offers (A14: only Online riders get offers).
        \App\Models\Rider::where('user_id', $user->id)->where('is_online', true)->update(['is_online' => false]);

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();
        return response()->json([
            'data' => new UserResource($user->load(self::USER_RELATIONS)),
        ]);
    }

    /**
     * Identity verification from the account (a government ID, birthday, sex and an address). Optional for buyers who
     * registered with email; Google sign-ups complete it before shopping.
     */
    public function completeProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        // Only needed if profile is still incomplete
        if ($user->date_of_birth && $user->sex && $user->government_id_type) {
            return response()->json(['data' => new UserResource($user->load(['sellerProfile', 'addresses']))]);
        }

        $request->merge(['phone' => PhMobile::prepare($request->input('phone'))]);

        $validated = $request->validate([
            'sex'                  => ['required', 'in:male,female,prefer_not_to_say'],
            'phone'                => ['required', ...PhMobile::rules(), 'unique:users,phone,' . $user->id],
            'date_of_birth'        => Validation::dateOfBirth(),
            'province'             => ['required', 'string', 'max:100'],
            'city_municipality'    => ['required', 'string', 'max:100'],
            'barangay'             => ['required', 'string', 'max:100'],
            'street_address'       => ['required', 'string', 'max:255'],
            'government_id_type'   => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id,school_id'],
            'government_id_image'  => Validation::document(),
            'government_id_image_back' => Validation::document(BuyerRegisterRequest::requiresBack($request->input('government_id_type'))),
            'avatar'            => Validation::image(required: false),
            'google_avatar_url'  => ['nullable', 'url', 'max:500'],
        ], [
            'phone.regex' => PhMobile::MESSAGE,
            ...Validation::uploadMessages('government_id_image', 'the front of your ID', document: true),
            ...Validation::uploadMessages('government_id_image_back', 'the back of your ID', document: true),
            ...Validation::uploadMessages('avatar', 'the profile photo'),
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
                    $name = 'avatars/' . \Illuminate\Support\Str::uuid() . '.jpg';
                    Storage::disk('public')->put($name, $imgContents);
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
                'avatar_path'                    => $avatarPath ?? $user->avatar_path,
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
                'is_default' => ! $user->addresses()->where('is_default', true)->exists(),
            ]);
        });

        return response()->json(['data' => new UserResource($user->fresh()->load('sellerProfile'))]);
    }

    /**
     * PATCH /auth/profile: names, date of birth and sex. The email and the mobile number are changed through their own
     * verified flows (a code confirms the new value), never here.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        foreach (['first_name', 'middle_name', 'last_name'] as $field) {
            if (is_string($request->input($field))) {
                $request->merge([$field => preg_replace('/\s+/', ' ', trim($request->input($field)))]);
            }
        }

        $validated = $request->validate([
            'first_name'    => ['sometimes', ...Validation::personName()],
            'middle_name'   => ['sometimes', ...Validation::personName(required: false)],
            'last_name'     => ['sometimes', ...Validation::personName()],
            'date_of_birth' => ['sometimes', ...Validation::dateOfBirth(required: false)],
            'sex'           => ['sometimes', 'nullable', 'in:male,female,prefer_not_to_say'],
            'phone'         => ['prohibited'],
            'email'         => ['prohibited'],
        ], [
            ...Validation::personNameMessages('first_name', 'First name'),
            ...Validation::personNameMessages('middle_name', 'Middle name'),
            ...Validation::personNameMessages('last_name', 'Last name'),
            'phone.prohibited' => 'Use Change mobile number to verify a new number.',
            'email.prohibited' => 'Use Change email to verify a new email address.',
        ]);

        $request->user()->update($validated);

        return response()->json([
            'message' => 'Your profile has been updated.',
            'data'    => new UserResource($request->user()->fresh()->load(self::USER_RELATIONS)),
        ]);
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate(['avatar' => Validation::image()], Validation::uploadMessages('avatar', 'a profile photo'));

        $user = $request->user();
        $old = $user->avatar_path;

        $path = $request->file('avatar')->store('avatars', 'public');
        $user->update(['avatar_path' => $path]);

        // The old photo is removed only after the new one is saved, so a failed upload keeps the current photo.
        if ($old) {
            Storage::disk('public')->delete($old);
        }

        return response()->json([
            'message' => 'Your profile photo has been updated.',
            'data'    => new UserResource($user->fresh()->load(self::USER_RELATIONS)),
        ]);
    }

    /** POST /auth/change-password {current_password, password, password_confirmation} */
    public function changePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'string', 'confirmed', BuyerRegisterRequest::passwordRule()],
            'password_confirmation' => ['required', 'string'],
        ], [
            'current_password.required' => 'Enter your current password.',
            'password.required'         => 'Enter a new password.',
            'password.confirmed'        => 'The new passwords do not match.',
            'password_confirmation.required' => 'Confirm your new password.',
        ]);

        if (! $user->password || ! Hash::check((string) $request->input('current_password'), $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'The current password is incorrect.']);
        }
        if (Hash::check((string) $request->input('password'), $user->password)) {
            throw ValidationException::withMessages(['password' => 'The new password must be different from your current password.']);
        }

        $user->forceFill(['password' => $request->input('password')])->save();

        // Other signed-in devices must sign in again with the new password; this one stays signed in.
        $current = $user->currentAccessToken();
        $user->tokens()->when($current, fn ($q) => $q->where('id', '!=', $current->id))->delete();

        return response()->json(['message' => 'Your password has been changed.']);
    }

    /**
     * POST /auth/email-change {email}: emails a code to the NEW address. Until it is entered, the old email stays the
     * sign-in email and is what the profile shows. An email already used by any account is refused with no code sent.
     */
    public function requestEmailChange(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $request->merge(['email' => is_string($request->input('email')) ? mb_strtolower(trim($request->input('email'))) : $request->input('email')]);

        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:100', 'unique:users,email'],
        ], [
            'email.required' => 'Enter the new email address.',
            'email.email'    => 'Enter a valid email address, for example name@example.com.',
            'email.unique'   => 'This email is already in use by another account.',
        ]);

        $this->otp->issue($user, EmailOtp::PURPOSE_EMAIL_CHANGE, $data['email'], $data['email']);

        return response()->json([
            'message'       => "We sent a 6-digit code to {$data['email']}. Enter it to finish changing your email. Until then, keep signing in with {$user->email}.",
            'pending_email' => $data['email'],
            'expires_in'    => $this->otp->minutes() * 60,
        ]);
    }

    /** POST /auth/email-change/confirm {code} */
    public function confirmEmailChange(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $otp = $this->otp->consume($user, EmailOtp::PURPOSE_EMAIL_CHANGE, $request->input('code'));

        // Someone may have taken the address while the code was in the inbox.
        if (User::where('email', $otp->target)->where('id', '!=', $user->id)->exists()) {
            throw ValidationException::withMessages(['code' => 'This email is already in use by another account. Choose another email.']);
        }

        $user->forceFill(['email' => $otp->target, 'email_verified_at' => now()])->save();

        return response()->json([
            'message' => "Your email is now {$user->email}. Use it the next time you sign in.",
            'data'    => new UserResource($user->fresh()->load(self::USER_RELATIONS)),
        ]);
    }

    /**
     * POST /auth/phone-change {phone}: checks the new mobile number and sends a confirmation code to the account's
     * email (Loved-IT sends no SMS). The number is saved only after the code is entered.
     */
    public function requestPhoneChange(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $request->merge(['phone' => PhMobile::prepare($request->input('phone'))]);

        $data = $request->validate([
            'phone' => ['required', ...PhMobile::rules(), 'unique:users,phone'],
        ], [
            'phone.required' => 'Enter the new mobile number.',
            'phone.regex'    => PhMobile::MESSAGE,
            'phone.string'   => PhMobile::MESSAGE,
            'phone.unique'   => 'This mobile number is already in use by another account.',
        ]);

        $this->otp->issue($user, EmailOtp::PURPOSE_PHONE_CHANGE, $data['phone']);

        return response()->json([
            'message'       => 'We sent a 6-digit code to ' . $user->email . ' to confirm ' . PhMobile::local($data['phone']) . '. Your number changes once you enter it.',
            'pending_phone' => PhMobile::local($data['phone']),
            'expires_in'    => $this->otp->minutes() * 60,
        ]);
    }

    /** POST /auth/phone-change/confirm {code} */
    public function confirmPhoneChange(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $otp = $this->otp->consume($user, EmailOtp::PURPOSE_PHONE_CHANGE, $request->input('code'));

        if (User::where('phone', $otp->target)->where('id', '!=', $user->id)->exists()) {
            throw ValidationException::withMessages(['code' => 'This mobile number is already in use by another account.']);
        }

        $user->forceFill(['phone' => $otp->target])->save();

        return response()->json([
            'message' => 'Your mobile number is now ' . PhMobile::local($user->phone) . '.',
            'data'    => new UserResource($user->fresh()->load(self::USER_RELATIONS)),
        ]);
    }
}
