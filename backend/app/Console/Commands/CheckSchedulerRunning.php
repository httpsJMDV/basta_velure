<?php

namespace App\Console\Commands;

use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Tells you whether Laravel's scheduler is actually running. Orders only auto-complete and sellers are
 * only paid when it is, so a stopped scheduler is easy to miss. The scheduler writes a heartbeat every
 * minute (routes/console.php); this command fails (exit code 1) when the heartbeat is missing or stale,
 * so it can also be wired into a monitor or a deploy check.
 */
class CheckSchedulerRunning extends Command
{
    public const HEARTBEAT_KEY = 'scheduler:last-run';

    protected $signature = 'scheduler:check {--max-age=5 : Minutes without a heartbeat before the scheduler counts as stopped}';

    protected $description = 'Check that the Laravel scheduler is running (orders auto-complete and seller payouts depend on it)';

    public function handle(): int
    {
        $maxAge = max(1, (int) $this->option('max-age'));
        $last = Cache::get(self::HEARTBEAT_KEY);

        if (! $last) {
            $this->error('No scheduler heartbeat found. The scheduler does not appear to be running.');
            $this->line($this->howToStart());

            return self::FAILURE;
        }

        $minutes = (int) floor(Carbon::parse($last)->diffInMinutes(now(), true));

        if ($minutes > $maxAge) {
            $this->error("The scheduler last ran {$minutes} minutes ago (limit: {$maxAge}). It appears to have stopped.");
            $this->line($this->howToStart());

            return self::FAILURE;
        }

        $this->info("The scheduler is running (last heartbeat {$minutes} minute(s) ago).");

        return self::SUCCESS;
    }

    private function howToStart(): string
    {
        return 'Start it with `php artisan schedule:work` (development) or a cron entry running `php artisan schedule:run` every minute (production). '
            . 'Without it, delivered orders are never auto-completed and sellers are never paid.';
    }
}
