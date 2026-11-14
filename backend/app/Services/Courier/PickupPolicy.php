<?php

namespace App\Services\Courier;

use App\Models\DispatchOffer;
use App\Models\HubCoverage;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Services\RiderWorkload;
use Illuminate\Support\Facades\DB;

/** Company defaults, with optional hub overrides. Booking a return is separate from assigning its rider. */
class PickupPolicy
{
    public function originHub(Parcel $parcel): ?SortingCenter
    {
        $companyId = LogisticsCompany::effectiveId($parcel->logistics_company_id);
        if (! $companyId || ! $parcel->pickup_barangay_code) {
            return null;
        }

        return LogisticsCompany::constrain(SortingCenter::query(), $companyId)
            ->where('status', SortingCenter::STATUS_APPROVED)
            ->whereIn('id', HubCoverage::where('barangay_code', $parcel->pickup_barangay_code)->select('sorting_center_id'))
            ->orderBy('id')->first();
    }

    public function enabled(?int $companyId, ?SortingCenter $hub, string $field): bool
    {
        $company = LogisticsCompany::find(LogisticsCompany::effectiveId($companyId));
        if (! $company || $company->status !== LogisticsCompany::STATUS_APPROVED) {
            return false;
        }
        if ($hub && $hub->{$field} !== null) {
            return (bool) $hub->{$field};
        }

        return (bool) ($company?->{$field} ?? ($field === 'auto_seller_pickups'));
    }

    public function sellerEnabled(Parcel $parcel): bool
    {
        return $this->enabled($parcel->logistics_company_id, $this->originHub($parcel), 'auto_seller_pickups');
    }

    /** Stop only unaccepted offers; assigned riders keep their jobs and scheduled windows remain intact. */
    public function reconcileOffers(int $companyId): void
    {
        $ids = LogisticsCompany::constrain(Parcel::query(), $companyId)
            ->where('status', Parcel::STATUS_READY_FOR_PICKUP)->whereNull('pickup_rider_id')
            ->where('dispatch_state', Parcel::DISPATCH_OFFERING)->pluck('id');
        foreach ($ids as $id) {
            DB::transaction(function () use ($id) {
                $parcel = Parcel::lockForUpdate()->find($id);
                if (! $parcel || $parcel->pickup_rider_id || $this->sellerEnabled($parcel)) {
                    return;
                }
                DispatchOffer::where('parcel_id', $id)->where('status', DispatchOffer::STATUS_OFFERED)
                    ->update(['status' => DispatchOffer::STATUS_CANCELLED, 'responded_at' => now()]);
                $parcel->forceFill(['dispatch_state' => Parcel::DISPATCH_UNASSIGNED])->save();
            });
        }
    }

    /** Only local, available delivery riders receive automatic returns; never truck drivers or overloaded riders. */
    public function assignReturns(?int $companyId = null): int
    {
        $query = ReturnPickup::whereIn('status', [ReturnPickup::STATUS_REQUESTED, ReturnPickup::STATUS_AT_HUB]);
        if ($companyId !== null) {
            LogisticsCompany::constrain($query, $companyId);
        }
        $assigned = 0;
        foreach ($query->orderBy('id')->pluck('id') as $id) {
            $assigned += DB::transaction(function () use ($id) {
                $pickup = ReturnPickup::lockForUpdate()->find($id);
                $service = app(ReturnPickups::class);
                if (! $pickup || ($pickup->status !== ReturnPickup::STATUS_REQUESTED && ! $service->readyForShopRider($pickup))) {
                    return 0;
                }
                $shopLeg = $service->readyForShopRider($pickup);
                $hub = SortingCenter::find($shopLeg ? $pickup->destination_hub_id : $pickup->sorting_center_id);
                if (! $hub || $hub->status !== SortingCenter::STATUS_APPROVED
                    || LogisticsCompany::effectiveId($hub->logistics_company_id) !== LogisticsCompany::effectiveId($pickup->logistics_company_id)
                    || ! $this->enabled($pickup->logistics_company_id, $hub, 'auto_return_pickups')) {
                    return 0;
                }
                $actor = $hub->user ?? LogisticsCompany::find(LogisticsCompany::effectiveId($pickup->logistics_company_id))?->owner;
                if (! $actor) {
                    return 0;
                }
                $riders = Rider::where('sorting_center_id', $hub->id)->carriesParcels()->canWork()
                    ->where('is_online', true)->where('last_seen_at', '>', now()->subMinutes(Rider::PRESENCE_TIMEOUT_MINUTES))
                    ->orderBy('id')->get();
                $workload = app(RiderWorkload::class);
                $rider = $riders->sortBy(fn ($r) => $workload->activeJobs($r))->first(fn ($r) => app(\App\Services\RiderCargo::class)->problem($r, [$pickup]) === null);
                if (! $rider) {
                    return 0;
                }
                // Serialize capacity checks across simultaneous auto-return workers.
                $rider = Rider::lockForUpdate()->find($rider->id);
                if (! $rider || ! $rider->isAvailable() || app(\App\Services\RiderCargo::class)->problem($rider, [$pickup]) !== null) {
                    return 0;
                }
                $service->assign($pickup, $rider, $actor, 'system');

                return 1;
            });
        }

        return $assigned;
    }
}
