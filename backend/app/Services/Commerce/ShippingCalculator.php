<?php

namespace App\Services\Commerce;

use App\Models\LogisticsCompany;
use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Support\PhRegions;

/**
 * The shipping fee of one store's parcel (A20): the route between the shop's pickup zone and the buyer's zone, from
 * the courier's rate table, for the chargeable weight (the items' total weight rounded up to the next whole kg, at
 * least 1 kg). An address that no zone covers is not serviceable (L8). Rates are read when the checkout is priced, so
 * a change applies only to checkouts started after it; placed orders keep the fee they were charged.
 */
class ShippingCalculator
{
    /** @var array<int, array{zones: array<int, string>, areas: array<int, array{zone_id: int, level: string, key: string, excluded: bool}>, rates: array<string, ShippingRate>}> */
    private array $tables = [];

    /** @var array<int, int>|null companies with a rate table, preferred first */
    private ?array $companies = null;

    /** Forgets the rate tables read so far, so a rate changed since is used (a worker can live across requests). */
    public function reset(): void
    {
        $this->tables = [];
        $this->companies = null;
    }

    /** Whole kilograms charged for a total weight in grams. */
    public static function chargeableKg(int $grams): int
    {
        return max(1, (int) ceil(max(0, $grams) / 1000));
    }

    /**
     * @param  array{region?: ?string, province?: ?string, city?: ?string}|null  $origin  null when the shop has no matched pickup area
     * @param  array{region?: ?string, province?: ?string, city?: ?string}  $destination
     * @return array{serviceable: bool, company_id: ?int, fee: float, chargeable_kg: int, route: ?string, message: ?string}
     */
    public function quote(?array $origin, array $destination, int $grams, ?int $preferredCompanyId = null): array
    {
        $kg = self::chargeableKg($grams);
        $companies = $this->companiesWithRates($preferredCompanyId);

        // No courier has set up zones yet: the flat fee of config/shipping.php.
        if ($companies === []) {
            return ['serviceable' => true, 'company_id' => $preferredCompanyId, 'fee' => (float) config('shipping.fee', 50), 'chargeable_kg' => $kg, 'route' => null, 'message' => null];
        }

        foreach ($companies as $companyId) {
            $to = $this->zoneFor($companyId, $destination);
            if (! $to) {
                continue;
            }
            // A shop from before addresses were matched to areas: the flat fee, once the destination is covered.
            if ($origin === null || ! array_filter($origin)) {
                return ['serviceable' => true, 'company_id' => $companyId, 'fee' => (float) config('shipping.fee', 50), 'chargeable_kg' => $kg, 'route' => null, 'message' => null];
            }
            $from = $this->zoneFor($companyId, $origin);
            $rate = $from ? ($this->tables[$companyId]['rates']["{$from}-{$to}"] ?? null) : null;
            if (! $rate) {
                continue;
            }
            $zones = $this->tables[$companyId]['zones'];
            $route = $from === $to ? "Within {$zones[$to]}" : "{$zones[$from]} to {$zones[$to]}";

            return ['serviceable' => true, 'company_id' => $companyId, 'fee' => $rate->feeFor($kg), 'chargeable_kg' => $kg, 'route' => $route, 'message' => null];
        }

        return [
            'serviceable' => false, 'company_id' => null, 'fee' => 0.0, 'chargeable_kg' => $kg, 'route' => null,
            'message' => 'We cannot deliver to this address yet: no courier covers the area. Choose another address.',
        ];
    }

    /**
     * The zone of a place for one courier: the most specific area that matches (city, then province, then region).
     * An area carved out at a level stops the wider zones from applying, unless another zone includes it there.
     *
     * @param  array{region?: ?string, province?: ?string, city?: ?string}  $place
     */
    public function zoneFor(int $companyId, array $place): ?int
    {
        $table = $this->table($companyId);
        $city = self::cityKey($place['city'] ?? null);
        $province = PhRegions::provinceKey($place['province'] ?? null) ?? PhRegions::provinceKey($place['city'] ?? null);
        $region = PhRegions::regionOf($place['region'] ?? null) ?? PhRegions::regionOf($place['province'] ?? null) ?? PhRegions::regionOf($place['city'] ?? null);
        // NCR has no provinces: its "province" code is the region code itself.
        if ($province !== null && str_ends_with((string) ($place['province'] ?? ''), '0000000')) {
            $province = null;
        }

        foreach (['city' => $city, 'province' => $province, 'region' => $region] as $level => $key) {
            if ($key === null) {
                continue;
            }
            $included = null;
            $excluded = false;
            foreach ($table['areas'] as $area) {
                if ($area['level'] !== $level || $area['key'] !== $key) {
                    continue;
                }
                if ($area['excluded']) {
                    $excluded = true;
                } else {
                    $included ??= $area['zone_id'];
                }
            }
            if ($included) {
                return $included;
            }
            if ($excluded) {
                return null;
            }
        }

        return null;
    }

    /** The key two codes of the same city share: RRPPMM of a 9-digit code, the same digits of a 10-digit one. */
    public static function cityKey(?string $code): ?string
    {
        $code = trim((string) $code);
        if (preg_match('/^\d{9}$/', $code)) {
            return substr($code, 0, 6);
        }
        if (preg_match('/^\d{10}$/', $code)) {
            return substr($code, 0, 2) . substr($code, 3, 4);
        }

        return null;
    }

    /** The key an area is compared on, for its level. */
    public static function areaKey(string $level, string $code): ?string
    {
        return match ($level) {
            'city'     => self::cityKey($code),
            'province' => PhRegions::provinceKey($code),
            default    => PhRegions::regionOf($code),
        };
    }

    /** Couriers with a rate table, the preferred one first, then the default courier, then the rest. */
    private function companiesWithRates(?int $preferred): array
    {
        if ($this->companies === null) {
            $this->companies = ShippingRate::query()->distinct()->orderBy('logistics_company_id')->pluck('logistics_company_id')->map(fn ($id) => (int) $id)->all();
        }
        $default = LogisticsCompany::defaultId();
        $order = array_values(array_unique(array_filter([$preferred, $default])));

        return array_values(array_unique([
            ...array_values(array_filter($order, fn ($id) => in_array($id, $this->companies, true))),
            ...$this->companies,
        ]));
    }

    private function table(int $companyId): array
    {
        if (isset($this->tables[$companyId])) {
            return $this->tables[$companyId];
        }
        $zones = ShippingZone::with('areas')->where('logistics_company_id', $companyId)->get();
        $areas = [];
        foreach ($zones as $zone) {
            foreach ($zone->areas as $a) {
                $key = self::areaKey($a->level, $a->psgc_code);
                if ($key !== null) {
                    $areas[] = ['zone_id' => $zone->id, 'level' => $a->level, 'key' => $key, 'excluded' => (bool) $a->excluded];
                }
            }
        }
        $rates = ShippingRate::where('logistics_company_id', $companyId)->get()->keyBy(fn ($r) => "{$r->origin_zone_id}-{$r->destination_zone_id}")->all();

        return $this->tables[$companyId] = ['zones' => $zones->pluck('name', 'id')->all(), 'areas' => $areas, 'rates' => $rates];
    }
}
