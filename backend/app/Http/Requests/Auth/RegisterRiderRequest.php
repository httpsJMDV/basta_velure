<?php

namespace App\Http\Requests\Auth;

use App\Models\Rider;
use App\Models\SortingCenter;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRiderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

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

        // Hub selection alias
        if (! $this->filled('sorting_center_id') && $this->filled('hub_id')) {
            $merge['sorting_center_id'] = $this->input('hub_id');
        }

        // Plate number normalization: trim and uppercase
        if ($this->filled('plate_number')) {
            $merge['plate_number'] = strtoupper(trim((string) $this->input('plate_number')));
        }

        // Vehicle type normalization (e.g. "motorcycle" -> "Motorcycle")
        if ($this->filled('vehicle_type')) {
            $raw = trim((string) $this->input('vehicle_type'));
            $match = collect(Rider::VEHICLE_TYPES)->first(fn ($t) => strcasecmp($t, $raw) === 0);
            if ($match) {
                $merge['vehicle_type'] = $match;
            }
        }

        if (! empty($merge)) {
            $this->merge($merge);
        }
    }

    public function rules(): array
    {
        return [
            // Personal Details
            'first_name'            => ['required', 'string', 'max:50'],
            'middle_name'           => ['nullable', 'string', 'max:50'],
            'last_name'             => ['required', 'string', 'max:50'],
            'sex'                   => ['required', 'in:male,female'],
            'email'                 => ['required', 'email', 'max:100', 'unique:users,email'],
            'phone'                 => ['required', 'string', 'regex:/^(\+?[1-9]\d{6,14}|09\d{9})$/', 'unique:users,phone'],
            'date_of_birth'         => ['required', 'date', 'before:today', function ($attr, $value, $fail) {
                $age = Carbon::parse($value)->age;
                if ($age < 18) {
                    $fail('Courier applicant must be at least 18 years old to register.');
                }
            }],
            'password'              => ['required', 'string', 'min:8', 'confirmed'],

            // Address Details
            'address_province'      => ['required', 'string', 'max:100'],
            'address_city'          => ['required', 'string', 'max:100'],
            'address_barangay'      => ['required', 'string', 'max:100'],
            'address_street'        => ['required', 'string', 'max:255'],

            // Hub Selection
            'sorting_center_id'     => [
                'required',
                'integer',
                'exists:sorting_centers,id',
                function ($attr, $value, $fail) {
                    $hub = SortingCenter::find($value);
                    if (! $hub || $hub->status !== SortingCenter::STATUS_APPROVED) {
                        $fail('The selected logistics hub is not approved or does not exist.');
                    }
                },
            ],

            // Vehicle Information
            'vehicle_type'          => ['required', 'string', Rule::in(Rider::VEHICLE_TYPES)],
            'plate_number'          => ['required', 'string', 'max:20', 'regex:/^[A-Z0-9\s\-]+$/i'],

            // Document Uploads
            'or_cr_image'           => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'drivers_license_image' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
        ];
    }

    public function messages(): array
    {
        return [
            'first_name.required'             => 'First name is required.',
            'first_name.max'                  => 'First name must not exceed 50 characters.',
            'middle_name.max'                 => 'Middle name must not exceed 50 characters.',
            'last_name.required'              => 'Last name is required.',
            'last_name.max'                   => 'Last name must not exceed 50 characters.',
            'sex.required'                    => 'Please select your biological sex.',
            'sex.in'                          => 'Selected biological sex must be either male or female.',
            'email.required'                  => 'Email address is required.',
            'email.email'                     => 'Please provide a valid email address.',
            'email.max'                       => 'Email address must not exceed 100 characters.',
            'email.unique'                    => 'This email address is already registered to an existing account.',
            'phone.required'                  => 'Contact number is required.',
            'phone.regex'                     => 'Please enter a valid Philippine mobile number (e.g., 09171234567 or +639171234567).',
            'phone.unique'                    => 'This mobile phone number is already registered.',
            'date_of_birth.required'          => 'Date of birth is required.',
            'date_of_birth.date'              => 'Please provide a valid date format for date of birth.',
            'date_of_birth.before'            => 'Date of birth must be a date before today.',
            'password.required'               => 'Password is required.',
            'password.min'                    => 'Password must be at least 8 characters long.',
            'password.confirmed'              => 'Password confirmation does not match.',
            'address_province.required'       => 'Province is required.',
            'address_city.required'           => 'City / Municipality is required.',
            'address_barangay.required'       => 'Barangay is required.',
            'address_street.required'         => 'Street address is required.',
            'sorting_center_id.required'      => 'Please select the logistics hub you wish to apply to.',
            'sorting_center_id.integer'       => 'Invalid logistics hub identifier.',
            'sorting_center_id.exists'        => 'The selected logistics hub does not exist.',
            'vehicle_type.required'           => 'Please select your vehicle type.',
            'vehicle_type.in'                 => 'Vehicle type must be Motorcycle, Tricycle, Car, or Van.',
            'plate_number.required'           => 'Vehicle plate number is required.',
            'plate_number.max'                => 'Plate number must not exceed 20 characters.',
            'plate_number.regex'              => 'Plate number contains invalid characters.',
            'or_cr_image.required'            => 'Official Receipt / Certificate of Registration (OR/CR) document is required.',
            'or_cr_image.file'                => 'OR/CR upload must be a valid file.',
            'or_cr_image.mimes'               => 'OR/CR document must be a JPG, JPEG, PNG, or PDF file.',
            'or_cr_image.max'                 => 'OR/CR document file size must not exceed 5MB.',
            'drivers_license_image.required'  => "Driver's license document is required.",
            'drivers_license_image.file'      => "Driver's license upload must be a valid file.",
            'drivers_license_image.mimes'     => "Driver's license document must be a JPG, JPEG, PNG, or PDF file.",
            'drivers_license_image.max'       => "Driver's license file size must not exceed 5MB.",
        ];
    }
}
