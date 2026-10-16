<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\Concerns\ValidatesRiderVehicle;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A signed-in buyer applies to deliver for a logistics hub, like applying as a seller: the account and its personal
 * details are reused, so only the hub, the vehicle and the driving documents are asked for.
 */
class RegisterRiderRequest extends FormRequest
{
    use ValidatesRiderVehicle;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $merge = $this->normalizedVehicleInput();

        // Hub selection alias
        if (! $this->filled('sorting_center_id') && $this->filled('hub_id')) {
            $merge['sorting_center_id'] = $this->input('hub_id');
        }

        if ($merge) {
            $this->merge($merge);
        }
    }

    public function rules(): array
    {
        return [
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

            // Vehicle Information (type and plate: shared with the rider's own vehicle edit)
            ...$this->vehicleRules(),

            // Document Uploads
            'or_cr_image'           => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'drivers_license_image' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
        ];
    }

    /** The account must be an adult buyer with no courier or hub application in force. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                /** @var User $user */
                $user = $this->user();

                if ($user->role !== 'buyer') {
                    $validator->errors()->add('account', 'Only a buyer account can apply to become a courier.');
                    return;
                }
                if (! $user->date_of_birth) {
                    $validator->errors()->add('account', 'Add your birthday to your account before applying.');
                } elseif (Carbon::parse($user->date_of_birth)->age < 18) {
                    $validator->errors()->add('account', 'Courier applicants must be at least 18 years old.');
                }

                $rider = Rider::where('user_id', $user->id)->latest('id')->first();
                if ($rider && $rider->status !== Rider::STATUS_DISAPPROVED) {
                    $validator->errors()->add('account', $rider->status === Rider::STATUS_ACTIVE
                        ? 'Your account is already an approved courier.'
                        : 'You already have a courier application waiting for the hub.');
                }

                $hub = SortingCenter::where('user_id', $user->id)->latest('id')->first();
                if ($hub && $hub->status !== SortingCenter::STATUS_REJECTED) {
                    $validator->errors()->add('account', 'A logistics hub account cannot also be a courier.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'sorting_center_id.required'      => 'Please select the logistics hub you wish to apply to.',
            'sorting_center_id.integer'       => 'Invalid logistics hub identifier.',
            'sorting_center_id.exists'        => 'The selected logistics hub does not exist.',
            ...$this->vehicleMessages(),
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
