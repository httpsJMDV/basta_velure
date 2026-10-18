<?php

namespace App\Services;

use App\Mail\SellerApplicationMail;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class SellerRegistrationService
{
    /**
     * Attach a seller_profiles row to an account (a signed-in buyer, or the unverified account a visitor just created).
     * Documents go to the private "ids" disk. The "application received" email waits until the account is verified,
     * so a visitor who never confirms their email gets one email (the code) and nothing else.
     *
     * @param  array<string, mixed>  $data  validated SellerRegisterRequest input
     * @param  array<string, UploadedFile|null>  $files
     */
    public function apply(User $user, array $data, array $files, bool $notify = true): User
    {
        $stored = [];
        $store = function (string $key, string $dir) use ($files, &$stored): ?string {
            $file = $files[$key] ?? null;
            if (! $file) {
                return null;
            }

            return $stored[] = $file->store($dir, 'ids');
        };

        try {
            DB::transaction(function () use ($user, $data, $store) {
                $type = $data['seller_type'];
                // The one "DTI or SEC" slot keeps the certificate that matches the seller type.
                $registration = $type === 'corporation'
                    ? $store('sec_certificate', 'dti_sec_registrations')
                    : $store('dti_certificate', 'dti_sec_registrations');
                $registration ??= $store('dti_sec_registration', 'dti_sec_registrations');

                SellerProfile::updateOrCreate(
                    ['user_id' => $user->id],
                    [
                        'shop_name'                     => $data['shop_name'],
                        'shop_category'                 => $data['shop_category'] ?? null,
                        'seller_type'                   => $type,
                        'tin'                           => $data['tin'] ?? null,
                        'shop_description'              => $data['shop_description'] ?? null,
                        'shop_contact_number'           => $data['shop_contact_number'] ?? $user->phone,
                        'date_of_birth'                 => $user->date_of_birth,
                        'government_id_type'            => $data['government_id_type'] ?? 'national_id',
                        'government_id_number'          => 'N/A',
                        'government_id_number_hash'     => hash('sha256', 'N/A_' . $user->id),
                        'government_id_image_path'      => $store('government_id_image', 'government_ids'),
                        'government_id_image_back_path' => $store('government_id_image_back', 'government_ids'),
                        'selfie_with_id_path'           => $store('selfie_with_id', 'selfies'),
                        'business_permit_path'          => $store('business_permit', 'business_permits'),
                        'dti_sec_registration_path'     => $registration,
                        'bir_2303_path'                 => $store('bir_2303', 'bir_2303'),
                        'fda_lto_path'                  => $store('fda_lto', 'fda_ltos'),
                        'payout_gcash_number'           => 'N/A',
                        'address_region'                => $data['address_region'] ?? null,
                        'address_region_code'           => $data['address_region_code'] ?? null,
                        'address_province'              => $data['address_province'],
                        'address_city'                  => $data['address_city'],
                        'address_barangay'              => $data['address_barangay'],
                        'address_street'                => $data['address_street'] ?? null,
                        'address_postal_code'           => $data['address_postal_code'] ?? null,
                        'address_province_code'         => $data['address_province_code'] ?? null,
                        'address_city_code'             => $data['address_city_code'] ?? null,
                        'address_barangay_code'         => $data['address_barangay_code'] ?? null,
                        'application_status'            => 'pending',
                        'rejection_reason'              => null,
                        'submitted_at'                  => now(),
                    ]
                );
            });
        } catch (\Throwable $e) {
            Storage::disk('ids')->delete($stored);
            throw $e;
        }

        if ($notify) {
            Mail::to($user->email)->queue(new SellerApplicationMail($user));
        }

        return $user->fresh()->load('sellerProfile');
    }
}
