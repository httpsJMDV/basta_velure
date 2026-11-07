<?php

namespace App\Console\Commands;

use App\Services\Courier\Dispatcher;
use Illuminate\Console\Command;

/**
 * A shop can ask for a pickup time (PickupSlot). Such a parcel waits as Scheduled; from an hour before its window it
 * is offered to riders like any pickup. Scheduled every five minutes.
 */
class ReleaseScheduledPickups extends Command
{
    protected $signature = 'pickups:release-scheduled';

    protected $description = 'Start offering scheduled pickups to riders shortly before the window the shop chose';

    public function handle(Dispatcher $dispatcher): int
    {
        $n = $dispatcher->releaseScheduled();
        $this->info("pickups:release-scheduled: started {$n} pickup(s).");

        return self::SUCCESS;
    }
}
