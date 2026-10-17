<?php

namespace App\Services;

use App\Models\LogisticsCompany;
use App\Models\SortingCenter;

/**
 * Picks the courier for an order, the way marketplaces hand parcels to J&T, Flash or Ninja Van: the buyer does not
 * choose. A courier whose hub covers the seller's barangay can collect the parcel, so it wins; one that also covers
 * the buyer's barangay is better still. Ties go to the courier with the most hubs, then the default courier.
 * With no coverage anywhere, the default courier takes it. Every courier charges the same flat fee.
 */
class CourierAssigner
{
    /** @var array<int, array{covers: array<string, true>, hubs: int}>|null coverage per approved courier */
    private ?array $network = null;

    public function forRoute(?string $pickupBarangayCode, ?string $destinationBarangayCode): ?int
    {
        $defaultId = LogisticsCompany::defaultId();
        $pickup = trim((string) $pickupBarangayCode);
        $destination = trim((string) $destinationBarangayCode);

        $best = null;
        $bestScore = null;
        foreach ($this->network() as $companyId => $c) {
            $score = [
                $pickup !== '' && isset($c['covers'][$pickup]) ? 1 : 0,
                $destination !== '' && isset($c['covers'][$destination]) ? 1 : 0,
                $c['hubs'],
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

    /** @return array<int, array{covers: array<string, true>, hubs: int}> */
    private function network(): array
    {
        if ($this->network !== null) {
            return $this->network;
        }

        $defaultId = LogisticsCompany::defaultId();
        $approved = LogisticsCompany::where('status', LogisticsCompany::STATUS_APPROVED)->pluck('id')->all();
        $network = array_fill_keys($approved, ['covers' => [], 'hubs' => 0]);

        SortingCenter::where('status', SortingCenter::STATUS_APPROVED)
            ->get(['id', 'logistics_company_id', 'coverage_barangays'])
            ->each(function (SortingCenter $hub) use (&$network, $defaultId) {
                $companyId = $hub->logistics_company_id ?? $defaultId;
                if ($companyId === null || ! isset($network[$companyId])) {
                    return; // the hub's courier is not approved
                }
                $network[$companyId]['hubs']++;
                foreach ($hub->coverage_barangays ?? [] as $code) {
                    $network[$companyId]['covers'][(string) $code] = true;
                }
            });

        return $this->network = $network;
    }
}
