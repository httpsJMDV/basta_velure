<?php

namespace App\Http\Controllers\Api\V1;

use App\Console\Commands\CheckSchedulerRunning;
use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Services\Backups\BackupConflict;
use App\Services\Backups\DatabaseBackups;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The admin Backups page (docs/api/admin-backups.md): the list, "Back up now" (made one short step per request, since
 * Laravel Cloud ends a request after 20 seconds), download and delete. Every action is in the admin activity log.
 */
class AdminBackupController extends Controller
{
    public function __construct(private readonly DatabaseBackups $backups) {}

    /** GET /admin/backups */
    public function index(): JsonResponse
    {
        $all = $this->backups->all();
        $done = array_values(array_filter($all, fn ($b) => $b['status'] === 'completed'));
        $heartbeat = Cache::get(CheckSchedulerRunning::HEARTBEAT_KEY);

        return response()->json([
            'data' => array_map(fn ($m) => $this->present($m), $all),
            'meta' => [
                'database' => $this->backups->databaseSummary(),
                'storage' => [
                    'location' => laravel_cloud() ? 'Private storage bucket on Laravel Cloud (Cloudflare R2)' : 'This server: storage/app/private/backups',
                    'bytes' => array_sum(array_column($done, 'bytes')),
                    'count' => count($done),
                ],
                'schedule' => [
                    'time' => '02:00', 'timezone' => 'Asia/Manila',
                    'keep_daily' => DatabaseBackups::KEEP_DAILY, 'keep_weekly' => DatabaseBackups::KEEP_WEEKLY,
                    'keep_manual_days' => DatabaseBackups::KEEP_MANUAL_DAYS,
                ],
                'scheduler' => [
                    'running' => $heartbeat !== null && Carbon::parse($heartbeat)->gt(now()->subMinutes(3)),
                    'last_seen_at' => $heartbeat,
                ],
                'skipped_tables' => DatabaseBackups::SKIPPED_TABLES,
            ],
        ]);
    }

    /** POST /admin/backups: starts a backup and makes its first step; the page then calls continue until it is done. */
    public function store(Request $request): JsonResponse
    {
        try {
            $m = $this->backups->start($request->user(), 'manual');
        } catch (BackupConflict $e) {
            return response()->json(['message' => $e->getMessage(), 'data' => $this->present($e->running)], 409);
        }
        AdminActivityLog::log($request->user()->id, 'create_backup', "Started database backup {$m['id']}", 'backup', self::targetId($m['id']), ['backup' => $m['id']]);
        $m = $this->backups->step($m['id'], 6.0);

        return response()->json(['message' => 'Backup started.', 'data' => $this->present($m)], 201);
    }

    /** POST /admin/backups/{id}/continue: the next step (about 8 seconds of rows). */
    public function continue(string $id): JsonResponse
    {
        $m = $this->backups->find($id);
        abort_unless($m, 404, 'Backup not found.');

        return response()->json(['data' => $this->present($this->backups->step($id, 8.0))]);
    }

    /** GET /admin/backups/{id}/download: the whole .sql.gz file. */
    public function download(Request $request, string $id): StreamedResponse|JsonResponse
    {
        $m = $this->backups->find($id);
        abort_unless($m, 404, 'Backup not found.');
        if ($m['status'] !== 'completed') {
            return response()->json(['message' => 'This backup is not finished, so it cannot be downloaded.'], 409);
        }
        AdminActivityLog::log($request->user()->id, 'download_backup', "Downloaded database backup {$id}", 'backup', self::targetId($id), ['backup' => $id]);

        return $this->backups->download($m);
    }

    /** DELETE /admin/backups/{id}. The newest finished backup is always kept. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $m = $this->backups->find($id);
        abort_unless($m, 404, 'Backup not found.');
        if ($m['status'] === 'running' && ! $this->backups->stale($m)) {
            return response()->json(['message' => 'This backup is still being made.'], 409);
        }
        $newest = collect($this->backups->all())->firstWhere('status', 'completed');
        if ($newest && $newest['id'] === $id) {
            return response()->json(['message' => 'The newest finished backup is always kept. Make a new one first if you need to remove this one.'], 422);
        }
        $this->backups->delete($id);
        AdminActivityLog::log($request->user()->id, 'delete_backup', "Deleted database backup {$id}", 'backup', self::targetId($id), ['backup' => $id]);

        return response()->json(['message' => 'Backup deleted.']);
    }

    /** The activity log wants a number: the backup's date and time, 20261113020000. */
    private static function targetId(string $id): int
    {
        return (int) preg_replace('/D/', '', substr($id, 0, 15));
    }

    private function present(array $m): array
    {
        $estimate = array_sum(array_column($m['tables'], 'estimate'));
        $done = count(array_filter($m['tables'], fn ($t) => $t['done']));
        $status = $this->backups->stale($m) ? 'stalled' : $m['status'];
        $current = $m['tables'][$m['cursor']['table']]['name'] ?? null;

        return [
            'id' => $m['id'],
            'status' => $status,
            'trigger' => $m['trigger'],
            'created_by' => $m['created_by']['name'] ?? null,
            'started_at' => $m['started_at'],
            'finished_at' => $m['finished_at'],
            'duration_seconds' => $m['finished_at'] ? Carbon::parse($m['started_at'])->diffInSeconds(Carbon::parse($m['finished_at'])) : null,
            'tables' => count($m['tables']),
            'tables_done' => $done,
            'current_table' => $status === 'running' ? $current : null,
            'rows' => $m['rows'],
            'bytes' => $m['bytes'],
            'progress' => $m['status'] === 'completed' ? 100 : (int) min(99, round(($m['rows'] / max(1, $estimate)) * 100)),
            'error' => $m['error'],
        ];
    }
}
