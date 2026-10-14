<?php

namespace App\Support;

/**
 * Peso amounts as integer centavos, so sums, averages and differences never go through floats.
 * Amounts travel as decimal strings ("150.00"), exactly as MySQL DECIMAL(10,2) returns them.
 */
final class Money
{
    /** "150.00", "150.5", "150", 150, null  ->  15000, 15050, 15000, 15000, 0 */
    public static function toCents(string|int|null $amount): int
    {
        if ($amount === null || $amount === '') {
            return 0;
        }

        $s = trim((string) $amount);
        $negative = str_starts_with($s, '-');
        $s = ltrim($s, '+-');

        [$whole, $fraction] = array_pad(explode('.', $s, 2), 2, '');
        $cents = ((int) $whole) * 100 + (int) str_pad(substr($fraction, 0, 2), 2, '0');

        return $negative ? -$cents : $cents;
    }

    /** 15050 -> "150.50" */
    public static function fromCents(int $cents): string
    {
        $sign = $cents < 0 ? '-' : '';
        $abs = abs($cents);

        return sprintf('%s%d.%02d', $sign, intdiv($abs, 100), $abs % 100);
    }

    /** Average per item in centavos, rounded half up. Zero items give zero. */
    public static function averageCents(int $totalCents, int $count): int
    {
        return $count > 0 ? intdiv($totalCents * 2 + $count, $count * 2) : 0;
    }
}
