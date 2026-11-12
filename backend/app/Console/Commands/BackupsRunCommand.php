<?php

namespace App\Console\Commands;

use App\Services\Backups\BackupConflict;
use App\Services\Backups\DatabaseBackups;
use Illuminate\Console\Command;

/**
 * Makes a full database backup in one go and applies the keep rules (DatabaseBackups). Runs every day at 2:00 AM
 * Manila time from the scheduler; run it by hand (or from Laravel Cloud's Commands tab) before anything risky.
 */
class BackupsRunCommand extends Command
{
    protected $signature = 'backups:run {--manual : Count it as a backup made by hand (kept 30 days) instead of a daily one}';

    protected $description = 'Back up the database to private storage and remove backups past their keep date';

    public function handle(DatabaseBackups $backups): int
    {
        try {
            $m = $backups->start(null, $this->option('manual') ? 'manual' : 'scheduled');
        } catch (BackupConflict $e) {
            $this->warn($e->getMessage());

            return self::SUCCESS;
        }

        $this->line("Backing up {$m['database']} ({$m['id']})...");
        $m = $backups->runToEnd($m['id']);
        if ($m['status'] !== 'completed') {
            $this->error('The backup failed: ' . ($m['error'] ?? 'unknown error'));

            return self::FAILURE;
        }
        $removed = $backups->prune();
        $this->info(sprintf('Done: %d tables, %s rows, %.1f MB compressed.%s', count($m['tables']), number_format($m['rows']), $m['bytes'] / 1048576,
            $removed ? ' Removed ' . count($removed) . ' old backup(s).' : ''));

        return self::SUCCESS;
    }
}
