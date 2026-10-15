import { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import {
  TrendingUp,
  Coins,
  ShoppingBag,
  Package,
  Layers,
  Award,
  PieChart as PieChartIcon,
  BarChart3,
  QrCode,
  Truck,
  Users,
  ShieldAlert,
  Percent,
  ClipboardList,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  getAdminReportSummaryApi,
  getAdminRevenueChartApi,
  getAdminCategoryBreakdownApi,
  getAdminTopSellersApi,
  getAdminPaymentSplitApi,
} from '../../api/client';
import type {
  AdminReportSummary,
  AdminRevenueChartPoint,
  CategoryBreakdownItem,
  TopSellerItem,
  PaymentMethodSplit,
  ReportRangeParams,
} from '../../types';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';
import { NA, peso, whole, percent, manilaToday } from '../../utils/adminReports';
import { PageHero } from '../../components/admin/dashboardKit';
import DateRangeBar from '../../components/admin/DateRangeBar';

const TIMEFRAMES = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: '12 months', value: '12m' },
  { label: 'All time', value: 'all' },
];

const PRESET_VALUES = new Set(TIMEFRAMES.map((t) => t.value));
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORY_COLORS = ['#A32D2D', '#007DFE', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

const PIPELINE_COLORS: Record<string, string> = {
  awaiting_confirmation: '#F59E0B',
  processing:            '#3B82F6',
  hub_first_mile:        '#8B5CF6',
  out_for_delivery:      '#F97316',
  delivered_completed:   '#10B981',
  cancelled_problem:     '#EF4444',
};

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

export default function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // The range lives in the URL (?from=&to= or ?range=), so a dashboard card can link to exactly the days it shows.
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';
  const rangeParam = searchParams.get('range') ?? '';
  const customRange = DATE_PATTERN.test(fromParam) && DATE_PATTERN.test(toParam) && fromParam <= toParam;
  const preset = PRESET_VALUES.has(rangeParam) ? rangeParam : '30d';

  const rangeParams: ReportRangeParams = useMemo(
    () => (customRange ? { from: fromParam, to: toParam } : { range: preset }),
    [customRange, fromParam, toParam, preset],
  );

  const [interval, setIntervalMode] = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [summary, setSummary] = useState<AdminReportSummary | null>(null);
  const [chartData, setChartData] = useState<AdminRevenueChartPoint[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [sellers, setSellers] = useState<TopSellerItem[]>([]);
  const [paymentSplit, setPaymentSplit] = useState<PaymentMethodSplit | null>(null);

  const pageRef = useMountAnim();
  const today = manilaToday();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const monthly = interval === 'monthly' || (!customRange && (preset === '12m' || preset === 'all'));
      const [sum, chart, cats, topSell, split] = await Promise.all([
        getAdminReportSummaryApi(rangeParams),
        getAdminRevenueChartApi({ ...rangeParams, interval: monthly ? 'monthly' : 'daily' }),
        getAdminCategoryBreakdownApi(rangeParams),
        getAdminTopSellersApi(rangeParams),
        getAdminPaymentSplitApi(rangeParams),
      ]);
      setSummary(sum);
      setChartData(chart);
      setCategories(cats);
      setSellers(topSell);
      setPaymentSplit(split);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [rangeParams, interval, customRange, preset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open on the section the dashboard linked to (#sales, #commission, ...), once the figures are on screen.
  useEffect(() => {
    if (loading || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.hash]);

  function choosePreset(value: string) {
    setSearchParams({ range: value }, { replace: false });
  }

  function applyDates(from: string, to: string) {
    if (DATE_PATTERN.test(from) && DATE_PATTERN.test(to) && from <= to) {
      setSearchParams({ from, to });
    }
  }

  const range = summary?.range;

  const animatedCommission = useCountUp(summary?.total_commission ?? 0);
  const animatedGmv        = useCountUp(summary?.total_gmv ?? 0);
  const animatedEarnings   = useCountUp(summary?.total_seller_earnings ?? 0);
  const animatedUnits      = useCountUp(summary?.total_units_sold ?? 0);
  const animatedOrders     = useCountUp(summary?.total_orders ?? 0);

  const sectionClass = 'scroll-mt-4';

  return (
    <div ref={pageRef} className="pb-8 space-y-4">
      {/* ── 1. Page header and the period control ── */}
      <PageHero
        icon={BarChart3}
        eyebrow="Commerce"
        title="Platform Reports & Analytics"
        subtitle="The same figures as the dashboard, counted in Philippine time. Cancelled and returned orders are left out of sales, commission and activity."
      >
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-neutral-200 border border-white/15">
          <CalendarDays className="w-3 h-3" aria-hidden="true" />
          {loading ? 'Loading…' : range ? `${range.days} ${range.days === 1 ? 'day' : 'days'}` : NA}
        </span>
      </PageHero>

      <DateRangeBar
        presets={TIMEFRAMES}
        preset={customRange ? '' : preset}
        from={range && !loading ? (range.preset === 'all' ? '' : range.from) : customRange ? fromParam : ''}
        to={range && !loading ? (range.preset === 'all' ? '' : range.to) : customRange ? toParam : ''}
        today={today}
        fromPlaceholder="Since the first order"
        toPlaceholder="Today"
        onPreset={choosePreset}
        onRange={applyDates}
      />
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" aria-hidden="true" /> The reports could not be loaded.</span>
          <button onClick={loadData} className="px-3 py-1 text-xs font-bold text-white bg-brand-red rounded-lg hover:bg-[#8e2424]">Retry</button>
        </div>
      )}

      {/* ── 2. Summary KPI Grid ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs h-24 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="w-7 h-7 bg-gray-100 rounded-lg" />
                <div className="w-12 h-3.5 bg-gray-100 rounded" />
              </div>
              <div className="space-y-1">
                <div className="w-20 h-5 bg-gray-200 rounded" />
                <div className="w-28 h-2.5 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div id="sales" className={`${sectionClass} bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{summary ? `${whole(summary.total_orders)} orders` : NA}</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary ? peso(animatedGmv) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Gross Merchandise Value</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Orders that count, shipping included</p>
            </div>
          </div>

          <div id="commission" className={`${sectionClass} bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
                <Coins className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">Rate: {percent(summary?.avg_commission_rate)}</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-brand-red tracking-tight leading-none">
                {summary ? peso(animatedCommission) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Platform Commission</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Stored fees, as a share of GMV</p>
            </div>
          </div>

          <div id="orders" className={`${sectionClass} bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold shrink-0">
                <ClipboardList className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{summary?.orders_placed !== undefined ? `${whole(summary.orders_placed)} placed` : NA}</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary ? whole(animatedOrders) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Orders</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {summary?.cancelled_orders !== undefined && summary?.returned_orders !== undefined
                  ? `Not counting ${whole(summary.cancelled_orders)} cancelled and ${whole(summary.returned_orders)} returned`
                  : NA}
              </p>
            </div>
          </div>

          <div id="activity" className={`${sectionClass} bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">In this period</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary?.active_buyers !== undefined ? `${whole(summary.active_buyers)} · ${whole(summary.active_sellers)}` : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Active Buyers · Sellers</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Placed, or sold on, a counted order</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Net</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary ? peso(animatedEarnings) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Seller Payout Earnings</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Store partners' share, before payout</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">All Stores</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary ? whole(animatedUnits) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Total Units Sold</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Across all item categories</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold shrink-0">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <Link to="/admin/disputes" className="text-[10px] font-bold text-brand-red hover:underline">Open queue</Link>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary?.disputes ? whole(summary.disputes.opened) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Disputes Opened</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {summary?.disputes ? `${whole(summary.disputes.open_now)} open right now` : NA}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <Percent className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">vs previous period</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {summary?.previous ? peso(summary.previous.gmv) : NA}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Previous Period GMV</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {summary?.previous ? `${formatDay(summary.previous.range.from)} to ${formatDay(summary.previous.range.to)}` : NA}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Main Revenue Over Time Chart ── */}
      {loading ? (
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-72 animate-pulse" />
      ) : (
        <div id="trend" className={`${sectionClass} bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Platform Revenue Over Time</h2>
              <p className="text-[11px] text-gray-400">Gross Merchandise Value (GMV) vs Platform Commission Net</p>
            </div>

            <div className="flex items-center gap-1 bg-gray-100/80 p-0.5 rounded-lg text-[11px] font-bold border border-gray-200/50">
              <button
                onClick={() => setIntervalMode('daily')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  interval === 'daily' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setIntervalMode('monthly')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  interval === 'monthly' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          {chartData.every((p) => p.gmv === 0 && p.commission === 0) ? (
            <p className="py-16 text-center text-xs text-gray-400">No sales recorded in this period.</p>
          ) : (
            <div className="h-60 w-full pt-2 [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_.recharts-wrapper]:outline-none focus:outline-none select-none">
              <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
                  <defs>
                    <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007DFE" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#007DFE" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A32D2D" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#A32D2D" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(value, name) => [peso(Number(value)), name === 'gmv' ? 'Gross GMV' : 'Platform Commission']}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: 6, fontSize: 11 }}
                    formatter={(val) => (val === 'gmv' ? 'GMV Volume' : 'Platform Commission')}
                  />
                  <Area type="monotone" dataKey="gmv" stroke="#007DFE" strokeWidth={2} fillOpacity={1} fill="url(#gmvGrad)" />
                  <Area type="monotone" dataKey="commission" stroke="#A32D2D" strokeWidth={2.5} fillOpacity={1} fill="url(#commGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Pipeline & Payment Channels (2-Column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Order pipeline */}
        <div id="pipeline" className={`${sectionClass} bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3`}>
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Order Pipeline</h2>
              <p className="text-[11px] text-gray-400">Orders placed in this period, by where they are now</p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold text-gray-700 bg-gray-100 rounded-md">
              {summary?.pipeline ? `${whole(summary.pipeline.total)} total` : NA}
            </span>
          </div>
          {!summary?.pipeline ? (
            <p className="py-6 text-center text-xs text-gray-400">{NA}</p>
          ) : summary.pipeline.total === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">No orders placed in this period.</p>
          ) : (
            <div className="space-y-2">
              {summary.pipeline.groups.map((g) => {
                const max = Math.max(...summary.pipeline!.groups.map((x) => x.count), 1);
                const pct = Math.round((g.count / summary.pipeline!.total) * 100);
                return (
                  <div key={g.key} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-gray-700">{g.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-900">{g.count}</span>
                        <span className="text-[10px] text-gray-400 font-medium w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden bg-gray-100 rounded-full">
                      <div className="h-full rounded-full" style={{ width: `${(g.count / max) * 100}%`, background: PIPELINE_COLORS[g.key] ?? '#9CA3AF' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Methods Split Bar */}
        <div id="payments" className={`${sectionClass} bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex flex-col justify-between gap-3`}>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Payment Channels</h2>
              <PieChartIcon className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400">GCash vs Cash on Delivery, on the orders that count</p>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-sky-50/50 border border-sky-100 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#007DFE] flex items-center gap-1"><QrCode className="w-3 h-3" /> GCash</span>
                <span className="font-mono text-gray-500 text-[10px]">{paymentSplit ? `${whole(paymentSplit.gcash.count)} orders` : NA}</span>
              </div>
              <p className="text-base font-black text-gray-900">{peso(paymentSplit?.gcash.volume)}</p>
              <div className="w-full bg-sky-200/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#007DFE] h-full"
                  style={{ width: `${paymentSplit?.total_volume ? (paymentSplit.gcash.volume / paymentSplit.total_volume) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-blue-700 flex items-center gap-1"><Truck className="w-3 h-3" /> COD</span>
                <span className="font-mono text-gray-500 text-[10px]">{paymentSplit ? `${whole(paymentSplit.cod.count)} orders` : NA}</span>
              </div>
              <p className="text-base font-black text-gray-900">{peso(paymentSplit?.cod.volume)}</p>
              <div className="w-full bg-blue-200/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full"
                  style={{ width: `${paymentSplit?.total_volume ? (paymentSplit.cod.volume / paymentSplit.total_volume) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex justify-between text-xs font-bold text-gray-700">
            <span>Total Captured:</span>
            <span>{peso(paymentSplit?.total_volume)}</span>
          </div>
        </div>
      </div>

      {/* ── 5. Category Breakdown ── */}
      <div id="categories" className={`${sectionClass} bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3`}>
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Category Sales &amp; Commission Breakdown</h2>
            <p className="text-[11px] text-gray-400">
              Rate is the stored commission divided by the stored sales of each category
            </p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
            <Layers className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-3.5 py-2.5">Category</th>
                <th className="px-3.5 py-2.5">Rate</th>
                <th className="px-3.5 py-2.5">Gross Sales</th>
                <th className="px-3.5 py-2.5">Units</th>
                <th className="px-3.5 py-2.5 text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">
                    No category sales recorded in this period.
                  </td>
                </tr>
              ) : (
                categories.map((cat, i) => (
                  <tr key={cat.category} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-gray-900">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        {cat.category}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                        {percent(cat.commission_rate)}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-gray-900">{peso(cat.gross_sales)}</td>
                    <td className="px-3.5 py-2.5 text-gray-600">{whole(cat.units_sold)}</td>
                    <td className="px-3.5 py-2.5 font-bold text-brand-red text-right">{peso(cat.commission_earned)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 6. Seller Performance Leaderboard ── */}
      <div id="sellers" className={`${sectionClass} bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3`}>
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Top Seller Performance Leaderboard</h2>
            <p className="text-[11px] text-gray-400">Ranked by item sales (shipping not included) and the commission they generated</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Award className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-3.5 py-2.5">Rank</th>
                <th className="px-3.5 py-2.5">Shop &amp; Seller</th>
                <th className="px-3.5 py-2.5">Gross Sales</th>
                <th className="px-3.5 py-2.5">Orders</th>
                <th className="px-3.5 py-2.5">Units Sold</th>
                <th className="px-3.5 py-2.5">Commission</th>
                <th className="px-3.5 py-2.5 text-right">Net Payout Credited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sellers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">
                    No seller sales recorded in this period.
                  </td>
                </tr>
              ) : (
                sellers.map((s, idx) => (
                  <tr key={s.seller_id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-3.5 py-2.5 font-black text-xs">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <p className="font-bold text-gray-900">{s.shop_name}</p>
                      <p className="text-[10px] text-gray-400">{s.seller_name} · {s.email ?? NA}</p>
                    </td>
                    <td className="px-3.5 py-2.5 font-bold text-gray-900">{peso(s.gross_sales)}</td>
                    <td className="px-3.5 py-2.5 text-gray-600 font-medium">{whole(s.orders_count)}</td>
                    <td className="px-3.5 py-2.5 text-gray-600">{whole(s.units_sold)}</td>
                    <td className="px-3.5 py-2.5 font-bold text-brand-red">{peso(s.commission_generated)}</td>
                    <td className="px-3.5 py-2.5 font-bold text-emerald-600 text-right">{peso(s.net_payout_credited)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
