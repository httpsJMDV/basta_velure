<?php

namespace App\Services;

use App\Models\EmailOtp;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Sends and checks the 6-digit email codes (Assumption A9): valid for config('verification.otp_minutes') minutes,
 * one live code per purpose (a resend cancels the previous one), and a code works once.
 */
class EmailOtpService
{
    /**
     * Creates a new code for the purpose, cancels any earlier one, and emails it to $sendTo (the account's email when
     * null). Returns the plain code only so tests can use it; it is never put in a response.
     */
    public function issue(User $user, string $purpose, ?string $target = null, ?string $sendTo = null): string
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        DB::transaction(function () use ($user, $purpose, $target, $code) {
            EmailOtp::where('user_id', $user->id)
                ->where('purpose', $purpose)
                ->whereNull('consumed_at')
                ->whereNull('superseded_at')
                ->update(['superseded_at' => now()]);

            EmailOtp::create([
                'user_id'    => $user->id,
                'purpose'    => $purpose,
                'target'     => $target,
                'code_hash'  => Hash::make($code),
                'expires_at' => now()->addMinutes($this->minutes()),
            ]);
        });

        app(MailNotifier::class)->verificationCode($user, $code, $purpose, $sendTo ?? $user->email, $this->minutes());

        return $code;
    }

    /**
     * Checks a code typed by the user and consumes it. Each failure is a validation error on "code" with its own
     * message: wrong format, no code requested, expired (with the resend hint), or wrong code.
     */
    public function consume(User $user, string $purpose, mixed $code): EmailOtp
    {
        $code = is_string($code) || is_int($code) ? trim((string) $code) : '';

        if ($code === '') {
            throw ValidationException::withMessages(['code' => 'Enter the 6-digit code from your email.']);
        }
        if (! preg_match('/^\d{6}$/', $code)) {
            throw ValidationException::withMessages(['code' => 'The code is exactly 6 digits (numbers only).']);
        }

        /** @var EmailOtp|null $otp */
        $otp = $this->pending($user, $purpose);

        if (! $otp) {
            throw ValidationException::withMessages(['code' => 'This code is not valid. Request a new code and try again.']);
        }

        if ($otp->expires_at->isPast()) {
            throw ValidationException::withMessages(['code' => 'This code has expired. Tap Resend code to get a new one.']);
        }

        if ($otp->attempts >= (int) config('verification.otp_max_attempts', 5)) {
            throw ValidationException::withMessages(['code' => 'Too many wrong codes. Tap Resend code to get a new one.']);
        }

        if (! Hash::check($code, $otp->code_hash)) {
            // Counted outside any transaction, so the wrong guess sticks even though a validation error follows.
            EmailOtp::whereKey($otp->id)->increment('attempts');
            throw ValidationException::withMessages(['code' => 'The code is incorrect. Check the latest email we sent and try again.']);
        }

        // Consumed with a conditional update, so two simultaneous submits of the same code cannot both succeed.
        $claimed = EmailOtp::whereKey($otp->id)->whereNull('consumed_at')->whereNull('superseded_at')
            ->update(['consumed_at' => now()]);

        if ($claimed !== 1) {
            throw ValidationException::withMessages(['code' => 'This code was already used. Request a new code if you still need one.']);
        }

        return $otp->refresh();
    }

    /** The live (not consumed, not superseded) code for a purpose, if any. */
    public function pending(User $user, string $purpose): ?EmailOtp
    {
        return EmailOtp::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->whereNull('superseded_at')
            ->latest('id')
            ->first();
    }

    public function minutes(): int
    {
        return max(1, (int) config('verification.otp_minutes', 5));
    }
}
