<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'first_name'    => $this->first_name,
            'middle_name'   => $this->middle_name,
            'last_name'     => $this->last_name,
            'email'         => $this->email,
            'phone'         => $this->phone,
            'date_of_birth'              => $this->date_of_birth?->toDateString(),
            'sex'                        => $this->sex,
            'buyer_application_status'   => $this->buyer_application_status,
            'buyer_rejection_reason'     => $this->buyer_rejection_reason,
            'role'                       => $this->role,
            'status'                     => $this->status,
            'avatar_url'                 => $this->avatar_path
                ? \Illuminate\Support\Facades\Storage::disk('public')->url($this->avatar_path)
                : null,
            'government_id_type'      => $this->government_id_type,
            'government_id_image_url' => $this->government_id_image_path
                ? url("/api/v1/admin/buyer-applications/{$this->id}/id-image")
                : null,
            'government_id_image_back_url' => $this->government_id_image_back_path
                ? url("/api/v1/admin/buyer-applications/{$this->id}/id-image-back")
                : null,
            'default_address' => $this->whenLoaded('addresses', function () {
                $addr = $this->addresses->firstWhere('is_default', true)
                    ?? $this->addresses->first();
                if (! $addr) return null;
                return [
                    'province'          => $addr->province,
                    'city_municipality' => $addr->district,
                    'barangay'          => $addr->ward,
                    'street_address'    => $addr->address ?: null,
                ];
            }),
            'created_at' => $this->created_at?->toIso8601String(),
            'seller_profile' => $this->whenLoaded('sellerProfile', fn () => [
                'shop_name'          => $this->sellerProfile->shop_name,
                'application_status' => $this->sellerProfile->application_status,
                'rejection_reason'   => $this->sellerProfile->rejection_reason,
                'submitted_at'       => $this->sellerProfile->submitted_at,
            ]),
        ];
    }
}
