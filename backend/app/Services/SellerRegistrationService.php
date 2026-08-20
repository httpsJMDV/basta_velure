<?php

namespace App\Services;

use App\Mail\SellerApplicationMail;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class SellerRegistrationService
{
    /**
     * Attach a seller_profiles row to an existing authenticated user.
     * Never creates a new User — the buyer account is reused as-is.
     */
    public function apply(
        User $user,
        array $data,
        UploadedFile $idImage,
        ?UploadedFile $idImageBack = null,
        ?UploadedFile $businessPermit = null,
    ): User {
        DB::transaction(function () use ($user, $data, $idImage, $idImageBack, $businessPermit) {
            $imagePath     = $idImage->store('government_ids', 'ids');
            $imageBackPath = $idImageBack?->store('government_ids', 'ids');
            $permitPath    = $businessPermit?->store('business_permits', 'ids');

            SellerProfile::create([
                'user_id'                       => $user->id,
                'shop_name'                     => $data['shop_name'],
                'shop_category'                 => $data['line_of_business'],
                'shop_description'              => $data['shop_description'] ?? null,
                'date_of_birth'                 => $user->date_of_birth, // reuse from users table
                'government_id_type'            => $data['government_id_type'],
                'government_id_number'          => 'N/A',
                'government_id_number_hash'     => hash('sha256', 'N/A_' . $user->id),
                'government_id_image_path'      => $imagePath,
                'government_id_image_back_path' => $imageBackPath,
                'business_permit_path'          => $permitPath,
                'payout_gcash_number'           => 'N/A',
                'address_province'              => $data['address_province'],
                'address_city'                  => $data['address_city'],
                'address_barangay'              => $data['address_barangay'],
                'address_street'                => $data['address_street'] ?? null,
                'application_status'            => 'pending',
                'submitted_at'                  => now(),
            ]);
        });

        Mail::to($user->email)->queue(new SellerApplicationMail($user));

        return $user->fresh()->load('sellerProfile');
    }
}
