<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Support\PhPlaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Where a courier delivers (docs/api/courier-network.md): its approved hubs, gateways and delivery riders by island
 * group, region and province, the barangays they cover, and the hubs that still have no rider (a hub without riders
 * receives parcels but cannot deliver them).
 */
class LogisticsCoverageController extends Controller
{
    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** GET /logistics/coverage?region= : the network by island and region; with region, its provinces too. */
    public function summary(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $hubs = fn () => LogisticsCompany::constrain(SortingCenter::query(), $company->id)->where('status', SortingCenter::STATUS_APPROVED);

        $hubsByRegion = $hubs()->selectRaw('region_code, COUNT(*) as n')->groupBy('region_code')->pluck('n', 'region_code');
        $riders = $this->ridersBy($company, 'sorting_centers.region_code');
        $covered = DB::table('hub_coverage')->joinSub($hubs()->select(['id', 'region_code']), 'h', 'h.id', '=', 'hub_coverage.sorting_center_id')
            ->selectRaw('h.region_code, COUNT(DISTINCT hub_coverage.barangay_code) as n')->groupBy('h.region_code')->pluck('n', 'region_code');
        $gateways = $hubs()->where(fn ($q) => $q->whereNotNull('gateway_region_code')->orWhere('is_island_gateway', true))
            ->get(['id', 'hub_name', 'address_city', 'gateway_region_code', 'is_island_gateway', 'island_group']);

        $barangays = [];
        foreach (PhPlaces::cities() as $city) {
            $barangays[$city['region']] = ($barangays[$city['region']] ?? 0) + count(PhPlaces::barangaysOf($city));
        }

        $islands = [];
        // In the usual order (NCR, CAR, Region I, II, ...), not the order the data file happens to list them in.
        foreach (array_keys(\App\Support\PhRegions::REGIONS) as $code) {
            $code = (string) $code;
            $region = PhPlaces::data()['regions'][$code] ?? ['island' => PhPlaces::islandOf($code) ?? 'luzon'];
            $gateway = $gateways->first(fn ($g) => $g->gateway_region_code === $code);
            $islands[$region['island']][] = [
                'code'              => $code,
                'name'              => (string) PhPlaces::regionName($code),
                'short'             => (string) PhPlaces::regionName($code, true),
                'hubs'              => (int) ($hubsByRegion[$code] ?? 0),
                'hubs_with_riders'  => (int) ($riders[$code]->hubs ?? 0),
                'riders'            => (int) ($riders[$code]->riders ?? 0),
                'barangays'         => $barangays[$code] ?? 0,
                'barangays_covered' => (int) ($covered[$code] ?? 0),
                'gateway'           => $gateway ? $this->hubRef($gateway) : null,
            ];
        }

        $data = [
            'islands' => collect(PhPlaces::ISLAND_NAMES)->map(fn ($name, $key) => [
                'key'     => $key,
                'name'    => $name,
                'gateway' => ($g = $gateways->first(fn ($g) => $g->is_island_gateway && $g->island_group === $key)) ? $this->hubRef($g) : null,
                'regions' => $islands[$key] ?? [],
            ])->values(),
            'totals'  => [
                'hubs'              => (int) $hubsByRegion->sum(),
                'hubs_with_riders'  => (int) collect($riders)->sum('hubs'),
                'riders'            => (int) collect($riders)->sum('riders'),
                'barangays'         => array_sum($barangays),
                'barangays_covered' => (int) $covered->sum(),
                'gateways'          => $gateways->whereNotNull('gateway_region_code')->count(),
            ],
        ];

        if ($region = $this->region($request)) {
            // Metro Manila has no provinces, so its hubs and riders are counted by city instead.
            $column = $region === '130000000' ? 'city_code' : 'province_code';
            $byProvince = $hubs()->where('region_code', $region)->whereNotNull($column)->selectRaw("{$column} as k, COUNT(*) as n")->groupBy($column)->pluck('n', 'k');
            $ridersByProvince = $this->ridersBy($company, "sorting_centers.{$column}", $region);
            $provinces = [];
            foreach (PhPlaces::cities() as $city) {
                if ($city['region'] !== $region) {
                    continue;
                }
                // Metro Manila has no provinces: its cities are listed instead.
                $key = $city['province'] ?? $city['code'];
                $provinces[$key] ??= ['code' => $key, 'name' => $city['province'] ? (string) PhPlaces::provinceName($city['province']) : PhPlaces::displayName($city['name']),
                    'cities' => 0, 'hubs' => 0, 'riders' => 0, 'hubs_with_riders' => 0];
                $provinces[$key]['cities']++;
            }
            foreach ($provinces as $key => &$p) {
                $p['hubs'] = (int) ($byProvince[$key] ?? 0);
                $p['riders'] = (int) ($ridersByProvince[$key]->riders ?? 0);
                $p['hubs_with_riders'] = (int) ($ridersByProvince[$key]->hubs ?? 0);
            }
            unset($p);
            $data['region'] = ['code' => $region, 'name' => PhPlaces::regionName($region), 'provinces' => collect($provinces)->sortBy('name')->values()];
        }

        return response()->json(['data' => $data]);
    }

