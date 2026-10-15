<?php

namespace App\Console\Commands;

use App\Services\Demo\DemoDataService;
use App\Services\Demo\DemoGuard;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fills the LOCAL database with a realistic demo dataset (see docs/demo-walkthrough.md).
 * Refuses to run in production or on a database whose name ends in _test.
 */
class DemoSeedCommand extends Command
{
    protected $signature = 'demo:seed';

    protected $description = 'Fill the local database with demo data for every role and order stage (removes any earlier demo data first)';

    public function handle(DemoDataService $demo): int
    {
        if ($refusal = DemoGuard::refusal()) {
            $this->error($refusal);

            return self::FAILURE;
        }

        $database = DB::connection()->getDatabaseName();
        $this->warn("Database: {$database} (environment: " . app()->environment() . ')');

        $existing = $demo->preview();
        if ($existing !== []) {
            $this->line('Existing demo data that will be removed first: ' . $this->describe($existing));
        }
        $this->line('Everything created uses @' . config('demo.email_domain') . ' emails. Nothing else is touched.');

        $result = $demo->seed();

        if ($result['removed'] !== []) {
            $this->line('Removed: ' . $this->describe($result['removed']));
        }
        if ($result['categories_seeded']) {
            $this->line('The database had no categories, so the standard category list was added (demo:reset leaves it alone).');
        }

        $this->newLine();
        $this->info('Demo data created.');
        $this->line('Totals: ' . $this->describe($result['totals']));

        $this->newLine();
        $this->line('Orders by status:');
        $this->table(['Status', 'Orders'], collect($result['statuses'])->map(fn (int $n, string $s) => [$s, $n])->values()->all());

        $this->line('Sign in with an email OR a username (local demo only: these passwords are deliberately weak):');
        $this->table(['Role', 'Username', 'Email', 'Password'], array_map(fn (array $c) => [$c['role'], $c['username'], $c['email'], $c['password']], $result['credentials']));

        $this->line('Next: docs/demo-walkthrough.md. Remove it all later with: php artisan demo:reset');

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
