<?php

namespace App\Console\Commands;

use App\Services\Backups\DatabaseBackups;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Puts a backup back into the database this app uses (every table in the backup is dropped and recreated with the
 * backed-up rows). A safety backup of the database as it is now is made first, so a wrong restore can be undone.
 * It refuses a _test database and asks to confirm unless --force (on Laravel Cloud, run it from the Commands tab).
 */
class BackupsRestoreCommand extends Command
{
    protected $signature = 'backups:restore {id : The backup id, e.g. 20261113-020000-ab12} {--force : Do not ask}';

    protected $description = 'Restore a database backup (a safety backup of the current data is made first)';

    public function handle(DatabaseBackups $backups): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to restore into the test database ({$database}).");

            return self::FAILURE;
        }
        $m = $backups->find((string) $this->argument('id'));
        if (! $m || $m['status'] !== 'completed') {
            $this->error('No finished backup with that id. The admin Backups page lists them.');

            return self::FAILURE;
        }

        $this->warn("This replaces every table in {$database} with backup {$m['id']} ({$m['rows']} rows, made {$m['started_at']}).");
        if (! $this->option('force') && ! $this->confirm('Restore it?')) {
            return self::FAILURE;
        }

        $this->line('Making a safety backup of the current data first...');
        $safety = $backups->start(null, 'pre-restore');
        $safety = $backups->runToEnd($safety['id']);
        if ($safety['status'] !== 'completed') {
            $this->error('The safety backup failed, so nothing was restored: ' . ($safety['error'] ?? ''));

            return self::FAILURE;
        }
        $this->line("Safety backup: {$safety['id']}");

        $count = 0;
        foreach ($backups->statements($m) as $statement) {
            DB::unprepared($statement);
            if (++$count % 200 === 0) {
                $this->output->write('.');
            }
        }
        $this->newLine();
        $this->info("Restored {$m['id']}: {$count} statements. If the app is newer than the backup, run php artisan migrate --force next.");

        return self::SUCCESS;
    }
}
