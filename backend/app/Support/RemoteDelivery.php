<?php

namespace App\Support;

/**
 * Where a parcel for a very remote town ends up (orders.delivery_point): the barangay hall, or the counter of the
 * nearest courier branch. Null means the buyer's door, as usual. See PhPlaces::isRemoteTown and
 * docs/api/courier-network.md.
 */
class RemoteDelivery
{
    public const BARANGAY_HALL = 'barangay_hall';

    public const BRANCH = 'branch';

    public const POINTS = [self::BARANGAY_HALL, self::BRANCH];

    public static function label(?string $point): ?string
    {
        return match ($point) {
            self::BARANGAY_HALL => 'Barangay hall',
            self::BRANCH        => 'Pick up at the branch',
            default             => null,
        };
    }

    /** What the buyer reads at checkout and on the order. */
    public static function buyerNote(?string $point, ?string $barangay = null, ?string $hubName = null): ?string
    {
        $barangay = trim((string) $barangay) !== '' ? "the {$barangay} barangay hall" : 'your barangay hall';

        return match ($point) {
            self::BARANGAY_HALL => "Your town is far from the courier's branch, so the rider brings your parcel to {$barangay}. We'll tell you when it's there; bring a valid ID, and the cash if you pay on delivery.",
            self::BRANCH        => 'Your parcel waits at the courier branch' . ($hubName ? " ({$hubName})" : '') . ' for you to pick up. Bring a valid ID, and the cash if you pay on delivery.',
            default             => null,
        };
    }

    /** What the rider reads on the delivery stop. */
    public static function riderNote(?string $point, ?string $barangay = null): ?string
    {
        return $point === self::BARANGAY_HALL
            ? 'Remote town: take this parcel to the ' . (trim((string) $barangay) !== '' ? "{$barangay} " : '') . 'barangay hall. The buyer meets you there, or a barangay official signs for it.'
            : null;
    }
}
