<?php

namespace App\Console\Commands;

use App\Services\Courier\NetworkBuilder;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\DB;

/**
 * Gives every approved courier a hub in every city and municipality (about 1,600 each), marks the regional and island
 * gateways, and puts a starter rider at each gateway. Only adds; a second run adds nothing. See NetworkBuilder and
 * docs/api/courier-network.md.
 */
class NetworkBuildCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'network:build
        {--courier=* : Only these courier ids (default: every approved courier)}
        {--dry-run : Count what would be added, change nothing}
        {--force : Run in production without asking}';

    protected $description = 'Add a hub in every city and municipality for each courier, with regional and island gateways';

    public function handle(NetworkBuilder $builder): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to run on the test database ({$database}).");

            return self::FAILURE;
        }

        $dry = (bool) $this->option('dry-run');
        $this->warn("Database: {$database} (environment: " . app()->environment() . ')' . ($dry ? ', dry run' : ''));
        if (! $dry && ! $this->confirmToProceed('Application is in production. Build the courier network?')) {
            return self::FAILURE;
        }

        $started = microtime(true);
        $stats = $builder->build(array_map('intval', (array) $this->option('courier')), $dry, fn (string $line) => $this->line($line));

        $this->table(['Courier', 'New hubs', 'Barangays added', 'Old hubs placed', 'Gateways', 'Starter riders'],
            collect($stats)->map(fn ($s, $name) => [$name, $s['hubs_created'], $s['barangays_added'], $s['hubs_tagged'], $s['gateways'], $s['riders_created']])->values()->all());
        $this->info(($dry ? 'Nothing was changed. ' : '') . sprintf('Took %.1f s.', microtime(true) - $started));

        return self::SUCCESS;
    }
}
