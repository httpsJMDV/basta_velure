<?php

namespace App\Console\Commands;

use App\Services\Showcase\ShowcaseCatalogFill;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\DB;

/**
 * Gives every storefront category and sub-category products (database/data/showcase/fill.json): moves misfiled
 * showcase products, adds the shops for the aisles nobody sold in, and lists about two products in each empty
 * sub-category, with photos. Only adds; a second run adds nothing.
 */
class ShowcaseFillCatalogCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'showcase:fill-catalog {--force : Run in production without asking}';

    protected $description = 'Fill every empty category with showcase shops and products (only adds; safe to run again)';

    public function handle(ShowcaseCatalogFill $fill): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to run on the test database ({$database}).");

            return self::FAILURE;
        }
        $this->warn("Database: {$database} (environment: " . app()->environment() . ')');
        if (! $this->confirmToProceed('Application is in production. Fill the empty categories?')) {
            return self::FAILURE;
        }

        try {
            $result = $fill->run(fn (string $line) => $this->line($line));
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("Done: {$result['moved']} products moved, {$result['shops']} new shops, {$result['products']} new products with {$result['photos']} photos.");
        if ($result['skipped'] !== []) {
            $this->warn(count($result['skipped']) . ' left out (no photo): ' . implode(', ', $result['skipped']));
        }
        $this->line('New shops sign in as seller41 and up with the showcase seller password.');

        return self::SUCCESS;
    }
}
