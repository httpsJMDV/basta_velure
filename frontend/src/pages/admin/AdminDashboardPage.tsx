import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { getAdminStatsApi, getAdminDashboardFeedApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { useCountUp } from '../../hooks/useDashboardAnimations';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import type { AdminStats, DashboardFeed, DashboardChartPoint, DashboardAttentionItem } from '../../types';
import { NA, peso, whole, percent, reportsHref, percentChange } from '../../utils/adminReports';
import { ChartEmptyState, HERO_BUTTON, LiveStamp } from '../../components/admin/dashboardKit';
import type { AdminOutletContext } from './AdminLayout';
import { adminQueues } from './adminQueues';
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, BarChart2, CheckCircle2, Clock, History, Minus,
} from 'lucide-react';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart } from 'recharts';

// The admin home: what happened in the last 30 days, and what is waiting for Loved-IT right now. Figures come from the
// same service as Analytics & Reports (GET /admin/stats, /admin/dashboard-feed); the work queue reads the sidebar's
// counts (GET /admin/nav-counts) so the two never disagree. The page refreshes itself once a minute.

const TZ = 'Asia/Manila';
const REFRESH_MS = 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A Manila calendar day as YYYY-MM-DD. */
function manilaDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return manilaDay(d);
}

/** Monday of the Manila week that holds `day`. */
function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00+08:00`).getUTCDay(); // 0 = Sunday
  return shiftDay(day, -((weekday + 6) % 7));
}

function chartDateLabel(iso: string) {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: TZ });
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-PH', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "3 d 4 h" for how long something has waited. */
function waited(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (Number.isNaN(mins)) return '';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

function initials(name: string): string {
  const parts = name.replace(/^Dispute on #/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <section className={`bg-white border border-gray-200/80 rounded-2xl shadow-xs flex flex-col min-w-0 ${className}`}>{children}</section>;
}

function CardHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
      <div className="min-w-0">
        <h2 className="text-[11px] font-bold tracking-wider text-gray-800 uppercase">{title}</h2>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

function CardLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-red hover:text-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 rounded">
      {children} <ArrowRight className="w-3 h-3" aria-hidden="true" />
    </Link>
  );
}

function Change({ current, previous }: { current: number | null | undefined; previous: number | null | undefined }) {
  // Nothing to compare against: say so instead of a made-up "+100%".
  if (previous === 0 && (current ?? 0) > 0) return <span className="text-[11px] text-gray-400">None in the prior 30 days</span>;
  const change = percentChange(current, previous);
  if (!change) return <span className="text-[11px] text-gray-400">{NA} vs prior 30 days</span>;
  if (change.dir === 'flat') {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500"><Minus className="w-3 h-3" aria-hidden="true" /> Same as prior 30 days</span>;
  }
  const up = change.dir === 'up';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-700' : 'text-rose-600'}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {up ? '+' : '−'}{change.pct}% <span className="font-normal text-gray-400">vs prior 30 days</span>
    </span>
  );
}

/** A 30-day line under a figure. Decorative: the figure and the chart below carry the numbers. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <div className="h-7 border-b border-dashed border-gray-200" aria-hidden="true" />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-7" aria-hidden="true">
      <polygon points={`0,${h} ${points.join(' ')} ${w},${h}`} fill={color} opacity={0.08} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Header band ──────────────────────────────────────────────────────────────

function Header({ name, waiting, queues, updatedAt }: { name: string; waiting: number | null; queues: number; updatedAt: Date | null }) {
  // The day of the last refresh (shown once the figures are in).
  const today = updatedAt ? updatedAt.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ }) : '';
  return (
    <div
      className="rounded-2xl px-4 py-4 sm:px-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm border border-neutral-800"
      style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">Admin console{today && ` · ${today}`}</p>
        <h1 className="mt-1 text-base font-bold tracking-tight sm:text-lg">{greeting()}, {name || 'Administrator'}</h1>
        <p className="text-[12px] text-neutral-400 mt-0.5">
          {waiting === null
            ? 'Checking what is waiting for you…'
            : waiting === 0
              ? 'Nothing is waiting for you. Every queue is clear.'
              : `${whole(waiting)} item${waiting === 1 ? '' : 's'} waiting for you across ${queues} queue${queues === 1 ? '' : 's'}.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <LiveStamp updatedAt={updatedAt} />
        <Link to="/admin/reports" className={HERO_BUTTON}><BarChart2 className="w-4 h-4" aria-hidden="true" /> Reports</Link>
        <Link to="/admin/activity-log" className={HERO_BUTTON}><History className="w-4 h-4" aria-hidden="true" /> Activity log</Link>
      </div>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function Kpi({ className = '', label, value, money, to, change, spark, color, foot }: {
  className?: string;
  label: string;
  value: number | null | undefined;
  money?: boolean;
  to: string;
  change?: React.ReactNode;
  spark?: number[];
  color: string;
  foot?: string;
}) {
  const animated = useCountUp(value ?? 0);
  const shown = value === null || value === undefined ? NA : money ? peso(animated) : whole(animated);
  return (
    <Link to={to} className={`group flex flex-col gap-1.5 p-4 min-w-0 border-gray-100 hover:bg-gray-50/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red/40 ${className}`} title="Open in Analytics & Reports">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase truncate">{label}</span>
        <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-red transition-colors shrink-0" aria-hidden="true" />
      </div>
      <p className="text-xl font-black leading-none tracking-tight text-gray-900 sm:text-2xl tabular-nums truncate">{shown}</p>
      <div className="min-h-[16px]">{change}</div>
      {spark ? <Sparkline values={spark} color={color} /> : <p className="h-7 flex items-end text-[11px] text-gray-400 truncate">{foot}</p>}
    </Link>
  );
}

