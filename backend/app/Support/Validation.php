<?php

namespace App\Support;

/**
 * The input rules every form shares (Assumptions A2, A10, A16, A17, A25 of the black-box workbooks), kept in one place
 * so registration, profile edits, products and uploads can never drift apart.
 */
final class Validation
{
    /** Names: 2 to 50 characters; letters (including ñ and other accented letters), spaces, hyphen, apostrophe, period. */
    public const NAME_REGEX = "/^\\p{L}[\\p{L}\\p{M} .'\\-]*$/u";

    /**
     * A short label people read, such as a rider's delivery area: it starts with a letter or digit and uses letters,
     * digits, spaces and . , ' & ( ) / # - only.
     */
    public const LABEL_REGEX = "/^[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N} .,'&()\\/#\\-]*$/u";

    /** At least two letters anywhere, so "T", "12" or "--" is not a label. */
    public const TWO_LETTERS_REGEX = '/\\p{L}.*\\p{L}/su';

    /** At least three letters anywhere, so a reason is words, not "..." or "123". */
    public const WORDS_REGEX = '/(?:\\p{L}.*){3}/su';

    /** The name on a GCash or bank account (a person or a business): starts with a letter; letters, spaces and . , ' & ( ) -. */
    public const ACCOUNT_NAME_REGEX = "/^\\p{L}[\\p{L}\\p{M} .,'&()\\-]*$/u";

    /** Uploads are capped at 5 MB: 5,120 KB, exactly 5,242,880 bytes. */
    public const MAX_UPLOAD_KB = 5120;

