<?php

namespace App\Console\Commands;

use App\Services\Showcase\ShowcaseAudit;
use App\Services\Showcase\ShowcaseRepair;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\Cache;

/**
 * Checks the showcase accounts against the same rules real sign-ups, applications and listings meet, and against
 * what the site needs to work for them (sign-in, GCash checkout, pickup and delivery coverage, documents the admin
 * can open). --fix repairs what it can and checks again. Only showcase accounts are read or changed.
 */
class ShowcaseCheckCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'showcase:check
        {--fix : Repair what fails, then check again}
        {--force : Repair in production without asking}';

    protected $description = 'Check the showcase accounts against the real validation rules (and repair them with --fix)';

    public function handle(ShowcaseAudit $audit, ShowcaseRepair $repair): int
    {
        if (! ShowcaseRepair::accounts()->exists()) {
            $this->info('There are no showcase accounts in this database.');

            return self::SUCCESS;
        }

        $problems = $audit->run();
        $this->report($problems, 'Before');

        if (! $this->option('fix')) {
            return $problems === [] ? self::SUCCESS : self::FAILURE;
        }
        if ($problems === []) {
            return self::SUCCESS;
        }
        if (! $this->confirmToProceed('Application is in production. Repair the showcase accounts?')) {
            return self::FAILURE;
        }

        $result = $repair->run();
        Cache::forget('storefront.categories');
        $this->newLine();
        $this->info('Repaired:');
        foreach ($result['fixed'] as $what => $count) {
            $this->line(sprintf('  %-32s %d', $what, $count));
        }

        $after = $audit->run();
        $this->report($after, 'After');

        return $after === [] ? self::SUCCESS : self::FAILURE;
    }

    /** @param array<int, array{account: string, check: string, problem: string}> $problems */
    private function report(array $problems, string $when): void
    {
        if ($problems === []) {
            $this->info("{$when}: every showcase account passes.");

            return;
        }

        $this->warn("{$when}: " . count($problems) . ' problems in ' . count(array_unique(array_column($problems, 'account'))) . ' accounts.');
        $groups = [];
        foreach ($problems as $p) {
            // The same problem across accounts and products: drop the product name, the stored value and the barangay code.
            $generic = preg_replace(['/^".*?": /', '/Stored: .*$/', '/barangay \d+/'], ['', 'Stored: …', 'barangay …'], $p['problem']);
            $key = $p['check'] . ' | ' . $generic;
            $groups[$key][] = $p['account'];
        }
        $rows = [];
        foreach ($groups as $key => $accounts) {
            [$check, $problem] = explode(' | ', $key, 2);
            $unique = array_values(array_unique($accounts));
            $rows[] = [$check, $problem, count($accounts), implode(', ', array_slice($unique, 0, 3)) . (count($unique) > 3 ? ', …' : '')];
        }
        usort($rows, fn ($a, $b) => $b[2] <=> $a[2]);
        $this->table(['Check', 'Problem', 'Count', 'For example'], $rows);
    }
}
