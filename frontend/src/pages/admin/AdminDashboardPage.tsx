import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminStatsApi, getAdminDashboardFeedApi,
  getAdminOrderStatsApi, getAdminPaymentStatsApi,
  getAdminDisputeStatsApi, getAdminReviewStatsApi,
} from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';
import type {
  AdminStats, DashboardFeed, DashboardChartPoint,
  AdminOrderStats, AdminPaymentStats, AdminDisputeStats, AdminReviewStats,
} from '../../types';
import {
  UserPlus, Package,
  Users, TrendingUp, TrendingDown,
  ArrowRight, Activity, Minus,
  ShieldAlert,
  Gauge, PackageCheck, Wallet,
  Coins, QrCode, Truck, Clock,
  CheckCircle2, Store, ShieldCheck
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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const WEEKLY_GMV_GOAL = 50_000;

// ─── Compact Hero Band ────────────────────────────────────────────────────────

function HeroBand({ stats, userName }: { stats: AdminStats | null; userName: string }) {
  const pendingTotal = stats
    ? (stats.pending_seller_applications || 0) +
      (stats.pending_buyer_applications || 0) +
      (stats.pending_products || 0) +
      (stats.open_disputes || 0) +
      (stats.pending_payment_verifications || 0) +
      (stats.pending_payout_requests || 0)
    : 0;
  const hasIssues = pendingTotal > 0;
  const animatedGmv        = useCountUp(stats?.gmv_today ?? 0);
  const animatedCommission = useCountUp(stats?.commission_today ?? 0);
  const animatedOrders     = useCountUp(stats?.orders_today ?? 0);
  const animatedPending    = useCountUp(pendingTotal);
  const gmvGoalPct         = Math.min(Math.round(((stats?.gmv_today ?? 0) / WEEKLY_GMV_GOAL) * 100), 100);

  return (
    <div
      className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
    >
      {/* Left: Greeting + Status Pill + Action Chips inline */}
      <div className="flex flex-wrap items-center min-w-0 gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-tight text-white sm:text-sm whitespace-nowrap">
            {greeting()}, {userName || 'Administrator'}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            hasIssues ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${hasIssues ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            {hasIssues ? `${animatedPending} Tasks Pending` : 'All Systems Healthy'}
          </span>
        </div>

        {/* Inline Quick Action Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <Link
            to="/admin/seller-applications"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-red hover:bg-[#8e2424] text-white text-[11px] font-bold transition-all whitespace-nowrap active:scale-95 shadow-xs"
          >
            <Store className="w-3 h-3" />
            Sellers ({stats?.pending_seller_applications ?? 0})
          </Link>
          <Link
            to="/admin/buyer-applications"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium transition-all whitespace-nowrap active:scale-95 border border-neutral-700/60"
          >
            <UserPlus className="w-3 h-3" />
            Buyer IDs ({stats?.pending_buyer_applications ?? 0})
          </Link>
          <Link
            to="/admin/product-reviews"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium transition-all whitespace-nowrap active:scale-95 border border-neutral-700/60"
          >
            <Package className="w-3 h-3" />
            Products ({stats?.pending_products ?? 0})
          </Link>
          <Link
            to="/admin/disputes"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium transition-all whitespace-nowrap active:scale-95 border border-neutral-700/60"
          >
            <ShieldAlert className="w-3 h-3" />
            Disputes ({stats?.open_disputes ?? 0})
          </Link>
        </div>
      </div>

      {/* Right: Inline Today's Key Performance Numbers */}
      {stats && (
        <div className="flex items-center self-end justify-between w-full gap-3 pt-1 text-xs border-t sm:gap-4 shrink-0 md:self-auto md:pt-0 md:border-t-0 border-neutral-800/80 md:w-auto md:justify-end">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-neutral-400">GMV Today</span>
            <span className="text-xs font-black text-white sm:text-sm">₱{animatedGmv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 ml-0.5" title="Weekly GMV Target Progress">
              {gmvGoalPct}% Goal
            </span>
          </div>

          <div className="w-px h-4 bg-neutral-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-neutral-400">Net Commission</span>
            <span className="text-xs font-bold text-emerald-400 sm:text-sm">₱{animatedCommission.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="w-px h-4 bg-neutral-800" />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-neutral-400">Orders</span>
            <span className="text-xs font-bold text-violet-300 sm:text-sm">{animatedOrders}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trend Badge ──────────────────────────────────────────────────────────────

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const { pct, dir } = trend(current, previous);
  if (dir === 'flat') {
    return (
      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
        <Minus className="w-2.5 h-2.5" /> No change vs {label}
      </span>
    );
  }
  const up = dir === 'up';
  return (
    <span className={`text-[10px] flex items-center gap-0.5 font-bold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : '-'}{pct}% vs {label}
    </span>
  );
}

// ─── Compact Action Queue Metric Card ─────────────────────────────────────────

interface ActionCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  to: string;
  badgeLabel: string;
  iconBg: string;
  iconColor: string;
  accentBorder: string;
  description: string;
}

function ActionCard({
  icon: Icon, label, value, to, badgeLabel, iconBg, iconColor, accentBorder, description
}: ActionCardProps) {
  const animated = useCountUp(value);
  const hasItems = value > 0;

  return (
    <Link
      to={to}
      className={`group relative bg-white rounded-xl p-3.5 border transition-all duration-150 hover:shadow-sm hover:border-gray-300 flex flex-col justify-between ${
        hasItems ? `${accentBorder} shadow-xs` : 'border-gray-200/80'
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          {hasItems ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-brand-red border border-rose-100 animate-pulse">
              {badgeLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
              <CheckCircle2 className="w-2.5 h-2.5" /> Clear
            </span>
          )}
        </div>

        <p className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${hasItems ? 'text-gray-900' : 'text-gray-700'}`}>
          {animated}
        </p>
        <p className="mt-1 text-xs font-bold text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{description}</p>
      </div>

      <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] font-bold text-brand-red group-hover:text-[#801f1f]">
        <span>Review Queue</span>
        <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

// ─── Compact Financial / Velocity Metric Card ─────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subtext?: string;
  prefix?: string;
  trendEl?: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

function StatCard({ icon: Icon, label, value, subtext, prefix, trendEl, iconBg, iconColor }: StatCardProps) {
  const numericTarget = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericTarget);
  const displayValue = typeof value === 'number'
    ? (prefix ? `${prefix}${animated.toLocaleString('en-PH', { minimumFractionDigits: prefix ? 2 : 0 })}` : animated.toLocaleString())
    : value;

  return (
    <div className="flex flex-col justify-between p-3.5 bg-white border shadow-xs rounded-xl border-gray-200/80">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          {trendEl && <div>{trendEl}</div>}
        </div>
        <p className="text-xl font-black leading-none tracking-tight text-gray-900 sm:text-2xl">{displayValue}</p>
        <p className="mt-1 text-xs font-bold text-gray-800">{label}</p>
        {subtext && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{subtext}</p>}
      </div>
    </div>
  );
}

// ─── Compact Section Header ───────────────────────────────────────────────────

function SectionHeader({ title, to, icon: Icon }: { title: string; to?: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-2">
        <div className="w-1 h-3.5 rounded-full bg-brand-red" />
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
        <h2 className="text-[11px] font-bold tracking-wider text-gray-800 uppercase">{title}</h2>
      </div>
      {to && (
        <Link to={to} className="text-[11px] font-bold text-brand-red hover:text-[#801f1f] flex items-center gap-1 transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Compact Shared Empty State ───────────────────────────────────────────────

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-1.5 py-8 text-center">
      <div className="flex items-center justify-center w-8 h-8 border border-gray-100 rounded-xl bg-gray-50">
        <Activity className="w-4 h-4 text-gray-300" />
      </div>
      <p className="text-[11px] font-semibold text-gray-400">{message}</p>
    </div>
  );
}

// ─── Compact Multi-Metric Analytics Chart ─────────────────────────────────────

type ChartRange = '7d' | '14d';
type MetricView = 'gmv' | 'orders' | 'new_sellers';

function AnalyticsTrendChart({ data }: { data: DashboardChartPoint[] }) {
  const [range, setRange] = useState<ChartRange>('14d');
  const [metric, setMetric] = useState<MetricView>('gmv');

  const sliced = useMemo(() => {
    const n = range === '7d' ? 7 : 14;
    return data.slice(-n).map((d) => ({ ...d, date: chartDateLabel(d.date) }));
  }, [data, range]);

  const metricConfig = {
    gmv: {
      label: 'Gross Sales (GMV ₱)',
      sub: 'Daily platform sales volume',
      color: '#A32D2D',
      dataKey: 'gmv',
      formatter: (v: number) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    },
    orders: {
      label: 'Orders Processed',
      sub: 'Daily completed order volume',
      color: '#7C3AED',
      dataKey: 'orders',
      formatter: (v: number) => `${Number(v || 0).toLocaleString()} orders`,
    },
    new_sellers: {
      label: 'Store Partner Registrations',
      sub: 'Daily merchant partner signups',
      color: '#059669',
      dataKey: 'new_sellers',
      formatter: (v: number) => `${Number(v || 0).toLocaleString()} stores`,
    },
  }[metric];

  const totalPeriod = useMemo(() => {
    return sliced.reduce((acc, curr) => acc + (Number((curr as any)[metricConfig.dataKey]) || 0), 0);
  }, [sliced, metricConfig.dataKey]);

  const isEmpty = sliced.every((d) => ((d as any)[metricConfig.dataKey] ?? 0) === 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      {/* Header with Metric & Range Controls */}
      <div className="flex flex-col justify-between gap-2.5 p-3.5 border-b border-gray-100 sm:p-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">{metricConfig.label}</h3>
          <p className="text-[11px] text-gray-400">{metricConfig.sub}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Metric Selector */}
          <div className="flex p-0.5 text-[11px] font-bold border bg-gray-100/80 rounded-lg border-gray-200/50">
            <button
              onClick={() => setMetric('gmv')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                metric === 'gmv' ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              GMV (₱)
            </button>
            <button
              onClick={() => setMetric('orders')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                metric === 'orders' ? 'bg-white text-violet-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setMetric('new_sellers')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                metric === 'new_sellers' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Sellers
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex p-0.5 text-[11px] font-bold border bg-gray-100/80 rounded-lg border-gray-200/50">
            {(['7d', '14d'] as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-1 rounded-md transition-all ${
                  range === r ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-400 hover:text-gray-800'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      {isEmpty ? (
        <ChartEmptyState message={`No ${metricConfig.label.toLowerCase()} recorded in this window`} />
      ) : (
        <div className="flex-1 min-h-[205px] p-3.5 [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_.recharts-wrapper]:outline-none focus:outline-none select-none">
          <ResponsiveContainer width="100%" height={205} style={{ outline: 'none' }}>
            <AreaChart data={sliced} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metricConfig.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={metricConfig.color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  backgroundColor: '#ffffff',
                }}
                labelStyle={{ fontWeight: 700, color: '#111827' }}
                formatter={(val: any) => [metricConfig.formatter(Number(val)), metricConfig.label]}
              />
              <Area
                type="monotone"
                dataKey={metricConfig.dataKey}
                name={metricConfig.label}
                stroke={metricConfig.color}
                strokeWidth={2.5}
                fill={`url(#grad-${metric})`}
                dot={false}
                activeDot={{ r: 5, fill: metricConfig.color, strokeWidth: 1.5, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Period Summary Footprint */}
          <div className="flex items-center justify-between pt-2 mt-2 text-[11px] text-gray-500 border-t border-gray-100">
            <span>Period Aggregate ({range}):</span>
            <span className="font-bold text-gray-900">{metricConfig.formatter(totalPeriod)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return '??';
  const clean = name.replace(/^(Dispute on #|Store App|Buyer ID)/i, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatWaitingTime(iso: string): string {
  if (!iso) return 'Pending';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (isNaN(diffMs) || diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m waiting`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h waiting`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours > 0) return `${days}d ${remainingHours}h waiting`;
  return `${days}d waiting`;
}

// ─── Compact Attention Feed Hub ────────────────────────────────────────────────

function AttentionFeedHub({ items }: { items: DashboardFeed['attention_items'] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <div className="flex items-center justify-center border w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border-emerald-100">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <h3 className="text-xs font-bold text-gray-900">All Clear &amp; Processed</h3>
        <p className="max-w-xs text-[11px] text-gray-400">No pending store applications, buyer ID checks, or customer dispute cases.</p>
      </div>
    );
  }

  const TYPE_META: Record<string, { label: string; bg: string; text: string; initialBg: string }> = {
    seller_application: { label: 'Store App', bg: 'bg-rose-50', text: 'text-brand-red', initialBg: 'bg-rose-600 text-white' },
    buyer_application:  { label: 'Buyer ID',  bg: 'bg-[#FFC107]/20 border border-[#FFC107]/40', text: 'text-[#854d0e]', initialBg: 'bg-[#d97706] text-white' }, // Mikado Gold
    product_approval:   { label: 'Product',   bg: 'bg-amber-50', text: 'text-amber-700', initialBg: 'bg-amber-600 text-white' },
    dispute:            { label: 'Dispute',   bg: 'bg-red-50',   text: 'text-red-600', initialBg: 'bg-red-600 text-white' },
  };

  return (
    <div className="flex flex-col justify-between h-full overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Priority Attention Queue</h3>
        <span className="text-[10px] font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
          {items.length} Action{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-gray-100 overflow-y-auto max-h-[265px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const meta = TYPE_META[item.type] ?? { label: item.type, bg: 'bg-gray-50', text: 'text-gray-500', initialBg: 'bg-gray-600 text-white' };

          return (
            <Link
              key={`${item.type}-${item.id}`}
              to={item.link}
              className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50/80 transition-colors group"
            >
              {item.avatar_url ? (
                <img
                  src={item.avatar_url}
                  alt={item.label}
                  className="w-7 h-7 rounded-lg object-cover shrink-0 border border-gray-200/80 shadow-2xs"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className={`w-7 h-7 rounded-lg items-center justify-center font-bold text-[10px] tracking-tight shrink-0 shadow-2xs ${
                  item.avatar_url ? 'hidden' : 'flex'
                } ${meta.initialBg}`}
              >
                {getInitials(item.label)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${meta.bg} ${meta.text}`}>
                    {meta.label}
                  </span>
                  {item.urgent && (
                    <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-100 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {formatWaitingTime(item.waiting_since)}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold leading-tight text-gray-900 truncate transition-colors group-hover:text-brand-red">
                  {item.label}
                </p>
                <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.sub} · {formatDate(item.waiting_since)}</p>
              </div>

              <div className="flex items-center justify-center w-6 h-6 text-gray-400 transition-all rounded-md bg-gray-50 group-hover:bg-brand-red group-hover:text-white shrink-0">
                <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="px-3.5 py-2 bg-gray-50/60 border-t border-gray-100 text-center">
        <span className="text-[10px] text-gray-400">Respond within 24–48 hours to maintain marketplace SLA</span>
      </div>
    </div>
  );
}
// ─── Compact Commission Revenue Breakdown Card ────────────────────────────────

export function CommissionRevenueCard({ stats }: { stats: AdminStats }) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'lifetime'>('month');

  const value = period === 'today'
    ? (stats.commission_today ?? 0)
    : period === 'week'
    ? (stats.commission_this_week ?? 0)
    : period === 'month'
    ? (stats.commission_this_month ?? 0)
    : (stats.commission_lifetime ?? 0);

  const animated = useCountUp(value);

  return (
    <div className="flex flex-col justify-between h-full p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex flex-col justify-between gap-2.5 pb-3 border-b border-gray-100 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center font-bold border rounded-lg text-emerald-600 border-emerald-100 w-7 h-7 bg-emerald-50 shrink-0">
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Platform Commission Net</h3>
            <p className="text-[11px] text-gray-400">Net revenue captured from completed orders</p>
          </div>
        </div>

        <div className="flex items-center self-start gap-1 p-0.5 text-[11px] font-bold bg-gray-100/80 border rounded-lg sm:self-auto border-gray-200/50">
          {(['today', 'week', 'month', 'lifetime'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                period === p ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {p === 'lifetime' ? 'All Time' : p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 pt-3 sm:flex-row sm:items-end">
        <div>
          <span className="block text-[10px] font-bold tracking-wider text-gray-400 uppercase">
            {period === 'today' ? "Today's Net" : period === 'week' ? "This Week's Net" : period === 'month' ? "This Month's Net" : "Lifetime Net Platform Fees"}
          </span>
          <p className="mt-0.5 text-2xl font-black tracking-tight text-gray-900">
            ₱{animated.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-2 text-xs border border-gray-100 bg-gray-50/70 rounded-xl">
          <div>
            <span className="text-[9px] text-gray-400 block font-bold uppercase">Today</span>
            <span className="text-xs font-bold text-gray-900">₱{(stats.commission_today ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
          <div>
            <span className="text-[9px] text-gray-400 block font-bold uppercase">Lifetime</span>
            <span className="text-xs font-bold text-brand-red">₱{(stats.commission_lifetime ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compact Payment Split & Liquidity Card ───────────────────────────────────

export function PaymentSplitCard({ stats }: { stats: AdminStats }) {
  const gcashVol   = stats.gcash_volume ?? 0;
  const codVol     = stats.cod_volume ?? 0;
  const totalVol   = gcashVol + codVol;
  const gcashCount = stats.gcash_orders_count ?? 0;
  const codCount   = stats.cod_orders_count ?? 0;
  const totalCount = gcashCount + codCount;

  const gcashPct = totalVol > 0 ? Math.round((gcashVol / totalVol) * 100) : 0;
  const codPct   = totalVol > 0 ? 100 - gcashPct : 0;

  return (
    <div className="flex flex-col justify-between h-full gap-3 p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center font-bold text-blue-600 border border-blue-100 rounded-lg w-7 h-7 bg-blue-50 shrink-0">
            <QrCode className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Payment Breakdown</h3>
            <p className="text-[11px] text-gray-400">GCash Direct Scan vs Cash on Delivery (COD)</p>
          </div>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-bold text-gray-500 bg-gray-100 rounded-md">
          {totalCount} Total
        </span>
      </div>

      <div className="space-y-3">
        {/* Progress distribution bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="flex items-center gap-1 text-blue-600"><QrCode className="w-3 h-3" /> GCash ({gcashPct}%)</span>
            <span className="flex items-center gap-1 text-emerald-700"><Truck className="w-3 h-3" /> COD ({codPct}%)</span>
          </div>
          <div className="flex w-full h-2 overflow-hidden bg-gray-100 rounded-full">
            <div className="h-full transition-all duration-700 bg-blue-600" style={{ width: `${gcashPct}%` }} />
            <div className="h-full transition-all duration-700 bg-emerald-500" style={{ width: `${codPct}%` }} />
          </div>
        </div>

        {/* Breakdown Metric Pills */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100">
            <div className="flex items-center justify-between mb-0.5 text-xs">
              <span className="font-bold text-blue-700 text-[11px]">GCash</span>
              <span className="text-[10px] text-gray-500">{gcashCount} orders</span>
            </div>
            <p className="text-sm font-black text-gray-900 sm:text-base">
              ₱{gcashVol.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <div className="flex items-center justify-between mb-0.5 text-xs">
              <span className="font-bold text-emerald-700 text-[11px]">Cash on Delivery</span>
              <span className="text-[10px] text-gray-500">{codCount} orders</span>
            </div>
            <p className="text-sm font-black text-gray-900 sm:text-base">
              ₱{codVol.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compact Orders Fulfillment Status Pipeline ───────────────────────────────

function OrdersBreakdownCard({ stats }: { stats: AdminOrderStats }) {
  const rows: Array<{ key: string; label: string; hex: string }> = [
    { key: 'pending',          label: 'Pending Confirmation', hex: '#F59E0B' },
    { key: 'packed',           label: 'Packed by Seller',     hex: '#3B82F6' },
    { key: 'shipped',          label: 'In Transit / Shipped', hex: '#8B5CF6' },
    { key: 'out_for_delivery', label: 'Out for Delivery',     hex: '#F97316' },
    { key: 'delivered',        label: 'Successfully Delivered',hex: '#10B981' },
    { key: 'cancelled',        label: 'Cancelled / Returned', hex: '#EF4444' },
  ];
  const counts     = rows.map(r => stats.by_status[r.key as never] ?? 0);
  const realTotal  = counts.reduce((a, b) => a + b, 0);
  const max        = Math.max(...counts, 1);
  const animatedTotal = useCountUp(realTotal);

  return (
    <div className="flex flex-col justify-between h-full gap-3 p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Fulfillment Pipeline</h3>
          <p className="text-[11px] text-gray-400">Live order state distribution</p>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-bold text-gray-700 bg-gray-100 rounded-md">
          {animatedTotal} Total
        </span>
      </div>

      {realTotal === 0 ? (
        <ChartEmptyState message="No orders recorded yet" />
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const count = counts[i];
            const pct = Math.round((count / realTotal) * 100);
            return (
              <div key={r.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-gray-700">{r.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900">{count}</span>
                    <span className="text-[10px] text-gray-400 font-medium w-6 text-right">{pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden bg-gray-100 rounded-full">
                  <div
                    className="h-full transition-all duration-700 rounded-full"
                    style={{ width: `${(count / max) * 100}%`, background: r.hex }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Compact Recent Admin Activity Stream ─────────────────────────────────────

function RecentActivityStream({ activities }: { activities: DashboardFeed['recent_activity'] }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5 p-6 text-center bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <Activity className="w-6 h-6 text-gray-300" />
        <p className="text-[11px] text-gray-400">No activity logs registered yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between h-full p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Audit &amp; Activity Log</h3>
          <p className="text-[11px] text-gray-400">Recent administrative operations</p>
        </div>
        <Link to="/admin/activity-log" className="flex items-center gap-1 text-[11px] font-bold text-brand-red hover:underline">
          Full Log <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-gray-100 overflow-y-auto max-h-[220px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {activities.map((act) => (
          <div key={act.id} className="flex items-start gap-2.5 py-2">
            <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-600 shrink-0 mt-0.5">
              <Activity className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-snug text-gray-900">{act.description}</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                <span className="font-semibold text-gray-600">{act.admin.first_name} {act.admin.last_name}</span>
                <span>•</span>
                <span>{formatDate(act.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Admin Dashboard Page Component ──────────────────────────────────────

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const userName = user ? `${user.first_name} ${user.last_name}` : '';
  const [stats, setStats]           = useState<AdminStats | null>(null);
  const [feed, setFeed]             = useState<DashboardFeed | null>(null);
  const [orderStats, setOrderStats] = useState<AdminOrderStats | null>(null);
  const [, setPayStats]             = useState<AdminPaymentStats | null>(null);
  const [, setDispStats]            = useState<AdminDisputeStats | null>(null);
  const [, setRevStats]             = useState<AdminReviewStats | null>(null);
  const [loading, setLoading]       = useState(true);

  const pageRef = useMountAnim();

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

  const skeletonCard = (key: number) => (
    <div key={key} className="bg-white border border-gray-200/80 rounded-xl p-3.5 h-[96px] animate-pulse flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="w-7 h-7 bg-gray-100 rounded-lg" />
        <div className="w-12 h-3.5 bg-gray-100 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="w-20 h-5 bg-gray-200 rounded" />
        <div className="w-28 h-2.5 bg-gray-100 rounded" />
      </div>
    </div>
  );

  return (
    <div ref={pageRef} className="pb-8 space-y-4">

      {/* ── 1. Compact Executive Hero Header ── */}
      <HeroBand stats={stats} userName={userName} />

      {/* ── 2. Moderation Action Center (Top Priority) ── */}
      <div>
        <SectionHeader
          title="Moderation &amp; Action Hub"
          icon={Gauge}
        />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map(skeletonCard)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ActionCard
              icon={Store}
              label="Seller Applications"
              value={stats.pending_seller_applications}
              to="/admin/seller-applications"
              badgeLabel="Review"
              iconBg="bg-rose-50"
              iconColor="text-brand-red"
              accentBorder="border-rose-200 shadow-rose-50"
              description="Store approval &amp; permits"
            />
            <ActionCard
              icon={UserPlus}
              label="Buyer ID Verifications"
              value={stats.pending_buyer_applications ?? 0}
              to="/admin/buyer-applications"
              badgeLabel="Verify"
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              accentBorder="border-blue-200 shadow-blue-50"
              description="Gov ID &amp; selfie checks"
            />
            <ActionCard
              icon={Package}
              label="Product Reviews"
              value={stats.pending_products ?? 0}
              to="/admin/product-reviews"
              badgeLabel="Review"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              accentBorder="border-amber-200 shadow-amber-50"
              description="FDA permit &amp; compliance"
            />
            <ActionCard
              icon={ShieldAlert}
              label="Open Disputes"
              value={stats.open_disputes}
              to="/admin/disputes"
              badgeLabel="Mediate"
              iconBg="bg-red-50"
              iconColor="text-red-600"
              accentBorder="border-red-200 shadow-red-50"
              description="Returns &amp; refunds"
            />
          </div>
        ) : null}
      </div>

      {/* ── 3. Marketplace Velocity & Core Performance ── */}
      <div>
        <SectionHeader
          title="Marketplace Performance"
          icon={Activity}
        />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map(skeletonCard)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              label="Gross Sales (GMV Today)"
              value={stats.gmv_today}
              prefix="₱"
              subtext="Total marketplace sales"
              iconBg="bg-rose-50"
              iconColor="text-brand-red"
              trendEl={<TrendBadge current={stats.gmv_today} previous={stats.gmv_yesterday} label="yesterday" />}
            />
            <StatCard
              icon={Coins}
              label="Platform Net Commission"
              value={stats.commission_today ?? 0}
              prefix="₱"
              subtext="Take-rate fees captured"
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <StatCard
              icon={PackageCheck}
              label="Orders Processed Today"
              value={stats.orders_today}
              subtext="Confirmed and fulfilled"
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
              trendEl={<TrendBadge current={stats.orders_today} previous={stats.orders_yesterday} label="yesterday" />}
            />
            <StatCard
              icon={Users}
              label="Active Marketplace Users"
              value={`${stats.total_buyers.toLocaleString()} Buyers · ${stats.total_sellers.toLocaleString()} Sellers`}
              subtext="Total registered accounts"
              iconBg="bg-indigo-50"
              iconColor="text-indigo-600"
            />
          </div>
        ) : null}
      </div>

      {/* ── 4. Main Analytics Chart & Urgent Attention Feed (2-Column) ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 animate-pulse">
          <div className="lg:col-span-7 bg-white border border-gray-200/80 rounded-2xl h-[310px]" />
          <div className="lg:col-span-5 bg-white border border-gray-200/80 rounded-2xl h-[310px]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <AnalyticsTrendChart data={feed?.chart_data ?? []} />
          </div>
          <div className="lg:col-span-5">
            <AttentionFeedHub items={feed?.attention_items ?? []} />
          </div>
        </div>
      )}

      {/* ── 5. Revenue & Payment Liquidity (2-Column) ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 animate-pulse">
          <div className="bg-white border border-gray-200/80 rounded-2xl h-52" />
          <div className="bg-white border border-gray-200/80 rounded-2xl h-52" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <CommissionRevenueCard stats={stats} />
          <PaymentSplitCard stats={stats} />
        </div>
      ) : null}

      {/* ── 6. Order Fulfillment Pipeline & Admin Audit Stream (2-Column) ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 animate-pulse">
          <div className="bg-white border border-gray-200/80 rounded-2xl h-52" />
          <div className="bg-white border border-gray-200/80 rounded-2xl h-52" />
        </div>
      ) : orderStats && feed ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <OrdersBreakdownCard stats={orderStats} />
          <RecentActivityStream activities={feed.recent_activity} />
        </div>
      ) : null}

    </div>
  );
}
