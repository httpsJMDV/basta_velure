<?php

namespace App\Services\Demo;

/**
 * The three places the demo data uses, with REAL PSGC codes.
 *
 * Source: https://psgc.gitlab.io/api (the dataset the web app's address picker reads), looked up on 2026-10-14:
 *   GET /provinces/                                   Laguna                  043400000
 *   GET /provinces/043400000/cities-municipalities/   Santa Cruz              043426000
 *                                                     Pagsanjan               043419000
 *                                                     Los Baños               043411000
 *   GET /cities-municipalities/<code>/barangays/      Bagumbayan              043426002
 *                                                     Anibong                 043419001
 *                                                     Batong Malake           043411004
 * PSGC codes are strings with leading zeros; keep them as strings.
 *
 * They are fixed here so the seeder works offline and the tests never call the network. If the dataset is ever
 * revised, re-run the lookups above and update these constants.
 */
final class DemoPlaces
{
    public const AREAS = [
        'A' => [
            'label'         => 'Area A',
            'province'      => 'Laguna',
            'province_code' => '043400000',
            'city'          => 'Santa Cruz',
            'city_code'     => '043426000',
            'barangay'      => 'Bagumbayan',
            'barangay_code' => '043426002',
        ],
        'B' => [
            'label'         => 'Area B',
            'province'      => 'Laguna',
            'province_code' => '043400000',
            'city'          => 'Pagsanjan',
            'city_code'     => '043419000',
            'barangay'      => 'Anibong',
            'barangay_code' => '043419001',
        ],
        'C' => [
            'label'         => 'Area C',
            'province'      => 'Laguna',
            'province_code' => '043400000',
            'city'          => 'Los Baños',
            'city_code'     => '043411000',
            'barangay'      => 'Batong Malake',
            'barangay_code' => '043411004',
        ],
    ];

    /**
     * @return array{label: string, province: string, province_code: string, city: string, city_code: string, barangay: string, barangay_code: string}
     */
    public static function area(string $key): array
    {
        return self::AREAS[$key];
    }

    /**
     * @return array<int, string> the three barangay codes, in A, B, C order
     */
    public static function barangayCodes(): array
    {
        return array_values(array_map(fn (array $a) => $a['barangay_code'], self::AREAS));
    }
}
