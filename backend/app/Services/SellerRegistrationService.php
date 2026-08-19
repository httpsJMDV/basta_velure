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
    public function register(array $data, UploadedFile $idImage, ?UploadedFile $idImageBack = null, ?UploadedFile $businessPermit = null): User
    {
        $user = DB::transaction(function () use ($data, $idImage, $idImageBack) {
            $user = User::create([
                'first_name'  => $data['first_name'],
                'middle_name' => $data['middle_name'] ?? null,
                'last_name'   => $data['last_name'],
                'email'       => $data['email'],
                'phone'       => $data['phone'],
                'password'    => $data['password'],
                'sex'         => $data['sex'],
            ]);

            // role set explicitly — never from request input
            $user->role = 'seller';
            $user->save();

            $imagePath        = $idImage->store('government_ids', 'ids');
            $imageBackPath    = $idImageBack ? $idImageBack->store('government_ids', 'ids') : null;
            $permitPath       = $businessPermit ? $businessPermit->store('business_permits', 'ids') : null;

            SellerProfile::create([
                'user_id'                         => $user->id,
                'shop_name'                       => $data['shop_name'],
                'shop_category'                   => $data['line_of_business'],
                'shop_description'                => $data['shop_description'] ?? null,
                'date_of_birth'                   => $data['date_of_birth'],
                'government_id_type'              => $data['government_id_type'],
                'government_id_number'            => 'N/A',
                'government_id_number_hash'       => hash('sha256', 'N/A_' . $user->id),
                'government_id_image_path'        => $imagePath,
                'government_id_image_back_path'   => $imageBackPath,
                'business_permit_path'            => $permitPath,
                'payout_gcash_number'             => 'N/A',
                'application_status'              => 'pending',
                'submitted_at'                    => now(),
            ]);

            return $user->load('sellerProfile');
        });

        Mail::to($user->email)->queue(new SellerApplicationMail($user));

        return $user;
    }
}
