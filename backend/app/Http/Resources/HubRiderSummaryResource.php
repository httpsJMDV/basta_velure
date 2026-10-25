<?php

namespace App\Http\Resources;

use App\Models\Rider;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Rider
 */
class HubRiderSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'user'               => [
                'id'         => $this->user?->id,
                'first_name' => $this->user?->first_name,
                'last_name'  => $this->user?->last_name,
                'email'      => $this->user?->email,
                'phone'      => $this->user?->phone,
            ],
            'vehicle_type'       => $this->vehicle_type,
            'plate_number'       => $this->plate_number,
            'status'             => $this->status,
            'submitted_at'       => $this->submitted_at?->toIso8601String(),
            // Applied on the public form and waiting for a decision (approving emails the activation link)
            'applicant'          => $this->isApplicant(),
            'applied_at'         => $this->applied_at?->toIso8601String(),
            'active_areas_count' => $this->relationLoaded('areaAssignments')
                ? $this->areaAssignments->where('is_active', true)->count()
                : $this->areaAssignments()->where('is_active', true)->count(),
            'created_at'         => $this->created_at?->toIso8601String(),
        ];
    }
}
