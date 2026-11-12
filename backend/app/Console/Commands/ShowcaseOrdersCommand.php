<?php

namespace App\Console\Commands;

use App\Services\Showcase\ShowcaseOrders;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\DB;

/**
 * Gives the showcase buyers an order history with product reviews and shop comments (ShowcaseOrders). Only buyers
 * with no order yet are used, so it can be run in parts (--limit) and never doubles anyone's history.
 */
class ShowcaseOrdersCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'showcase:orders
        {--limit=0 : Only this many buyers in this run (0 = all)}
        {--force : Run in production without asking}';

    protected $description = 'Give every showcase buyer delivered orders, product reviews and shop comments';

    public function handle(ShowcaseOrders $orders): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to run on the test database ({$database}).");

            return self::FAILURE;
        }
        $this->warn("Database: {$database} (environment: " . app()->environment() . ')');
        if (! $this->confirmToProceed('Application is in production. Add orders and reviews for the showcase buyers?')) {
            return self::FAILURE;
        }

        $started = microtime(true);
        try {
            $r = $orders->run(fn (string $line) => $this->line($line), max(0, (int) $this->option('limit')));
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info(sprintf('Done in %.0fs: %d buyers, %d orders, %d product reviews, %d shop comments, %d skipped.',
            microtime(true) - $started, $r['buyers'], $r['orders'], $r['reviews'], $r['shop_comments'], $r['skipped']));

        return self::SUCCESS;
    }
}
