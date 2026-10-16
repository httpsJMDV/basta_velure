<?php

namespace App\Http\Requests\Auth;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A signed-in buyer applies to run a logistics hub (sorting center), like applying as a seller: the account, its
 * personal details and its government ID are reused, so only the hub itself is asked for.
 */
class RegisterSortingCenterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
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

        if ($merge) {
            $this->merge($merge);
        }
    }

    public function rules(): array
    {
        return [
            'hub_name'                   => ['required', 'string', 'max:150'],

            // Address Details (PSGC aligned)
            'address_province'           => ['required', 'string', 'max:100'],
            'address_city'               => ['required', 'string', 'max:100'],
            'address_barangay'           => ['required', 'string', 'max:100'],
            'address_street'             => ['required', 'string', 'max:255'],

            // Optional PSGC codes for the hub address
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

    /** The account must be a buyer with an ID on file and no other hub or courier application in force. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                /** @var User $user */
                $user = $this->user();

                if ($user->role !== 'buyer') {
                    $validator->errors()->add('account', 'Only a buyer account can apply to run a logistics hub.');
                    return;
                }
                if (! $user->government_id_image_path) {
                    $validator->errors()->add('account', 'Add a government ID to your account before applying. The hub application uses the ID on your account.');
                }

                $hub = SortingCenter::where('user_id', $user->id)->latest('id')->first();
                if ($hub && $hub->status !== SortingCenter::STATUS_REJECTED) {
                    $validator->errors()->add('account', $hub->status === SortingCenter::STATUS_APPROVED
                        ? 'Your account already runs a logistics hub.'
                        : ($hub->status === SortingCenter::STATUS_PENDING
                            ? 'You already have a hub application waiting for review.'
                            : 'Your logistics hub is suspended. Please contact platform administration.'));
                }

                $rider = Rider::where('user_id', $user->id)->latest('id')->first();
                if ($rider && $rider->status !== Rider::STATUS_DISAPPROVED) {
                    $validator->errors()->add('account', 'A courier account cannot also run a logistics hub.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'hub_name.required'                   => 'Hub name is required.',
            'address_province.required'           => 'Province is required.',
            'address_city.required'               => 'City / Municipality is required.',
            'address_barangay.required'           => 'Barangay is required.',
            'address_street.required'             => 'Street address is required.',
            'dti_permit.required'                 => 'DTI / Business permit is required.',
            'dti_permit.mimes'                    => 'DTI / Business permit must be a JPG, PNG or PDF file.',
            'dti_permit.max'                      => 'DTI / Business permit must not exceed 5MB.',
            'coverage_barangays.required'         => 'Select at least one barangay the hub will cover.',
            'coverage_barangays.min'              => 'Select at least one barangay the hub will cover.',
            'coverage_barangays.*.regex'          => 'Each coverage barangay must be a valid PSGC code.',
            'psgc_code.regex'                     => 'PSGC code must be a 9 or 10 digit number.',
            'psgc_province_code.regex'            => 'PSGC province code must be a 9 or 10 digit number.',
            'psgc_city_code.regex'                => 'PSGC city code must be a 9 or 10 digit number.',
            'psgc_barangay_code.regex'            => 'PSGC barangay code must be a 9 or 10 digit number.',
        ];
    }
}
