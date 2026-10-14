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
 * Only items that are still pending_release, due and on a COMPLETED order are released. Disbursed items,
 * and items of cancelled, returned, disputed or merely delivered orders, are never touched.
 * Safe to run repeatedly.
 *
 * Normally "due" means escrow_release_at has passed (set when the order completes). As a safety net, an
 * item on a COMPLETED order that somehow has no release date (for example after a manual database edit)
 * is dated from the order's completed_at plus the hold, instead of staying stuck forever. If the order has
 * no completed_at either, nothing can be dated honestly, so the item is left alone and counted in a warning.
 */
class ReleaseDuePayouts extends Command
{
    protected $signature = 'payouts:release-due';

    protected $description = 'Release escrowed seller earnings whose hold period has ended';

    public function handle(): int
    {
        $now = now();
        $holdDays = max(0, (int) config('payouts.escrow_hold_days', 7));
        $released = 0;
        $repaired = 0;

        // 1. The normal path: a release date that has passed.
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

        // 2. Safety net: completed orders whose items have no release date. Date them from completed_at.
        OrderItem::with('order:id,completed_at')
            ->where('payout_status', 'pending_release')
            ->whereNull('escrow_release_at')
            ->whereHas('order', fn ($q) => $q
                ->where('status', OrderStatus::COMPLETED->value)
                ->whereNotNull('completed_at')
                ->where('completed_at', '<=', $now->copy()->subDays($holdDays)))
            ->chunkById(200, function (Collection $items) use (&$released, &$repaired, $holdDays) {
                foreach ($items as $item) {
                    $dueAt = $item->order->completed_at->copy()->addDays($holdDays);

                    $changed = OrderItem::where('id', $item->id)
                        ->where('payout_status', 'pending_release')
                        ->whereNull('escrow_release_at')
                        ->update(['escrow_release_at' => $dueAt, 'payout_status' => 'available']);

                    $released += $changed;
                    $repaired += $changed;
                }
            });

        // 3. Anything on a completed order that cannot be dated at all is reported, never guessed.
        $undatable = OrderItem::where('payout_status', 'pending_release')
            ->whereNull('escrow_release_at')
            ->whereHas('order', fn ($q) => $q
                ->where('status', OrderStatus::COMPLETED->value)
                ->whereNull('completed_at'))
            ->count();

        $message = "payouts:release-due: released {$released} item(s)" . ($repaired > 0 ? " ({$repaired} had no release date and were dated from completed_at)" : '') . '.';
        $this->info($message);
        Log::info($message);

        if ($undatable > 0) {
            $warning = "payouts:release-due: {$undatable} pending item(s) on COMPLETED orders have neither a release date nor a completion time and were left alone. Check them by hand.";
            $this->warn($warning);
            Log::warning($warning);
        }

        return self::SUCCESS;
    }
}
