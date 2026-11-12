<?php

namespace App\Services\Backups;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Database backups (the admin Backups page, `php artisan backups:run`, `backups:restore`).
 *
 * A backup is a plain MySQL dump (DROP / CREATE TABLE, then INSERTs, one statement per line), gzip-compressed and kept
 * on the private "local" disk (an R2 bucket on Laravel Cloud) under backups/<id>/: a manifest.json and the dump in
 * parts (part-0000.sql.gz, part-0001.sql.gz, ...). The download joins them into one .sql.gz file.
 *
 * It is made in steps: each step dumps rows for a few seconds and writes one part, and the cursor (table, last id) is
 * kept in the manifest. The website's "Back up now" calls one step per request, because a request on Laravel Cloud is
 * cut off after 20 seconds; the scheduler and the command run every step in one go.
 *
 * Left out on purpose: the cache, sessions, queue and sign-in token tables (they rebuild themselves or are only
 * valid for minutes). Uploaded files (product photos, IDs, receipts) live in the storage buckets, not in the database.
 */
class DatabaseBackups
{
    public const DISK = 'local';

    public const DIR = 'backups';

    /** Tables that are not worth restoring: they rebuild themselves or only matter for minutes. */
    public const SKIPPED_TABLES = ['cache', 'cache_locks', 'sessions', 'jobs', 'job_batches', 'personal_access_tokens'];

    public const ID_PATTERN = '/^\d{8}-\d{6}-[a-z0-9]{4}$/';

    /** How many automatic (daily) backups are kept, and for how many weeks a Sunday one is kept beyond that. */
    public const KEEP_DAILY = 7;

    public const KEEP_WEEKLY = 4;

    /** A backup made by hand is kept this many days. */
    public const KEEP_MANUAL_DAYS = 30;

    private const ROWS_PER_QUERY = 1000;

    private const ROWS_PER_INSERT = 200;

    /** A part is written once this much SQL has been gathered, even inside a step. */
    private const PART_BYTES = 6_000_000;

    // ── Making one ─────────────────────────────────────────────────────────

    /** Starts a backup: the table list, the manifest and the header part. Refused while another one is running. */
    public function start(?User $by, string $trigger): array
    {
        $running = collect($this->all())->first(fn (array $b) => $b['status'] === 'running' && ! $this->stale($b));
        if ($running) {
            throw new BackupConflict('A backup is already being made. Wait for it to finish.', $running);
        }

        $now = Carbon::now('Asia/Manila');
        $id = $now->format('Ymd-His') . '-' . Str::lower(Str::random(4));
        $tables = $this->tables();

        $manifest = [
            'id'          => $id,
            'status'      => 'running',
            'trigger'     => $trigger,
            'created_by'  => $by ? ['id' => $by->id, 'name' => trim($by->first_name . ' ' . $by->last_name)] : null,
            'database'    => DB::connection()->getDatabaseName(),
            'started_at'  => now()->toIso8601String(),
            'finished_at' => null,
            'tables'      => array_map(fn ($t) => ['name' => $t['name'], 'estimate' => $t['rows'], 'rows' => 0, 'done' => false], $tables),
            'cursor'      => ['table' => 0, 'after' => null, 'offset' => 0, 'created' => false],
            'parts'       => [],
            'bytes'       => 0,
            'rows'        => 0,
            'error'       => null,
        ];

        $header = "-- Loved-IT database backup {$id}\n"
            . '-- Database: ' . $manifest['database'] . ', made ' . $now->format('Y-m-d H:i:s') . " (Asia/Manila), {$trigger}\n"
            . "-- Restore: php artisan backups:restore {$id} --force, or: gunzip -c <file>.sql.gz | mysql -u <user> -p <database>\n"
            . "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n";
        $this->writePart($manifest, $header);
        $this->save($manifest);

        return $manifest;
    }

