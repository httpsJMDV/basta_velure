<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Rider
 */
class RiderProfileResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $this->user;
        $hub = $this->sortingCenter;

        // Active areas only
        $activeAreas = $this->areaAssignments
            ? $this->areaAssignments->where('is_active', true)->values()
            : collect();

        return [
            'id'           => $this->id,
            'user_id'      => $this->user_id,
            'first_name'   => $user?->first_name,
            'last_name'    => $user?->last_name,
            'full_name'    => trim(($user?->first_name ?? '').' '.($user?->last_name ?? '')),
            'email'        => $user?->email,
            'phone'        => $user?->phone,
            'status'       => $this->status,
            'vehicle_type' => $this->vehicle_type,
            'plate_number' => $this->plate_number,
            'hub'          => $hub ? [
                'id'               => $hub->id,
                'hub_name'         => $hub->hub_name,
                'address_city'     => $hub->address_city,
                'address_province' => $hub->address_province,
            ] : null,
            'active_areas' => $activeAreas->map(fn ($area) => [
                'id'                 => $area->id,
                'area_label'         => $area->area_label,
                'barangays_count'    => count($area->coverage_barangays ?? []),
                'coverage_barangays' => $area->coverage_barangays ?? [],
            ])->all(),
            'active_areas_count' => $activeAreas->count(),
            'submitted_at'       => $this->submitted_at?->toIso8601String(),
            'created_at'         => $this->created_at?->toIso8601String(),
        ];
    }
}

