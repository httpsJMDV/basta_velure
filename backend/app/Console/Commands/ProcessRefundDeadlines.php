<?php

namespace App\Console\Commands;

use App\Services\Commerce\ManualRefunds;
use Illuminate\Console\Command;

/**
 * The deadlines of refunds the shop sends by hand: a sent refund the buyer did not report within
 * orders.refund_confirm_days counts as received, and a shop late to send one is reminded while Loved-IT is told
 * (once). Safe to run repeatedly; scheduled every 15 minutes.
 */
class ProcessRefundDeadlines extends Command
{
    protected $signature = 'refunds:process-deadlines';

    protected $description = 'Close sent refunds the buyer did not report and flag shops that are late sending one';

    public function handle(ManualRefunds $refunds): int
    {
        $done = $refunds->processDeadlines();
        $this->info("refunds:process-deadlines: confirmed {$done['confirmed']}, flagged late {$done['overdue']}.");

        return self::SUCCESS;
    }
}
