<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SortingCenterApplicationSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $applicantName = $this->user
            ? trim("{$this->user->first_name} {$this->user->last_name}")
            : null;

        $cityProvince = array_filter([$this->address_city, $this->address_province]);

        return [
            'id'              => $this->id,
            'hub_name'        => $this->hub_name,
            'address_city'    => $this->address_city,
            'address_province'=> $this->address_province,
            'city_province'   => implode(', ', $cityProvince),
            'applicant_name'  => $applicantName,
            'applicant_email' => $this->user?->email,
            'applicant_avatar_url' => $this->user?->avatar_url,
            'submitted_date'  => $this->created_at?->toIso8601String(),
            'created_at'      => $this->created_at?->toIso8601String(),
            'status'          => $this->status,
        ];
    }
}
