<?php

namespace App\Services;

use App\Models\Parcel;
use App\Models\ReturnPickup;
use App\Models\Rider;
use Illuminate\Support\Collection;

/** Reserved physical cargo, independent of shipping charges. A staff review never certifies road safety. */
class RiderCargo
{
    public function signature(Rider $rider): string
    {
        return hash('sha256', implode('|', [$rider->vehicle_type, $rider->plate_number, $rider->vehicle_updated_at?->toIso8601String()]));
    }

    public function reviewed(Rider $rider): bool
    {
        return $rider->cargo_verified_at !== null && is_array($rider->cargo_configuration)
            && $rider->cargo_vehicle_signature === $this->signature($rider);
    }

    /** @return Collection<string, Parcel|ReturnPickup> */
    private function active(Rider $rider, bool $lock = false): Collection
    {
        $deliveryStatuses = $this->reviewed($rider) ? [...RiderWorkload::DELIVERY_STATUSES, Parcel::STATUS_DELIVERY_FAILED] : RiderWorkload::DELIVERY_STATUSES;
        $parcels = Parcel::where(fn ($q) => $q
            ->where(fn ($p) => $p->where('pickup_rider_id', $rider->id)->whereIn('status', RiderWorkload::PICKUP_STATUSES))
            ->orWhere(fn ($p) => $p->where('assigned_rider_id', $rider->id)->whereIn('status', $deliveryStatuses))
            ->when($this->reviewed($rider), fn ($q) => $q->orWhere(fn ($p) => $p->where('assigned_rider_id', $rider->id)
                ->where('status', Parcel::STATUS_RETURN_TO_SENDER)->whereNull('rts_rider_id')
                ->whereDoesntHave('hubStops', fn ($stops) => $stops->where('direction', 'return')->whereNotNull('departed_at'))))
            ->orWhere(fn ($p) => $p->where('rts_rider_id', $rider->id)->where('status', Parcel::STATUS_RETURN_TO_SENDER)))
            ->when($lock, fn ($q) => $q->lockForUpdate())->orderBy('id')->get();
        $returns = ReturnPickup::where(fn ($q) => $q
            ->where(fn ($p) => $p->where('rider_id', $rider->id)->whereIn('status', [ReturnPickup::STATUS_ASSIGNED, ReturnPickup::STATUS_COLLECTED]))
            ->orWhere(fn ($p) => $p->where('shop_rider_id', $rider->id)->where('status', ReturnPickup::STATUS_OUT_TO_SHOP)))
            ->when($lock, fn ($q) => $q->lockForUpdate())->orderBy('id')->get();

        return collect([...$parcels, ...$returns])->keyBy(fn ($job) => $this->key($job));
    }

    private function key(Parcel|ReturnPickup $job): string
    {
        return class_basename($job).':'.$job->id;
    }

    private function totals(Collection $jobs): array
    {
        $grams = 0;
        $volume = 0;
        $unknown = 0;
        foreach ($jobs as $job) {
            $m = $job->load_measurements;
            if (! is_array($m) || min($m['weight_kg'] ?? 0, $m['length_cm'] ?? 0, $m['width_cm'] ?? 0, $m['height_cm'] ?? 0) <= 0) {
                $unknown++;

                continue;
            }
            $grams += (int) ceil(round((float) $m['weight_kg'] * 1000, 3));
            $volume += (float) $m['length_cm'] * (float) $m['width_cm'] * (float) $m['height_cm'];
        }

        return ['grams' => $grams, 'volume_cm3' => $volume, 'unmeasured_jobs' => $unknown, 'jobs' => $jobs->count()];
    }

    public function profile(Rider $rider): array
    {
        $reviewed = $this->reviewed($rider);
        $configuration = $rider->cargo_configuration ?? [];
        $totals = $this->totals($this->active($rider));
        $kg = $reviewed ? (float) $configuration['usable_cargo_kg'] : null;
        $litres = $reviewed ? round($configuration['length_cm'] * $configuration['width_cm'] * $configuration['height_cm'] / 1000, 2) : null;

        return [
            'mode' => $reviewed ? 'weight' : 'legacy', 'verified_at' => $reviewed ? $rider->cargo_verified_at?->toIso8601String() : null,
            'capacity_kg' => $kg, 'reserved_kg' => round($totals['grams'] / 1000, 3),
            'remaining_kg' => $kg === null ? null : max(0, round($kg - $totals['grams'] / 1000, 3)),
            'capacity_litres' => $litres, 'reserved_litres' => round($totals['volume_cm3'] / 1000, 2),
            'unmeasured_jobs' => $totals['unmeasured_jobs'], 'active_jobs' => $totals['jobs'],
            'configuration' => $configuration,
            'notice' => $reviewed ? 'Measured parcels reserve weight and space when assigned. Physical fit, secure mounting, visibility and handling still require an in-person check.'
                : 'Vehicle capacity has not been reviewed for this vehicle. The existing three-job pickup-offer restriction remains; it is not a legal or safe-weight rating.',
        ];
    }

    /** New assignments reserve cargo; a failed delivery does not magically unload a reviewed vehicle. */
    public function problem(Rider $rider, array $incoming = [], bool $legacyLimit = true, bool $lock = false): ?string
    {
        if (! $this->reviewed($rider) && ! $legacyLimit) {
            return null;
        }
        $active = $this->active($rider, $lock);
        foreach ($incoming as $job) {
            $active->put($this->key($job), $job);
        }
        if (! $this->reviewed($rider)) {
            return $legacyLimit && $active->count() > Rider::MAX_ACTIVE_JOBS
                ? 'This rider has too many active jobs for the three-job pickup restriction. A courier must review the vehicle before kg-based loads are enabled.' : null;
        }
        $config = $rider->cargo_configuration;
        $totals = $this->totals($active);
        if ($totals['unmeasured_jobs'] > 0) {
            return 'Record the packed weight and dimensions of all assigned and incoming jobs before adding cargo to this rider.';
        }
        if ($totals['grams'] > (int) floor(round($config['usable_cargo_kg'] * 1000, 3))) {
            return 'This load exceeds the rider’s reviewed cargo allowance of '.$config['usable_cargo_kg'].' kg. Choose another rider or split the load.';
        }
        $bay = [$config['length_cm'], $config['width_cm'], $config['height_cm']];
        sort($bay);
        foreach ($active as $job) {
            $m = $job->load_measurements;
            $box = [$m['length_cm'], $m['width_cm'], $m['height_cm']];
            sort($box);
            foreach ($box as $i => $side) {
                if ($side > $bay[$i]) {
                    return 'A package exceeds this rider’s reviewed cargo-space dimensions. Use a suitable larger vehicle.';
                }
            }
        }
        if ($totals['volume_cm3'] > array_product($bay)) {
            return 'The combined package volume exceeds this rider’s reviewed cargo space. Split the load.';
        }

        return null;
    }

    public function assertFits(Rider $rider, array $incoming, bool $legacyLimit = true): void
    {
        $fresh = Rider::lockForUpdate()->findOrFail($rider->id);
        if ($problem = $this->problem($fresh, $incoming, $legacyLimit, true)) {
            abort(422, $problem);
        }
    }
}
