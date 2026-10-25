<?php

namespace App\Http\Requests\Auth;

use App\Models\Category;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A seller application (Seller Account Creation workbook, A1, A7, A8, A11, A14). A visitor fills in the account fields
 * and the shop in one form and confirms the email with a code; a signed-in buyer only fills in the shop. The documents
 * depend on the seller type: an individual sends a government ID; a sole proprietorship adds its DTI certificate and
 * BIR Form 2303; a corporation adds its SEC certificate and BIR Form 2303.
 */
class SellerRegisterRequest extends FormRequest
{
    public const SELLER_TYPES = ['individual', 'sole_proprietorship', 'corporation'];

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

        if (is_string($this->input('shop_name'))) {
            $merge['shop_name'] = preg_replace('/\s+/', ' ', trim($this->input('shop_name')));
        }
        if ($this->has('tin')) {
            $merge['tin'] = Validation::normalizeTin($this->input('tin'));
        }
        if (is_string($this->input('address_postal_code'))) {
            $merge['address_postal_code'] = trim($this->input('address_postal_code'));
        }
        if (is_string($this->input('address_street'))) {
            $merge['address_street'] = trim($this->input('address_street'));
        }
        if ($this->has('shop_contact_number')) {
            $merge['shop_contact_number'] = PhMobile::prepare($this->input('shop_contact_number'));
        }

