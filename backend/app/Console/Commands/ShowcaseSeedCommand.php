<?php

namespace App\Console\Commands;

use App\Services\Showcase\ShowcaseSeeder;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Fills a database (the live one included) with a realistic marketplace: one admin, 40 sellers with about 300 real
 * products and photos, 220 buyers and a courier network. See config/showcase.php. Refuses on a _test database and
 * when the showcase accounts already exist; asks before writing in production unless --force.
 */
class ShowcaseSeedCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'showcase:seed
        {--admin-password= : The admin password (at least 12 characters); a strong one is generated when omitted}
        {--force : Run in production without asking}';

    protected $description = 'Add 300 showcase accounts, real products with photos and a courier network (only adds; runs once)';

    public function handle(ShowcaseSeeder $seeder): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to run on the test database ({$database}).");

            return self::FAILURE;
        }

        $this->warn("Database: {$database} (environment: " . app()->environment() . ')');
        $this->line('This adds 300 accounts (1 admin, 40 sellers, 3 courier admins, 9 hubs, 27 riders, 220 buyers) and about 300 products with photos. Nothing is deleted.');
        if (! $this->confirmToProceed('Application is in production. Add the showcase data?')) {
            return self::FAILURE;
        }

        $password = (string) ($this->option('admin-password') ?: Str::password(20, symbols: false));
        $generated = ! $this->option('admin-password');

        try {
            $result = $seeder->run($password, fn (string $line) => $this->line($line));
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info("Done: {$result['products']} products with {$result['photos']} photos.");
        if ($result['skipped_products'] !== []) {
            $this->warn(count($result['skipped_products']) . ' products were left out because their photos could not be downloaded: ' . implode(', ', $result['skipped_products']));
        }
        $this->line('Courier partners: ' . implode(', ', $result['couriers']));

        $passwords = config('showcase.passwords');
        $a = $result['accounts'];
        $this->table(['Accounts', 'Usernames', 'Password'], [
            ['Admin (the only one)', 'admin', $generated ? $password . '   <- shown once, save it now' : '(the one you passed)'],
            ["Sellers ({$a['sellers']})", 'seller1 to seller' . $a['sellers'], $passwords['seller']],
            ["Buyers ({$a['buyers']})", 'buyer1 to buyer' . $a['buyers'], $passwords['buyer']],
            ["Courier admins ({$a['couriers']})", 'courier1 to courier' . $a['couriers'], $passwords['courier']],
            ["Hub owners ({$a['hubs']})", 'hub1 to hub' . $a['hubs'], $passwords['hub']],
            ["Riders ({$a['riders']})", 'rider1 to rider' . $a['riders'], $passwords['rider']],
        ]);
        $this->line('Sign in with the username or <username>@' . config('showcase.email_domain') . '. These accounts never receive email (SHOWCASE_SEND_MAIL).');

        return self::SUCCESS;
    }
}
