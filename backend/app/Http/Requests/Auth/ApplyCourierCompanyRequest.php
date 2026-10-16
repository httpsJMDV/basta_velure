<?php

namespace App\Http\Requests\Auth;

use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A signed-in buyer applies to run a courier company (like J&T or Flash) on Loved-IT, like applying as a seller.
 * The platform admin reviews it; once approved, the applicant runs the company's portal (/logistics).
 */
class ApplyCourierCompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('code'))) {
            $this->merge(['code' => strtoupper(trim($this->input('code')))]);
        }
    }

    public function rules(): array
    {
        $reapplying = $this->ownRejectedCompany()?->id;

        return [
            'name'             => ['required', 'string', 'max:120',
                Rule::unique('logistics_companies', 'name')->ignore($reapplying)->where(fn ($q) => $q->where('status', '!=', LogisticsCompany::STATUS_REJECTED))],
            'code'             => ['required', 'string', 'regex:/^[A-Z0-9]{2,6}$/',
                Rule::unique('logistics_companies', 'code')->ignore($reapplying)],
            'description'      => ['nullable', 'string', 'max:500'],
            'contact_email'    => ['required', 'email', 'max:150'],
            'contact_phone'    => ['required', 'string', 'max:30'],
            'address_province' => ['required', 'string', 'max:100'],
            'address_city'     => ['required', 'string', 'max:100'],
            'address_barangay' => ['required', 'string', 'max:100'],
            'address_street'   => ['required', 'string', 'max:255'],
            'business_permit'  => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'logo'             => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ];
    }

    /** The account must be a buyer that does not already run (or wait on) a courier company. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                /** @var User $user */
                $user = $this->user();
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
        $membership = LogisticsCompanyMember::with('company')->where('user_id', $this->user()?->id)->where('role', 'owner')->first();

        return $membership?->company?->status === LogisticsCompany::STATUS_REJECTED ? $membership->company : null;
    }

    public function messages(): array
    {
        return [
            'name.required'            => 'Company name is required.',
            'name.unique'              => 'A courier company with this name already exists.',
            'code.required'            => 'A short code is required (for example JNT).',
            'code.regex'               => 'The code must be 2 to 6 letters or numbers (for example JNT).',
            'code.unique'              => 'This code is already used by another courier company.',
            'business_permit.required' => 'A business permit (DTI, SEC or Mayor\'s Permit) is required.',
            'business_permit.mimes'    => 'The business permit must be a JPG, PNG or PDF file.',
            'business_permit.max'      => 'The business permit must not exceed 5MB.',
            'logo.max'                 => 'The logo must not exceed 2MB.',
        ];
    }
}
