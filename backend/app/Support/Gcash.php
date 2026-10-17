<?php

namespace App\Support;

/** GCash account numbers: Philippine mobile numbers, stored as 09XXXXXXXXX. */
final class Gcash
{
    /** "0917 123 4567", "+63 917 123 4567" or "639171234567" → "09171234567"; anything else → null. */
    public static function normalize(?string $value): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $value);
        if (str_starts_with($digits, '63') && strlen($digits) === 12) {
            $digits = '0' . substr($digits, 2);
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '9')) {
            $digits = '0' . $digits;
        }

        return preg_match('/^09\d{9}$/', $digits) ? $digits : null;
    }

    /** "09171234567" → "0917 123 4567", the way GCash shows numbers. */
    public static function format(?string $number): ?string
    {
        if (! $number || ! preg_match('/^09\d{9}$/', $number)) {
            return $number ?: null;
        }

        return substr($number, 0, 4) . ' ' . substr($number, 4, 3) . ' ' . substr($number, 7);
    }

    /** The validation rule for a GCash number field (checked again with normalize()). */
    public const RULE = ['string', 'max:20', 'regex:/^[0-9+\s-]+$/'];

    /** A GCash transfer reference: 13 digits (receipts print it as "1234 567 890123"); spaces are dropped. */
    public static function reference(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) $value);
    }
}
