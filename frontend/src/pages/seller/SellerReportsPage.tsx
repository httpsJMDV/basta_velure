import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  Coins,
  Package,
  QrCode,
  Truck,
  Award,
  Wallet,
  CreditCard,
  CalendarRange,
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
  getSellerReportSummaryApi,
  getSellerRevenueChartApi,
  getSellerPaymentMethodsApi,
  getSellerReportTopProductsApi,
} from '../../api/client';
import type {
  SellerReportSummary,
  SellerRevenueChartPoint,
  SellerTopProduct,
  PaymentMethodSplit,
} from '../../types';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';
import { apiErrorMessage } from '../../utils/apiError';

const peso = (n: number) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Today's date in Manila, as YYYY-MM-DD. */
const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const TIMEFRAMES = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: '12 Months', value: '12m' },
  { label: 'Custom', value: 'custom' },
];

export default function SellerReportsPage() {
  const pageRef = useMountAnim();

  const [range, setRange] = useState<string>('30d');
  const [interval, setInterval] = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // The custom range being typed, and the one last applied.
  const [fromInput, setFromInput] = useState<string>(manilaToday());
  const [toInput, setToInput] = useState<string>(manilaToday());
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const rangeError = fromInput && toInput && toInput < fromInput ? 'The end date cannot be before the start date.' : null;

  const [summary, setSummary] = useState<SellerReportSummary | null>(null);
  const [chartData, setChartData] = useState<SellerRevenueChartPoint[]>([]);
  const [paymentSplit, setPaymentSplit] = useState<PaymentMethodSplit | null>(null);
  const [topProducts, setTopProducts] = useState<SellerTopProduct[]>([]);

  const loadData = useCallback(async () => {
    if (range === 'custom' && !custom) return;
    const params = range === 'custom' && custom ? { from: custom.from, to: custom.to } : { range };
    setLoading(true);
    setError(null);
    try {
      const [sum, chart, split, top] = await Promise.all([
        getSellerReportSummaryApi(params),
        getSellerRevenueChartApi({ ...params, interval: range === '12m' ? 'monthly' : interval }),
        getSellerPaymentMethodsApi(params),
        getSellerReportTopProductsApi(params),
      ]);
      setSummary(sum);
      setChartData(chart);
      setPaymentSplit(split);
      setTopProducts(top);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not load the report. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [range, interval, custom]);

  const applyCustom = () => {
    if (!fromInput || !toInput || rangeError) return;
    setCustom({ from: fromInput, to: toInput });
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Animated numbers
  const animatedGmv = useCountUp(summary?.gross_sales ?? 0);
  const animatedEarnings = useCountUp(summary?.net_earnings ?? 0);
  const animatedOrders = useCountUp(summary?.total_orders ?? 0);
  const animatedFees = useCountUp(summary?.commission_paid ?? 0);

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Modern White / Pearl-Gray Executive Hero Command Bar ── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-gray-900 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-brand-red shrink-0 border border-rose-100">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                Store Sales Reports &amp; Revenue Analytics
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {summary?.from && summary?.to && !loading
                ? `${fmtDay(summary.from)}${summary.from !== summary.to ? ` to ${fmtDay(summary.to)}` : ''} · Manila time, both days included`
                : 'Sales, earnings and best sellers for the period you pick'}
            </p>
          </div>
        </div>

        {/* Timeframe Selector inside Hero Bar */}
        <div className="flex items-center gap-1 bg-gray-100/90 p-0.5 rounded-xl border border-gray-200/70 self-end md:self-auto shrink-0">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setRange(t.value);
                if (t.value === 'custom' && !custom && !rangeError) setCustom({ from: fromInput, to: toInput });
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                range === t.value
                  ? 'bg-brand-red text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {range === 'custom' && (
        <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 shadow-xs">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              applyCustom();
            }}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-gray-700 mr-1 self-center">
              <CalendarRange className="w-4 h-4 text-brand-red" /> Custom range
            </div>
            <label className="text-[11px] font-semibold text-gray-500">
              From
              <input
                type="date"
                value={fromInput}
                max={manilaToday()}
                onChange={(e) => setFromInput(e.target.value)}
                className="mt-1 block h-9 px-2.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-red"
              />
            </label>
            <label className="text-[11px] font-semibold text-gray-500">
              To
              <input
                type="date"
                value={toInput}
                max={manilaToday()}
                onChange={(e) => setToInput(e.target.value)}
                aria-invalid={!!rangeError}
                className={`mt-1 block h-9 px-2.5 text-sm text-gray-900 bg-white border rounded-lg focus:outline-none ${rangeError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red'}`}
              />
            </label>
            <button
              type="submit"
              disabled={!!rangeError || !fromInput || !toInput}
              className="h-9 px-4 rounded-lg bg-brand-red text-white text-xs font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
            {rangeError && <p className="basis-full text-[11px] font-semibold text-red-600">{rangeError}</p>}
          </form>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl px-4 py-2.5">{error}</div>
      )}

      {/* ── 2. Compact 4-Card Summary KPI Grid ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
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
          {/* Gross Sales */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{summary?.total_orders ?? 0} orders</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedGmv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Gross sales</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {(summary?.seller_discounts ?? 0) > 0
                  ? `Items sold; your discounts −${peso(summary?.seller_discounts ?? 0)}`
                  : 'Items sold, shipping not included'}
              </p>
            </div>
          </div>

          {/* Net Merchant Earnings */}
          <div className="bg-white rounded-xl p-3.5 border border-emerald-200/80 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                <Wallet className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Your share
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight leading-none">
                ₱{animatedEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Net earnings</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">After your discounts and the 5% commission</p>
            </div>
          </div>

          {/* Orders Fulfilled */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{summary?.delivered_orders ?? 0} delivered</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {animatedOrders.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Orders</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">{summary?.units_sold ?? 0} units · cancelled and returned left out</p>
            </div>
          </div>

          {/* Platform Fees */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold shrink-0">
                <Coins className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">5%</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedFees.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Loved-IT commission</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">5% of sales after your discounts</p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Revenue Over Time Chart ── */}
      {loading ? (
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-72 animate-pulse" />
      ) : (
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Store Revenue Performance</h2>
              <p className="text-[11px] text-gray-400">Gross sales and net earnings for the same period</p>
            </div>

            {range !== '12m' && range !== 'today' && (
              <div className="flex items-center gap-1 bg-gray-100/80 p-0.5 rounded-lg text-[11px] font-bold border border-gray-200/50">
                <button
                  onClick={() => setInterval('daily')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    interval === 'daily' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setInterval('monthly')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    interval === 'monthly' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Monthly
                </button>
              </div>
            )}
          </div>

          {/* Chart area with no black focus outline */}
          <div className="h-60 w-full pt-2 [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_.recharts-wrapper]:outline-none focus:outline-none select-none">
            <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
                <defs>
                  <linearGradient id="sellerGmvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A32D2D" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#A32D2D" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="sellerEarnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
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
                  formatter={(value: any, name: any) => [
                    `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                    name === 'sales' || name === 'gross_sales' ? 'Gross Sales' : 'Net Earnings',
                  ]}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: 6, fontSize: 11 }}
                  formatter={(val) => (val === 'gross_sales' || val === 'sales' ? 'Gross Sales' : 'Net Earnings')}
                />
                <Area type="monotone" dataKey="gross_sales" stroke="#A32D2D" strokeWidth={2.5} fillOpacity={1} fill="url(#sellerGmvGrad)" />
                <Area type="monotone" dataKey="net_earnings" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#sellerEarnGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── 4. Payment Channels Split & Top Products (2-Column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Payment Channels Split (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <QrCode className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Payment Method Volume</h3>
              <p className="text-[10px] text-gray-400">How buyers paid for your orders</p>
            </div>
          </div>

          <div className="space-y-3 text-xs pt-1">
            {(() => {
              const channels = [
                { key: 'cod', label: 'Cash on Delivery', icon: Truck, text: 'text-emerald-700', bar: 'bg-emerald-600', row: paymentSplit?.cod },
                { key: 'gcash', label: 'GCash to your shop', icon: QrCode, text: 'text-[#007DFE]', bar: 'bg-[#007DFE]', row: paymentSplit?.gcash },
                { key: 'e_wallet_card', label: 'E-wallet & card (via Loved-IT)', icon: CreditCard, text: 'text-violet-700', bar: 'bg-violet-600', row: paymentSplit?.e_wallet_card },
              ];
              const total = channels.reduce((s, c) => s + (c.row?.volume ?? 0), 0);
              return channels.map((c) => {
                const share = total > 0 ? Math.round(((c.row?.volume ?? 0) / total) * 100) : 0;
                return (
                  <div key={c.key} className="p-3 bg-gray-50 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className={`font-bold ${c.text} flex items-center gap-1`}>
                        <c.icon className="w-3.5 h-3.5" /> {c.label}
                      </span>
                      <span className="font-mono font-bold text-gray-900">{peso(c.row?.volume ?? 0)}</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className={`${c.bar} h-full rounded-full transition-all`} style={{ width: `${share}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>{c.row?.count ?? 0} {(c.row?.count ?? 0) === 1 ? 'order' : 'orders'}</span>
                      <span>{share}% share</span>
                    </div>
                  </div>
                );
              });
            })()}
            <p className="text-[10px] text-gray-400 leading-snug">
              Order totals as the buyer paid them, shipping included. Cancelled and returned orders are left out.
            </p>
          </div>
        </div>

        {/* Top Performing Merchandise (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold">
                <Award className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Top Performing Merchandise</h3>
                <p className="text-[10px] text-gray-400">Ranked by gross sales volume during selected period</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {topProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">
                No product revenue records found for this timeframe.
              </div>
            ) : (
              topProducts.slice(0, 5).map((p, idx) => (
                <div key={p.product_id || (p as any).id || idx} className="py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50/60 px-1 rounded-xl transition-colors">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="w-5 text-center font-mono font-bold text-gray-400 text-xs">
                      #{idx + 1}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0 overflow-hidden border border-gray-200/60">
                      {(p as any).thumbnail_url ? (
                        <img src={(p as any).thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400">{p.units_sold} units sold</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-gray-900 block">
                      ₱{Number(p.gross_sales || (p as any).revenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">Gross Sales</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
