<?php

namespace App\Services;

use App\Mail\SellerApplicationMail;
use App\Mail\WelcomeMail;
use App\Models\Address;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

/**
 * Creating accounts and finishing their email verification (A9, A12). Every registration (buyer, seller, courier)
 * creates an "unverified" account; entering the emailed code makes it usable. A buyer is then Active; a seller or
 * courier applicant is Pending Approval and their application reaches the admin's queue.
 */
class AccountRegistrar
{
    /** @param array<string, mixed> $data validated account fields (BuyerRegisterRequest::accountRules) */
    public function createUnverified(array $data): User
    {
        $user = User::create([
            'first_name'    => $data['first_name'],
            'middle_name'   => $data['middle_name'] ?? null,
            'last_name'     => $data['last_name'],
            'email'         => $data['email'],
            'phone'         => $data['phone'],
            'password'      => $data['password'],
            'date_of_birth' => $data['date_of_birth'] ?? null,
        ]);
        $user->forceFill([
            'role'              => 'buyer',
            'status'            => 'unverified',
            'terms_accepted_at' => now(),
        ])->save();

        return $user;
    }

    /**
     * The address given while signing up (the app's sign-up form, or Complete profile), saved as a Home address in
     * the address book like one added there. It becomes the default when the account has none. The PSGC codes are
     * kept when the form sent them; without them the address asks to be picked again before checkout
     * (`address_needs_update`), as it always did.
     *
     * @param array{street_address: string, province: string, city_municipality: string, barangay: string, region?: ?string,
     *     region_code?: ?string, province_code?: ?string, city_code?: ?string, barangay_code?: ?string} $place
     */
    public function addSignUpAddress(User $user, array $place, ?string $phone): Address
    {
        return $user->addresses()->create([
            'full_name'     => trim($user->first_name . ' ' . $user->last_name),
            'phone'         => $phone ?? $user->phone,
            'address'       => $place['street_address'],
            'province'      => $place['province'],
            'district'      => $place['city_municipality'],
            'ward'          => $place['barangay'],
            'region'        => $place['region'] ?? null,
            'region_code'   => $place['region_code'] ?? null,
            'province_code' => $place['province_code'] ?? null,
            'city_code'     => $place['city_code'] ?? null,
            'barangay_code' => $place['barangay_code'] ?? null,
            'label'         => 'home',
            'is_default'    => ! $user->addresses()->where('is_default', true)->exists(),
        ]);
    }

    /**
     * The email is confirmed: the account becomes active, and any application made with it is sent for review.
     *
     * @return string what the person sees next
     */
    public function completeVerification(User $user): string
    {
        $user->forceFill(['status' => 'active', 'email_verified_at' => now()])->save();

        $profile = $user->sellerProfile()->first();
        if ($profile && $profile->application_status === 'pending') {
            Mail::to($user->email)->queue(new SellerApplicationMail($user));

            return 'Your email is verified. Your seller application is now Pending Approval: an admin will review it and email you the result.';
        }

        $membership = LogisticsCompanyMember::with('company')->where('user_id', $user->id)->first();
        if ($membership?->company && $membership->company->status === LogisticsCompany::STATUS_PENDING) {
            app(MailNotifier::class)->courierApplicationReceived($membership->company);

            return 'Your email is verified. Your courier company application is now Pending Approval: an admin will review it and email you the result.';
        }

        $hub = SortingCenter::with(['user', 'logisticsCompany'])->where('user_id', $user->id)->latest('id')->first();
        if ($hub && $hub->status === SortingCenter::STATUS_PENDING) {
            app(MailNotifier::class)->hubApplicationReceived($hub);
            app(MailNotifier::class)->courierNewHubApplication($hub);

            return 'Your email is verified. Your hub application is now Pending Approval: the courier company will review it and email you the result.';
        }

        Mail::to($user->email)->queue(new WelcomeMail($user));

        return 'Your email is verified and your account is active. Welcome to Loved-IT!';
    }
}
