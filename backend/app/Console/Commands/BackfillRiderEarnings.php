<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\Parcel;
use App\Services\RiderEarningsRecorder;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Creates the earnings rows that are missing for parcels delivered before Feature 2.9 existed.
 * Each row is the rider's share of the delivery fee the buyer paid on that order, and the parcel's own
 * delivery time is the earned time. The hub's share is added too when the parcel has a hub and none yet. Parcels that already have a row are skipped, so it is safe to
 * run repeatedly.
 */
class BackfillRiderEarnings extends Command
{
    protected $signature = 'riders:backfill-earnings';

    protected $description = 'Create missing rider earnings rows for parcels that were already delivered';

    public function handle(RiderEarningsRecorder $recorder): int
    {
        $created = 0;

        // Delivered parcels with an assigned rider and no earnings row yet. (A buyer-confirmed order keeps
        // its parcel at DELIVERED, so completed orders are covered too.)
        Parcel::where('status', Parcel::STATUS_DELIVERED)
            ->whereNotNull('assigned_rider_id')
            ->whereHas('order', fn ($q) => $q->whereIn('status', [OrderStatus::DELIVERED->value, OrderStatus::COMPLETED->value]))
            ->where(function ($q) {
                $q->whereDoesntHave('earning')->orWhere(function ($q2) {
                    $q2->whereNotNull('sorting_center_id')->whereNotIn('id', \App\Models\HubEarning::withTrashed()->whereNotNull('parcel_id')->select('parcel_id'));
                });
            })
            ->chunkById(200, function (Collection $parcels) use ($recorder, &$created) {
                foreach ($parcels as $parcel) {
                    $row = $recorder->recordForParcel($parcel, $parcel->delivered_at ?? $parcel->updated_at);
                    if ($row) {
                        $created++;
                    }
                }
            });

        $message = "riders:backfill-earnings: created {$created} rider earnings row(s) (" . \App\Support\ShippingSplit::riderPercent() . '% of each delivery fee).';
        $this->info($message);
        Log::info($message);

        return self::SUCCESS;
    }
}
