<?php

namespace App\Console\Commands;

use App\Services\Courier\NetworkBuilder;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\DB;

/**
 * Cuts each courier's hub-in-every-town network down to branches that serve the towns around them, hires 2 delivery
 * riders and a truck driver for each branch, and leaves very remote towns to the nearest branch (barangay hall or
 * pickup at the branch). See NetworkBuilder::consolidate and docs/api/courier-network.md.
 */
class NetworkConsolidateCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'network:consolidate
        {--courier=* : Only these courier ids (default: every approved courier)}
        {--radius= : How far a branch reaches, in km between town centres (default config logistics.branch_radius_km)}
        {--dry-run : Count what would change, change nothing}
        {--force : Run in production without asking}';

    protected $description = 'Cut the courier network to branches with riders and truck drivers';

    public function handle(NetworkBuilder $builder): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to run on the test database ({$database}).");

            return self::FAILURE;
        }

        $dry = (bool) $this->option('dry-run');
        $radius = (float) ($this->option('radius') ?: config('logistics.branch_radius_km', 15));
        $this->warn("Database: {$database} (environment: " . app()->environment() . "), branch reach {$radius} km" . ($dry ? ', dry run' : ''));
        if (! $dry && ! $this->confirmToProceed('Application is in production. Cut the network to branches?')) {
            return self::FAILURE;
        }

        $started = microtime(true);
        $stats = $builder->consolidate(array_map('intval', (array) $this->option('courier')), $dry, fn (string $line) => $this->line($line), $radius);

        $this->table(['Courier', 'Hubs before', 'Branches', 'Hubs removed', 'Remote towns', 'Riders hired', 'Truck drivers hired'],
            collect($stats)->map(fn ($s, $name) => [$name, $s['hubs_before'], $s['branches'], $s['hubs_removed'], $s['remote_towns'], $s['riders_created'], $s['truck_drivers_created']])->values()->all());
        $this->info(($dry ? 'Nothing was changed. ' : '') . sprintf('Took %.1f s.', microtime(true) - $started));

        return self::SUCCESS;
    }
}