    /** Dumps rows for about $seconds and writes them as the next part; finishes the backup after the last table. */
    public function step(string $id, float $seconds = 8.0): array
    {
        $lock = Cache::lock("backup-step:{$id}", 60);
        if (! $lock->get()) {
            return $this->find($id) ?? throw new RuntimeException('Backup not found.');
        }

        try {
            $m = $this->find($id) ?? throw new RuntimeException('Backup not found.');
            if ($m['status'] !== 'running') {
                return $m;
            }

            try {
                $deadline = microtime(true) + $seconds;
                $sql = '';
                $pdo = DB::connection()->getPdo();

                while ($m['cursor']['table'] < count($m['tables']) && microtime(true) < $deadline && strlen($sql) < self::PART_BYTES) {
                    $t = &$m['tables'][$m['cursor']['table']];
                    $table = $t['name'];
                    if (! $m['cursor']['created']) {
                        $create = (array) DB::selectOne('SHOW CREATE TABLE `' . str_replace('`', '``', $table) . '`');
                        $sql .= "\nDROP TABLE IF EXISTS `{$table}`;\n" . str_replace("\n", ' ', (string) ($create['Create Table'] ?? array_values($create)[1])) . ";\n";
                        $m['cursor']['created'] = true;
                    }

                    $byId = $this->hasIntegerId($table);
                    $rows = $byId
                        ? DB::table($table)->when($m['cursor']['after'] !== null, fn ($q) => $q->where('id', '>', $m['cursor']['after']))->orderBy('id')->limit(self::ROWS_PER_QUERY)->get()
                        : DB::table($table)->offset($m['cursor']['offset'])->limit(self::ROWS_PER_QUERY)->get();

                    if ($rows->isEmpty()) {
                        $t['done'] = true;
                        $m['cursor'] = ['table' => $m['cursor']['table'] + 1, 'after' => null, 'offset' => 0, 'created' => false];
                        unset($t);
                        continue;
                    }

                    foreach ($rows->chunk(self::ROWS_PER_INSERT) as $chunk) {
                        $columns = array_keys((array) $chunk->first());
                        $values = $chunk->map(fn ($row) => '(' . implode(',', array_map(fn ($v) => $this->value($pdo, $v), array_values((array) $row))) . ')');
                        $sql .= 'INSERT INTO `' . $table . '` (`' . implode('`,`', $columns) . '`) VALUES ' . $values->implode(',') . ";\n";
                    }
                    $t['rows'] += $rows->count();
                    $m['rows'] += $rows->count();
                    if ($byId) {
                        $m['cursor']['after'] = $rows->last()->id;
                    } else {
                        $m['cursor']['offset'] += $rows->count();
                    }
                    unset($t);
                }

                if ($m['cursor']['table'] >= count($m['tables'])) {
                    $sql .= "\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n-- End of backup {$m['id']}\n";
                    $m['status'] = 'completed';
                    $m['finished_at'] = now()->toIso8601String();
                }
                if ($sql !== '') {
                    $this->writePart($m, $sql);
                }
            } catch (\Throwable $e) {
                $m['status'] = 'failed';
                $m['error'] = Str::limit($e->getMessage(), 300);
                $m['finished_at'] = now()->toIso8601String();
                report($e);
            }

            $this->save($m);

            return $m;
        } finally {
            $lock->release();
        }
    }

    /** Every step in one go (the scheduler and the command). */
    public function runToEnd(string $id, ?callable $progress = null): array
    {
        do {
            $m = $this->step($id, 30.0);
            if ($progress) {
                $progress($m);
            }
        } while ($m['status'] === 'running');

        return $m;
    }

    // ── Reading them ───────────────────────────────────────────────────────

    /** @return array<int, array<string, mixed>> newest first */
    public function all(): array
    {
        $disk = Storage::disk(self::DISK);
        $out = [];
        foreach ($disk->directories(self::DIR) as $dir) {
            $id = basename($dir);
            if (preg_match(self::ID_PATTERN, $id) && ($m = $this->find($id))) {
                $out[] = $m;
            }
        }
        usort($out, fn ($a, $b) => strcmp($b['id'], $a['id']));

        return $out;
    }

    public function find(string $id): ?array
    {
        if (! preg_match(self::ID_PATTERN, $id)) {
            return null;
        }
        $json = Storage::disk(self::DISK)->get(self::DIR . "/{$id}/manifest.json");
        $m = $json ? json_decode($json, true) : null;

        return is_array($m) ? $m : null;
    }

    /**
     * The backup as one .sql.gz download. The parts are re-packed into a single gzip stream as they are sent, because
     * some Windows tools only open the first member of a multi-member .gz file.
     */
    public function download(array $m): StreamedResponse
    {
        $disk = Storage::disk(self::DISK);

        return response()->streamDownload(function () use ($disk, $m) {
            $gzip = deflate_init(ZLIB_ENCODING_GZIP, ['level' => 6]);
            foreach ($m['parts'] as $part) {
                $sql = gzdecode((string) $disk->get(self::DIR . "/{$m['id']}/{$part}"));
                echo deflate_add($gzip, $sql === false ? '' : $sql, ZLIB_NO_FLUSH);
            }
            echo deflate_add($gzip, '', ZLIB_FINISH);
        }, "loved-it-backup-{$m['id']}.sql.gz", ['Content-Type' => 'application/gzip']);
    }

    /** The SQL of a finished backup, one statement at a time (for backups:restore). */
    public function statements(array $m): \Generator
    {
        $disk = Storage::disk(self::DISK);
        foreach ($m['parts'] as $part) {
            $sql = gzdecode((string) $disk->get(self::DIR . "/{$m['id']}/{$part}"));
            if ($sql === false) {
                throw new RuntimeException("Part {$part} of backup {$m['id']} is damaged.");
            }
            foreach (explode("\n", $sql) as $line) {
                $line = trim($line);
                if ($line !== '' && ! str_starts_with($line, '--')) {
                    yield $line;
                }
            }
        }
    }

    public function delete(string $id): void
    {
        if (preg_match(self::ID_PATTERN, $id)) {
            Storage::disk(self::DISK)->deleteDirectory(self::DIR . "/{$id}");
        }
    }

