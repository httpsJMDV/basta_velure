<?php

namespace App\Http\Requests;

use App\Http\Requests\Logistics\AddRiderRequest;
use App\Models\Rider;
use App\Support\Validation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/rider/vehicle. The rider changes their vehicle type or plate: a new OR/CR is required with the change,
 * the plate must not belong to another rider, and the courier company is asked to re-verify (RID-PROF-002/003).
 */
class UpdateRiderVehicleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(AddRiderRequest::normalizedVehicleInput($this));
    }

    public function rider(): Rider
    {
        return Rider::where('user_id', $this->user()->id)->firstOrFail();
    }

    public function rules(): array
    {
        $rider = $this->rider();

        return [
            'vehicle_type' => ['required', 'string', Rule::in(Rider::VEHICLE_TYPES)],
            'plate_number' => ['required', 'string', 'regex:/^[A-Z0-9]{2,10}$/', function ($attr, $value, $fail) use ($rider) {
                if (is_string($value) && AddRiderRequest::plateTaken($value, $rider->id)) {
                    $fail('This plate number is already registered to another rider.');
                }
            }],
            'or_cr_image'  => Validation::document(),
        ];
    }

    public function messages(): array
    {
        return [
            'vehicle_type.required' => 'Please select your vehicle type.',
            'vehicle_type.in'       => 'Vehicle type must be Motorcycle, Tricycle, Car or Van.',
            'plate_number.required' => 'Vehicle plate number is required.',
            'plate_number.regex'    => 'Enter the plate number with letters and numbers only, for example 123ABC.',
            ...Validation::uploadMessages('or_cr_image', 'the new OR/CR', document: true),
        ];
    }
}
