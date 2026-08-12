<?php

namespace App\Services;

use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SellerRegistrationService
{
    public function register(array $data, UploadedFile $idImage): User
    {
        return DB::transaction(function () use ($data, $idImage) {
            $user = User::create([
                'first_name'  => $data['first_name'],
                'middle_name' => $data['middle_name'] ?? null,
                'last_name'   => $data['last_name'],
                'email'       => $data['email'],
                'phone'       => $data['phone'],
                'password'    => $data['password'],
            ]);

            // role set explicitly — never from request input
            $user->role = 'seller';
            $user->save();

            $imagePath = $idImage->store('government_ids', 'ids');

            SellerProfile::create([
                'user_id'                    => $user->id,
                'shop_name'                  => $data['shop_name'],
                'date_of_birth'              => $data['date_of_birth'],
                'government_id_type'         => $data['government_id_type'],
                'government_id_number'       => $data['government_id_number'],
                'government_id_number_hash'  => hash('sha256', $data['government_id_number']),
                'government_id_image_path'   => $imagePath,
                'payout_gcash_number'        => $data['payout_gcash_number'],
                'application_status'         => 'pending',
                'submitted_at'               => now(),
            ]);

            return $user->load('sellerProfile');
        });
    }
}
