<?php

namespace App\Support;

/**
 * Philippine mobile numbers. People type them as 09XXXXXXXXX (11 digits) or +639XXXXXXXXX; both are the same number
 * and are stored once, as +639XXXXXXXXX, so uniqueness checks see them as equal. Spaces and hyphens between digit
 * groups are ignored; letters, landlines and any other length are not a mobile number.
 */
final class PhMobile
{
    public const MESSAGE = 'Enter a valid Philippine mobile number: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.';

    /** "0917 123 4567", "0917-123-4567" or "+639171234567" → "+639171234567"; anything else → null. */
    public static function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $compact = preg_replace('/[\s-]+/', '', trim($value));

        if (preg_match('/^09(\d{9})$/', $compact, $m)) {
            return '+639' . $m[1];
        }
        if (preg_match('/^\+639(\d{9})$/', $compact, $m)) {
            return '+639' . $m[1];
        }

        return null;
    }

    /** "+639171234567" → "09171234567", the way the number is shown in forms. */
    public static function local(?string $stored): ?string
    {
        if ($stored && preg_match('/^\+639(\d{9})$/', $stored, $m)) {
            return '09' . $m[1];
        }

        return $stored ?: null;
    }

    /**
     * The normalized value to merge into a request before validation. An input that is not a valid mobile number is
     * left exactly as typed, so the rule below rejects it with the format message instead of a silently changed value.
     */
    public static function prepare(mixed $value): mixed
    {
        return self::normalize($value) ?? $value;
    }

    /** Validation rules for a stored-format mobile field (use after prepare()). */
    public static function rules(): array
    {
        return ['string', 'regex:/^\+639\d{9}$/'];
    }
}
