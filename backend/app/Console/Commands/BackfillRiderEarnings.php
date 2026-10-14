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
 * Uses the fee in force today (the old deliveries had no fee at the time) and the parcel's own
 * delivery time as the earned time. Parcels that already have a row are skipped, so it is safe to
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
            ->whereDoesntHave('earning')
            ->chunkById(200, function (Collection $parcels) use ($recorder, &$created) {
                foreach ($parcels as $parcel) {
                    $row = $recorder->recordForParcel($parcel, $parcel->delivered_at ?? $parcel->updated_at);
                    if ($row) {
                        $created++;
                    }
                }
            });

        $message = "riders:backfill-earnings: created {$created} earnings row(s) at the current fee of ₱{$recorder->currentFee()}.";
        $this->info($message);
        Log::info($message);

        return self::SUCCESS;
    }
}
