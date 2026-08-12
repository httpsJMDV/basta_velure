<?php

namespace App\Services;

use App\Models\AdminActivityLog;
use App\Models\SellerProfile;
use Illuminate\Support\Facades\DB;

class AdminSellerReviewService
{
    public function approve(SellerProfile $profile, int $adminId): void
    {
        DB::transaction(function () use ($profile, $adminId) {
            $profile->update([
                'application_status' => 'approved',
                'rejection_reason'   => null,
                'reviewed_by'        => $adminId,
                'reviewed_at'        => now(),
            ]);

            AdminActivityLog::create([
                'admin_id'    => $adminId,
                'action'      => 'approve_seller',
                'target_type' => 'seller_profile',
                'target_id'   => $profile->id,
                'description' => "Approved seller application for shop \"{$profile->shop_name}\".",
                'meta'        => ['user_id' => $profile->user_id, 'shop_name' => $profile->shop_name],
            ]);
        });
    }

    public function reject(SellerProfile $profile, int $adminId, string $reason): void
    {
        DB::transaction(function () use ($profile, $adminId, $reason) {
            $profile->update([
                'application_status' => 'rejected',
                'rejection_reason'   => $reason,
                'reviewed_by'        => $adminId,
                'reviewed_at'        => now(),
            ]);

            AdminActivityLog::create([
                'admin_id'    => $adminId,
                'action'      => 'reject_seller',
                'target_type' => 'seller_profile',
                'target_id'   => $profile->id,
                'description' => "Rejected seller application for shop \"{$profile->shop_name}\".",
                'meta'        => ['user_id' => $profile->user_id, 'shop_name' => $profile->shop_name, 'reason' => $reason],
            ]);
        });
    }
}
