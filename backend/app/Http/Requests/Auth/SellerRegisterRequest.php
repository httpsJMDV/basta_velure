<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class SellerRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name'          => ['required', 'string', 'max:50'],
            'middle_name'         => ['nullable', 'string', 'max:50'],
            'last_name'           => ['required', 'string', 'max:50'],
            'email'               => ['required', 'email:rfc,dns', 'max:100', 'unique:users,email'],
            'phone'               => ['required', 'string', 'regex:/^\+[1-9]\d{6,14}$/', 'unique:users,phone'],
            'password'            => [
                'required', 'confirmed',
                Password::min(8)->mixedCase()->numbers()->symbols()->uncompromised(),
            ],
            'date_of_birth'       => ['required', 'date', 'before_or_equal:' . now()->subYears(18)->toDateString()],
            'shop_name'           => ['required', 'string', 'max:100', 'unique:seller_profiles,shop_name'],
            'payout_gcash_number' => ['required', 'string', 'max:20'],
            'government_id_type'  => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id'],
            'government_id_number'=> ['required', 'string', 'max:50'],
            'government_id_image' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
        ];
    }

    public function messages(): array
    {
        return [
            'date_of_birth.before_or_equal' => 'You must be at least 18 years old to register as a seller.',
            'government_id_image.max'        => 'ID image must not exceed 5MB.',
            'phone.regex'                    => 'Phone number must be in international format (e.g. +639171234567). No letters or special characters.',
            'phone.unique'                   => 'This phone number is already registered.',
        ];
    }
}
