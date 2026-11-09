<?php

namespace App\Support;

use App\Models\HubCoverage;

/**
 * Every city and municipality of the Philippines with its barangays, from database/data/network/places.json (PSGC,
 * 9-digit codes). Used to build the couriers' nationwide hub network and to tell how far apart two places are.
 */
final class PhPlaces
{
    /** Island group of each region (the first two digits of any PSGC code). */
    public const ISLAND_OF_REGION = [
        '01' => 'luzon', '02' => 'luzon', '03' => 'luzon', '04' => 'luzon', '05' => 'luzon', '13' => 'luzon', '14' => 'luzon', '17' => 'luzon',
        '06' => 'visayas', '07' => 'visayas', '08' => 'visayas',
        '09' => 'mindanao', '10' => 'mindanao', '11' => 'mindanao', '12' => 'mindanao', '15' => 'mindanao', '16' => 'mindanao',
    ];

    public const ISLAND_NAMES = ['luzon' => 'Luzon', 'visayas' => 'Visayas', 'mindanao' => 'Mindanao'];

    /**
     * The city (PSGC code) each courier's regional gateway sits in, by region. Parcels between regions gather there.
     * BARMM's is Cotabato City, which PSGC lists under Region XII but is the region's port and seat of government.
     */
    public const REGION_GATEWAY_CITY = [
        '130000000' => '133900000', // NCR: Manila
        '140000000' => '141102000', // CAR: Baguio
        '010000000' => '013314000', // Ilocos: San Fernando, La Union
        '020000000' => '021529000', // Cagayan Valley: Tuguegarao
        '030000000' => '035416000', // Central Luzon: San Fernando, Pampanga
        '040000000' => '043405000', // CALABARZON: Calamba
        '170000000' => '175205000', // MIMAROPA: Calapan
        '050000000' => '050506000', // Bicol: Legazpi
        '060000000' => '063022000', // Western Visayas: Iloilo City
        '070000000' => '072217000', // Central Visayas: Cebu City
        '080000000' => '083747000', // Eastern Visayas: Tacloban
        '090000000' => '097332000', // Zamboanga Peninsula: Zamboanga City
        '100000000' => '104305000', // Northern Mindanao: Cagayan de Oro
        '110000000' => '112402000', // Davao Region: Davao City
        '120000000' => '126303000', // SOCCSKSARGEN: General Santos
        '160000000' => '160202000', // Caraga: Butuan
        '150000000' => '129804000', // BARMM: Cotabato City
    ];

    /** Where ships and planes leave from and land, one per island group. */
    public const ISLAND_GATEWAY_CITY = ['luzon' => '133900000', 'visayas' => '072217000', 'mindanao' => '112402000'];

    /** @var array{regions: array<string, array{name: string, short: string, island: string}>, provinces: array<string, array{name: string, region: string}>, cities: list<array<string, mixed>>}|null */
    private static ?array $data = null;

    /** @var array<string, array<string, mixed>>|null cities by code */
    private static ?array $byCode = null;

    /** @return array{regions: array<string, array{name: string, short: string, island: string}>, provinces: array<string, array{name: string, region: string}>, cities: list<array<string, mixed>>} */
    public static function data(): array
    {
        if (self::$data === null) {
            $raw = json_decode((string) file_get_contents(database_path('data/network/places.json')), true);
            self::$data = ['regions' => $raw['regions'] ?? [], 'provinces' => $raw['provinces'] ?? [], 'cities' => $raw['cities'] ?? []];
        }

        return self::$data;
    }

    /** @return list<array{code: string, name: string, city: bool, capital: bool, province: ?string, region: string, island: string, center: ?string, barangays: string}> */
    public static function cities(): array
    {
        return self::data()['cities'];
    }

    /** @return array<string, mixed>|null */
    public static function city(?string $code): ?array
    {
        if (self::$byCode === null) {
            self::$byCode = [];
            foreach (self::cities() as $city) {
                self::$byCode[$city['code']] = $city;
            }
        }

        return self::$byCode[(string) $code] ?? null;
    }

    /** @return list<string> */
    public static function barangaysOf(array $city): array
    {
        return array_values(array_filter(explode(',', (string) ($city['barangays'] ?? ''))));
    }

    /** The town centre of a city or municipality code, as [lat, lng], when known. */
    public static function coords(?string $cityCode): ?array
    {
        $city = self::city($cityCode);

        return isset($city['lat'], $city['lng']) ? [(float) $city['lat'], (float) $city['lng']] : null;
    }

