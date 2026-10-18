<?php

namespace App\Console\Commands;

use App\Services\Commerce\ReturnService;
use Illuminate\Console\Command;

/**
 * The 3-day rules of return requests (A31): a request the shop did not answer is approved, and a rejection the buyer
 * did not escalate closes, completing the order. Safe to run repeatedly; scheduled every 15 minutes.
 */
class ProcessReturnDeadlines extends Command
{
    protected $signature = 'returns:process-deadlines';

    protected $description = 'Approve unanswered return requests and close rejected ones that were not escalated';

    public function handle(ReturnService $returns): int
    {
        $done = $returns->processDeadlines();
        $this->info("returns:process-deadlines: approved {$done['approved']}, closed {$done['closed']}.");

        return self::SUCCESS;
    }
}
