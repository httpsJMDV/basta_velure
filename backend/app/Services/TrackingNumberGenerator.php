<?php

namespace App\Services;

use App\Models\Parcel;
use Carbon\Carbon;
use RuntimeException;

class TrackingNumberGenerator
{
    /**
     * Unambiguous character set (no 0, O, 1, I)
     */
    public const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    /**
     * Length of random alphanumeric suffix.
     */
    public const SUFFIX_LENGTH = 6;

    /**
     * Maximum collision retry attempts.
     */
    public const MAX_RETRIES = 5;

    /**
     * Generate a unique tracking number with format LIT-YYMMDD-XXXXXX.
     *
     * @param Carbon|null $date
     * @return string
     * @throws RuntimeException
     */
    public function generate(?Carbon $date = null): string
    {
        $datePrefix = ($date ?? Carbon::now())->format('ymd');

        for ($attempt = 0; $attempt < self::MAX_RETRIES; $attempt++) {
            $randomSuffix = $this->randomString(self::SUFFIX_LENGTH);
            $candidate = "LIT-{$datePrefix}-{$randomSuffix}";

            if (! Parcel::where('tracking_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        throw new RuntimeException('Failed to generate a unique tracking number after ' . self::MAX_RETRIES . ' attempts.');
    }

    /**
     * Generate cryptographically secure random string from CHARSET.
     */
    public function randomString(int $length = 6): string
    {
        $charsetLen = strlen(self::CHARSET);
        $result = '';

        for ($i = 0; $i < $length; $i++) {
            $result .= self::CHARSET[random_int(0, $charsetLen - 1)];
        }

        return $result;
    }
}
