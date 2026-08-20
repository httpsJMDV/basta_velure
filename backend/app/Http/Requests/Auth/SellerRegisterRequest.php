<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class SellerRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Must be authenticated — no seller application from guests
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'shop_name'                    => ['required', 'string', 'max:100', 'unique:seller_profiles,shop_name'],
            'line_of_business'             => ['required', 'string', 'max:100'],
            'shop_description'             => ['required', 'string', 'max:200'],
            'government_id_type'           => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id,school_id'],
            'government_id_image'          => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'government_id_image_back'     => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'business_permit'              => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'address_province'             => ['required', 'string', 'max:100'],
            'address_city'                 => ['required', 'string', 'max:100'],
            'address_barangay'             => ['required', 'string', 'max:100'],
            'address_street'               => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'government_id_image.max' => 'ID image must not exceed 5MB.',
            'business_permit.max'     => 'Business permit must not exceed 5MB.',
        ];
    }
}