    /** Straight-line kilometres between two town centres, or null when either is unknown. */
    public static function distanceKm(?string $fromCity, ?string $toCity): ?float
    {
        $a = self::coords($fromCity);
        $b = self::coords($toCity);
        if (! $a || ! $b) {
            return null;
        }
        $r = M_PI / 180;
        $h = sin(($b[0] - $a[0]) * $r / 2) ** 2 + cos($a[0] * $r) * cos($b[0] * $r) * sin(($b[1] - $a[1]) * $r / 2) ** 2;

        return 12742 * asin(min(1.0, sqrt($h)));
    }

    /**
     * A very remote town: not a city or capital, and no other town of its province within 40 km (far islands like
     * Kalayaan, Cagayancillo, Mapun). It has no courier branch; parcels for it go to the barangay hall or wait at the
     * nearest branch for the buyer (places.json `remote`, docs/api/courier-network.md).
     */
    public static function isRemoteTown(?string $cityCode): bool
    {
        return (bool) (self::city($cityCode)['remote'] ?? false);
    }

    /** True when a barangay is in a very remote town. */
    public static function isRemoteBarangay(?string $barangayCode): bool
    {
        $code = trim((string) $barangayCode);

        return preg_match('/^\d{9,10}$/', $code) === 1 && self::isRemoteTown(HubCoverage::cityOf($code));
    }

    /** "Region XI (Davao Region)", or with $short "Region XI" (NCR, CAR and BARMM go by their letters). */
    public static function regionName(?string $code, bool $short = false): ?string
    {
        $code = (string) $code;
        if (! isset(PhRegions::REGIONS[$code])) {
            return null;
        }
        if (! $short) {
            return PhRegions::REGIONS[$code];
        }

        return ['130000000' => 'NCR', '140000000' => 'CAR', '150000000' => 'BARMM', '170000000' => 'MIMAROPA'][$code]
            ?? (string) (self::data()['regions'][$code]['short'] ?? PhRegions::REGIONS[$code]);
    }

    public static function provinceName(?string $code): ?string
    {
        return self::data()['provinces'][(string) $code]['name'] ?? null;
    }

    /** "City of Davao" reads as "Davao City" on a hub's name; Manila stays Manila. */
    public static function displayName(string $name): string
    {
        if ($name === 'City of Manila') {
            return 'Manila';
        }
        if (str_starts_with($name, 'City of ')) {
            return substr($name, 8) . ' City';
        }

        return $name;
    }

    /** The province shown on a hub's address: its province, or Metro Manila for NCR (which has none). */
    public static function addressProvince(array $city): string
    {
        if ($city['region'] === '130000000') {
            return 'Metro Manila';
        }

        return self::provinceName($city['province']) ?? (string) self::regionName($city['region']);
    }

    // ── Distance classes ──────────────────────────────────────────────────────

    /** luzon, visayas or mindanao for any PSGC code (9 or 10 digits), or null. */
    public static function islandOf(?string $code): ?string
    {
        $code = trim((string) $code);

        return preg_match('/^\d{9,10}$/', $code) ? (self::ISLAND_OF_REGION[substr($code, 0, 2)] ?? null) : null;
    }

    /**
     * How far apart two barangays are, for the delivery estimate: same_city, same_province, same_region, same_island
     * or other_island. Null when a code is missing.
     */
    public static function distanceClass(?string $from, ?string $to): ?string
    {
        $from = trim((string) $from);
        $to = trim((string) $to);
        if (! preg_match('/^\d{9,10}$/', $from) || ! preg_match('/^\d{9,10}$/', $to)) {
            return null;
        }

        return match (true) {
            HubCoverage::cityOf($from) === HubCoverage::cityOf($to)                 => 'same_city',
            PhRegions::provinceKey($from) === PhRegions::provinceKey($to)           => 'same_province',
            PhRegions::regionOf($from) === PhRegions::regionOf($to)                 => 'same_region',
            self::islandOf($from) !== null && self::islandOf($from) === self::islandOf($to) => 'same_island',
            default                                                                  => 'other_island',
        };
    }

    /**
     * The delivery estimate between two barangays, in days, and how to say it.
     *
     * @return array{min: int, max: int, kind: string, label: string}|null
     */
    public static function estimate(?string $from, ?string $to): ?array
    {
        $kind = self::distanceClass($from, $to);
        if ($kind === null) {
            return null;
        }
        [$min, $max] = config("logistics.eta_days.{$kind}", [2, 5]);
        $islands = [self::ISLAND_NAMES[self::islandOf($from)] ?? '', self::ISLAND_NAMES[self::islandOf($to)] ?? ''];

        return [
            'min'   => (int) $min,
            'max'   => (int) $max,
            'kind'  => $kind,
            'label' => match ($kind) {
                'same_city'     => 'Same city',
                'same_province' => 'Same province',
                'same_region'   => 'Same region',
                'same_island'   => "Within {$islands[0]}",
                default         => "{$islands[0]} to {$islands[1]} by sea",
            },
        ];
    }
}
