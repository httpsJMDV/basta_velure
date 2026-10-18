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
            'vehicle_updated_at' => $this->vehicle_updated_at?->toIso8601String(),
            'license_number' => $this->license_number,
            'license_expiry' => $this->license_expiry?->toDateString(),
            'company'      => \App\Models\LogisticsCompany::summaryFor($this->companyId()),
            'is_online'    => $this->isAvailable(),
            'needs_reverification' => (bool) $this->needs_reverification,
            'suspension_reason'    => $this->suspension_reason,
            'rejection_reason'     => $this->rejection_reason,
            'active_jobs'  => app(\App\Services\RiderWorkload::class)->activeJobs($this->resource),
            'max_active_jobs' => \App\Models\Rider::MAX_ACTIVE_JOBS,
            'documents'    => array_values(array_filter([
                $this->drivers_license_path ? ['key' => 'license', 'label' => "Driver's license", 'url' => url('/api/v1/rider/documents/license')] : null,
                $this->or_cr_path ? ['key' => 'or-cr', 'label' => 'Vehicle OR/CR', 'url' => url('/api/v1/rider/documents/or-cr')] : null,
            ])),
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

