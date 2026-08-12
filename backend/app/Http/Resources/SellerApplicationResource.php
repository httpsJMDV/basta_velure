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
            'date_of_birth'        => $this->date_of_birth?->toDateString(),
            'government_id_type'   => $this->government_id_type,
            // Never expose the raw number — admin sees it via the signed URL flow only
            'government_id_image_url' => route('admin.seller-applications.id-image', $this->id),
            'payout_gcash_number'  => $this->payout_gcash_number, // decrypted for admin only
            'rejection_reason'     => $this->rejection_reason,
            'submitted_at'         => $this->submitted_at,
            'reviewed_at'          => $this->reviewed_at,
            'user'                 => new UserResource($this->whenLoaded('user')),
        ];
    }
}
