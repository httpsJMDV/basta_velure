<?php

namespace App\Services;

use App\Models\HubCoverage;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\SortingCenter;

/**
 * Picks the courier for an order, the way marketplaces hand parcels to J&T, Flash or Ninja Van: the buyer does not
 * choose. A courier whose hub covers the seller's barangay can collect the parcel, so it wins; one that also covers
 * the buyer's barangay is better still. When several couriers cover both ends (all three are nationwide), the one with
 * the fewest parcels on the move gets it, so the work is shared; then the default courier. With no coverage anywhere,
 * the default courier takes it.
 *
 * Coverage is read from the hub_coverage index (one query per barangay), never by loading every hub.
 */
class CourierAssigner
{
    /** @var list<int>|null */
    private ?array $approved = null;

    /** @var array<string, array<int, true>> */
    private array $covering = [];

    /** @var array<int, int>|null */
    private ?array $load = null;

    /** The statuses of a parcel a courier is still working on. */
    private const OPEN = [
        Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP, Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_SORTED,
        Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY, Parcel::STATUS_DELIVERY_FAILED, Parcel::STATUS_RETURN_TO_SENDER,
    ];

    public function forRoute(?string $pickupBarangayCode, ?string $destinationBarangayCode): ?int
    {
        $defaultId = LogisticsCompany::defaultId();
        $atPickup = $this->companiesCovering($pickupBarangayCode);
        $atDestination = $this->companiesCovering($destinationBarangayCode);

        $best = null;
        $bestScore = null;
        foreach ($this->approved() as $companyId) {
            $score = [
                isset($atPickup[$companyId]) ? 1 : 0,
                isset($atDestination[$companyId]) ? 1 : 0,
                -($this->load()[$companyId] ?? 0),
                $companyId === $defaultId ? 1 : 0,
                -$companyId,
            ];
            if ($bestScore === null || $score > $bestScore) {
                $best = $companyId;
                $bestScore = $score;
            }
        }

        // Nobody covers either end: the default courier.
        if ($bestScore === null || ($bestScore[0] === 0 && $bestScore[1] === 0)) {
            return $defaultId ?? $best;
        }

        return $best;
    }

    /**
     * Whether some approved courier has hubs at both ends of a route. Checked only once a courier has a nationwide
     * network (an island gateway, from network:build): before that, hubs cover a few towns each and the delivery
     * zones alone decide where the site delivers (L8), as they always did.
     */
    public function canDeliver(?string $pickupBarangayCode, ?string $destinationBarangayCode): bool
    {
        if (! $this->networkExists()) {
            return true;
        }
        $both = array_intersect_key($this->companiesCovering($pickupBarangayCode), $this->companiesCovering($destinationBarangayCode));

        return $both !== [];
    }

    private ?bool $hasNetwork = null;

    private function networkExists(): bool
    {
        return $this->hasNetwork ??= SortingCenter::coverageIndexReady()
            && SortingCenter::where('status', SortingCenter::STATUS_APPROVED)->where('is_island_gateway', true)->exists();
    }

    /** @return array<int, true> approved couriers with an approved hub covering this barangay */
    private function companiesCovering(?string $code): array
    {
        $code = trim((string) $code);
        if ($code === '' || ! SortingCenter::coverageIndexReady()) {
            return [];
        }
        if (! isset($this->covering[$code])) {
            $defaultId = LogisticsCompany::defaultId();
            $approved = array_flip($this->approved());
            $this->covering[$code] = SortingCenter::where('status', SortingCenter::STATUS_APPROVED)
                ->whereIn('id', HubCoverage::where('barangay_code', $code)->select('sorting_center_id'))
                ->distinct()->pluck('logistics_company_id')
                ->map(fn ($id) => $id ?? $defaultId)
                ->filter(fn ($id) => $id !== null && isset($approved[$id]))
                ->mapWithKeys(fn ($id) => [(int) $id => true])->all();
        }

        return $this->covering[$code];
    }

    /** @return list<int> */
    private function approved(): array
    {
        return $this->approved ??= LogisticsCompany::where('status', LogisticsCompany::STATUS_APPROVED)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array<int, int> open parcels per courier right now */
    private function load(): array
    {
        if ($this->load === null) {
            $defaultId = LogisticsCompany::defaultId();
            $this->load = [];
            foreach (Parcel::whereIn('status', self::OPEN)->selectRaw('logistics_company_id, count(*) as n')->groupBy('logistics_company_id')->get() as $row) {
                $id = (int) ($row->logistics_company_id ?? $defaultId);
                $this->load[$id] = ($this->load[$id] ?? 0) + (int) $row->n;
            }
        }

        return $this->load;
    }
}
