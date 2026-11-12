// Database backups for the admin Backups page (docs/api/admin-backups.md).
import { http } from './client';

export type BackupStatus = 'running' | 'completed' | 'failed' | 'stalled';

export interface Backup {
  id: string;
  status: BackupStatus;
  /** manual (Back up now), scheduled (the nightly one), pre-restore (made by backups:restore before it restores). */
  trigger: 'manual' | 'scheduled' | 'pre-restore' | string;
  created_by: string | null;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  tables: number;
  tables_done: number;
  current_table: string | null;
  rows: number;
  bytes: number;
  progress: number;
  error: string | null;
}

export interface BackupsMeta {
  database: { name: string; tables: number; rows: number; size_bytes: number };
  storage: { location: string; bytes: number; count: number };
  schedule: { time: string; timezone: string; keep_daily: number; keep_weekly: number; keep_manual_days: number };
  scheduler: { running: boolean; last_seen_at: string | null };
  skipped_tables: string[];
}

export const getBackupsApi = () => http.get<{ data: Backup[]; meta: BackupsMeta }>('/admin/backups').then((r) => r.data);

export const startBackupApi = () => http.post<{ data: Backup }>('/admin/backups').then((r) => r.data.data);

export const continueBackupApi = (id: string) => http.post<{ data: Backup }>(`/admin/backups/${id}/continue`).then((r) => r.data.data);

export const deleteBackupApi = (id: string) => http.delete<{ message: string }>(`/admin/backups/${id}`).then((r) => r.data);

/** Saves the backup as loved-it-backup-<id>.sql.gz (the download needs the signed-in token, so it goes through axios). */
export async function downloadBackup(id: string): Promise<void> {
  const res = await http.get(`/admin/backups/${id}/download`, { responseType: 'blob', timeout: 120_000 });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loved-it-backup-${id}.sql.gz`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
