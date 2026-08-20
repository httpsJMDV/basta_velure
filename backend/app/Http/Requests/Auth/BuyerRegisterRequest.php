<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;
use Carbon\Carbon;

class BuyerRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name'           => ['required', 'string', 'max:50'],
            'middle_name'          => ['nullable', 'string', 'max:50'],
            'last_name'            => ['required', 'string', 'max:50'],
            'sex'                  => ['required', 'in:male,female'],
            'email'                => ['required', 'email:rfc,dns', 'max:100', 'unique:users,email'],
            'phone'                => ['required', 'string', 'regex:/^\+[1-9]\d{6,14}$/', 'unique:users,phone'],
            'date_of_birth'        => ['required', 'date', 'before:today', function ($attr, $value, $fail) {
                $age = Carbon::parse($value)->age;
                if ($age < 18) {
                    $fail('You must be at least 18 years old to register.');
                }
            }],
            'password'             => [
                'required', 'confirmed',
                Password::min(8)->mixedCase()->numbers()->symbols()->uncompromised(),
            ],
            // Address fields
            'province'             => ['required', 'string', 'max:100'],
            'city_municipality'    => ['required', 'string', 'max:100'],
            'barangay'             => ['required', 'string', 'max:100'],
            'street_address'       => ['nullable', 'string', 'max:255'],
            // Government ID
            'government_id_type'      => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id,school_id'],
            'government_id_image'     => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'government_id_image_back' => [
                $this->requiresBack($this->input('government_id_type')) ? 'required' : 'nullable',
                'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120',
            ],
            'avatar' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex'                       => 'Phone must be in international format (e.g. +639171234567).',
            'government_id_image.mimes'         => 'ID image must be JPG, PNG, or PDF.',
            'government_id_image.max'           => 'ID image must not exceed 5MB.',
            'government_id_image_back.required' => 'A back photo is required for this ID type.',
            'government_id_image_back.mimes'    => 'ID back image must be JPG, PNG, or PDF.',
            'government_id_image_back.max'      => 'ID back image must not exceed 5MB.',
        ];
    }

    public static function requiresBack(?string $idType): bool
    {
        return in_array($idType, ['drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id'], true);
    }
}