    /** @return array<int, string> */
    public static function personName(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'string', 'min:2', 'max:50', 'regex:' . self::NAME_REGEX];
    }

    /** Messages for a name field, e.g. personNameMessages('first_name', 'First name'). */
    public static function personNameMessages(string $field, string $label): array
    {
        return [
            "{$field}.required" => "{$label} is required.",
            "{$field}.min"      => "{$label} must be 2 to 50 characters.",
            "{$field}.max"      => "{$label} must be 2 to 50 characters.",
            "{$field}.regex"    => "{$label} may contain letters only (spaces, hyphens, apostrophes and periods are allowed).",
        ];
    }

    /**
     * An image upload: JPG or PNG, checked by the file's content (a renamed program is rejected), up to 5 MB.
     *
     * @return array<int, string>
     */
    public static function image(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'file', 'mimes:jpg,jpeg,png', 'max:' . self::MAX_UPLOAD_KB];
    }

    /**
     * A document upload: JPG, PNG or PDF, checked by content, up to 5 MB.
     *
     * @return array<int, string>
     */
    public static function document(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:' . self::MAX_UPLOAD_KB];
    }

    /** The upload messages for one field. */
    public static function uploadMessages(string $field, string $label, bool $document = false): array
    {
        $types = $document ? 'JPG, PNG or PDF' : 'JPG or PNG';

        return [
            "{$field}.required" => "Please upload {$label}.",
            "{$field}.file"     => "{$label} must be a {$types} file up to 5 MB.",
            "{$field}.uploaded" => "{$label} could not be uploaded. Use a {$types} file up to 5 MB.",
            "{$field}.mimes"    => "{$label} must be a {$types} file (other file types are not accepted).",
            "{$field}.max"      => "{$label} must be 5 MB or smaller.",
        ];
    }

    /** A short label (3 to $max characters, at least two letters), such as "Zone 2 - Poblacion". */
    public static function label(bool $required = true, int $max = 60): array
    {
        return [$required ? 'required' : 'nullable', 'string', 'min:3', "max:{$max}", 'regex:' . self::LABEL_REGEX, 'regex:' . self::TWO_LETTERS_REGEX];
    }

    public static function labelMessages(string $field, string $label, int $max = 60): array
    {
        return [
            "{$field}.required" => "{$label} is required.",
            "{$field}.min"      => "{$label} must be 3 to {$max} characters, like \"Zone 2 - Poblacion\".",
            "{$field}.max"      => "{$label} must be 3 to {$max} characters, like \"Zone 2 - Poblacion\".",
            "{$field}.regex"    => "{$label} needs at least two letters and may use letters, numbers, spaces and . , ' & ( ) / # - only.",
        ];
    }

    /** Words someone else will read, such as a reason: $min to $max characters with at least three letters. */
    public static function sentence(bool $required = true, int $min = 10, int $max = 500): array
    {
        return [$required ? 'required' : 'nullable', 'string', "min:{$min}", "max:{$max}", 'regex:' . self::WORDS_REGEX];
    }

    public static function sentenceMessages(string $field, string $label, int $min = 10, int $max = 500): array
    {
        return [
            "{$field}.required" => "{$label} is required.",
            "{$field}.min"      => "{$label} must be at least {$min} characters.",
            "{$field}.max"      => "{$label} may not be longer than {$max} characters.",
            "{$field}.regex"    => "{$label} must be written in words.",
        ];
    }

    /** The name on a GCash or bank account: 2 to 120 characters, letters first. */
    public static function accountName(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'string', 'min:2', 'max:120', 'regex:' . self::ACCOUNT_NAME_REGEX];
    }

    public static function accountNameMessages(string $field): array
    {
        return [
            "{$field}.required" => 'Enter the name on the GCash account.',
            "{$field}.min"      => 'Enter the full name on the GCash account (2 to 120 characters).',
            "{$field}.max"      => 'Enter the full name on the GCash account (2 to 120 characters).',
            "{$field}.regex"    => 'Enter the name exactly as GCash shows it: letters, spaces and . , \' & ( ) - only.',
        ];
    }

    /** A price: ₱1.00 to ₱1,000,000.00 with at most two decimal places. */
    public static function price(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'numeric', 'decimal:0,2', 'min:1', 'max:1000000'];
    }

    public const STOCK_MAX = 99999;

    /** Stock or quantity: a whole number from 0 to 99,999. */
    public static function stock(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'integer', 'min:0', 'max:' . self::STOCK_MAX];
    }

    /** A free-text reason (cancel, reject, override, suspend): 10 to 300 characters. */
    public static function reason(bool $required = true): array
    {
        return [$required ? 'required' : 'nullable', 'string', 'min:10', 'max:300'];
    }

    public static function reasonMessages(string $field = 'reason'): array
    {
        return [
            "{$field}.required" => 'Please give a reason (10 to 300 characters).',
            "{$field}.min"      => 'The reason must be at least 10 characters.',
            "{$field}.max"      => 'The reason must be 300 characters or fewer.',
        ];
    }

    /** A Philippine TIN, 000-000-000-000 (9-digit TIN plus a 3-digit branch code), compared on its 12 digits. */
    public static function normalizeTin(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }
        $trimmed = trim($value);

        return preg_match('/^\d{3}-?\d{3}-?\d{3}-?\d{3}$/', $trimmed)
            ? implode('-', str_split(preg_replace('/\D/', '', $trimmed), 3))
            : $trimmed;
    }

    public const TIN_REGEX = '/^\d{3}-\d{3}-\d{3}-\d{3}$/';
    public const TIN_MESSAGE = 'Enter the TIN as 12 digits in the format 000-000-000-000.';

    /** Today's date in the Philippines (the server clock is UTC, which is still "yesterday" until 8 a.m. Manila time). */
    public static function today(): \Carbon\CarbonImmutable
    {
        return \Carbon\CarbonImmutable::now('Asia/Manila')->startOfDay();
    }

    /** The date rule for a date of birth: a real date, not in the future, and the person is 18 or older today (A6). */
    public static function dateOfBirth(bool $required = true): array
    {
        return [
            $required ? 'required' : 'nullable', 'date_format:Y-m-d',
            function (string $attribute, mixed $value, \Closure $fail) {
                try {
                    $born = \Carbon\CarbonImmutable::createFromFormat('Y-m-d', (string) $value, 'Asia/Manila')->startOfDay();
                } catch (\Throwable) {
                    return; // date_format reports it
                }
                if ($born->greaterThan(self::today())) {
                    $fail('The date of birth cannot be in the future.');
                } elseif ($born->addYears(18)->greaterThan(self::today())) {
                    $fail('You must be at least 18 years old to register.');
                }
            },
        ];
    }

    /** A 4-digit Philippine postal code. */
    public const POSTAL_REGEX = '/^\d{4}$/';
    public const POSTAL_MESSAGE = 'Enter a 4-digit postal code.';
}
