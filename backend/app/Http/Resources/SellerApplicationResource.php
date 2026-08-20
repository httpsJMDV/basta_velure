<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class SellerApplicationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                   => $this->id,
            'application_status'   => $this->application_status,
            'shop_name'            => $this->shop_name,
            'shop_category'        => $this->shop_category,
            'shop_description'     => $this->shop_description,
            'date_of_birth'        => $this->date_of_birth?->toDateString(),
            'government_id_type'   => $this->government_id_type,
            'government_id_image_url'      => route('admin.seller-applications.id-image', $this->id),
            'government_id_image_back_url' => $this->government_id_image_back_path
                ? route('admin.seller-applications.id-image-back', $this->id)
                : null,
            'business_permit_url'  => $this->business_permit_path
                ? route('admin.seller-applications.business-permit', $this->id)
                : null,
            'payout_gcash_number'  => $this->payout_gcash_number,
            'rejection_reason'     => $this->rejection_reason,
            'submitted_at'         => $this->submitted_at,
            'reviewed_at'          => $this->reviewed_at,
            'user'                 => new UserResource($this->whenLoaded('user')),
        ];
    }
}
