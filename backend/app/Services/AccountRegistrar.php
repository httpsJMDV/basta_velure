<?php

namespace App\Services;

use App\Mail\SellerApplicationMail;
use App\Mail\WelcomeMail;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
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

        Mail::to($user->email)->queue(new WelcomeMail($user));

        return 'Your email is verified and your account is active. Welcome to Loved-IT!';
    }
}