    /**
     * GET /logistics/coverage/hubs?region=&province=&search=&show=all|no_riders|gateways&page= : the courier's approved
     * hubs, 25 a page, with their riders, the barangays they cover and the parcels at each now.
     */
    public function hubs(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $search = trim((string) $request->query('search', ''));
        $province = trim((string) $request->query('province', ''));
        $show = (string) $request->query('show', 'all');

        $riderCount = Rider::query()->selectRaw('COUNT(*)')->whereColumn('riders.sorting_center_id', 'sorting_centers.id')
            ->where('status', Rider::STATUS_ACTIVE)->carriesParcels();
        $query = LogisticsCompany::constrain(SortingCenter::query(), $company->id)
            ->where('status', SortingCenter::STATUS_APPROVED)
            ->when($this->region($request), fn ($q, $r) => $q->where('region_code', $r))
            ->when($province !== '' && preg_match('/^\d{9}$/', $province), fn ($q) => $q->where(fn ($w) => $w->where('province_code', $province)->orWhere('city_code', $province)))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('hub_name', 'like', "%{$search}%")->orWhere('address_city', 'like', "%{$search}%")->orWhere('address_province', 'like', "%{$search}%")))
            ->when($show === 'gateways', fn ($q) => $q->where(fn ($w) => $w->whereNotNull('gateway_region_code')->orWhere('is_island_gateway', true)))
            ->when($show === 'no_riders', fn ($q) => $q->whereNotExists(fn ($e) => $e->from('riders')->whereColumn('riders.sorting_center_id', 'sorting_centers.id')
                ->where('riders.status', Rider::STATUS_ACTIVE)->where('riders.duty', '!=', Rider::DUTY_TRUCK)->whereNull('riders.deleted_at')))
            ->select(['id', 'hub_name', 'address_city', 'address_province', 'region_code', 'island_group', 'gateway_region_code', 'is_island_gateway', 'user_id'])
            ->selectSub($riderCount, 'riders_count')
            ->withCount('coverage as barangays_count')
            ->withCount(['parcels as parcels_here' => fn ($q) => $q->whereIn('status', [Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_SORTED])->whereNull('transit_since')])
            ->orderByDesc('is_island_gateway')->orderByRaw('gateway_region_code IS NULL')->orderBy('hub_name');

        $page = $query->paginate(25);

        return response()->json([
            'data' => collect($page->items())->map(fn (SortingCenter $h) => [
                'id'          => $h->id,
                'name'        => (string) $h->hub_name,
                'city'        => (string) $h->address_city,
                'province'    => (string) $h->address_province,
                'region'      => PhPlaces::regionName($h->region_code, true),
                'gateway'     => $h->gatewayLabel(),
                'riders'      => (int) $h->riders_count,
                'barangays'   => (int) $h->barangays_count,
                'parcels_here' => (int) $h->parcels_here,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()],
        ]);
    }

    private function region(Request $request): ?string
    {
        $region = trim((string) $request->query('region', ''));

        return isset(PhPlaces::data()['regions'][$region]) ? $region : null;
    }

    /** @return \Illuminate\Support\Collection<string, object{riders: int, hubs: int}> active delivery riders by a hub column */
    private function ridersBy(LogisticsCompany $company, string $column, ?string $region = null)
    {
        $query = DB::table('riders')->join('sorting_centers', 'sorting_centers.id', '=', 'riders.sorting_center_id')
            ->where('riders.status', Rider::STATUS_ACTIVE)->where('riders.duty', '!=', Rider::DUTY_TRUCK)->whereNull('riders.deleted_at')
            ->where('sorting_centers.status', SortingCenter::STATUS_APPROVED)->whereNull('sorting_centers.deleted_at')
            ->when($region, fn ($q) => $q->where('sorting_centers.region_code', $region))
            ->whereNotNull($column);
        LogisticsCompany::constrain($query, $company->id, 'sorting_centers.logistics_company_id');

        return $query->selectRaw("{$column} as k, COUNT(*) as riders, COUNT(DISTINCT riders.sorting_center_id) as hubs")
            ->groupBy($column)->get()->keyBy('k');
    }

    /** @return array{id: int, name: string, city: string} */
    private function hubRef(SortingCenter $hub): array
    {
        return ['id' => $hub->id, 'name' => (string) $hub->hub_name, 'city' => (string) $hub->address_city];
    }
}
