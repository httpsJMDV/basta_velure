<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A courier company. The private details (permit, owner, review) only go to its own team and the platform admin. */
class LogisticsCompanyResource extends JsonResource
{
    public bool $withPrivate = false;

    public function full(): static
    {
        $this->withPrivate = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $public = [
            'id'          => $this->id,
            'name'        => $this->name,
            'code'        => $this->code,
            'slug'        => $this->slug,
            'logo_url'    => $this->logo_url,
            'status'      => $this->status,
        ];

        if (! $this->withPrivate) {
            return $public;
        }

        return $public + [
            'description'      => $this->description,
            'contact_email'    => $this->contact_email,
            'contact_phone'    => $this->contact_phone,
            'address_province' => $this->address_province,
            'address_city'     => $this->address_city,
            'address_barangay' => $this->address_barangay,
            'address_street'   => $this->address_street,
            'address_region'   => $this->address_region,
            'address_postal_code' => $this->address_postal_code,
            'sec_registration_no' => $this->sec_registration_no,
            'tin'              => $this->tin,
            'contact_first_name' => $this->contact_first_name,
            'contact_last_name'  => $this->contact_last_name,
            'contact_position'   => $this->contact_position,
            'service_regions'    => $this->service_regions ?? [],
            'service_region_names' => \App\Support\PhRegions::names($this->service_regions ?? []),
            'rejection_reason' => $this->rejection_reason,
            'submitted_at'     => $this->submitted_at?->toIso8601String(),
            'reviewed_at'      => $this->reviewed_at?->toIso8601String(),
            'business_permit_url' => $this->business_permit_path ? route('admin.courier-applications.permit', $this->id) : null,
            'documents'        => array_values(array_filter([
                $this->business_permit_path ? ['key' => 'permit', 'label' => "Mayor's / business permit", 'url' => route('admin.courier-applications.permit', $this->id)] : null,
                $this->sec_certificate_path ? ['key' => 'sec', 'label' => 'SEC certificate', 'url' => route('admin.courier-applications.document', [$this->id, 'sec'])] : null,
                $this->bir_2303_path ? ['key' => 'bir', 'label' => 'BIR Form 2303', 'url' => route('admin.courier-applications.document', [$this->id, 'bir'])] : null,
                $this->representative_id_path ? ['key' => 'rep-id', 'label' => 'Representative ID', 'url' => route('admin.courier-applications.document', [$this->id, 'rep-id'])] : null,
            ])),
            'owner'            => $this->whenLoaded('owner', fn () => $this->owner ? [
                'id'         => $this->owner->id,
                'name'       => trim($this->owner->first_name . ' ' . $this->owner->last_name),
                'email'      => $this->owner->email,
                'phone'      => $this->owner->phone,
                'avatar_url' => $this->owner->avatar_url,
            ] : null),
            'hubs_count'       => $this->when(isset($this->hubs_count), fn () => (int) $this->hubs_count),
            'approved_hubs_count' => $this->when(isset($this->approved_hubs_count), fn () => (int) $this->approved_hubs_count),
        ];
    }
}
