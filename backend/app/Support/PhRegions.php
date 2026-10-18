<?php

namespace App\Support;

/**
 * The 17 regions of the Philippines with their PSGC codes, and the region or province a PSGC code belongs to. Codes
 * come from the PSGC API the forms use (9 digits: RR PP MM BBB); the newer 10-digit form (RR PPP MM BBB) also works.
 */
final class PhRegions
{
    /** @var array<string, string> region code => display name */
    public const REGIONS = [
        '130000000' => 'National Capital Region (NCR)',
        '140000000' => 'Cordillera Administrative Region (CAR)',
        '010000000' => 'Region I (Ilocos Region)',
        '020000000' => 'Region II (Cagayan Valley)',
        '030000000' => 'Region III (Central Luzon)',
        '040000000' => 'Region IV-A (CALABARZON)',
        '170000000' => 'MIMAROPA Region',
        '050000000' => 'Region V (Bicol Region)',
        '060000000' => 'Region VI (Western Visayas)',
        '070000000' => 'Region VII (Central Visayas)',
        '080000000' => 'Region VIII (Eastern Visayas)',
        '090000000' => 'Region IX (Zamboanga Peninsula)',
        '100000000' => 'Region X (Northern Mindanao)',
        '110000000' => 'Region XI (Davao Region)',
        '120000000' => 'Region XII (SOCCSKSARGEN)',
        '160000000' => 'Region XIII (Caraga)',
        '150000000' => 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
    ];

    /** The region code (9 digits) any PSGC code belongs to: its first two digits. */
    public static function regionOf(?string $code): ?string
    {
        $code = trim((string) $code);
        if (! preg_match('/^\d{9,10}$/', $code)) {
            return null;
        }

        return substr($code, 0, 2) . '0000000';
    }

    /** A province key for a PSGC code: first 4 digits of a 9-digit code, first 5 of a 10-digit code. */
    public static function provinceKey(?string $code): ?string
    {
        $code = trim((string) $code);
        if (preg_match('/^\d{9}$/', $code)) {
            return substr($code, 0, 4);
        }
        if (preg_match('/^\d{10}$/', $code)) {
            return substr($code, 0, 2) . substr($code, 3, 2);
        }

        return null;
    }

    public static function name(?string $regionCode): ?string
    {
        $key = self::regionOf($regionCode);

        return $key ? (self::REGIONS[$key] ?? null) : null;
    }

    /**
     * @param  array<int, string>  $codes
     * @return array<int, string>
     */
    public static function names(array $codes): array
    {
        return array_values(array_filter(array_map(fn ($c) => self::name(is_string($c) ? $c : null), $codes)));
    }

    /** @return array<int, array{code: string, name: string}> */
    public static function options(): array
    {
        return array_map(fn ($code, $name) => ['code' => $code, 'name' => $name], array_keys(self::REGIONS), self::REGIONS);
    }
}
