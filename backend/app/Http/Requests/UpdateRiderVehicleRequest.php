<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesRiderVehicle;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/rider/vehicle. Only approved riders reach this (the route group's middleware), and the
 * target is always the caller's own rider record.
 */
class UpdateRiderVehicleRequest extends FormRequest
{
    use ValidatesRiderVehicle;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge($this->normalizedVehicleInput());
    }

    public function rules(): array
    {
        return $this->vehicleRules();
    }

    public function messages(): array
    {
        return $this->vehicleMessages();
    }
}
