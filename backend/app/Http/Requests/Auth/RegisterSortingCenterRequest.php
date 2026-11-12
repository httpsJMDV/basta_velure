<?php

namespace App\Http\Requests\Auth;

use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A logistics hub (sorting center) application.
 *
 * A visitor registers the hub with its own account in one form (POST /auth/register-hub): the person's details, a
 * government ID and the hub, then confirms the email with a code, like a courier company. A hub account is for
 * deliveries only and never shops (User::isWorkAccount).
 *
 * A signed-in account may still apply (POST /auth/apply-hub), reusing its details and ID, as long as it is not a seller
 * or already doing deliveries: only a seller switches between selling and buying.
 */
class RegisterSortingCenterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function isGuest(): bool
    {
        return $this->user('sanctum') === null;
    }

    protected function prepareForValidation(): void
    {
        $merge = $this->isGuest() ? BuyerRegisterRequest::normalizedAccountInput($this) : [];

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
        foreach (['hub_name', 'address_street'] as $field) {
            $value = $merge[$field] ?? $this->input($field);
            if (is_string($value)) {
                $merge[$field] = preg_replace('/\s+/', ' ', trim($value));
            }
        }

        if ($merge) {
            $this->merge($merge);
        }
    }

    public function rules(): array
    {
        $rules = [
            // The courier company the hub joins; that company's team reviews the application.
            'logistics_company_id'       => ['required', 'integer', Rule::exists('logistics_companies', 'id')->where('status', LogisticsCompany::STATUS_APPROVED)],
            'hub_name'                   => ['required', 'string', 'min:3', 'max:150', 'regex:' . Validation::TWO_LETTERS_REGEX],

            // Address Details (PSGC aligned)
            'address_province'           => ['required', 'string', 'max:100'],
            'address_city'               => ['required', 'string', 'max:100'],
            'address_barangay'           => ['required', 'string', 'max:100'],
            'address_street'             => ['required', 'string', 'min:3', 'max:255'],

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

        if ($this->isGuest()) {
            $rules += BuyerRegisterRequest::accountRules(withDateOfBirth: true) + [
                // The operator's government ID, which the courier checks with the permit (an account that applies
                // from inside uses the ID already on it).
                'government_id_type'       => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id'],
                'government_id_image'      => Validation::document(),
                'government_id_image_back' => Validation::document(BuyerRegisterRequest::requiresBack($this->input('government_id_type'))),
            ];
        }

        return $rules;
    }

    /** A signed-in account must have an ID on file, run no shop and do no other deliveries. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                /** @var User|null $user */
                $user = $this->user('sanctum');
                if (! $user) {
                    return;
                }

                if ($user->role !== 'buyer') {
                    $validator->errors()->add('account', 'Only a buyer account can apply to run a logistics hub.');
                    return;
                }
                if ($user->isSellerAccount()) {
                    $validator->errors()->add('account', 'A seller account cannot also run a logistics hub. Register the hub with its own email.');
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
                $company = $user->logisticsMembership?->company;
                if ($company && $company->status !== LogisticsCompany::STATUS_REJECTED) {
                    $validator->errors()->add('account', 'A courier company account cannot also run a logistics hub.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            ...($this->isGuest() ? BuyerRegisterRequest::accountMessages() : []),
            'logistics_company_id.required'       => 'Choose the courier company your hub will join.',
            'logistics_company_id.exists'         => 'The selected courier company is not available.',
            'hub_name.required'                   => 'Hub name is required.',
            'hub_name.min'                        => 'Hub name must be 3 to 150 characters.',
            'hub_name.max'                        => 'Hub name must be 3 to 150 characters.',
            'hub_name.regex'                      => 'Hub name needs at least two letters.',
            'address_province.required'           => 'Province is required.',
            'address_city.required'               => 'City / Municipality is required.',
            'address_barangay.required'           => 'Barangay is required.',
            'address_street.required'             => 'Street address is required.',
            'address_street.min'                  => 'Enter the street, building or lot number.',
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
            'government_id_type.required'         => 'Choose the type of government ID.',
            'government_id_type.in'               => 'Choose a government-issued ID. School IDs are not accepted.',
            ...Validation::uploadMessages('government_id_image', 'the front of your ID', document: true),
            ...Validation::uploadMessages('government_id_image_back', 'the back of your ID', document: true),
        ];
    }
}
