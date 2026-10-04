<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SortingCenterApplicationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $this->user;

        return [
            'id'                 => $this->id,
            'hub_name'           => $this->hub_name,
            'status'             => $this->status,
            'address_province'   => $this->address_province,
            'address_city'       => $this->address_city,
            'address_barangay'   => $this->address_barangay,
            'address_street'     => $this->address_street,
            'coverage_barangays' => $this->coverage_barangays ?? [],
            'coverage_count'     => is_array($this->coverage_barangays) ? count($this->coverage_barangays) : 0,
            'rejection_reason'   => $this->rejection_reason,
            'reviewed_by'        => $this->reviewed_by,
            'reviewed_at'        => $this->reviewed_at?->toIso8601String(),
            'created_at'         => $this->created_at?->toIso8601String(),
            'updated_at'         => $this->updated_at?->toIso8601String(),
            'dti_permit_url'     => $this->dti_permit_path
                ? route('admin.sorting-center-applications.dti-permit', $this->id)
                : null,
            'applicant'          => $user ? [
                'id'                            => $user->id,
                'first_name'                    => $user->first_name,
                'middle_name'                   => $user->middle_name,
                'last_name'                     => $user->last_name,
                'email'                         => $user->email,
                'phone'                         => $user->phone,
                'sex'                           => $user->sex,
                'date_of_birth'                 => $user->date_of_birth,
                'status'                        => $user->status,
                'government_id_type'            => $user->government_id_type,
                'government_id_image_url'       => $user->government_id_image_path
                    ? route('admin.sorting-center-applications.id-image', $this->id)
                    : null,
                'government_id_image_back_url'  => $user->government_id_image_back_path
                    ? route('admin.sorting-center-applications.id-image-back', $this->id)
                    : null,
            ] : null,
        ];
    }
}
