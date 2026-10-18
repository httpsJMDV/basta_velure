<?php

namespace App\Services;

use App\Models\Parcel;
use App\Models\Rider;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * How busy a rider is (A14, A34): their active jobs and today's completed deliveries.
 *
 * An active job is a parcel the rider still has to move: a pickup assigned to them that has not reached the hub yet,
 * a delivery assigned to them that is not finished, or a return they are taking back to the seller.
 */
class RiderWorkload
{
    /** Pickup jobs: assigned to the rider and not yet received at the hub. */
    public const PICKUP_STATUSES = [Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP];

    /** Delivery jobs: assigned to the rider for the last mile and not finished. */
    public const DELIVERY_STATUSES = [Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY];

    public function activeJobs(Rider|int $rider): int
    {
        $id = $rider instanceof Rider ? $rider->id : $rider;

        return (int) ($this->activeJobCounts([$id])[$id] ?? 0);
    }

    /**
     * @param  iterable<int>  $riderIds
     * @return array<int, int> rider id => active jobs
     */
    public function activeJobCounts(iterable $riderIds): array
    {
        $ids = collect($riderIds)->map(fn ($id) => (int) $id)->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }

        $counts = array_fill_keys($ids->all(), 0);

        $pickups = Parcel::whereIn('pickup_rider_id', $ids)->whereIn('status', self::PICKUP_STATUSES)
            ->selectRaw('pickup_rider_id as rider_id, count(*) as n')->groupBy('pickup_rider_id')->pluck('n', 'rider_id');
        $deliveries = Parcel::whereIn('assigned_rider_id', $ids)->whereIn('status', self::DELIVERY_STATUSES)
            ->selectRaw('assigned_rider_id as rider_id, count(*) as n')->groupBy('assigned_rider_id')->pluck('n', 'rider_id');
        $returns = Parcel::whereIn('rts_rider_id', $ids)->where('status', Parcel::STATUS_RETURN_TO_SENDER)
            ->selectRaw('rts_rider_id as rider_id, count(*) as n')->groupBy('rts_rider_id')->pluck('n', 'rider_id');

        foreach ([$pickups, $deliveries, $returns] as $set) {
            foreach ($set as $riderId => $n) {
                $counts[(int) $riderId] = ($counts[(int) $riderId] ?? 0) + (int) $n;
            }
        }

        return $counts;
    }

    /**
     * Deliveries each rider completed today (Asia/Manila).
     *
     * @param  iterable<int>  $riderIds
     * @return array<int, int>
     */
    public function deliveredToday(iterable $riderIds): array
    {
        $ids = collect($riderIds)->map(fn ($id) => (int) $id)->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }
        $start = CarbonImmutable::now('Asia/Manila')->startOfDay()->utc();

        return Parcel::whereIn('assigned_rider_id', $ids)
            ->where('status', Parcel::STATUS_DELIVERED)
            ->where('delivered_at', '>=', $start)
            ->selectRaw('assigned_rider_id as rider_id, count(*) as n')->groupBy('assigned_rider_id')
            ->pluck('n', 'rider_id')->map(fn ($n) => (int) $n)->all();
    }

    public function hasCapacity(Rider $rider): bool
    {
        return $this->activeJobs($rider) < Rider::MAX_ACTIVE_JOBS;
    }
}
