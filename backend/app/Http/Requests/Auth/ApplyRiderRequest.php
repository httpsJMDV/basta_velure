<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\Logistics\AddRiderRequest;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A visitor applies to ride for a hub on the public "Become a rider" form: the same details a courier company enters
 * on its Add Rider form (AddRiderRequest), plus the hub they want to work from. The application makes no usable
 * account: the hub or its courier approves it first, then the rider sets a password from the activation email.
 *
 * A rider whose earlier application was not approved can apply again with the same email and mobile number; their
 * old application is updated instead of a second account being made.
 */
class ApplyRiderRequest extends FormRequest
{
    private Rider|false|null $reapplying = null;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $merge = BuyerRegisterRequest::normalizedAccountInput($this);
        $merge += AddRiderRequest::normalizedVehicleInput($this);
        if (is_string($this->input('license_number'))) {
            $merge['license_number'] = strtoupper(preg_replace('/\s+/', '', $this->input('license_number')));
        }
        $this->merge($merge);
    }

    /** The not-approved application this one replaces, found by the email it was made with. */
    public function reapplying(): ?Rider
    {
        if ($this->reapplying === null) {
            $email = $this->input('email');
            $user = is_string($email) && $email !== '' ? User::where('email', $email)->first() : null;
            $rider = $user && $user->status === 'pending_activation' ? Rider::where('user_id', $user->id)->first() : null;
            $this->reapplying = $rider && $rider->applied_at !== null && $rider->status === Rider::STATUS_DISAPPROVED ? $rider : false;
        }

        return $this->reapplying ?: null;
    }

    public function hub(): ?SortingCenter
    {
        return SortingCenter::find($this->integer('sorting_center_id'));
    }

    public function rules(): array
    {
        $again = $this->reapplying();

        return [
            'sorting_center_id' => ['required', 'integer', function ($attr, $value, $fail) {
                $hub = SortingCenter::find($value);
                $company = $hub ? LogisticsCompany::find(LogisticsCompany::effectiveId($hub->logistics_company_id)) : null;
                if (! $hub || $hub->status !== SortingCenter::STATUS_APPROVED || ! $company || $company->status !== LogisticsCompany::STATUS_APPROVED) {
                    $fail('Choose a hub from the list.');
                }
            }],
            'first_name'     => Validation::personName(),
            'last_name'      => Validation::personName(),
            'middle_name'    => Validation::personName(required: false),
            'date_of_birth'  => Validation::dateOfBirth(),
            'email'          => ['required', 'string', 'email:rfc', 'max:100', function ($attr, $value, $fail) use ($again) {
                $user = User::where('email', $value)->first();
                if (! $user || ($again && $again->user_id === $user->id)) {
                    return;
                }
                $rider = Rider::with('sortingCenter')->where('user_id', $user->id)->first();
                if ($rider?->isApplicant()) {
                    $fail('You already applied with this email. ' . ($rider->sortingCenter?->hub_name ?? 'The hub') . ' is reviewing it, and we will email you their decision.');

                    return;
                }
                $fail('This email already has a Loved-IT account. Riders sign in with an email of their own, so use a different one.');
            }],
            'phone'          => ['required', ...PhMobile::rules(), Rule::unique('users', 'phone')->ignore($again?->user_id)],
            ...AddRiderRequest::licenseRules($again?->id),
            'vehicle_type'   => ['required', 'string', Rule::in(Rider::VEHICLE_TYPES)],
            'plate_number'   => ['required', 'string', 'regex:/^[A-Z0-9]{2,10}$/', function ($attr, $value, $fail) use ($again) {
                if (is_string($value) && AddRiderRequest::plateTaken($value, $again?->id)) {
                    $fail('This plate number is already registered to another rider.');
                }
            }],
            'drivers_license_image' => Validation::document(),
            'or_cr_image'    => Validation::document(),
            'accept_terms'   => ['accepted'],
        ];
    }

    public function messages(): array
    {
        return [
            'sorting_center_id.required' => 'Choose the hub you want to ride for.',
            'sorting_center_id.integer'  => 'Choose a hub from the list.',
            ...Validation::personNameMessages('first_name', 'First name'),
            ...Validation::personNameMessages('middle_name', 'Middle name'),
            ...Validation::personNameMessages('last_name', 'Last name'),
            'date_of_birth.required'    => 'Date of birth is required.',
            'date_of_birth.date_format' => 'Enter a valid date of birth.',
            'email.required'   => 'Email is required.',
            'email.email'      => 'Enter a valid email address, for example name@example.com.',
            'email.max'        => 'The email must be 100 characters or fewer.',
            'phone.required'   => 'Mobile number is required.',
            'phone.regex'      => PhMobile::MESSAGE,
            'phone.string'     => PhMobile::MESSAGE,
            'phone.unique'     => 'This mobile number is already in use by another account.',
            ...AddRiderRequest::licenseMessages(),
            'vehicle_type.required' => 'Choose the vehicle type.',
            'vehicle_type.in'       => 'Vehicle type must be Motorcycle, Tricycle, Car or Van.',
            'plate_number.required' => 'Plate number is required.',
            'plate_number.regex'    => 'Enter the plate number with letters and numbers only, for example 123ABC or NBC1234.',
            ...Validation::uploadMessages('drivers_license_image', "the driver's license", document: true),
            ...Validation::uploadMessages('or_cr_image', 'the vehicle OR/CR', document: true),
            'accept_terms.accepted' => 'You must accept the Terms of Use and Privacy Policy to apply.',
        ];
    }
}
