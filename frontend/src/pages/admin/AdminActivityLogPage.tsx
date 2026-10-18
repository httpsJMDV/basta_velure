import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity, ShieldAlert, UserCheck, UserX, Store, Truck, Warehouse, RotateCcw, FolderPlus, Tags, Trash2, Percent,
  FileText, BadgeCheck, Scale, CalendarDays, CalendarClock, ClipboardCheck, ChevronRight, Braces, ArrowUpRight,
} from 'lucide-react';
import { getActivityLogApi } from '../../api/client';
import type { ActivityArea, ActivityLogEntry, ActivityLogSummary } from '../../types';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  FilterPanel, SearchField, StatusTabs, ListCard, ListPager, ListError, ListEmpty, Avatar, useDebouncedSearch, type ListMeta,
} from '../../components/admin/listKit';
import CustomSelect from '../../components/ui/CustomSelect';
import { SidePanel } from '../../components/ui/Overlay';
import { useMountAnim } from '../../hooks/useDashboardAnimations';

const TZ = 'Asia/Manila';

type Tone = 'emerald' | 'rose' | 'red' | 'blue' | 'violet' | 'amber' | 'gray';
const TONE: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
};

/** Every action the admin pages record, in words. */
const ACTIONS: Record<string, { label: string; icon: React.ElementType; tone: Tone }> = {
  approve_buyer: { label: 'Buyer approved', icon: UserCheck, tone: 'emerald' },
  reject_buyer: { label: 'Buyer rejected', icon: UserX, tone: 'rose' },
  approve_seller: { label: 'Seller approved', icon: Store, tone: 'emerald' },
  reject_seller: { label: 'Seller rejected', icon: Store, tone: 'rose' },
  approve_courier: { label: 'Courier approved', icon: Truck, tone: 'emerald' },
  reject_courier: { label: 'Courier rejected', icon: Truck, tone: 'rose' },
  suspend_courier: { label: 'Courier suspended', icon: ShieldAlert, tone: 'red' },
  reactivate_courier: { label: 'Courier reactivated', icon: RotateCcw, tone: 'blue' },
  approve_sorting_center: { label: 'Hub approved', icon: Warehouse, tone: 'emerald' },
  reject_sorting_center: { label: 'Hub rejected', icon: Warehouse, tone: 'rose' },
  suspend_sorting_center: { label: 'Hub suspended', icon: ShieldAlert, tone: 'red' },
  reactivate_sorting_center: { label: 'Hub reactivated', icon: RotateCcw, tone: 'blue' },
  suspend_user: { label: 'Account suspended', icon: ShieldAlert, tone: 'red' },
  reactivate_user: { label: 'Account reactivated', icon: RotateCcw, tone: 'blue' },
  create_category: { label: 'Category added', icon: FolderPlus, tone: 'violet' },
  update_category: { label: 'Category changed', icon: Tags, tone: 'violet' },
  delete_category: { label: 'Category deleted', icon: Trash2, tone: 'rose' },
  update_commission: { label: 'Commission changed', icon: Percent, tone: 'amber' },
  update_return_policy: { label: 'Return policy changed', icon: FileText, tone: 'amber' },
  confirm_commission: { label: 'Commission payment confirmed', icon: BadgeCheck, tone: 'emerald' },
  resolve_dispute: { label: 'Dispute decided', icon: Scale, tone: 'blue' },
};

function actionInfo(action: string) {
  return ACTIONS[action] ?? { label: action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), icon: Activity, tone: 'gray' as Tone };
}

const AREAS: { value: '' | ActivityArea; label: string }[] = [
  { value: '', label: 'Everything' },
  { value: 'applications', label: 'Applications' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'catalog', label: 'Categories' },
  { value: 'money', label: 'Commission & policy' },
  { value: 'disputes', label: 'Disputes' },
  { value: 'other', label: 'Other' },
];

const PERIODS = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

/** What a log entry points at, and where the admin manages it. */
const TARGETS: Record<string, { label: string; to: string }> = {
  user: { label: 'Account', to: '/admin/buyers' },
  seller_profile: { label: 'Seller', to: '/admin/sellers' },
  logistics_company: { label: 'Courier', to: '/admin/courier-applications' },
  sorting_center: { label: 'Hub', to: '/admin/sorting-center-applications' },
  category: { label: 'Category', to: '/admin/categories' },
  dispute: { label: 'Case', to: '/admin/disputes' },
  platform_setting: { label: 'Setting', to: '/admin/settings' },
  commission_payment: { label: 'Commission payment', to: '/admin/payments' },
};

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}