    /**
     * Keeps the newest KEEP_DAILY automatic backups, one per week (the newest of each week) for KEEP_WEEKLY weeks, and
     * manual ones for KEEP_MANUAL_DAYS days; a failed or stuck backup goes after a day. The newest finished backup is
     * never removed. Returns the ids removed.
     *
     * @return array<int, string>
     */
    public function prune(): array
    {
        $all = $this->all();
        $newestDone = collect($all)->firstWhere('status', 'completed')['id'] ?? null;
        $keep = [];
        $auto = array_values(array_filter($all, fn ($b) => $b['status'] === 'completed' && $b['trigger'] !== 'manual'));
        foreach (array_slice($auto, 0, self::KEEP_DAILY) as $b) {
            $keep[$b['id']] = true;
        }
        $weeks = [];
        foreach ($auto as $b) {
            $week = Carbon::parse($b['started_at'])->timezone('Asia/Manila')->format('o-W');
            if (! isset($weeks[$week]) && count($weeks) < self::KEEP_WEEKLY) {
                $weeks[$week] = true;
                $keep[$b['id']] = true;
            }
        }

        $removed = [];
        foreach ($all as $b) {
            $age = Carbon::parse($b['started_at'])->diffInDays(now());
            $drop = match (true) {
                $b['id'] === $newestDone, isset($keep[$b['id']]) => false,
                $b['status'] === 'running' => $this->stale($b) && $age >= 1,
                $b['status'] === 'failed' => $age >= 1,
                $b['trigger'] === 'manual' => $age >= self::KEEP_MANUAL_DAYS,
                default => true,
            };
            if ($drop) {
                $this->delete($b['id']);
                $removed[] = $b['id'];
            }
        }

        return $removed;
    }

    /** The database now: its size and how many tables and rows a backup would hold. */
    public function databaseSummary(): array
    {
        $tables = $this->tables();
        $size = (int) DB::table('information_schema.tables')->where('table_schema', DB::connection()->getDatabaseName())->sum(DB::raw('data_length + index_length'));

        return ['name' => DB::connection()->getDatabaseName(), 'tables' => count($tables), 'rows' => array_sum(array_column($tables, 'rows')), 'size_bytes' => $size];
    }

    /** A running backup nobody has moved on for 10 minutes was abandoned (the admin closed the page). */
    public function stale(array $m): bool
    {
        return $m['status'] === 'running' && Carbon::parse($m['updated_at'] ?? $m['started_at'])->lt(now()->subMinutes(10));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /** @return array<int, array{name: string, rows: int}> the tables a backup holds, by name */
    private function tables(): array
    {
        $estimates = DB::table('information_schema.tables')
            ->where('table_schema', DB::connection()->getDatabaseName())->where('table_type', 'BASE TABLE')
            // MySQL 8 names information_schema columns in capitals, so they are aliased.
            ->selectRaw('TABLE_NAME as name, TABLE_ROWS as n')->pluck('n', 'name');

        return collect($estimates)->keys()
            ->reject(fn ($t) => in_array($t, self::SKIPPED_TABLES, true))
            ->sort()->values()
            ->map(fn ($t) => ['name' => (string) $t, 'rows' => (int) $estimates[$t]])
            ->all();
    }

    private function hasIntegerId(string $table): bool
    {
        static $cache = [];

        return $cache[$table] ??= (bool) DB::table('information_schema.columns')
            ->where('table_schema', DB::connection()->getDatabaseName())->where('table_name', $table)
            ->where('column_name', 'id')->where('column_key', 'PRI')
            ->whereIn('data_type', ['int', 'bigint', 'mediumint', 'smallint', 'tinyint'])->exists();
    }

    /** One value as SQL: NULL, or a quoted string (bytes that are not text as hex), so a newline never ends a line. */
    private function value(\PDO $pdo, mixed $v): string
    {
        if ($v === null) {
            return 'NULL';
        }
        if (is_bool($v)) {
            return $v ? '1' : '0';
        }
        if (is_int($v) || is_float($v)) {
            return (string) $v;
        }
        $s = (string) $v;
        if (! mb_check_encoding($s, 'UTF-8')) {
            return '0x' . bin2hex($s);
        }

        return str_replace(["\n", "\r"], ['\\n', '\\r'], $pdo->quote($s));
    }

    private function writePart(array &$m, string $sql): void
    {
        $name = sprintf('part-%04d.sql.gz', count($m['parts']));
        $gz = gzencode($sql, 6);
        Storage::disk(self::DISK)->put(self::DIR . "/{$m['id']}/{$name}", $gz);
        $m['parts'][] = $name;
        $m['bytes'] += strlen($gz);
    }

    private function save(array $m): void
    {
        $m['updated_at'] = now()->toIso8601String();
        Storage::disk(self::DISK)->put(self::DIR . "/{$m['id']}/manifest.json", json_encode($m, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
}
