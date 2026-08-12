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
            'date_of_birth' => $this->date_of_birth?->toDateString(),
            'gender'        => $this->gender,
            'role'          => $this->role,
            'status'        => $this->status,
            'avatar_url'    => $this->avatar_path
                ? \Illuminate\Support\Facades\Storage::disk('public')->url($this->avatar_path)
                : null,
            'seller_profile' => $this->whenLoaded('sellerProfile', fn () => [
                'shop_name'          => $this->sellerProfile->shop_name,
                'application_status' => $this->sellerProfile->application_status,
                'rejection_reason'   => $this->sellerProfile->rejection_reason,
                'submitted_at'       => $this->sellerProfile->submitted_at,
            ]),
        ];
    }
}
