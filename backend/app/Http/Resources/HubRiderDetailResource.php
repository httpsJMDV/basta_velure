<?php

namespace App\Http\Resources;

use App\Models\Rider;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Rider
 */
class HubRiderDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $defaultAddress = call_user_func(function () {
            if (! $this->user) return null;
            $addr = $this->user->relationLoaded('addresses')
                ? ($this->user->addresses->firstWhere('is_default', true) ?? $this->user->addresses->first())
                : ($this->user->addresses()->where('is_default', true)->first() ?? $this->user->addresses()->first());
            if (! $addr) return null;
            return [
                'province' => $addr->province,
                'city'     => $addr->district,
                'barangay' => $addr->ward,
                'street'   => $addr->address ?: null,
            ];
        });

        $reviewerName = null;
        if ($this->reviewer) {
            $reviewerName = trim("{$this->reviewer->first_name} {$this->reviewer->last_name}");
        }

        return [
            'id'                  => $this->id,
            'user'                => [
                'id'            => $this->user?->id,
                'first_name'    => $this->user?->first_name,
                'middle_name'   => $this->user?->middle_name,
                'last_name'     => $this->user?->last_name,
                'email'         => $this->user?->email,
                'phone'         => $this->user?->phone,
                'date_of_birth' => $this->user?->date_of_birth?->toDateString(),
                'sex'           => $this->user?->sex,
                'created_at'    => $this->user?->created_at?->toIso8601String(),
            ],
            'address'             => $defaultAddress,
            'vehicle_type'        => $this->vehicle_type,
            'plate_number'        => $this->plate_number,
            'status'              => $this->status,
            'rejection_reason'    => $this->rejection_reason,
            'reviewed_by'         => $this->reviewed_by,
            'reviewer_name'       => $reviewerName,
            'reviewed_at'         => $this->reviewed_at?->toIso8601String(),
            'submitted_at'        => $this->submitted_at?->toIso8601String(),
            'created_at'          => $this->created_at?->toIso8601String(),
            'documents'           => [
                'or_cr_url'           => $this->or_cr_path ? url("/api/v1/hub/riders/{$this->id}/or-cr") : null,
                'drivers_license_url' => $this->drivers_license_path ? url("/api/v1/hub/riders/{$this->id}/license") : null,
            ],
            'area_assignments'    => RiderAreaAssignmentResource::collection(
                $this->relationLoaded('areaAssignments')
                    ? $this->areaAssignments
                    : $this->areaAssignments()->orderBy('created_at', 'desc')->get()
            ),
        ];
    }
}
