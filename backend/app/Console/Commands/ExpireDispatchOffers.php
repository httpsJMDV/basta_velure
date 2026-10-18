<?php

namespace App\Console\Commands;

use App\Services\Courier\Dispatcher;
use Illuminate\Console\Command;

/**
 * Pickup offers last 60 seconds (A14): an offer past that expires and the job goes to the next nearest eligible rider,
 * or to the Unassigned queue after 3 tries. The rider's and the company's screens also expire offers when they load;
 * this keeps the hand-over moving when nobody is looking. Scheduled every minute.
 */
class ExpireDispatchOffers extends Command
{
    protected $signature = 'dispatch:expire-offers';

    protected $description = 'Expire pickup offers older than 60 seconds and offer the job to the next rider';

    public function handle(Dispatcher $dispatcher): int
    {
        $n = $dispatcher->expireDue();
        $this->info("dispatch:expire-offers: expired {$n} offer(s).");

        return self::SUCCESS;
    }
}
