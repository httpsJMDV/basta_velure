<?php

namespace App\Services;

use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;

/**
 * Which riders of a hub can serve which destination barangay.
 *
 * A rider covers a barangay only when they are ACTIVE, belong to the hub, and have an
 * active area assignment whose barangay codes contain the code. Codes are PSGC strings
 * and are always compared as strings so leading zeros match.
 */
class RiderAreaCoverage
{
    /**
     * Map of barangay code => [rider id => [matching area labels]].
     *
     * @return array<string, array<int, array<int, string>>>
     */
    public function eligibleByBarangayCode(SortingCenter $hub): array
    {
        $map = [];

        RiderAreaAssignment::where('is_active', true)
            ->whereHas('rider', fn ($q) => $q
                ->where('status', Rider::STATUS_ACTIVE)
                ->where('sorting_center_id', $hub->id))
            ->orderBy('id')
            ->get(['rider_id', 'area_label', 'coverage_barangays'])
            ->each(function (RiderAreaAssignment $assignment) use (&$map) {
                foreach ($assignment->coverage_barangays ?? [] as $code) {
                    $labels = &$map[(string) $code][$assignment->rider_id];
                    $labels ??= [];
                    $label = (string) $assignment->area_label;
                    if ($label !== '' && ! in_array($label, $labels, true)) {
                        $labels[] = $label;
                    }
                    unset($labels);
                }
            });

        return $map;
    }
}
