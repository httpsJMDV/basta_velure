<?php

namespace App\Http\Resources;

use App\Models\RiderAreaAssignment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin RiderAreaAssignment
 */
class RiderAreaAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'rider_id'           => $this->rider_id,
            'sorting_center_id'  => $this->sorting_center_id,
            'area_label'         => $this->area_label,
            'coverage_barangays' => $this->coverage_barangays ?? [],
            'is_active'          => (bool) $this->is_active,
            'created_at'         => $this->created_at?->toIso8601String(),
            'updated_at'         => $this->updated_at?->toIso8601String(),
        ];
    }
}
