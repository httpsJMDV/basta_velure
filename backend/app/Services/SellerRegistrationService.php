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
        ?UploadedFile $dtiSecRegistration = null,
        ?UploadedFile $fdaLto = null,
        ?UploadedFile $selfieWithId = null,
    ): User {
        DB::transaction(function () use ($user, $data, $idImage, $idImageBack, $businessPermit, $dtiSecRegistration, $fdaLto, $selfieWithId) {
            $imagePath     = $idImage->store('government_ids', 'ids');
            $imageBackPath = $idImageBack?->store('government_ids', 'ids');
            $selfiePath    = $selfieWithId?->store('selfies', 'ids');
            $permitPath    = $businessPermit?->store('business_permits', 'ids');
            $dtiSecPath    = $dtiSecRegistration?->store('dti_sec_registrations', 'ids');
            $fdaLtoPath    = $fdaLto?->store('fda_ltos', 'ids');

            SellerProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'shop_name'                     => $data['shop_name'],
                    'shop_category'                 => null,
                    'shop_description'              => $data['shop_description'] ?? null,
                    'date_of_birth'                 => $user->date_of_birth,
                    'government_id_type'            => $data['government_id_type'],
                    'government_id_number'          => 'N/A',
                    'government_id_number_hash'     => hash('sha256', 'N/A_' . $user->id),
                    'government_id_image_path'      => $imagePath,
                    'government_id_image_back_path' => $imageBackPath,
                    'selfie_with_id_path'           => $selfiePath,
                    'business_permit_path'          => $permitPath,
                    'dti_sec_registration_path'     => $dtiSecPath,
                    'fda_lto_path'                  => $fdaLtoPath,
                    'payout_gcash_number'           => 'N/A',
                    'address_province'              => $data['address_province'],
                    'address_city'                  => $data['address_city'],
                    'address_barangay'              => $data['address_barangay'],
                    'address_street'                => $data['address_street'] ?? null,
                    'application_status'            => 'pending',
                    'rejection_reason'              => null,
                    'submitted_at'                  => now(),
                ]
            );
        });

        Mail::to($user->email)->queue(new SellerApplicationMail($user));

        return $user->fresh()->load('sellerProfile');
    }
}