function KpiStrip({ stats, chart }: { stats: AdminStats; chart: DashboardChartPoint[] }) {
  const m = stats.metrics;
  const p = stats.previous;
  const series = (key: 'gmv' | 'orders' | 'commission') => chart.map((d) => Number(d[key] ?? 0));
  return (
    <section aria-label="Last 30 days" className="grid grid-cols-1 sm:grid-cols-2 overflow-hidden bg-white border shadow-xs lg:grid-cols-4 border-gray-200/80 rounded-2xl">
      <Kpi className="border-b sm:border-r lg:border-b-0" label="Gross sales (GMV)" value={m?.gmv} money to={reportsHref(stats.window, 'sales')} color="#C0001A"
        change={<Change current={m?.gmv} previous={p?.gmv} />} spark={series('gmv')} />
      <Kpi className="border-b lg:border-b-0 lg:border-r" label="Net commission" value={m?.commission} money to={reportsHref(stats.window, 'commission')} color="#059669"
        change={<Change current={m?.commission} previous={p?.commission} />} spark={series('commission')} />
      <Kpi className="border-b sm:border-b-0 sm:border-r" label="Orders" value={m?.orders} to={reportsHref(stats.window, 'orders')} color="#7C3AED"
        change={<Change current={m?.orders} previous={p?.orders} />} spark={series('orders')} />
      <Kpi label="Active buyers" value={m?.active_buyers} to={reportsHref(stats.window, 'activity')} color="#4F46E5"
        change={<Change current={m?.active_buyers} previous={p?.active_buyers} />}
        foot={m ? `${whole(m.active_sellers)} shops sold · ${whole(stats.total_buyers)} buyer accounts` : undefined} />
    </section>
  );
}

// ─── Sales trend ──────────────────────────────────────────────────────────────

type ChartRange = 7 | 14 | 30;
type MetricView = 'gmv' | 'orders' | 'commission';

