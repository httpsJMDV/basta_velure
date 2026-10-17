<?php

namespace App\Http\Requests\Auth;

use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\User;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A courier (logistics) company application (Logistics Account Creation workbook, A1, A7, A8, A14). A visitor fills in
 * the contact person's account and the company in one form and confirms the email with a code; a signed-in buyer only
 * fills in the company. The platform admin reviews it; once approved, the company runs its portal (/logistics).
 */
class ApplyCourierCompanyRequest extends FormRequest
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

        // The workbook form names the contact person; for a visitor that person is the account.
        if ($this->isGuest()) {
            $merge['first_name'] = $merge['first_name'] ?? (is_string($this->input('contact_first_name')) ? trim($this->input('contact_first_name')) : null);
            $merge['last_name'] = $merge['last_name'] ?? (is_string($this->input('contact_last_name')) ? trim($this->input('contact_last_name')) : null);
        }
        foreach (['contact_first_name', 'contact_last_name', 'contact_position', 'name', 'address_street', 'address_postal_code'] as $field) {
            if (is_string($this->input($field))) {
                $merge[$field] = preg_replace('/\s+/', ' ', trim($this->input($field)));
            }
        }
        if (is_string($this->input('code'))) {
            $merge['code'] = strtoupper(trim($this->input('code')));
        }
        if (is_string($this->input('sec_registration_no'))) {
            $merge['sec_registration_no'] = strtoupper(trim($this->input('sec_registration_no')));
        }
        if ($this->has('tin')) {
            $merge['tin'] = Validation::normalizeTin($this->input('tin'));
        }
        if ($this->has('contact_phone')) {
            $merge['contact_phone'] = PhMobile::prepare($this->input('contact_phone'));
        } elseif ($this->isGuest() && isset($merge['phone'])) {
            $merge['contact_phone'] = $merge['phone'];
        }
        if (is_string($this->input('contact_email'))) {
            $merge['contact_email'] = mb_strtolower(trim($this->input('contact_email')));
        }
        // Service areas may come as a JSON string from a multipart form.
        if (is_string($this->input('service_regions'))) {
            $decoded = json_decode($this->input('service_regions'), true);
            $merge['service_regions'] = is_array($decoded) ? $decoded : array_filter(explode(',', $this->input('service_regions')));
        }

        $this->merge($merge);
    }

    public function rules(): array
    {
        $reapplying = $this->ownRejectedCompany()?->id;
        $psgc = ['required', 'string', 'regex:/^\d{9,10}$/'];

        $rules = [
            'name'                  => ['required', 'string', 'min:2', 'max:120',
                Rule::unique('logistics_companies', 'name')->ignore($reapplying)->where(fn ($q) => $q->where('status', '!=', LogisticsCompany::STATUS_REJECTED))],
            'code'                  => ['nullable', 'string', 'regex:/^[A-Z0-9]{2,6}$/', Rule::unique('logistics_companies', 'code')->ignore($reapplying)],
            'sec_registration_no'   => ['required', 'string', 'regex:/^[A-Z]{2}\d{9}$/', function ($attr, $value, $fail) use ($reapplying) {
                if (is_string($value) && LogisticsCompany::where('sec_registration_no', $value)
                    ->where('status', '!=', LogisticsCompany::STATUS_REJECTED)
                    ->when($reapplying, fn ($q) => $q->where('id', '!=', $reapplying))->exists()) {
                    $fail('This SEC registration number is already in use by another company.');
                }
            }],
            'tin'                   => ['required', 'string', 'regex:' . Validation::TIN_REGEX, function ($attr, $value, $fail) use ($reapplying) {
                if (is_string($value) && SellerRegisterRequest::tinTaken($value, sellerUserId: $this->user('sanctum')?->id, companyId: $reapplying)) {
                    $fail('This TIN is already registered to another seller or logistics account.');
                }
            }],
            'description'           => ['nullable', 'string', 'max:500'],
            'contact_first_name'    => Validation::personName(),
            'contact_last_name'     => Validation::personName(),
            'contact_position'      => ['required', 'string', 'min:2', 'max:80'],
            'contact_email'         => [$this->isGuest() ? 'nullable' : 'required', 'email:rfc', 'max:150'],
            'contact_phone'         => ['required', ...PhMobile::rules()],

            'address_region'        => ['required', 'string', 'max:100'],
            'address_region_code'   => $psgc,
            'address_province'      => ['required', 'string', 'max:100'],
            'address_province_code' => $psgc,
            'address_city'          => ['required', 'string', 'max:100'],
            'address_city_code'     => $psgc,
            'address_barangay'      => ['required', 'string', 'max:100'],
            'address_barangay_code' => $psgc,
            'address_street'        => ['required', 'string', 'max:255'],
            'address_postal_code'   => ['required', 'string', 'regex:' . Validation::POSTAL_REGEX],

            'service_regions'       => ['required', 'array', 'min:1', 'max:17'],
            'service_regions.*'     => ['required', 'string', 'regex:/^\d{9,10}$/', 'distinct'],

            'sec_certificate'       => Validation::document(),
            'bir_2303'              => Validation::document(),
            'business_permit'       => Validation::document(),
            'representative_id'     => Validation::document(),
            'logo'                  => Validation::image(required: false),

            'accept_terms'          => ['accepted'],
        ];

        if ($this->isGuest()) {
            $rules += BuyerRegisterRequest::accountRules(withDateOfBirth: false);
        }

        return $rules;
    }

    /** The account must be a buyer that does not already run (or wait on) a courier company. */
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
                    $validator->errors()->add('account', 'Only a buyer account can apply to run a courier company.');
                    return;
                }
                $membership = LogisticsCompanyMember::with('company')->where('user_id', $user->id)->first();
                if ($membership && $membership->company && $membership->company->status !== LogisticsCompany::STATUS_REJECTED) {
                    $validator->errors()->add('account', match ($membership->company->status) {
                        LogisticsCompany::STATUS_PENDING => 'You already have a courier company application waiting for review.',
                        LogisticsCompany::STATUS_SUSPENDED => 'Your courier company is suspended. Please contact platform administration.',
                        default => 'Your account already runs a courier company.',
                    });
                }
            },
        ];
    }

    public function ownRejectedCompany(): ?LogisticsCompany
    {
        $userId = $this->user('sanctum')?->id;
        if (! $userId) {
            return null;
        }
        $membership = LogisticsCompanyMember::with('company')->where('user_id', $userId)->where('role', 'owner')->first();

        return $membership?->company?->status === LogisticsCompany::STATUS_REJECTED ? $membership->company : null;
    }

    public function messages(): array
    {
        return [
            ...($this->isGuest() ? BuyerRegisterRequest::accountMessages() : []),
            'name.required'                => 'Company name is required.',
            'name.unique'                  => 'A courier company with this name already exists.',
            'code.regex'                   => 'The short code must be 2 to 6 letters or numbers (for example BHE).',
            'code.unique'                  => 'This short code is already used by another courier company.',
            'sec_registration_no.required' => 'SEC registration number is required.',
            'sec_registration_no.regex'    => 'Enter the SEC registration number as 2 letters followed by 9 digits, for example CS202012345.',
            'tin.required'                 => 'TIN is required.',
            'tin.regex'                    => Validation::TIN_MESSAGE,
            ...Validation::personNameMessages('contact_first_name', 'Contact person first name'),
            ...Validation::personNameMessages('contact_last_name', 'Contact person last name'),
            'contact_position.required'    => 'The contact person\'s position is required.',
            'contact_phone.required'       => 'Mobile number is required.',
            'contact_phone.regex'          => PhMobile::MESSAGE,
            'address_region.required'      => 'Region is required.',
            'address_region_code.required' => 'Region is required.',
            'address_province.required'    => 'Province is required.',
            'address_province_code.required' => 'Province is required.',
            'address_city.required'        => 'City / Municipality is required.',
            'address_city_code.required'   => 'City / Municipality is required.',
            'address_barangay.required'    => 'Barangay is required.',
            'address_barangay_code.required' => 'Barangay is required.',
            'address_street.required'      => 'Street address is required.',
            'address_postal_code.required' => 'Postal code is required.',
            'address_postal_code.regex'    => Validation::POSTAL_MESSAGE,
            'service_regions.required'     => 'Choose at least one region you deliver in.',
            'service_regions.min'          => 'Choose at least one region you deliver in.',
            'service_regions.*.distinct'   => 'Each region can be chosen once.',
            ...Validation::uploadMessages('sec_certificate', 'the SEC certificate', document: true),
            ...Validation::uploadMessages('bir_2303', 'BIR Form 2303', document: true),
            ...Validation::uploadMessages('business_permit', "the Mayor's / business permit", document: true),
            ...Validation::uploadMessages('representative_id', 'a valid ID of the authorized representative', document: true),
            ...Validation::uploadMessages('logo', 'the logo'),
            'accept_terms.accepted'        => 'You must accept the Terms of Use and Privacy Policy to apply.',
        ];
    }
}
