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
            'rejection_reason' => $this->rejection_reason,
            'submitted_at'     => $this->submitted_at?->toIso8601String(),
            'reviewed_at'      => $this->reviewed_at?->toIso8601String(),
            'business_permit_url' => $this->business_permit_path ? route('admin.courier-applications.permit', $this->id) : null,
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
