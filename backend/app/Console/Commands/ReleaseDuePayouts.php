<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\OrderItem;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Makes escrowed earnings available once their hold has ended. This is the only place a payout moves
 * from pending_release to available. Amounts and commission are never read or changed.
 *
 * Only items that are still pending_release, due (escrow_release_at has passed) and on a COMPLETED
 * order are released. Disbursed items, and items of cancelled, returned, disputed or merely delivered
 * orders, are never touched. Safe to run repeatedly.
 */
class ReleaseDuePayouts extends Command
{
    protected $signature = 'payouts:release-due';

    protected $description = 'Release escrowed seller earnings whose hold period has ended';

    public function handle(): int
    {
        $now = now();
        $released = 0;

        OrderItem::where('payout_status', 'pending_release')
            ->whereNotNull('escrow_release_at')
            ->where('escrow_release_at', '<=', $now)
            ->whereHas('order', fn ($q) => $q->where('status', OrderStatus::COMPLETED->value))
            ->chunkById(200, function (Collection $items) use (&$released) {
                // The status guard is repeated in the update so a concurrent run cannot release twice
                // or overwrite an item that changed state in the meantime.
                $released += OrderItem::whereIn('id', $items->pluck('id'))
                    ->where('payout_status', 'pending_release')
                    ->update(['payout_status' => 'available']);
            });

        $message = "payouts:release-due: released {$released} item(s).";
        $this->info($message);
        Log::info($message);

        return self::SUCCESS;
    }
}
