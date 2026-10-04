<?php

namespace App\Http\Requests\Auth;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;

class RegisterSortingCenterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        // Hub name aliases
        if (! $this->filled('hub_name') && $this->filled('business_name')) {
            $merge['hub_name'] = $this->input('business_name');
        }

        // Address aliases
        if (! $this->filled('address_province') && $this->filled('province')) {
            $merge['address_province'] = $this->input('province');
        }
        if (! $this->filled('address_city')) {
            $city = $this->input('city_municipality') ?? $this->input('city');
            if ($city) {
                $merge['address_city'] = $city;
            }
        }
        if (! $this->filled('address_barangay') && $this->filled('barangay')) {
            $merge['address_barangay'] = $this->input('barangay');
        }
        if (! $this->filled('address_street')) {
            $street = $this->input('street_address') ?? $this->input('street');
            if ($street) {
                $merge['address_street'] = $street;
            }
        }

        // Contact and Birthday aliases
        if (! $this->filled('phone') && $this->filled('contact_number')) {
            $merge['phone'] = $this->input('contact_number');
        }
        if (! $this->filled('phone') && $this->filled('contact_no')) {
            $merge['phone'] = $this->input('contact_no');
        }
        if (! $this->filled('date_of_birth') && $this->filled('birthday')) {
            $merge['date_of_birth'] = $this->input('birthday');
        }

        // Coverage barangays string JSON to array if passed as string
        if ($this->has('coverage_barangays') && is_string($this->input('coverage_barangays'))) {
            $decoded = json_decode($this->input('coverage_barangays'), true);
            if (is_array($decoded)) {
                $merge['coverage_barangays'] = $decoded;
            }
        }

        if (! empty($merge)) {
            $this->merge($merge);
        }
    }

    public function rules(): array
    {
        return [
            // Applicant / User personal information
            'first_name'                 => ['required', 'string', 'max:50'],
            'middle_name'                => ['nullable', 'string', 'max:50'],
            'last_name'                  => ['required', 'string', 'max:50'],
            'sex'                        => ['required', 'in:male,female'],
            'email'                      => ['required', 'email', 'max:100', 'unique:users,email'],
            'phone'                      => ['required', 'string', 'regex:/^(\+?[1-9]\d{6,14}|09\d{9})$/', 'unique:users,phone'],
            'date_of_birth'              => ['required', 'date', 'before:today', function ($attr, $value, $fail) {
                $age = Carbon::parse($value)->age;
                if ($age < 18) {
                    $fail('Applicant must be at least 18 years old to register.');
                }
            }],
            'password'                   => ['required', 'string', 'min:8', 'confirmed'],

            // Government ID
            'government_id_type'         => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id,school_id'],
            'government_id_image'        => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'government_id_image_back'   => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],

            // Hub Details
            'hub_name'                   => ['required', 'string', 'max:150'],

            // Address Details (PSGC aligned)
            'address_province'           => ['required', 'string', 'max:100'],
            'address_city'               => ['required', 'string', 'max:100'],
            'address_barangay'           => ['required', 'string', 'max:100'],
            'address_street'             => ['required', 'string', 'max:255'],

            // Optional PSGC codes for Hub Address if provided
            'psgc_code'                  => ['nullable', 'string', 'regex:/^\d{9,10}$/'],
            'psgc_province_code'         => ['nullable', 'string', 'regex:/^\d{9,10}$/'],
            'psgc_city_code'             => ['nullable', 'string', 'regex:/^\d{9,10}$/'],
            'psgc_barangay_code'         => ['nullable', 'string', 'regex:/^\d{9,10}$/'],

            // DTI / Business Permit
            'dti_permit'                 => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],

            // Coverage Barangays
            'coverage_barangays'         => ['required', 'array', 'min:1'],
            'coverage_barangays.*'       => ['required', 'string', 'distinct', 'regex:/^\d{9,10}$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'first_name.required'                 => 'First name is required.',
            'last_name.required'                  => 'Last name is required.',
            'sex.required'                        => 'Sex is required.',
            'sex.in'                              => 'Sex must be either male or female.',
            'email.required'                      => 'Email address is required.',
            'email.email'                         => 'Please provide a valid email address.',
            'email.unique'                        => 'This email address is already registered.',
            'phone.required'                      => 'Contact phone number is required.',
            'phone.regex'                         => 'Contact number must be in a valid format (e.g. +639171234567 or 09171234567).',
            'phone.unique'                        => 'This contact number is already registered.',
            'date_of_birth.required'              => 'Date of birth is required.',
            'date_of_birth.date'                  => 'Date of birth must be a valid date.',
            'date_of_birth.before'                => 'Date of birth must be a date in the past.',
            'password.required'                   => 'Password is required.',
            'password.min'                        => 'Password must be at least 8 characters.',
            'password.confirmed'                  => 'Password confirmation does not match.',
            'government_id_type.required'         => 'Government ID type is required.',
            'government_id_type.in'               => 'Please select a valid government ID type.',
            'government_id_image.required'        => 'A photo of the government ID is required.',
            'government_id_image.file'            => 'Government ID must be a valid file.',
            'government_id_image.mimes'           => 'Government ID must be a JPG, PNG, or PDF file.',
            'government_id_image.max'             => 'Government ID file must not exceed 5MB.',
            'government_id_image_back.mimes'      => 'Back photo of government ID must be a JPG, PNG, or PDF file.',
            'government_id_image_back.max'        => 'Back photo of government ID must not exceed 5MB.',
            'hub_name.required'                   => 'Hub/business name is required.',
            'address_province.required'           => 'Province is required.',
            'address_city.required'               => 'Municipality/city is required.',
            'address_barangay.required'           => 'Barangay is required.',
            'address_street.required'             => 'Street address is required.',
            'psgc_code.regex'                     => 'Invalid PSGC code. PSGC code must be a 9 or 10-digit number.',
            'psgc_province_code.regex'            => 'Invalid PSGC province code.',
            'psgc_city_code.regex'                => 'Invalid PSGC city/municipality code.',
            'psgc_barangay_code.regex'            => 'Invalid PSGC barangay code.',
            'dti_permit.required'                 => 'DTI business permit file is required.',
            'dti_permit.file'                     => 'DTI permit must be an uploaded file.',
            'dti_permit.mimes'                    => 'DTI permit must be a JPG, PNG, or PDF file.',
            'dti_permit.max'                      => 'DTI permit file must not exceed 5MB.',
            'coverage_barangays.required'         => 'At least one coverage barangay is required.',
            'coverage_barangays.array'            => 'Coverage barangays must be provided as a list.',
            'coverage_barangays.min'              => 'At least one coverage barangay is required.',
            'coverage_barangays.*.required'       => 'Barangay PSGC code cannot be empty.',
            'coverage_barangays.*.distinct'       => 'Coverage barangays cannot contain duplicate codes.',
            'coverage_barangays.*.regex'          => 'Invalid PSGC code. Each coverage barangay must be a valid 9 or 10-digit PSGC code.',
        ];
    }
}

