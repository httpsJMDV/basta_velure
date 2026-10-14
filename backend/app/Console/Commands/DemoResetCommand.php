<?php

namespace App\Console\Commands;

use App\Services\Demo\DemoDataService;
use App\Services\Demo\DemoGuard;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Deletes the demo data created by demo:seed, and only that: rows reachable from users on the demo email domain, plus
 * the demo files on disk. Refuses to run in production or on a database whose name ends in _test.
 */
class DemoResetCommand extends Command
{
    protected $signature = 'demo:reset';

    protected $description = 'Delete the demo data (only rows reachable from @demo.loved-it.test users, and the demo files)';

    public function handle(DemoDataService $demo): int
    {
        if ($refusal = DemoGuard::refusal()) {
            $this->error($refusal);

            return self::FAILURE;
        }

        $database = DB::connection()->getDatabaseName();
        $this->warn("Database: {$database} (environment: " . app()->environment() . ')');

        $found = $demo->preview();
        if ($found === []) {
            $this->info('No demo data found. Nothing to remove.');
            // Still clears any leftover demo files.
            $demo->reset();

            return self::SUCCESS;
        }

        $this->line('Demo data found: ' . $this->describe($found));
        $this->line('Removing only rows reachable from @' . config('demo.email_domain') . ' users, plus the demo files.');

        try {
            $deleted = $demo->reset();
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('Removed: ' . $this->describe($deleted));

        return self::SUCCESS;
    }

    /**
     * @param array<string, int> $counts
     */
    private function describe(array $counts): string
    {
        return collect($counts)->map(fn (int $n, string $what) => "{$n} {$what}")->implode(', ');
    }
}
