<?php

namespace App\Support;

use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Models\User;

/**
 * Who may look at one parcel. The seller, the buyer, the parcel's approved hub, the rider carrying it and admins.
 * Everyone else is treated as if the parcel did not exist.
 */
class ParcelAccess
{
    /** The viewer's role on this parcel, or null when they may not see it. */
    public static function role(User $user, Parcel $parcel, bool $includePickupRider = true): ?string
    {
        if ($user->role === 'admin') {
            return 'admin';
        }

        $rider = $user->rider;
        if ($rider) {
            if ($parcel->assigned_rider_id !== null && $rider->id === $parcel->assigned_rider_id) {
                return 'rider';
            }
            if ($includePickupRider && $parcel->pickup_rider_id !== null && $rider->id === $parcel->pickup_rider_id) {
                return 'rider';
            }
        }

        $hub = $user->sortingCenter;
        if (
            $hub
            && $hub->status === SortingCenter::STATUS_APPROVED
            && $parcel->sorting_center_id !== null
            && $hub->id === $parcel->sorting_center_id
        ) {
            return 'hub';
        }

        if ($parcel->seller_id !== null && $parcel->seller_id === $user->id) {
            return 'seller';
        }

        if ($parcel->order && $parcel->order->buyer_id === $user->id) {
            return 'buyer';
        }

        return null;
    }
}
