<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\User
 * @property-read ?string $avatar_url
 */
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
            'avatar_url'                 => $this->avatar_url,
            'government_id_type'         => $this->government_id_type,
            'government_id_image_url' => $this->government_id_image_path
                ? url("/api/v1/admin/buyer-applications/{$this->id}/id-image")
                : null,
            'government_id_image_back_url' => $this->government_id_image_back_path
                ? url("/api/v1/admin/buyer-applications/{$this->id}/id-image-back")
                : null,
            'default_address' => call_user_func(function () {
                $addr = $this->relationLoaded('addresses')
                    ? ($this->addresses->firstWhere('is_default', true) ?? $this->addresses->first())
                    : ($this->addresses()->where('is_default', true)->first() ?? $this->addresses()->first());
                if (! $addr) return null;
                return [
                    'province'          => $addr->province,
                    'city_municipality' => $addr->district,
                    'barangay'          => $addr->ward,
                    'street_address'    => $addr->address ?: null,
                ];
            }),
            'has_password'  => ! is_null($this->password),
            'created_at' => $this->created_at?->toIso8601String(),
            'seller_profile' => $this->whenLoaded('sellerProfile', fn () => [
                'shop_name'          => $this->sellerProfile->shop_name,
                'shop_category'      => $this->sellerProfile->shop_category,
                'shop_description'   => $this->sellerProfile->shop_description,
                'application_status' => $this->sellerProfile->application_status,
                'rejection_reason'   => $this->sellerProfile->rejection_reason,
                'submitted_at'       => $this->sellerProfile->submitted_at,
                'address'            => [
                    'province'  => $this->sellerProfile->address_province,
                    'city'      => $this->sellerProfile->address_city,
                    'barangay'  => $this->sellerProfile->address_barangay,
                    'street'    => $this->sellerProfile->address_street,
                ],
            ]),
            'sorting_center' => $this->whenLoaded('sortingCenter', fn () => [
                'id'                 => $this->sortingCenter->id,
                'hub_name'           => $this->sortingCenter->hub_name,
                'status'             => $this->sortingCenter->status,
                'address_province'   => $this->sortingCenter->address_province,
                'address_city'       => $this->sortingCenter->address_city,
                'address_barangay'   => $this->sortingCenter->address_barangay,
                'address_street'     => $this->sortingCenter->address_street,
                'coverage_barangays' => $this->sortingCenter->coverage_barangays ?? [],
                'rejection_reason'   => $this->sortingCenter->rejection_reason,
                'created_at'         => $this->sortingCenter->created_at?->toIso8601String(),
            ]),
            'rider' => $this->whenLoaded('rider', fn () => [
                'id'                => $this->rider->id,
                'status'            => $this->rider->status,
                'vehicle_type'      => $this->rider->vehicle_type,
                'plate_number'      => $this->rider->plate_number,
                'sorting_center_id' => $this->rider->sorting_center_id,
                'hub_name'          => $this->rider->sortingCenter?->hub_name,
                'submitted_at'      => $this->rider->submitted_at?->toIso8601String(),
                'created_at'        => $this->rider->created_at?->toIso8601String(),
            ]),
        ];
    }
}
