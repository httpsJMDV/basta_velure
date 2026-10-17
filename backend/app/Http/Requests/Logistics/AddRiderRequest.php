<?php

namespace App\Http\Requests\Logistics;

use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A courier company adds a rider (Rider Account Creation workbook, A2 to A6, A13 to A16): the rider's name, date of
 * birth, email and mobile, the LTO license number and its expiry, the vehicle, and the license and OR/CR documents.
 * The rider then sets their own password from the activation email.
 */
class AddRiderRequest extends FormRequest
{
    public const LICENSE_REGEX = '/^[A-Z]\d{2}-\d{2}-\d{6}$/';

    public function authorize(): bool
    {
        return $this->attributes->get('logistics_company') !== null;
    }

    protected function prepareForValidation(): void
    {
        $merge = BuyerRegisterRequest::normalizedAccountInput($this);
        $merge += self::normalizedVehicleInput($this);
        if (is_string($this->input('license_number'))) {
            $merge['license_number'] = strtoupper(preg_replace('/\s+/', '', $this->input('license_number')));
        }
        $this->merge($merge);
    }

    /** Plates are compared without case, spaces or hyphens ("nbc 1234" is NBC1234). */
    public static function normalizedVehicleInput(FormRequest $request): array
    {
        $merge = [];
        if (is_string($request->input('plate_number'))) {
            $merge['plate_number'] = strtoupper(preg_replace('/[\s-]+/', '', $request->input('plate_number')));
        }
        if (is_string($request->input('vehicle_type'))) {
            $raw = trim($request->input('vehicle_type'));
            $match = collect(Rider::VEHICLE_TYPES)->first(fn ($t) => strcasecmp($t, $raw) === 0);
            if ($match) {
                $merge['vehicle_type'] = $match;
            }
        }

        return $merge;
    }

    public static function plateTaken(string $plate, ?int $exceptRiderId = null): bool
    {
        return Rider::whereRaw("UPPER(REPLACE(REPLACE(plate_number, ' ', ''), '-', '')) = ?", [$plate])
            ->whereNotIn('status', [Rider::STATUS_DISAPPROVED])
            ->when($exceptRiderId, fn ($q) => $q->where('id', '!=', $exceptRiderId))
            ->exists();
    }

    public static function licenseRules(?int $exceptRiderId = null): array
    {
        return [
            'license_number' => ['required', 'string', 'regex:' . self::LICENSE_REGEX, function ($attr, $value, $fail) use ($exceptRiderId) {
                if (is_string($value) && Rider::where('license_number', $value)
                    ->whereNotIn('status', [Rider::STATUS_DISAPPROVED])
                    ->when($exceptRiderId, fn ($q) => $q->where('id', '!=', $exceptRiderId))->exists()) {
                    $fail('This driver\'s license number is already registered to another rider.');
                }
            }],
            'license_expiry' => ['required', 'date_format:Y-m-d', function ($attr, $value, $fail) {
                try {
                    $expiry = \Carbon\CarbonImmutable::createFromFormat('Y-m-d', (string) $value, 'Asia/Manila')->startOfDay();
                } catch (\Throwable) {
                    return;
                }
                if ($expiry->lessThan(Validation::today())) {
                    $fail('This driver\'s license is expired. The expiry date must be today or later.');
                }
            }],
        ];
    }

    public static function licenseMessages(): array
    {
        return [
            'license_number.required'    => 'Driver\'s license number is required.',
            'license_number.regex'       => 'Enter the license number in the LTO format A00-00-000000 (1 letter and 11 digits).',
            'license_expiry.required'    => 'License expiry date is required.',
            'license_expiry.date_format' => 'Enter a valid license expiry date.',
        ];
    }

    public function rules(): array
    {
        /** @var LogisticsCompany $company */
        $company = $this->attributes->get('logistics_company');

        return [
            'first_name'     => Validation::personName(),
            'last_name'      => Validation::personName(),
            'middle_name'    => Validation::personName(required: false),
            'date_of_birth'  => Validation::dateOfBirth(),
            'email'          => ['required', 'string', 'email:rfc', 'max:100', 'unique:users,email'],
            'phone'          => ['required', ...PhMobile::rules(), 'unique:users,phone'],
            ...self::licenseRules(),
            'vehicle_type'   => ['required', 'string', Rule::in(Rider::VEHICLE_TYPES)],
            'plate_number'   => ['required', 'string', 'regex:/^[A-Z0-9]{2,10}$/', function ($attr, $value, $fail) {
                if (is_string($value) && self::plateTaken($value)) {
                    $fail('This plate number is already registered to another rider.');
                }
            }],
            'drivers_license_image' => Validation::document(),
            'or_cr_image'    => Validation::document(),
            // Optional: which of the company's hubs the rider starts from (the company's main hub when left out)
            'sorting_center_id' => ['nullable', 'integer', function ($attr, $value, $fail) use ($company) {
                $hub = LogisticsCompany::constrain(SortingCenter::query(), $company->id)->find($value);
                if (! $hub || $hub->status !== SortingCenter::STATUS_APPROVED) {
                    $fail('Choose one of your approved hubs.');
                }
            }],
        ];
    }

    public function messages(): array
    {
        return [
            ...Validation::personNameMessages('first_name', 'First name'),
            ...Validation::personNameMessages('middle_name', 'Middle name'),
            ...Validation::personNameMessages('last_name', 'Last name'),
            'date_of_birth.required'    => 'Date of birth is required.',
            'date_of_birth.date_format' => 'Enter a valid date of birth.',
            'email.required'   => 'Email is required.',
            'email.email'      => 'Enter a valid email address, for example name@example.com.',
            'email.unique'     => 'This email is already registered to another account.',
            'phone.required'   => 'Mobile number is required.',
            'phone.regex'      => PhMobile::MESSAGE,
            'phone.string'     => PhMobile::MESSAGE,
            'phone.unique'     => 'This mobile number is already in use by another account.',
            ...self::licenseMessages(),
            'vehicle_type.required' => 'Choose the vehicle type.',
            'vehicle_type.in'       => 'Vehicle type must be Motorcycle, Tricycle, Car or Van.',
            'plate_number.required' => 'Plate number is required.',
            'plate_number.regex'    => 'Enter the plate number with letters and numbers only, for example 123ABC or NBC1234.',
            ...Validation::uploadMessages('drivers_license_image', "the driver's license", document: true),
            ...Validation::uploadMessages('or_cr_image', 'the vehicle OR/CR', document: true),
        ];
    }
}
