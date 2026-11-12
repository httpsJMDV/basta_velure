# Admin: database backups

The admin **Backups** page (`/admin/backups`, under Settings in the sidebar) and the commands behind it. Service:
`App\Services\Backups\DatabaseBackups`; controller: `AdminBackupController`; tests: `tests/Feature/AdminBackupTest.php`.

## What a backup is

A plain MySQL dump (for each table `DROP TABLE IF EXISTS`, `CREATE TABLE`, then multi-row `INSERT`s, one statement per
line), gzip-compressed, on the private `local` disk (an R2 bucket on Laravel Cloud) under `backups/<id>/`:
`manifest.json` and the dump in parts (`part-0000.sql.gz`, ...). The download joins the parts into one standard
`.sql.gz`, so `gunzip -c file.sql.gz | mysql -u USER -p DATABASE` loads it.

Left out on purpose: `cache`, `cache_locks`, `sessions`, `jobs`, `job_batches`, `personal_access_tokens` (they rebuild
themselves; people sign in again). Uploaded files live in the storage buckets and are not part of a database backup.

Id: `YYYYMMDD-HHMMSS-xxxx` in Manila time (`\d{8}-\d{6}-[a-z0-9]{4}`); anything else is a 404.

## Made in steps

Laravel Cloud ends a web request after **20 seconds**, so a backup is made in steps of a few seconds; the cursor (table,
last id or offset) is kept in the manifest. The website calls `continue` until the status is `completed`. A backup
nobody has moved for 10 minutes is `stalled` and can be resumed (`continue`) or deleted. Only one backup runs at a time.

## Endpoints (`auth:sanctum`, `role:admin`)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/backups` | `data[]` (newest first) and `meta {database {name, tables, rows, size_bytes}, storage {location, bytes, count}, schedule {time, timezone, keep_daily, keep_weekly, keep_manual_days}, scheduler {running, last_seen_at}, skipped_tables[]}` |
| POST | `/admin/backups` | Starts a manual backup and makes its first step. 201 `{data}`; **409** `{message, data}` with the backup already running. Throttle 10/min |
| POST | `/admin/backups/{id}/continue` | The next step (about 8 s). 200 `{data}`; 404 unknown id |
| GET | `/admin/backups/{id}/download` | `application/gzip`, `loved-it-backup-<id>.sql.gz`; **409** when not finished |
| DELETE | `/admin/backups/{id}` | **422** for the newest finished backup (always kept), **409** while it is being made |

A backup row: `id, status (running|completed|failed|stalled), trigger (manual|scheduled|pre-restore), created_by,
started_at, finished_at, duration_seconds, tables, tables_done, current_table, rows, bytes, progress (0-100), error`.

Start, download and delete are written to the admin activity log (`create_backup`, `download_backup`,
`delete_backup`; area `backups`).

## Schedule and keep rules

`backups:run` runs every night at **2:00 AM Asia/Manila** (routes/console.php), then `prune()`: the 7 newest automatic
backups, the newest of each week for 4 weeks, manual ones for 30 days; failed or abandoned ones after a day. The newest
finished backup is never removed. With the scheduler off, nightly backups wait (the page says so).

## Commands

- `php artisan backups:run [--manual]`: a whole backup in one go, then the keep rules.
- `php artisan backups:restore <id> [--force]`: makes a `pre-restore` backup of the current data first, then runs the
  backup's statements against the app's database (every table in the backup is replaced). Refuses `_test` databases.
  On Laravel Cloud run it from the environment's Commands tab. Afterwards: `php artisan migrate --force` if the app is
  newer than the backup.