function dayLabel(key: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  const date = new Date(`${key}T12:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
  return key === today ? `Today · ${date}` : key === yesterday ? `Yesterday · ${date}` : date;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: TZ });
const adminName = (e: ActivityLogEntry) => (e.admin?.first_name ? `${e.admin.first_name} ${e.admin.last_name ?? ''}`.trim() : 'System');

function humanKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\bid\b/i, 'ID').replace(/^\w/, (c) => c.toUpperCase());
}

function humanValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function TargetChip({ e, link = true }: { e: ActivityLogEntry; link?: boolean }) {
  if (!e.target_type) return null;
  const t = TARGETS[e.target_type] ?? { label: humanKey(e.target_type), to: '' };
  const text = `${t.label}${e.target_id ? ` #${e.target_id}` : ''}`;
  const cls = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-600';
  return t.to && link
    ? <Link to={t.to} className={`${cls} hover:border-brand-red/40 hover:text-brand-red`}>{text}<ArrowUpRight className="w-3 h-3" aria-hidden="true" /></Link>
    : <span className={cls}>{text}</span>;
}

function DetailPanel({ entry, onClose }: { entry: ActivityLogEntry | null; onClose: () => void }) {
  const [raw, setRaw] = useState(false);
  useEffect(() => setRaw(false), [entry]);
  if (!entry) return null;
  const info = actionInfo(entry.action);
  const Icon = info.icon;
  const meta = entry.meta ?? {};

  return (
    <SidePanel open onClose={onClose} title={info.label} subtitle={`Entry #${entry.id}`} width="max-w-lg">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-xl ring-1 flex items-center justify-center shrink-0 ${TONE[info.tone]}`}><Icon className="w-5 h-5" aria-hidden="true" /></span>
          <p className="text-[14px] leading-relaxed text-gray-800">{entry.description}</p>
        </div>

        <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200/80 text-[13px]">
          {[
            ['Done by', <span key="a" className="flex items-center gap-2"><Avatar name={adminName(entry)} size="sm" />{adminName(entry)}</span>],
            ['When', stamp(entry.created_at)],
            ['About', entry.target_type ? <TargetChip key="t" e={entry} /> : 'Loved-IT as a whole'],
            ['Action code', <code key="c" className="text-[12px] text-gray-500">{entry.action}</code>],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-semibold text-gray-900 text-right min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        {Object.keys(meta).length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">Details</h3>
              <button type="button" onClick={() => setRaw((r) => !r)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 hover:text-brand-red">
                <Braces className="w-3.5 h-3.5" aria-hidden="true" /> {raw ? 'Show as a list' : 'Show raw data'}
              </button>
            </div>
            {raw ? (
              <pre className="p-3 overflow-x-auto text-[11.5px] leading-relaxed rounded-xl bg-neutral-900 text-emerald-300 whitespace-pre-wrap break-all">{JSON.stringify(meta, null, 2)}</pre>
            ) : (
              <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200/80 text-[13px]">
                {Object.entries(meta).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3.5 py-2.5">
                    <dt className="text-gray-500">{humanKey(k)}</dt>
                    <dd className="font-medium text-gray-900 break-words">{humanValue(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}
      </div>
    </SidePanel>
  );
}

const PER_PAGE = [15, 30, 50, 100];

export default function AdminActivityLogPage() {
  const [params, setParams] = useSearchParams();
  const area = params.get('area') ?? '';
  const adminId = params.get('admin') ?? '';
  const period = params.get('period') ?? '';
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? 1);
  const perPage = Number(params.get('per_page') ?? 30);

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [summary, setSummary] = useState<ActivityLogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<ActivityLogEntry | null>(null);
  const pageRef = useMountAnim();

  const update = useCallback((changes: Record<string, string>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    });
  }, [setParams]);

  const [searchInput, setSearchInput] = useDebouncedSearch(search, (v) => update({ search: v }));

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getActivityLogApi({
      area: area || undefined, admin_id: adminId ? Number(adminId) : undefined, period: period || undefined,
      search: search || undefined, page, per_page: perPage,
    })
      .then((res) => { setLogs(res.data); setMeta(res.meta as unknown as ListMeta); setSummary(res.summary); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [area, adminId, period, search, page, perPage]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const groups: { key: string; entries: ActivityLogEntry[] }[] = [];
    for (const e of logs) {
      const key = dayKey(e.created_at);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.entries.push(e);
      else groups.push({ key, entries: [e] });
    }
    return groups;
  }, [logs]);

  const filtered = !!(area || adminId || period || search);
  const clear = () => update({ area: '', admin: '', period: '', search: '' });

  return (
    <div ref={pageRef} className="w-full pb-8 space-y-4">
      <PageHero icon={Activity} eyebrow="Admin / Settings" title="Activity log"
        subtitle="Every decision an admin made on Loved-IT: what changed, who did it and when." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary === null ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={Activity} label="All entries" value={summary.total} subtext="Since the log began" iconBg="bg-gray-100" iconColor="text-gray-700"
              onClick={clear} active={!filtered} actionLabel="Show everything" />
            <StatCard icon={CalendarDays} label="Today" value={summary.today} subtext="Philippine time" iconBg="bg-rose-50" iconColor="text-brand-red"
              onClick={() => update({ period: period === 'today' ? '' : 'today' })} active={period === 'today'} actionLabel="Show today" />
            <StatCard icon={CalendarClock} label="Last 7 days" value={summary.week} subtext="Including today" iconBg="bg-blue-50" iconColor="text-blue-600"
              onClick={() => update({ period: period === '7d' ? '' : '7d' })} active={period === '7d'} actionLabel="Show the week" />
            <StatCard icon={ClipboardCheck} label="Applications reviewed" value={summary.areas.applications ?? 0} subtext="Buyers, sellers, couriers and hubs"
              iconBg="bg-emerald-50" iconColor="text-emerald-600" onClick={() => update({ area: area === 'applications' ? '' : 'applications' })} active={area === 'applications'} actionLabel="Show applications" />
          </>
        )}
      </div>

      <FilterPanel>
        <StatusTabs
          label="Area"
          value={area as '' | ActivityArea}
          onChange={(v) => update({ area: v })}
          options={AREAS.filter((a) => a.value !== 'other' || (summary?.areas.other ?? 0) > 0).map((a) => ({
            value: a.value, label: a.label, count: summary ? (a.value ? summary.areas[a.value] ?? 0 : summary.total) : null,
          }))}
        />
        <div className="flex flex-col gap-2 md:flex-row">
          <SearchField value={searchInput} onChange={setSearchInput} label="Search the log" placeholder="Search what happened, e.g. a shop or category name" />
          <div className="grid grid-cols-2 gap-2 md:w-[420px] shrink-0">
            <CustomSelect value={adminId} onChange={(v) => update({ admin: v })}
              options={[{ value: '', label: 'Every admin' }, ...(summary?.admins ?? []).map((a) => ({ value: String(a.id), label: a.name }))]} />
            <CustomSelect value={period} onChange={(v) => update({ period: v })} options={PERIODS} />
          </div>
        </div>
      </FilterPanel>

      {failed ? <ListError message="The activity log could not be loaded." onRetry={load} /> : (
        <ListCard title="Entries" count={meta?.total} busy={loading}>
          {loading && logs.length === 0 ? (
            <ul aria-busy="true" className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex gap-3 px-4 py-3.5 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-gray-100" />
                  <div className="flex-1 space-y-2"><div className="w-40 h-3 bg-gray-100 rounded" /><div className="w-3/4 h-3 bg-gray-100 rounded" /></div>
                </li>
              ))}
            </ul>
          ) : logs.length === 0 ? (
            <ListEmpty icon={Activity} title="Nothing recorded yet" hint="Approvals, suspensions, category and commission changes, and dispute decisions show here."
              filtered={filtered} onClear={clear} />
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>
              {days.map((d) => (
                <section key={d.key} aria-label={dayLabel(d.key)}>
                  <h3 className="sticky top-0 z-[1] px-4 py-1.5 bg-gray-50/95 backdrop-blur border-y border-gray-100 text-[11px] font-bold text-gray-500">{dayLabel(d.key)}</h3>
                  <ol className="relative">
                    {d.entries.map((e) => {
                      const info = actionInfo(e.action);
                      const Icon = info.icon;
                      return (
                        <li key={e.id} className="relative">
                          <button type="button" onClick={() => setOpen(e)}
                            className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-red-50/30 focus:outline-none focus-visible:bg-red-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red">
                            <span className={`mt-0.5 w-9 h-9 rounded-xl ring-1 flex items-center justify-center shrink-0 ${TONE[info.tone]}`}><Icon className="w-4 h-4" aria-hidden="true" /></span>
                            <span className="flex-1 min-w-0">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[13px] font-bold text-gray-900">{info.label}</span>
                                <TargetChip e={e} link={false} />
                              </span>
                              <span className="block mt-0.5 text-[12.5px] leading-snug text-gray-600">{e.description}</span>
                              <span className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-gray-400">
                                <span className="font-semibold text-gray-600">{adminName(e)}</span>
                                <span aria-hidden="true">·</span>
                                <time dateTime={e.created_at} title={stamp(e.created_at)}>{time(e.created_at)}</time>
                              </span>
                            </span>
                            <ChevronRight className="w-4 h-4 mt-2.5 text-gray-300 group-hover:text-brand-red shrink-0" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
          {meta && (
            <ListPager meta={meta} perPage={perPage} perPageOptions={PER_PAGE} noun={['entry', 'entries']}
              onPage={(p) => update({ page: String(p) })} onPerPage={(n) => update({ per_page: n === 30 ? '' : String(n) })} />
          )}
        </ListCard>
      )}

      <DetailPanel entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}
