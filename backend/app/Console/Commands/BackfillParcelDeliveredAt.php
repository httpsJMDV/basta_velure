<?php

namespace App\Console\Commands;

use App\Models\Parcel;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Gives a delivery time to parcels that were marked delivered by someone other than the rider endpoint (an admin),
 * before OrderStateMachine started stamping parcels.delivered_at for every actor.
 *
 * The time comes from the order's status history: the first time the order entered DELIVERED, which is the same
 * moment the state machine now stamps. Parcels that already have a delivered_at are never touched, so it is safe to
 * run repeatedly. It does not write delivery logs and does not touch earnings.
 *
 * It only reports what it would do unless --apply is given.
 */
class BackfillParcelDeliveredAt extends Command
{
    protected $signature = 'parcels:backfill-delivered-at {--apply : Write the changes (without it, only report them)}';

    protected $description = 'Set delivered_at on DELIVERED parcels that have none, from the order status history (dry run unless --apply)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');

        $missing = Parcel::where('status', Parcel::STATUS_DELIVERED)->whereNull('delivered_at')->count();

        // The first DELIVERED row of each order.
        $firstDelivered = DB::table('order_status_histories')
            ->where('to_status', 'DELIVERED')
            ->groupBy('order_id')
            ->selectRaw('order_id, MIN(created_at) as delivered_time');

        $fixable = DB::table('parcels as p')
            ->joinSub($firstDelivered, 'h', 'h.order_id', '=', 'p.order_id')
            ->where('p.status', Parcel::STATUS_DELIVERED)
            ->whereNull('p.delivered_at')
            ->whereNull('p.deleted_at');

        $wouldUpdate = (clone $fixable)->count();
        $updated = 0;

        if ($apply && $wouldUpdate > 0) {
            $updated = (clone $fixable)->update(['p.delivered_at' => DB::raw('h.delivered_time')]);
        }

        $noHistory = max(0, $missing - $wouldUpdate);

        $message = $apply
            ? "parcels:backfill-delivered-at: updated {$updated} parcel(s); {$noHistory} DELIVERED parcel(s) have no delivery history and were left alone."
            : "parcels:backfill-delivered-at (dry run): would update {$wouldUpdate} parcel(s); {$noHistory} DELIVERED parcel(s) have no delivery history and would stay as they are. Run with --apply to write.";

        $this->info($message);
        Log::info($message);

        return self::SUCCESS;
    }
}
