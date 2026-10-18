<?php

namespace App\Http\Requests\Auth;

use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Creating a Loved-IT account (Account Creation workbooks, A1 to A6): name, email, mobile number, date of birth and
 * password, with consent to the Terms of Use and Privacy Policy. The account starts unverified and is activated by the
 * 6-digit code emailed to it. Identity documents and addresses are added later from the account.
 */
class BuyerRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(self::normalizedAccountInput($this));
    }

    public function rules(): array
    {
        return self::accountRules();
    }

    public function messages(): array
    {
        return self::accountMessages();
    }

    /**
     * The trimmed, normalized account fields shared by every registration form (buyer, seller, courier): emails are
     * trimmed and lower-cased, and 09XXXXXXXXX / +639XXXXXXXXX become the same stored number.
     *
     * @return array<string, mixed>
     */
    public static function normalizedAccountInput(FormRequest $request): array
    {
        $merge = [];
        foreach (['first_name', 'middle_name', 'last_name'] as $field) {
            if (is_string($request->input($field))) {
                $merge[$field] = preg_replace('/\s+/', ' ', trim($request->input($field)));
            }
        }
        if (is_string($request->input('email'))) {
            $merge['email'] = mb_strtolower(trim($request->input('email')));
        }
        if ($request->has('phone')) {
            $merge['phone'] = PhMobile::prepare($request->input('phone'));
        }

        return $merge;
    }

    /**
     * The account fields. Buyers (and riders) give a date of birth; seller and courier applications do not ask for it.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function accountRules(bool $withDateOfBirth = true): array
    {
        return [
            'first_name'    => Validation::personName(),
            'middle_name'   => Validation::personName(required: false),
            'last_name'     => Validation::personName(),
            'email'         => ['required', 'string', 'email:rfc', 'max:100', 'unique:users,email'],
            'phone'         => ['required', ...PhMobile::rules(), 'unique:users,phone'],
            'date_of_birth' => $withDateOfBirth ? Validation::dateOfBirth() : Validation::dateOfBirth(required: false),
            'password'      => ['required', 'string', 'confirmed', self::passwordRule()],
            'password_confirmation' => ['required', 'string'],
            'accept_terms'  => ['accepted'],
        ];
    }

    /** A5: at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character. */
    public static function passwordRule(): \Illuminate\Validation\Rules\Password
    {
        return \Illuminate\Validation\Rules\Password::min(8)->mixedCase()->numbers()->symbols();
    }

    /** @return array<string, string> */
    public static function accountMessages(): array
    {
        return [
            ...Validation::personNameMessages('first_name', 'First name'),
            ...Validation::personNameMessages('middle_name', 'Middle name'),
            ...Validation::personNameMessages('last_name', 'Last name'),
            'email.required'        => 'Email is required.',
            'email.email'           => 'Enter a valid email address, for example name@example.com.',
            'email.unique'          => 'This email is already registered. Sign in instead, or use another email.',
            'phone.required'        => 'Mobile number is required.',
            'phone.regex'           => PhMobile::MESSAGE,
            'phone.string'          => PhMobile::MESSAGE,
            'phone.unique'          => 'This mobile number is already in use by another account.',
            'date_of_birth.required'    => 'Date of birth is required.',
            'date_of_birth.date_format' => 'Enter a valid date of birth.',
            'password.required'     => 'Password is required.',
            'password.confirmed'    => 'The passwords do not match.',
            'password_confirmation.required' => 'Please confirm your password.',
            'accept_terms.accepted' => 'You must accept the Terms of Use and Privacy Policy to create an account.',
        ];
    }

    /** Kept for the identity-verification step (complete profile): these ID types need a photo of the back. */
    public static function requiresBack(?string $idType): bool
    {
        return in_array($idType, ['drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id'], true);
    }
}