const METRICS: Record<MetricView, { tab: string; title: string; color: string; format: (v: number) => string }> = {
  gmv: { tab: 'GMV', title: 'Gross sales', color: '#C0001A', format: (v) => peso(v) },
  orders: { tab: 'Orders', title: 'Orders', color: '#7C3AED', format: (v) => whole(v) },
  commission: { tab: 'Commission', title: 'Net commission', color: '#059669', format: (v) => peso(v) },
};

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex p-0.5 text-[11px] font-bold border bg-gray-100/80 rounded-lg border-gray-200/60">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 ${value === o.value ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TrendCard({ data, className }: { data: DashboardChartPoint[]; className?: string }) {
  const [range, setRange] = useState<ChartRange>(30);
  const [metric, setMetric] = useState<MetricView>('gmv');
  const cfg = METRICS[metric];

  const sliced = useMemo(
    () => data.slice(-range).map((d) => ({ date: d.date, value: Number(d[metric] ?? 0), label: chartDateLabel(d.date) })),
    [data, range, metric],
  );
  const total = sliced.reduce((sum, d) => sum + d.value, 0);
  const best = sliced.reduce<(typeof sliced)[number] | null>((top, d) => (!top || d.value > top.value ? d : top), null);
  const shownDays = sliced.length > 0 ? { from: sliced[0].date, to: sliced[sliced.length - 1].date } : null;
  const isEmpty = sliced.length === 0 || sliced.every((d) => d.value === 0);

  return (
    <Card className={className}>
      <CardHead title="Sales trend" sub="Daily, in Manila days; cancelled and returned orders left out">
        <Segmented label="Figure" value={metric} onChange={setMetric}
          options={(Object.keys(METRICS) as MetricView[]).map((k) => ({ value: k, label: METRICS[k].tab }))} />
      </CardHead>

      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3">
        <div className="flex items-end gap-6">
          <div>
            <p className="text-[11px] text-gray-500">{cfg.title}, last {range} days</p>
            <p className="text-lg font-black tracking-tight text-gray-900 tabular-nums">{cfg.format(total)}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[11px] text-gray-500">Best day</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{best && best.value > 0 ? `${best.label} · ${cfg.format(best.value)}` : NA}</p>
          </div>
        </div>
        <Segmented label="Days shown" value={range} onChange={setRange}
          options={[7, 14, 30].map((n) => ({ value: n as ChartRange, label: `${n} days` }))} />
      </div>

      {isEmpty ? (
        <ChartEmptyState message={`No ${cfg.title.toLowerCase()} in the last ${range} days`} />
      ) : (
        <div className="flex-1 min-h-[240px] px-2 pt-2 select-none [&_.recharts-surface]:outline-none">
          <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <AreaChart data={sliced} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={`dash-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cfg.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={44} allowDecimals={metric !== 'orders'}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                labelStyle={{ fontWeight: 700, color: '#111827' }}
                formatter={(v) => [cfg.format(Number(v)), cfg.title]}
              />
              {/* No draw-in animation: the page refreshes every minute and the line should not replay each time. */}
              <Area type="monotone" dataKey="value" name={cfg.title} stroke={cfg.color} strokeWidth={2} fill={`url(#dash-${metric})`} dot={false} isAnimationActive={false}
                activeDot={{ r: 4, fill: cfg.color, strokeWidth: 1.5, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 mt-auto border-t border-gray-100">
        <span className="text-[11px] text-gray-400">{shownDays ? `${chartDateLabel(shownDays.from)} to ${chartDateLabel(shownDays.to)}` : ''}</span>
        <CardLink to={reportsHref(shownDays, 'trend')}>Open these days in Reports</CardLink>
      </div>
    </Card>
  );
}

// ─── Work queue ───────────────────────────────────────────────────────────────

function WorkQueue({ counts, className }: { counts: AdminOutletContext['navCounts']; className?: string }) {
  const queues = adminQueues(counts);
  const total = queues.reduce((sum, q) => sum + q.count, 0);
  // Queues with work first, in the order the admin works them.
  const ordered = [...queues.filter((q) => q.count > 0), ...queues.filter((q) => q.count === 0)];

  return (
    <Card className={className}>
      <CardHead title="Work queue" sub="What is waiting for Loved-IT right now">
        {counts && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border tabular-nums ${total > 0 ? 'bg-rose-50 text-brand-red border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {total > 0 ? `${whole(total)} waiting` : 'All clear'}
          </span>
        )}
      </CardHead>
      {!counts ? (
        <ul className="p-2 space-y-1 animate-pulse" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <li key={i} className="h-11 rounded-xl bg-gray-50" />)}
        </ul>
      ) : (
        <ul className="p-2">
          {ordered.map(({ key, icon: Icon, title, detail, to, count }) => (
            <li key={key}>
              <Link
                to={to}
                className={`group flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 ${count === 0 ? 'opacity-60 hover:opacity-100' : ''}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${count > 0 ? 'text-gray-700' : 'text-gray-400'}`} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold text-gray-900 truncate group-hover:text-brand-red">{title}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{detail}</span>
                </span>
                {count > 0 ? (
                  <span className="min-w-[26px] h-6 px-2 rounded-full bg-brand-red text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                    {count > 99 ? '99+' : count}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Clear
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Pipeline, payments, commission ───────────────────────────────────────────

const PIPELINE_COLORS: Record<string, string> = {
  awaiting_confirmation: '#F59E0B',
  processing:            '#3B82F6',
  hub_first_mile:        '#8B5CF6',
  out_for_delivery:      '#F97316',
  delivered_completed:   '#10B981',
  cancelled_problem:     '#EF4444',
};

function PipelineCard({ stats }: { stats: AdminStats }) {
  const pipeline = stats.pipeline;
  const groups = pipeline?.groups ?? [];
  const total = pipeline?.total ?? 0;

  return (
    <Card>
      <CardHead title="Order pipeline" sub="Orders placed in the last 30 days, by where they are now">
        <span className="text-[11px] font-bold text-gray-700 tabular-nums">{pipeline ? whole(total) : NA}</span>
      </CardHead>
      <div className="flex-1 px-4 py-3">
        {!pipeline ? (
          <ChartEmptyState message={`Pipeline ${NA}`} />
        ) : total === 0 ? (
          <ChartEmptyState message="No orders placed in the last 30 days" />
        ) : (
          <>
            <div className="flex w-full h-2.5 overflow-hidden rounded-full bg-gray-100" role="img"
              aria-label={groups.map((g) => `${g.label}: ${g.count}`).join(', ')}>
              {groups.filter((g) => g.count > 0).map((g) => (
                <div key={g.key} className="h-full" style={{ width: `${(g.count / total) * 100}%`, background: PIPELINE_COLORS[g.key] ?? '#9CA3AF' }} />
              ))}
            </div>
            <dl className="mt-3 divide-y divide-gray-50">
              {groups.map((g) => (
                <div key={g.key} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                  <dt className="flex items-center gap-2 min-w-0 text-gray-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIPELINE_COLORS[g.key] ?? '#9CA3AF' }} aria-hidden="true" />
                    <span className="truncate">{g.label}</span>
                  </dt>
                  <dd className="flex items-center gap-2 tabular-nums">
                    <span className="font-bold text-gray-900">{whole(g.count)}</span>
                    <span className="w-9 text-right text-[11px] text-gray-400">{Math.round((g.count / total) * 100)}%</span>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
      <div className="px-4 py-3 mt-auto border-t border-gray-100"><CardLink to={reportsHref(stats.window, 'pipeline')}>View in Reports</CardLink></div>
    </Card>
  );
}

function PaymentsCard({ stats }: { stats: AdminStats }) {
  const split = stats.payment_split;
  const rows = split ? [
    { key: 'gcash', label: 'GCash', color: '#2563EB', ...split.gcash },
    { key: 'cod', label: 'Cash on delivery', color: '#059669', ...split.cod },
    ...(split.e_wallet_card && split.e_wallet_card.count > 0 ? [{ key: 'gateway', label: 'E-wallet or card', color: '#9CA3AF', ...split.e_wallet_card }] : []),
  ] : [];
  const volume = rows.reduce((sum, r) => sum + r.volume, 0);

  return (
    <Card>
      <CardHead title="How buyers paid" sub="Orders that count, last 30 days">
        <span className="text-[11px] font-bold text-gray-700 tabular-nums">{split ? `${whole(split.total_orders)} orders` : NA}</span>
      </CardHead>
      <div className="flex-1 px-4 py-3">
        {!split || volume === 0 ? (
          <ChartEmptyState message="No paid orders in the last 30 days" />
        ) : (
          <>
            <div className="flex w-full h-2.5 overflow-hidden rounded-full bg-gray-100" role="img"
              aria-label={rows.map((r) => `${r.label}: ${percent(Math.round((r.volume / volume) * 100))}`).join(', ')}>
              {rows.map((r) => <div key={r.key} className="h-full" style={{ width: `${(r.volume / volume) * 100}%`, background: r.color }} />)}
            </div>
            <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${Math.min(rows.length, 2)}, minmax(0, 1fr))` }}>
              {rows.map((r) => (
                <div key={r.key} className="p-2.5 rounded-xl border border-gray-100 bg-gray-50/60 min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} aria-hidden="true" />
                    <span className="truncate">{r.label}</span>
                    <span className="ml-auto text-gray-400 tabular-nums">{Math.round((r.volume / volume) * 100)}%</span>
                  </p>
                  <p className="mt-1 text-sm font-black text-gray-900 tabular-nums truncate">{peso(r.volume)}</p>
                  <p className="text-[11px] text-gray-400 tabular-nums">{whole(r.count)} order{r.count === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="px-4 py-3 mt-auto border-t border-gray-100"><CardLink to={reportsHref(stats.window, 'payments')}>View in Reports</CardLink></div>
    </Card>
  );
}

function CommissionCard({ stats }: { stats: AdminStats }) {
  const today = manilaDay();
  const monthStart = `${today.slice(0, 8)}01`;
  const rows = [
    { label: 'Today', value: stats.commission_today, to: reportsHref({ from: today, to: today }, 'commission') },
    { label: 'This week', value: stats.commission_this_week, to: reportsHref({ from: weekStart(today), to: today }, 'commission') },
    { label: 'This month', value: stats.commission_this_month, to: reportsHref({ from: monthStart, to: today }, 'commission') },
    { label: 'Last 30 days', value: stats.metrics?.commission, to: reportsHref(stats.window, 'commission') },
    { label: 'All time', value: stats.commission_lifetime, to: '/admin/reports?range=all#commission' },
  ];
  const rate = stats.metrics?.avg_commission_rate;

  return (
    <Card>
      <CardHead title="Commission earned" sub="Stored fees on orders that count">
        <span className="text-[11px] text-gray-500">Avg rate <span className="font-bold text-gray-800 tabular-nums">{rate === null || rate === undefined ? NA : percent(rate)}</span></span>
      </CardHead>
      <ul className="flex-1 px-2 py-2">
        {rows.map((r) => (
          <li key={r.label}>
            <Link to={r.to} className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[12.5px] hover:bg-gray-50 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40">
              <span className="text-gray-600 group-hover:text-gray-900">{r.label}</span>
              <span className="font-bold text-gray-900 tabular-nums">{peso(r.value)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-4 py-3 mt-auto border-t border-gray-100"><CardLink to={reportsHref(stats.window, 'commission')}>View in Reports</CardLink></div>
    </Card>
  );
}

// ─── Waiting longest, recent activity ─────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  seller_application: 'Seller application',
  buyer_application: 'Buyer ID check',
  product_approval: 'Product on hold',
  dispute: 'Dispute',
};

function WaitingCard({ items, className }: { items: DashboardAttentionItem[]; className?: string }) {
  const oldest = [...items].sort((a, b) => new Date(a.waiting_since).getTime() - new Date(b.waiting_since).getTime()).slice(0, 8);
  return (
    <Card className={className}>
      <CardHead title="Waiting longest" sub="Oldest first; over 48 hours is marked" />
      {oldest.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-1.5 py-10 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" aria-hidden="true" />
          <p className="text-xs font-semibold text-gray-700">Nothing is waiting</p>
          <p className="text-[11px] text-gray-400">No applications, held products or disputes.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {oldest.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <Link to={item.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/80 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red/40">
                <Avatar url={item.avatar_url} name={item.label} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold text-gray-900 truncate group-hover:text-brand-red">{item.label}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{TYPE_LABEL[item.type] ?? item.sub}{item.sub && TYPE_LABEL[item.type] ? ` · ${item.sub}` : ''}</span>
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums shrink-0 ${item.urgent ? 'text-rose-600' : 'text-gray-500'}`}>
                  <Clock className="w-3 h-3" aria-hidden="true" /> {waited(item.waiting_since)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className="object-cover w-8 h-8 border rounded-lg border-gray-200/80 shrink-0" />;
  }
  return (
    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-bold shrink-0" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function ActivityCard({ activities, className }: { activities: DashboardFeed['recent_activity']; className?: string }) {
  return (
    <Card className={className}>
      <CardHead title="Recent admin activity"><CardLink to="/admin/activity-log">Full log</CardLink></CardHead>
      {activities.length === 0 ? (
        <ChartEmptyState message="No admin actions recorded yet" />
      ) : (
        <ol className="px-4 py-2">
          {activities.map((a, i) => (
            <li key={a.id} className="relative flex gap-3 py-2">
              {i < activities.length - 1 && <span className="absolute left-[3px] top-5 bottom-[-8px] w-px bg-gray-100" aria-hidden="true" />}
              <span className="w-[7px] h-[7px] mt-1.5 rounded-full bg-gray-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[12.5px] text-gray-800 leading-snug">{a.description}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  <span className="font-semibold text-gray-500">{[a.admin.first_name, a.admin.last_name].filter(Boolean).join(' ') || 'System'}</span>
                  {' · '}<time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString('en-PH', { timeZone: TZ })}>{ago(a.created_at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-white border border-gray-200/80 rounded-2xl animate-pulse ${className}`} aria-hidden="true" />;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { navCounts } = useOutletContext<AdminOutletContext>();
  const userName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '';
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [feed, setFeed] = useState<DashboardFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // `quiet` is the live refresh: no skeletons, and a failed attempt keeps what is shown.
  const load = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setFailed(false); }
    Promise.all([getAdminStatsApi(), getAdminDashboardFeedApi()])
      .then(([s, f]) => { setStats(s); setFeed(f); setUpdatedAt(new Date()); setFailed(false); })
      .catch(() => { if (!quiet) setFailed(true); })
      .finally(() => { if (!quiet) setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), REFRESH_MS);

  const queues = adminQueues(navCounts);
  const waiting = navCounts ? queues.reduce((sum, q) => sum + q.count, 0) : null;
  const openQueues = queues.filter((q) => q.count > 0).length;

  return (
    <div className="pb-8 space-y-4">
      <Header name={userName} waiting={waiting} queues={openQueues} updatedAt={updatedAt} />

      {failed && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
          <span>The dashboard figures could not be loaded.</span>
          <button type="button" onClick={() => load()} className="px-3 py-1 text-xs font-bold text-white rounded-lg bg-brand-red hover:bg-brand-red-dark">Try again</button>
        </div>
      )}

      {/* Last 30 days at a glance; each figure opens the same section of Analytics & Reports */}
      {loading && !stats ? <Skeleton className="h-[148px]" /> : stats ? <KpiStrip stats={stats} chart={feed?.chart_data ?? []} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {loading && !feed ? <Skeleton className="lg:col-span-8 h-[360px]" /> : feed ? <TrendCard data={feed.chart_data} className="lg:col-span-8" /> : null}
        <WorkQueue counts={navCounts} className="lg:col-span-4" />
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PipelineCard stats={stats} />
          <PaymentsCard stats={stats} />
          <CommissionCard stats={stats} />
        </div>
      ) : null}

      {loading && !feed ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Skeleton className="lg:col-span-7 h-64" /><Skeleton className="lg:col-span-5 h-64" />
        </div>
      ) : feed ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <WaitingCard items={feed.attention_items} className="lg:col-span-7" />
          <ActivityCard activities={feed.recent_activity} className="lg:col-span-5" />
        </div>
      ) : null}
    </div>
  );
}
