<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;

/**
 * The delivery fee and how it is shared. All maths is in whole centavos so the two shares always add up to the fee.
 */
final class ShippingSplit
{
    public const DEFAULT_FEE = '50.00';
    public const DEFAULT_RIDER_PERCENT = 85;
    public const DEFAULT_PICKUP_PERCENT = 20;

    /** The delivery fee a buyer pays per seller order, in centavos. An unusable setting is logged and the default used. */
    public static function feeCents(): int
    {
        $configured = trim((string) config('shipping.fee', self::DEFAULT_FEE));

        if (! preg_match('/^\d+(\.\d{1,2})?$/', $configured)) {
            Log::error("shipping.fee is not a valid peso amount ('{$configured}'); using " . self::DEFAULT_FEE . '.');
            $configured = self::DEFAULT_FEE;
        }

        return Money::toCents($configured);
    }

    /** The delivery fee as a decimal string with two places, for display and for the order row. */
    public static function fee(): string
    {
        return Money::fromCents(self::feeCents());
    }

    /** The rider's percentage of the fee (the hub gets the rest). Outside 0 to 100 it is logged and the default used. */
    public static function riderPercent(): int
    {
        $percent = config('shipping.rider_share_percent', self::DEFAULT_RIDER_PERCENT);

        if (! is_numeric($percent) || $percent < 0 || $percent > 100) {
            Log::error('shipping.rider_share_percent must be between 0 and 100; using ' . self::DEFAULT_RIDER_PERCENT . '.');

            return self::DEFAULT_RIDER_PERCENT;
        }

        return (int) $percent;
    }

    /**
     * The pickup rider's percentage of the fee, taken out of the riders' share (the delivery rider gets the rest of
     * it). Outside 0 to the riders' percentage it is logged and the default (capped at the riders' percentage) used.
     */
    public static function pickupPercent(): int
    {
        $rider = self::riderPercent();
        $percent = config('shipping.pickup_share_percent', self::DEFAULT_PICKUP_PERCENT);

        if (! is_numeric($percent) || $percent < 0 || $percent > $rider) {
            Log::error("shipping.pickup_share_percent must be between 0 and the rider share ({$rider}); using " . min(self::DEFAULT_PICKUP_PERCENT, $rider) . '.');

            return min(self::DEFAULT_PICKUP_PERCENT, $rider);
        }

        return (int) $percent;
    }

    /** The delivery rider's percentage of the fee: the riders' share minus the pickup rider's. */
    public static function deliveryPercent(): int
    {
        return self::riderPercent() - self::pickupPercent();
    }

    /**
     * Splits a fee into the riders' and the hub's shares, and the riders' share into the pickup and delivery riders'.
     * Each share is rounded half up to the centavo and the last one gets exactly what is left, so nothing is lost or
     * invented: pickup + delivery = rider, and rider + hub = the fee.
     *
     * @return array{rider: int, hub: int, pickup: int, delivery: int}
     */
    public static function split(int $feeCents): array
    {
        $feeCents = max(0, $feeCents);
        $rider = intdiv($feeCents * self::riderPercent() + 50, 100);
        $pickup = min($rider, intdiv($feeCents * self::pickupPercent() + 50, 100));

        return ['rider' => $rider, 'hub' => $feeCents - $rider, 'pickup' => $pickup, 'delivery' => $rider - $pickup];
    }
}
