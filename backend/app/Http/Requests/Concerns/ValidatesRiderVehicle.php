<?php

namespace App\Http\Requests\Concerns;

use App\Models\Rider;
use Illuminate\Validation\Rule;

/**
 * The vehicle rules shared by rider registration and the rider's own vehicle edit (feature 2.10), so the
 * two can never drift apart: the fixed motorized types, the plate pattern, and uppercase normalization.
 */
trait ValidatesRiderVehicle
{
    /**
     * Normalized vehicle input to merge into the request before validation.
     *
     * @return array<string, string>
     */
    protected function normalizedVehicleInput(): array
    {
        $merge = [];

        // Plate number normalization: trim and uppercase
        // Non-strings (arrays, objects) are left alone so the 'string' rule rejects them with a 422.
        if ($this->filled('plate_number') && is_string($this->input('plate_number'))) {
            $merge['plate_number'] = strtoupper(trim($this->input('plate_number')));
        }

        // Vehicle type normalization (e.g. "motorcycle" -> "Motorcycle")
        if ($this->filled('vehicle_type') && is_string($this->input('vehicle_type'))) {
            $raw = trim($this->input('vehicle_type'));
            $match = collect(Rider::VEHICLE_TYPES)->first(fn ($t) => strcasecmp($t, $raw) === 0);
            if ($match) {
                $merge['vehicle_type'] = $match;
            }
        }

        return $merge;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    protected function vehicleRules(): array
    {
        return [
            'vehicle_type' => ['required', 'string', Rule::in(Rider::VEHICLE_TYPES)],
            'plate_number' => ['required', 'string', 'max:20', 'regex:/^[A-Z0-9\s\-]+$/i'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function vehicleMessages(): array
    {
        return [
            'vehicle_type.required' => 'Please select your vehicle type.',
            'vehicle_type.in'       => 'Vehicle type must be Motorcycle, Tricycle, Car, or Van.',
            'plate_number.required' => 'Vehicle plate number is required.',
            'plate_number.max'      => 'Plate number must not exceed 20 characters.',
            'plate_number.regex'    => 'Plate number contains invalid characters.',
        ];
    }
}