        $this->merge($merge);
    }

    public function rules(): array
    {
        $type = $this->input('seller_type');
        $business = in_array($type, ['sole_proprietorship', 'corporation'], true);
        $psgc = ['required', 'string', 'regex:/^\d{9,10}$/'];

        $rules = [
            'shop_name'             => [...Validation::shopName(), function ($attr, $value, $fail) {
                if (is_string($value) && self::shopNameTaken($value, $this->user('sanctum')?->id)) {
                    $fail('This shop name is already taken. Choose another name.');
                }
            }],
            'shop_category'         => ['required', 'string', 'max:100', function ($attr, $value, $fail) {
                if (! Category::whereNull('parent_id')->where(fn ($q) => $q->where('name', $value)->orWhere('slug', $value))->exists()) {
                    $fail('Choose a shop category from the list.');
                }
            }],
            'shop_description'      => ['nullable', 'string', 'max:500'],
            'seller_type'           => ['required', 'in:' . implode(',', self::SELLER_TYPES)],
            'tin'                   => ['required', 'string', 'regex:' . Validation::TIN_REGEX, function ($attr, $value, $fail) {
                if (is_string($value) && self::tinTaken($value, sellerUserId: $this->user('sanctum')?->id)) {
                    $fail('This TIN is already registered to another seller or logistics account.');
                }
            }],
            'shop_contact_number'   => ['nullable', ...PhMobile::rules()],

            'address_region'        => ['required', 'string', 'max:100'],
            'address_region_code'   => $psgc,
            'address_province'      => ['required', 'string', 'max:100'],
            'address_city'          => ['required', 'string', 'max:100'],
            'address_barangay'      => ['required', 'string', 'max:100'],
            'address_street'        => ['required', 'string', 'max:255'],
            'address_postal_code'   => ['required', 'string', 'regex:' . Validation::POSTAL_REGEX],
            'address_province_code' => $psgc,
            'address_city_code'     => $psgc,
            'address_barangay_code' => $psgc,

            'government_id_type'       => ['nullable', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id'],
            'government_id_image'      => Validation::document(),
            'government_id_image_back' => Validation::document(required: false),
            'dti_certificate'          => Validation::document($type === 'sole_proprietorship'),
            'sec_certificate'          => Validation::document($type === 'corporation'),
            'bir_2303'                 => Validation::document($business),
            // Optional extras the admin may ask for later
            'business_permit'          => Validation::document(required: false),
            'selfie_with_id'           => Validation::image(required: false),
            'fda_lto'                  => Validation::document(required: false),
            // Older clients send the DTI or SEC document under one name
            'dti_sec_registration'     => Validation::document(required: false),

            'accept_terms'             => ['accepted'],
        ];

        if ($this->isGuest()) {
            $rules += BuyerRegisterRequest::accountRules(withDateOfBirth: false);
        }

        return $rules;
    }

    /** Only one live application per account: a pending or approved one cannot be sent again. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $user = $this->user('sanctum');
                $existing = $user?->sellerProfile;
                if ($existing && in_array($existing->application_status, ['pending', 'approved'], true)) {
                    $validator->errors()->add('account', $existing->application_status === 'approved'
                        ? 'Your account is already an approved seller.'
                        : 'You already have a seller application waiting for review.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            ...($this->isGuest() ? BuyerRegisterRequest::accountMessages() : []),
            ...Validation::shopNameMessages('Shop name'),
            'government_id_type.in'       => 'Choose a government-issued ID. School IDs are not accepted.',
            'shop_category.required'      => 'Choose a shop category.',
            'shop_description.max'        => 'The shop description must be 500 characters or fewer.',
            'seller_type.required'        => 'Choose a seller type.',
            'seller_type.in'              => 'Seller type must be Individual, Sole Proprietorship or Corporation.',
            'tin.required'                => 'TIN is required.',
            'tin.regex'                   => Validation::TIN_MESSAGE,
            'shop_contact_number.regex'   => PhMobile::MESSAGE,
            'address_region.required'     => 'Region is required.',
            'address_region_code.required' => 'Region is required.',
            'address_province.required'   => 'Province is required.',
            'address_province_code.required' => 'Province is required.',
            'address_city.required'       => 'City / Municipality is required.',
            'address_city_code.required'  => 'City / Municipality is required.',
            'address_barangay.required'   => 'Barangay is required.',
            'address_barangay_code.required' => 'Barangay is required.',
            'address_street.required'     => 'Street address is required.',
            'address_postal_code.required' => 'Postal code is required.',
            'address_postal_code.regex'   => Validation::POSTAL_MESSAGE,
            ...Validation::uploadMessages('government_id_image', 'a government-issued ID', document: true),
            ...Validation::uploadMessages('government_id_image_back', 'the back of the ID', document: true),
            ...Validation::uploadMessages('dti_certificate', 'the DTI certificate', document: true),
            ...Validation::uploadMessages('sec_certificate', 'the SEC certificate', document: true),
            ...Validation::uploadMessages('bir_2303', 'BIR Form 2303', document: true),
            ...Validation::uploadMessages('business_permit', 'the business permit', document: true),
            ...Validation::uploadMessages('selfie_with_id', 'the selfie with your ID'),
            ...Validation::uploadMessages('fda_lto', 'the FDA LTO', document: true),
            'accept_terms.accepted'       => 'You must accept the Terms of Use and Privacy Policy to apply.',
        ];
    }

    /** Shop names are unique ignoring case and surrounding spaces; a rejected application frees its name. */
    public static function shopNameTaken(string $name, ?int $ownerUserId = null): bool
    {
        return \App\Models\SellerProfile::whereRaw('LOWER(TRIM(shop_name)) = ?', [mb_strtolower(trim($name))])
            ->where('application_status', '!=', 'rejected')
            ->when($ownerUserId, fn ($q) => $q->where('user_id', '!=', $ownerUserId))
            ->exists();
    }

    /** A TIN belongs to one seller or logistics account (A8); rejected applications do not hold it. */
    public static function tinTaken(string $tin, ?int $sellerUserId = null, ?int $companyId = null): bool
    {
        $seller = \App\Models\SellerProfile::where('tin', $tin)
            ->where('application_status', '!=', 'rejected')
            ->when($sellerUserId, fn ($q) => $q->where('user_id', '!=', $sellerUserId))
            ->exists();
        $company = \App\Models\LogisticsCompany::where('tin', $tin)
            ->where('status', '!=', \App\Models\LogisticsCompany::STATUS_REJECTED)
            ->when($companyId, fn ($q) => $q->where('id', '!=', $companyId))
            ->exists();

        return $seller || $company;
    }
}
