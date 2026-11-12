import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import {
  DatabaseBackup, Download, Trash2, RefreshCw, ShieldCheck, Clock, Database, CalendarClock, AlertTriangle,
  CheckCircle2, Lock, Server, Play, FileArchive, ListChecks, LifeBuoy,
} from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import { ListError, Pill, SkeletonRows, TH, TD, relativeTime } from '../../components/admin/listKit';
import { Dialog, BUTTON } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import {
  continueBackupApi, deleteBackupApi, downloadBackup, getBackupsApi, startBackupApi,
  type Backup, type BackupsMeta,
} from '../../api/backups';

const TZ = 'Asia/Manila';

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function when(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function duration(s: number | null): string {
  if (s === null) return '—';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const TRIGGER: Record<string, { label: string; tone: 'blue' | 'violet' | 'gray' }> = {
  scheduled: { label: 'Daily', tone: 'blue' },
  manual: { label: 'Manual', tone: 'violet' },
  'pre-restore': { label: 'Before restore', tone: 'gray' },
};

const STATUS: Record<Backup['status'], { label: string; tone: 'emerald' | 'amber' | 'red' | 'gray' }> = {
  completed: { label: 'Ready', tone: 'emerald' },
  running: { label: 'In progress', tone: 'amber' },
  stalled: { label: 'Stopped', tone: 'gray' },
  failed: { label: 'Failed', tone: 'red' },
};

function errorMessage(e: unknown, fallback: string): string {
  return (axios.isAxiosError(e) && e.response?.data?.message) || fallback;
}

/** A white card with a small heading, like every admin panel. */
function Panel({ icon: Icon, title, hint, children, className = '' }: { icon: React.ElementType; title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-gray-200 rounded-2xl ${className}`}>
      <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
        <span className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0"><Icon className="w-4 h-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="block mt-1.5 px-3 py-2 rounded-lg bg-gray-900 text-gray-100 text-[11.5px] font-mono leading-relaxed overflow-x-auto whitespace-pre">{children}</code>;
}

export default function AdminBackupsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Backup[] | null>(null);
  const [meta, setMeta] = useState<BackupsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** When the list was loaded: "Last backup" is green when it is at most 26 hours older than this. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [active, setActive] = useState<Backup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Backup | null>(null);
  const alive = useRef(true);
  const looping = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await getBackupsApi();
      if (!alive.current) return;
      setItems(res.data);
      setMeta(res.meta);
      setLoadedAt(Date.now());
      setError(null);
    } catch (e) {
      if (alive.current) setError(errorMessage(e, 'The backups could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  /** Moves a backup on one short step at a time (the server stops a request after 20 seconds) until it is done. */
  const drive = useCallback(async (start: Backup) => {
    if (looping.current) return;
    looping.current = true;
    let b = start;
    setActive(b);
    try {
      while (alive.current && (b.status === 'running' || b.status === 'stalled')) {
        b = await continueBackupApi(b.id);
        if (alive.current) setActive(b);
      }
      if (!alive.current) return;
      if (b.status === 'completed') showToast(`Backup ready: ${bytes(b.bytes)}, ${b.rows.toLocaleString()} rows.`, 'success');
      else showToast(`The backup failed: ${b.error ?? 'unknown error'}`, 'error');
    } catch (e) {
      if (alive.current) showToast(errorMessage(e, 'The backup stopped. Press Resume to carry on.'), 'error');
    } finally {
      looping.current = false;
      if (alive.current) {
        setActive(null);
        void load();
      }
    }
  }, [load, showToast]);

  const backUpNow = async () => {
    try {
      const b = await startBackupApi();
      void drive(b);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.data) {
        showToast('A backup is already being made. Showing its progress.', 'success');
        void drive(e.response.data.data as Backup);
      } else {
        showToast(errorMessage(e, 'The backup could not be started.'), 'error');
      }
    }
  };

  const download = async (b: Backup) => {
    setBusyId(b.id);
    try {
      await downloadBackup(b.id);
    } catch {
      showToast('The download failed. Try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    const b = confirmDelete;
    if (!b) return;
    setBusyId(b.id);
    try {
      await deleteBackupApi(b.id);
      showToast('Backup deleted.', 'success');
      setConfirmDelete(null);
      void load();
    } catch (e) {
      showToast(errorMessage(e, 'The backup could not be deleted.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const last = items?.find((b) => b.status === 'completed') ?? null;
  const lastAgeHours = last ? (loadedAt - new Date(last.finished_at ?? last.started_at).getTime()) / 3_600_000 : null;
  const fresh = lastAgeHours !== null && lastAgeHours <= 26;
  const working = active !== null;

  return (
    <div className="space-y-5">
      <PageHero icon={DatabaseBackup} eyebrow="Settings" title="Database backups"
        subtitle="Private copies of the Loved-IT database: made every night, downloadable by admins, and restorable in minutes.">
        <button type="button" onClick={() => void backUpNow()} disabled={working}
          className="min-h-11 inline-flex items-center gap-2 px-4 rounded-xl bg-white text-gray-900 text-xs font-bold hover:bg-gray-100 disabled:opacity-60 transition-colors">
          {working ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <DatabaseBackup className="w-4 h-4" aria-hidden="true" />}
          {working ? 'Backing up…' : 'Back up now'}
        </button>
      </PageHero>

      {/* ── A backup being made ── */}
      {active && (
        <section className="bg-white border border-amber-200 rounded-2xl px-5 py-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-gray-900">Backing up {meta?.database.name ?? 'the database'}</p>
            <p className="text-xs text-gray-500 tabular-nums">{active.progress}%</p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={active.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-red transition-[width] duration-500" style={{ width: `${Math.max(3, active.progress)}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-600 tabular-nums">
            Table {Math.min(active.tables_done + 1, active.tables)} of {active.tables}
            {active.current_table && <> · <span className="font-mono">{active.current_table}</span></>}
            {' · '}{active.rows.toLocaleString()} rows · {bytes(active.bytes)}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">Keep this page open. The backup is made in short steps; if you leave, press Resume on it later.</p>
        </section>
      )}

      {/* ── Health ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {!items || !meta ? (
          [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={fresh ? ShieldCheck : AlertTriangle} label="Last backup"
              value={last ? relativeTime(last.finished_at ?? last.started_at) : 'None yet'}
              subtext={last ? `${bytes(last.bytes)} · ${last.rows.toLocaleString()} rows` : 'Press Back up now'}
              iconBg={fresh ? 'bg-emerald-50' : 'bg-amber-50'} iconColor={fresh ? 'text-emerald-600' : 'text-amber-600'} />
            <StatCard icon={CalendarClock} label="Automatic backups" value={`Daily, ${meta.schedule.time === '02:00' ? '2:00 AM' : meta.schedule.time}`}
              subtext={meta.scheduler.running ? 'Scheduler running' : 'Paused: the scheduler is off'}
              iconBg={meta.scheduler.running ? 'bg-blue-50' : 'bg-amber-50'} iconColor={meta.scheduler.running ? 'text-blue-600' : 'text-amber-600'} />
            <StatCard icon={FileArchive} label="Backups kept" value={meta.storage.count} subtext={`${bytes(meta.storage.bytes)} in private storage`}
              iconBg="bg-violet-50" iconColor="text-violet-600" />
            <StatCard icon={Database} label="Database now" value={bytes(meta.database.size_bytes)}
              subtext={`${meta.database.tables} tables · ${meta.database.rows.toLocaleString()} rows`} iconBg="bg-gray-100" iconColor="text-gray-600" />
          </>
        )}
      </div>

      {meta && !meta.scheduler.running && (
        <p className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          The scheduler is off, so tonight's automatic backup will not run. Use Back up now before any important change until it is on again.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── The backups ── */}
        <section className="lg:col-span-2 self-start bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Backups</h2>
              <p className="text-xs text-gray-500">Newest first. Times are Philippine time.</p>
            </div>
            <button type="button" onClick={() => void load()} className="min-h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
            </button>
          </header>

          {error ? (
            <div className="p-5"><ListError message={error} onRetry={() => void load()} /></div>
          ) : !items ? (
            <table className="w-full"><tbody><SkeletonRows cols={5} rows={4} /></tbody></table>
          ) : items.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileArchive className="w-8 h-8 mx-auto text-gray-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-gray-800">No backups yet</p>
              <p className="text-xs text-gray-500">Press Back up now to make the first one. It takes about a minute.</p>
            </div>
          ) : (
            <>
              {/* Phones: one card per backup */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {items.map((b) => (
                  <li key={b.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{when(b.started_at)}</p>
                        <p className="text-[11px] text-gray-500 font-mono truncate">{b.id}</p>
                      </div>
                      <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>
                    </div>
                    <p className="mt-1 text-xs text-gray-600 tabular-nums">{(TRIGGER[b.trigger] ?? TRIGGER.manual).label} · {bytes(b.bytes)} · {b.rows.toLocaleString()} rows</p>
                    <RowActions b={b} busy={busyId === b.id} working={working} onDownload={download} onDelete={setConfirmDelete} onResume={drive} />
                  </li>
                ))}
              </ul>

              {/* Wider screens: a table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>Backup</th>
                      <th className={TH}>Type</th>
                      <th className={`${TH} text-right`}>Size</th>
                      <th className={`${TH} text-right`}>Rows</th>
                      <th className={`${TH} text-right`}>Took</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/60">
                        <td className={TD}>
                          <p className="font-semibold text-gray-900 whitespace-nowrap">{when(b.started_at)}</p>
                          <p className="text-[11px] text-gray-500"><span className="font-mono">{b.id}</span>{b.created_by && <> · by {b.created_by}</>}</p>
                          {b.error && <p className="text-[11px] text-red-700 mt-0.5">{b.error}</p>}
                        </td>
                        <td className={TD}><Pill tone={(TRIGGER[b.trigger] ?? TRIGGER.manual).tone}>{(TRIGGER[b.trigger] ?? TRIGGER.manual).label}</Pill></td>
                        <td className={`${TD} text-right tabular-nums text-gray-700 whitespace-nowrap`}>{bytes(b.bytes)}</td>
                        <td className={`${TD} text-right tabular-nums text-gray-700`}>{b.rows.toLocaleString()}</td>
                        <td className={`${TD} text-right tabular-nums text-gray-500`}>{duration(b.duration_seconds)}</td>
                        <td className={TD}><Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill></td>
                        <td className={`${TD} text-right`}>
                          <RowActions b={b} busy={busyId === b.id} working={working} onDownload={download} onDelete={setConfirmDelete} onResume={drive} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ── Side facts ── */}
        <div className="space-y-5">
          <Panel icon={Clock} title="Recovery targets" hint="What a restore can promise with nightly backups.">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data at risk</dt>
                <dd className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">≤ 24 h</dd>
                <dd className="text-[11.5px] text-gray-500 leading-snug">At most one day of changes (RPO). A manual backup before risky work brings it to zero.</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Back online</dt>
                <dd className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">≈ 1 h</dd>
                <dd className="text-[11.5px] text-gray-500 leading-snug">From deciding to restore to the site working again (RTO), with the steps below.</dd>
              </div>
            </dl>
          </Panel>

          <Panel icon={FileArchive} title="What a backup holds">
            <ul className="space-y-1.5 text-[12.5px] text-gray-700">
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" aria-hidden="true" />Every table: accounts, shops, products, orders, payments, parcels, hubs, riders, reviews, messages, settings and the migration list.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" aria-hidden="true" />A plain MySQL file (.sql.gz) that any MySQL server can load.</li>
              <li className="flex gap-2"><span className="w-4 h-4 shrink-0 text-center text-gray-400 font-bold">–</span>Left out on purpose: {meta ? meta.skipped_tables.join(', ') : 'cache, sessions and queue tables'}. They rebuild themselves; people simply sign in again.</li>
              <li className="flex gap-2"><span className="w-4 h-4 shrink-0 text-center text-gray-400 font-bold">–</span>Uploaded photos and documents are not in the file: they stay in the storage buckets, which a database restore does not touch.</li>
            </ul>
          </Panel>

          <Panel icon={Lock} title="Where backups are kept">
            <p className="text-[12.5px] text-gray-700">{meta?.storage.location ?? '…'}</p>
            <ul className="mt-2 space-y-1 text-[12px] text-gray-500 list-disc pl-4">
              <li>Private: no public link exists; only admins can list or download them.</li>
              <li>Every download and delete is written to the Activity Log.</li>
              <li>The newest finished backup can never be deleted.</li>
            </ul>
          </Panel>
        </div>
      </div>

      {/* ── The plan ── */}
      <section className="bg-white border border-gray-200 rounded-2xl">
        <header className="px-5 pt-4 pb-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">The backup plan</h2>
          <p className="text-xs text-gray-500">How Loved-IT keeps its data safe, and what to do when something goes wrong.</p>
        </header>

        <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <div className="px-5 py-4 space-y-5">
            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><CalendarClock className="w-4 h-4 text-gray-500" aria-hidden="true" /> 1. When backups are made and how long they are kept</h3>
              <table className="mt-2 w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-gray-500">
                    <th className="py-1.5 font-semibold">Kind</th><th className="py-1.5 font-semibold">When</th><th className="py-1.5 font-semibold">Kept</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  <tr><td className="py-1.5 font-semibold text-gray-900">Daily</td><td className="py-1.5">Every night, 2:00 AM</td><td className="py-1.5">{meta?.schedule.keep_daily ?? 7} newest</td></tr>
                  <tr><td className="py-1.5 font-semibold text-gray-900">Weekly</td><td className="py-1.5">The newest daily of each week</td><td className="py-1.5">{meta?.schedule.keep_weekly ?? 4} weeks</td></tr>
                  <tr><td className="py-1.5 font-semibold text-gray-900">Manual</td><td className="py-1.5">Back up now, before risky work</td><td className="py-1.5">{meta?.schedule.keep_manual_days ?? 30} days</td></tr>
                  <tr><td className="py-1.5 font-semibold text-gray-900">Before restore</td><td className="py-1.5">Made by the restore itself</td><td className="py-1.5">Like a daily one</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11.5px] text-gray-500">Old backups are removed after each nightly run. Failed or abandoned ones go after a day.</p>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><Server className="w-4 h-4 text-gray-500" aria-hidden="true" /> 2. Three copies, two places, one off-site (3-2-1)</h3>
              <ol className="mt-2 space-y-2 text-[12.5px] text-gray-700">
                <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span><span><b className="text-gray-900">The live database</b> on Laravel Cloud, which the site uses.</span></li>
                <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span><span><b className="text-gray-900">The backups on this page</b>, in a separate private storage bucket.</span></li>
                <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span><span><b className="text-gray-900">An off-site copy</b>: every Friday, download the newest backup and keep it in the team's Google Drive (and on the development PC under <span className="font-mono">C:\Projects\db-backups</span>). If the cloud account is ever lost, this copy still exists.</span></li>
              </ol>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><ListChecks className="w-4 h-4 text-gray-500" aria-hidden="true" /> 3. Routine</h3>
              <ul className="mt-2 divide-y divide-gray-100 text-[12.5px]">
                <li className="py-1.5 flex gap-3"><span className="w-24 shrink-0 font-semibold text-gray-900">Every day</span><span className="text-gray-700">Automatic. Glance at "Last backup": it should be green and from last night.</span></li>
                <li className="py-1.5 flex gap-3"><span className="w-24 shrink-0 font-semibold text-gray-900">Every Friday</span><span className="text-gray-700">Download the newest backup to Google Drive. Delete downloaded copies older than a month.</span></li>
                <li className="py-1.5 flex gap-3"><span className="w-24 shrink-0 font-semibold text-gray-900">Every month</span><span className="text-gray-700">Test a restore on a PC (section 4, step 2). A backup that was never restored is only a hope.</span></li>
                <li className="py-1.5 flex gap-3"><span className="w-24 shrink-0 font-semibold text-gray-900">Before risky work</span><span className="text-gray-700">Press Back up now before updates with database changes, bulk edits, data imports and demos.</span></li>
              </ul>
            </div>
          </div>

          <div className="px-5 py-4 space-y-5">
            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><LifeBuoy className="w-4 h-4 text-gray-500" aria-hidden="true" /> 4. How to restore</h3>
              <ol className="mt-2 space-y-3 text-[12.5px] text-gray-700 list-decimal pl-5">
                <li><b className="text-gray-900">Pick the backup.</b> Choose the newest one made <i>before</i> the problem started. Write down its id.</li>
                <li>
                  <b className="text-gray-900">Try it on a PC first.</b> Download it, then in Git Bash:
                  <Code>{'mysql -u root -e "CREATE DATABASE velure_restore"\ngunzip -c loved-it-backup-<id>.sql.gz | mysql -u root velure_restore'}</Code>
                  <span className="block mt-1 text-[11.5px] text-gray-500">Check that the users, products and orders counts look right.</span>
                </li>
                <li>
                  <b className="text-gray-900">Restore the live site.</b> On Laravel Cloud open the environment, then <b>Commands</b>, and run:
                  <Code>{'php artisan backups:restore <id> --force'}</Code>
                  <span className="block mt-1 text-[11.5px] text-gray-500">It first makes a "Before restore" backup of the data as it is, so the restore itself can be undone.</span>
                </li>
                <li>
                  <b className="text-gray-900">Bring the app up to date</b> if the backup is older than the latest update:
                  <Code>{'php artisan migrate --force\nphp artisan optimize:clear'}</Code>
                </li>
                <li><b className="text-gray-900">Check and tell the team.</b> Sign in as admin, open Orders and Analytics &amp; Reports, and compare with what you expect. Orders placed after the backup must be re-entered from the shops' and buyers' messages.</li>
              </ol>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><AlertTriangle className="w-4 h-4 text-gray-500" aria-hidden="true" /> 5. When something goes wrong</h3>
              <ul className="mt-2 space-y-1.5 text-[12.5px] text-gray-700 list-disc pl-5">
                <li><b className="text-gray-900">The site is down but the data is fine:</b> not a restore. Check Laravel Cloud for a failed deployment or a sleeping database first.</li>
                <li><b className="text-gray-900">Data was deleted or changed by mistake:</b> stop further changes, press Back up now (to keep the evidence), then restore the last good backup.</li>
                <li><b className="text-gray-900">A bad update:</b> roll back the deployment on Laravel Cloud; restore only if the update changed data.</li>
              </ul>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><ShieldCheck className="w-4 h-4 text-gray-500" aria-hidden="true" /> 6. Keep backups safe</h3>
              <ul className="mt-2 space-y-1.5 text-[12.5px] text-gray-700 list-disc pl-5">
                <li>A backup holds names, addresses, phone numbers and password hashes. Treat it like the database itself.</li>
                <li>Never put a backup in GitHub (the repository is public), a group chat or an email.</li>
                <li>Delete downloaded copies you no longer need, and keep the Google Drive folder shared with admins only.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete this backup?"
        footer={<>
          <button type="button" className={BUTTON.ghost} onClick={() => setConfirmDelete(null)}>Keep it</button>
          <button type="button" className={BUTTON.danger} disabled={busyId !== null} onClick={() => void remove()}>Delete backup</button>
        </>}>
        <p className="text-sm text-gray-700">
          {confirmDelete && <>The backup from <b>{when(confirmDelete.started_at)}</b> ({bytes(confirmDelete.bytes)}) will be removed for good. </>}
          Download it first if you might still need it.
        </p>
      </Dialog>
    </div>
  );
}

function RowActions({ b, busy, working, onDownload, onDelete, onResume, compact }: {
  b: Backup; busy: boolean; working: boolean; compact?: boolean;
  onDownload: (b: Backup) => void; onDelete: (b: Backup) => void; onResume: (b: Backup) => void;
}) {
  const btn = 'min-h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50';
  return (
    <div className={`flex gap-1.5 ${compact ? 'justify-end' : 'mt-2.5'}`}>
      {b.status === 'completed' && (
        <button type="button" onClick={() => onDownload(b)} disabled={busy} className={`${btn} bg-gray-900 text-white hover:bg-gray-800`} aria-label={`Download backup ${b.id}`}>
          {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />} Download
        </button>
      )}
      {(b.status === 'stalled' || b.status === 'running') && !working && (
        <button type="button" onClick={() => onResume(b)} className={`${btn} border border-gray-200 text-gray-800 hover:bg-gray-50`}>
          <Play className="w-3.5 h-3.5" aria-hidden="true" /> Resume
        </button>
      )}
      {b.status !== 'running' && (
        <button type="button" onClick={() => onDelete(b)} disabled={busy} className={`${btn} text-gray-500 hover:text-red-700 hover:bg-red-50`} aria-label={`Delete backup ${b.id}`}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{!compact && ' Delete'}
        </button>
      )}
    </div>
  );
}

