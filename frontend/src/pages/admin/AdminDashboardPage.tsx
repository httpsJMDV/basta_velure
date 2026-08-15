import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminStatsApi, getAdminDashboardFeedApi,
  getAdminOrderStatsApi, getAdminPaymentStatsApi,
  getAdminDisputeStatsApi, getAdminReviewStatsApi,
} from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type {
  AdminStats, DashboardFeed, DashboardChartPoint,
  AdminOrderStats, AdminPaymentStats, AdminDisputeStats, AdminReviewStats,
} from '../../types';
import {
  UserCheck, Bike, ShoppingBag,
  Users, TrendingUp, TrendingDown,
  ArrowRight, Activity, Minus,
  ShieldAlert, Star,
  Gauge, PackageCheck, Wallet, Sparkles, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, Area, AreaChart,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trend(current: number, previous: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, dir: current > 0 ? 'up' : 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function chartDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ─── Greeting ────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── GMV ring ─────────────────────────────────────────────────────────────────
// Shows weekly GMV as a circular progress ring. Goal is a rough target
// (₱50 000/week placeholder) — replace with a real config value once
// platform settings are wired up.

const WEEKLY_GMV_GOAL = 50_000;

function GmvRing({ gmvToday }: { gmvToday: number }) {
  const pct  = Math.min(Math.round((gmvToday / WEEKLY_GMV_GOAL) * 100), 100);
  const r    = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div className="relative w-[72px] h-[72px]">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <defs>
            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff6b6b" />
              <stop offset="100%" stopColor="#A32D2D" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[14px] font-black text-white leading-none">{pct}%</span>
        </div>
      </div>
      <p className="text-[10px] text-white/50 text-center leading-tight tracking-wide uppercase">GMV Goal</p>
    </div>
  );
}

// ─── Hero band ────────────────────────────────────────────────────────────────

function HeroBand({ stats, userName }: { stats: AdminStats | null; userName: string }) {
  const pendingTotal = stats
    ? stats.pending_seller_applications + stats.pending_rider_applications + stats.open_disputes
    : 0;

  const hasIssues = pendingTotal > 0;

  return (
    <div
      className="rounded-2xl px-7 py-6 flex items-center justify-between gap-6 min-h-[110px] overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
    >
      {/* subtle grid texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)',
      }} />

      <div className="relative z-10">
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-1.5">
          {greeting()}
        </p>
        <p className="text-[26px] font-black text-white leading-tight tracking-tight">{userName}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasIssues ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <p className="text-[12px] text-white/50 leading-snug">
            {stats
              ? hasIssues
                ? `${pendingTotal} item${pendingTotal !== 1 ? 's' : ''} need your attention`
                : 'All systems normal — platform is healthy'
              : 'Loading platform status…'}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-5">
        {stats && (
          <div className="hidden sm:flex flex-col items-end gap-1">
            <p className="text-[11px] text-white/30 uppercase tracking-widest">Today's GMV</p>
            <p className="text-[22px] font-black text-white leading-none">
              ₱{stats.gmv_today > 0 ? stats.gmv_today.toLocaleString('en-PH') : '0'}
            </p>
          </div>
        )}
        {stats && <GmvRing gmvToday={stats.gmv_today} />}
      </div>
    </div>
  );
}

// ─── Trend badge ──────────────────────────────────────────────────────────────

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const { pct, dir } = trend(current, previous);
  if (dir === 'flat') return (
    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
      <Minus className="w-2.5 h-2.5" /> No change vs {label}
    </span>
  );
  const up = dir === 'up';
  return (
    <span className={`text-[10px] flex items-center gap-0.5 font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '↑' : '↓'} {pct}% vs {label}
    </span>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  to?: string;
  iconBg: string;
  iconColor: string;
  trend?: React.ReactNode;
  actionItem?: boolean;
}

function MetricCard({ icon: Icon, label, value, to, iconBg, iconColor, trend: trendEl, actionItem }: MetricCardProps) {
  const inner = (
    <div className={[
      'bg-white rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 h-full',
      actionItem && Number(value) > 0
        ? 'border border-red-100 shadow-sm shadow-red-50'
        : 'border border-gray-100',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`w-[18px] h-[18px] ${iconColor}`} />
        </div>
        {actionItem && Number(value) > 0 && (
          <span className="text-[9px] font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-wide leading-none border border-red-100">
            Action
          </span>
        )}
      </div>
      <div>
        <p className={`text-3xl font-black leading-none tracking-tight ${
          actionItem && Number(value) > 0 ? 'text-brand-red' : 'text-gray-900'
        }`}>
          {value}
        </p>
        <p className="text-[11px] text-gray-400 mt-1 leading-tight font-medium">{label}</p>
        {trendEl && <div className="mt-1.5">{trendEl}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, to, icon: Icon }: { title: string; to?: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5">
        <div className="w-[3px] h-4 rounded-full bg-brand-red" />
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
        <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.1em]">{title}</h2>
      </div>
      {to && (
        <Link to={to} className="text-[11px] font-semibold text-brand-red hover:underline flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

type ChartRange = '7d' | '14d';

function TrendChart({ data }: { data: DashboardChartPoint[] }) {
  const [range, setRange] = useState<ChartRange>('14d');

  const sliced = useMemo(() => {
    const n = range === '7d' ? 7 : 14;
    return data.slice(-n).map((d) => ({ ...d, date: chartDateLabel(d.date) }));
  }, [data, range]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden h-full flex flex-col">
      {/* header band */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-gray-800">Seller Registrations</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Daily new seller trend</p>
        </div>
        <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
          {(['7d', '14d'] as ChartRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                'px-3 py-1 text-[11px] font-bold rounded-lg transition-all',
                range === r
                  ? 'bg-white text-brand-red shadow-sm border border-gray-100'
                  : 'text-gray-400 hover:text-gray-700',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 px-2 pb-3">
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={sliced} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#A32D2D" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#A32D2D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              labelStyle={{ fontWeight: 700, color: '#111' }}
            />
            <Area
              type="monotone"
              dataKey="new_sellers"
              name="New Sellers"
              stroke="#A32D2D"
              strokeWidth={2.5}
              fill="url(#chart-fill)"
              dot={false}
              activeDot={{ r: 5, fill: '#A32D2D', strokeWidth: 2, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Attention feed ───────────────────────────────────────────────────────────

function AttentionFeed({ items }: { items: DashboardFeed['attention_items'] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-8 flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <Activity className="w-5 h-5 text-emerald-500" />
        </div>
        <p className="text-sm font-bold text-gray-800 mt-1">All clear</p>
        <p className="text-xs text-gray-400">No pending items need your attention.</p>
      </div>
    );
  }

  const TYPE_META: Record<string, { label: string; bg: string; text: string }> = {
    seller_application: { label: 'Seller',  bg: 'bg-violet-50',  text: 'text-violet-600' },
    rider_application:  { label: 'Rider',   bg: 'bg-sky-50',     text: 'text-sky-600' },
    dispute:            { label: 'Dispute', bg: 'bg-red-50',     text: 'text-red-600' },
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
      {items.map((item) => {
        const meta = TYPE_META[item.type] ?? { label: item.type, bg: 'bg-gray-50', text: 'text-gray-500' };
        return (
          <Link
            key={`${item.type}-${item.id}`}
            to={item.link}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80 transition-colors group"
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}>
              <AlertTriangle className={`w-3.5 h-3.5 ${meta.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${meta.bg} ${meta.text}`}>
                  {meta.label}
                </span>
                {item.urgent && (
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">
                    &gt;48h
                  </span>
                )}
              </div>
              <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{item.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{item.sub} · {formatDate(item.waiting_since)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-brand-red transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

// ─── Orders by status bar chart ─────────────────────────────────────────────

function OrdersBreakdownCard({ stats }: { stats: AdminOrderStats }) {
  const rows: Array<{ key: string; label: string; hex: string }> = [
    { key: 'pending',          label: 'Pending',          hex: '#F59E0B' },
    { key: 'packed',           label: 'Packed',           hex: '#3B82F6' },
    { key: 'shipped',          label: 'Shipped',          hex: '#8B5CF6' },
    { key: 'out_for_delivery', label: 'Out for delivery', hex: '#F97316' },
    { key: 'delivered',        label: 'Delivered',        hex: '#10B981' },
    { key: 'cancelled',        label: 'Cancelled',        hex: '#EF4444' },
  ];
  const counts = rows.map(r => stats.by_status[r.key as never] ?? 0);
  const total  = counts.reduce((a, b) => a + b, 0) || 1;
  const max    = Math.max(...counts, 1);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.1em]">Orders by Status</p>
        <span className="text-[11px] font-semibold text-gray-400">{total} total</span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const pct = Math.round((counts[i] / total) * 100);
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-gray-600">{r.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-gray-700">{counts[i]}</span>
                  <span className="text-[10px] text-gray-400">{pct}%</span>
                </div>
              </div>
              <div className="h-[6px] bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(counts[i] / max) * 100}%`, background: r.hex }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ activeDates }: { activeDates: Set<string> }) {
  const now         = new Date();
  const year        = now.getFullYear();
  const month       = now.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr    = now.toISOString().split('T')[0];
  const monthName   = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const dayLabels   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.1em]">Activity</p>
        <p className="text-[11px] font-semibold text-gray-400">{monthName}</p>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {dayLabels.map(d => (
          <div key={d} className="text-[9px] font-bold text-gray-300 text-center pb-1">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day     = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday  = dateStr === todayStr;
          const hasOrder = activeDates.has(dateStr);
          return (
            <div
              key={day}
              className="w-[24px] h-[24px] rounded-[5px] flex items-center justify-center text-[10px] mx-auto transition-all"
              style={{
                background: isToday ? '#A32D2D' : hasOrder ? '#dcfce7' : '#f9fafb',
                color:      isToday ? '#fff'    : hasOrder ? '#15803d' : '#6b7280',
                fontWeight: isToday || hasOrder ? 700 : 400,
                boxShadow:  isToday ? '0 2px 8px rgba(163,45,45,0.35)' : 'none',
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#dcfce7]" />
          <span className="text-[10px] text-gray-400">Has orders</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-brand-red" />
          <span className="text-[10px] text-gray-400">Today</span>
        </div>
      </div>
    </div>
  );
}

// ─── Highlight stat card ──────────────────────────────────────────────────────

interface HighlightCardProps { stats: AdminStats; payStats: AdminPaymentStats | null; }
function HighlightCard({ stats, payStats }: HighlightCardProps) {
  const hasPayout = payStats && payStats.pending_payout_amount > 0;
  const value = stats.gmv_today > 0
    ? `₱${stats.gmv_today.toLocaleString('en-PH')}`
    : hasPayout
      ? `₱${payStats!.pending_payout_amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : `${stats.total_buyers.toLocaleString()}`;
  const caption = stats.gmv_today > 0
    ? 'Revenue generated today'
    : hasPayout
      ? 'Pending seller payout'
      : 'Registered buyers';
  const badge = stats.gmv_today > 0 ? "Today's GMV" : hasPayout ? 'Awaiting release' : 'Total buyers';
  const badgeClass = hasPayout && stats.gmv_today === 0
    ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';

  return (
    <Link
      to={hasPayout && stats.gmv_today === 0 ? '/admin/payments' : stats.gmv_today > 0 ? '/admin/payments' : '/admin/buyers'}
      className="rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-3 h-full relative overflow-hidden block hover:opacity-90 transition-opacity"
      style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 100%)' }}
    >
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'radial-gradient(circle at 70% 20%, #fff 0%, transparent 60%)',
      }} />
      <div className="relative z-10 w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
        {hasPayout && stats.gmv_today === 0
          ? <Wallet className="w-6 h-6 text-amber-400" />
          : <Sparkles className="w-6 h-6 text-emerald-400" />}
      </div>
      <div className="relative z-10">
        <p className="text-[28px] font-black text-white leading-tight tracking-tight">{value}</p>
        <p className="text-[11px] text-white/50 mt-1 leading-snug">{caption}</p>
      </div>
      <span className={`relative z-10 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide border ${badgeClass}`}>
        {badge}
      </span>
    </Link>
  );
}

// ─── Commerce summary cards ───────────────────────────────────────────────────

function OrdersSummaryCard({ stats }: { stats: AdminOrderStats }) {
  const statuses: Array<{ key: string; color: string }> = [
    { key: 'pending',   color: 'bg-amber-400' },
    { key: 'packed',    color: 'bg-blue-400' },
    { key: 'shipped',   color: 'bg-violet-400' },
    { key: 'delivered', color: 'bg-emerald-500' },
    { key: 'cancelled', color: 'bg-red-400' },
  ];
  const total = statuses.reduce((s, { key }) => s + (stats.by_status[key as never] ?? 0), 0) || 1;

  return (
    <Link to="/admin/orders" className="block bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-1 mb-3">
        <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
          <PackageCheck className="w-[18px] h-[18px] text-violet-500" />
        </div>
        <ArrowRight className="w-4 h-4 text-gray-200 mt-0.5" />
      </div>
      <p className="text-3xl font-black text-gray-900 leading-none">{stats.orders_today}</p>
      <p className="text-[11px] text-gray-400 mt-1 font-medium">Orders today</p>
      <div className="mt-3 flex rounded-full overflow-hidden h-1.5 gap-px">
        {statuses.map(({ key, color }) => {
          const count = stats.by_status[key as never] ?? 0;
          const pct   = (count / total) * 100;
          return pct > 0 ? (
            <div key={key} className={`${color} h-full`} style={{ width: `${pct}%` }} title={`${key}: ${count}`} />
          ) : null;
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
        {statuses.map(({ key, color }) => {
          const count = stats.by_status[key as never] ?? 0;
          return (
            <span key={key} className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
              {key} {count}
            </span>
          );
        })}
      </div>
    </Link>
  );
}

function PaymentsSummaryCard({ stats }: { stats: AdminPaymentStats }) {
  return (
    <Link to="/admin/payments" className="block bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-1 mb-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <Wallet className="w-[18px] h-[18px] text-emerald-600" />
        </div>
        {stats.failed_count > 0 && (
          <span className="text-[9px] font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded-full uppercase border border-red-100">Action</span>
        )}
      </div>
      <p className="text-3xl font-black text-gray-900 leading-none">
        ₱{stats.pending_payout_amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
      <p className="text-[11px] text-gray-400 mt-1 font-medium">Pending payout</p>
      {stats.failed_count > 0 && (
        <p className="text-[11px] text-brand-red mt-2 font-semibold">{stats.failed_count} failed payment{stats.failed_count !== 1 ? 's' : ''}</p>
      )}
    </Link>
  );
}

function DisputesSummaryCard({ stats }: { stats: AdminDisputeStats }) {
  const total = stats.open + stats.in_progress;
  return (
    <Link to="/admin/disputes" className={[
      'block bg-white rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
      total > 0 ? 'border border-red-100' : 'border border-gray-100',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-1 mb-3">
        <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-[18px] h-[18px] text-red-500" />
        </div>
        {total > 0 && (
          <span className="text-[9px] font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded-full uppercase border border-red-100">Action</span>
        )}
      </div>
      <p className={`text-3xl font-black leading-none ${total > 0 ? 'text-brand-red' : 'text-gray-900'}`}>{total}</p>
      <p className="text-[11px] text-gray-400 mt-1 font-medium">Open disputes</p>
      <div className="mt-2 flex gap-3">
        <span className="text-[10px] text-gray-400">{stats.open} unassigned</span>
        <span className="text-[10px] text-gray-400">{stats.in_progress} in progress</span>
      </div>
    </Link>
  );
}

function ReviewsSummaryCard({ stats }: { stats: AdminReviewStats }) {
  return (
    <Link to="/admin/reviews" className={[
      'block bg-white rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
      stats.flagged_pending > 0 ? 'border border-amber-100' : 'border border-gray-100',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-1 mb-3">
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Star className="w-[18px] h-[18px] text-amber-500" />
        </div>
        {stats.flagged_pending > 0 && (
          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase border border-amber-100">Action</span>
        )}
      </div>
      <p className={`text-3xl font-black leading-none ${stats.flagged_pending > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
        {stats.flagged_pending}
      </p>
      <p className="text-[11px] text-gray-400 mt-1 font-medium">Flagged reviews</p>
      {stats.pending_review > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">{stats.pending_review} awaiting moderation</p>
      )}
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const userName = user ? `${user.first_name} ${user.last_name}` : '';
  const [stats, setStats]           = useState<AdminStats | null>(null);
  const [feed, setFeed]             = useState<DashboardFeed | null>(null);
  const [orderStats, setOrderStats] = useState<AdminOrderStats | null>(null);
  const [payStats, setPayStats]     = useState<AdminPaymentStats | null>(null);
  const [dispStats, setDispStats]   = useState<AdminDisputeStats | null>(null);
  const [revStats, setRevStats]     = useState<AdminReviewStats | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      getAdminStatsApi(),
      getAdminDashboardFeedApi(),
      getAdminOrderStatsApi(),
      getAdminPaymentStatsApi(),
      getAdminDisputeStatsApi(),
      getAdminReviewStatsApi(),
    ])
      .then(([s, f, os, ps, ds, rs]) => {
        setStats(s); setFeed(f);
        setOrderStats(os); setPayStats(ps);
        setDispStats(ds); setRevStats(rs);
      })
      .finally(() => setLoading(false));
  }, []);

  const skeletonRow = (cols: number) => (
    <div className={`grid grid-cols-${cols} gap-2`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-lg p-3 h-[80px] animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Hero band ── */}
      <HeroBand stats={stats} userName={userName} />

      {/* ── Platform Overview ── */}
      <div>
        <SectionHeader title="Platform Overview" icon={Gauge} />
        {loading ? skeletonRow(6) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <MetricCard icon={UserCheck}    label="Pending Sellers"   value={stats.pending_seller_applications} to="/admin/seller-applications" iconBg="bg-rose-50"    iconColor="text-rose-500"    actionItem />
            <MetricCard icon={Bike}          label="Pending Riders"    value={stats.pending_rider_applications}  to="/admin/rider-applications"  iconBg="bg-sky-50"     iconColor="text-sky-500"     actionItem />
            <MetricCard icon={ShieldAlert}   label="Open Disputes"     value={stats.open_disputes}               to="/admin/disputes"            iconBg="bg-red-50"     iconColor="text-red-500"     actionItem />
            <MetricCard icon={PackageCheck}  label="Orders Today"      value={stats.orders_today}                iconBg="bg-violet-50"  iconColor="text-violet-500"
              trend={<TrendBadge current={stats.orders_today} previous={stats.orders_yesterday} label="yesterday" />}
            />
            <MetricCard icon={Wallet}        label="GMV Today"
              value={stats.gmv_today > 0 ? `₱${stats.gmv_today.toLocaleString('en-PH')}` : '₱0'}
              iconBg="bg-emerald-50" iconColor="text-emerald-600"
              trend={<TrendBadge current={stats.gmv_today} previous={stats.gmv_yesterday} label="yesterday" />}
            />
            <MetricCard icon={Users}         label="New Buyers / Week" value={stats.new_buyers_this_week} to="/admin/buyers" iconBg="bg-indigo-50" iconColor="text-indigo-500"
              trend={<TrendBadge current={stats.new_buyers_this_week} previous={stats.new_buyers_last_week} label="last week" />}
            />
          </div>
        ) : null}
      </div>

      {/* ── Recent Attention + Trend Chart (2-col) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Left: Needs Attention feed */}
        <div>
          <SectionHeader title="Needs Attention" icon={AlertTriangle} to="/admin/seller-applications" />
          {loading ? (
            <div className="bg-white border border-gray-100 rounded-xl h-[260px] animate-pulse" />
          ) : feed ? (
            <AttentionFeed items={feed.attention_items} />
          ) : null}
        </div>

        {/* Right: Trend chart */}
        <div>
          <SectionHeader title="Registrations Trend" icon={TrendingUp} />
          {loading ? (
            <div className="bg-white border border-gray-100 rounded-xl h-[260px] animate-pulse" />
          ) : feed ? (
            <TrendChart data={feed.chart_data} />
          ) : null}
        </div>
      </div>

      {/* ── Three-column secondary grid ── */}
      {!loading && orderStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <OrdersBreakdownCard stats={orderStats} />
          <MiniCalendar activeDates={
            new Set(
              (feed?.chart_data ?? [])
                .filter(d => d.orders > 0)
                .map(d => d.date.split('T')[0])
            )
          } />
          <HighlightCard stats={stats} payStats={payStats} />
        </div>
      )}

      {/* ── Footer action bar ── */}
      {!loading && stats && (
        <div
          className="rounded-2xl px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 100%)' }}
        >
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)',
          }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                stats.pending_seller_applications + stats.pending_rider_applications + stats.open_disputes > 0
                  ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
              <p className="text-[13px] font-bold text-white leading-tight">
                {stats.pending_seller_applications + stats.pending_rider_applications + stats.open_disputes > 0
                  ? `${stats.pending_seller_applications + stats.pending_rider_applications + stats.open_disputes} pending tasks need your attention`
                  : 'All systems normal — no pending tasks'}
              </p>
            </div>
            <p className="text-[11px] text-white/40 ml-4">Consistency beats perfection — keep the platform healthy.</p>
          </div>
          <div className="relative z-10 flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              to="/admin/seller-applications"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-red text-white text-[12px] font-bold hover:bg-[#8a2424] transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Review Applications
            </Link>
            <Link
              to="/admin/buyers"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 text-white text-[12px] font-semibold hover:bg-white/15 transition-colors border border-white/10"
            >
              <Users className="w-3.5 h-3.5" />
              Manage Users
            </Link>
            <Link
              to="/admin/activity-log"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 text-white text-[12px] font-semibold hover:bg-white/15 transition-colors border border-white/10"
            >
              <Activity className="w-3.5 h-3.5" />
              View Reports
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
