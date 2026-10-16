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
     * Splits a fee into the rider's and the hub's shares. The rider's share is rounded half up to the centavo and
     * the hub gets exactly what is left, so nothing is lost or invented.
     *
     * @return array{rider: int, hub: int}
     */
    public static function split(int $feeCents): array
    {
        $feeCents = max(0, $feeCents);
        $rider = intdiv($feeCents * self::riderPercent() + 50, 100);

        return ['rider' => $rider, 'hub' => $feeCents - $rider];
    }
}
