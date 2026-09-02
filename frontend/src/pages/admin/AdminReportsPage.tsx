import { useEffect, useState, useCallback } from 'react';
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
} from '../../types';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';

const TIMEFRAMES = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'Past 12 Months', value: '12m' },
];

const CATEGORY_COLORS = ['#A32D2D', '#007DFE', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

export default function AdminReportsPage() {
  const [range, setRange] = useState<string>('30d');
  const [interval, setInterval] = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading] = useState<boolean>(true);

  const [summary, setSummary] = useState<AdminReportSummary | null>(null);
  const [chartData, setChartData] = useState<AdminRevenueChartPoint[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [sellers, setSellers] = useState<TopSellerItem[]>([]);
  const [paymentSplit, setPaymentSplit] = useState<PaymentMethodSplit | null>(null);

  const pageRef = useMountAnim();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, chart, cats, topSell, split] = await Promise.all([
        getAdminReportSummaryApi(range),
        getAdminRevenueChartApi({ range, interval: range === '12m' ? 'monthly' : interval }),
        getAdminCategoryBreakdownApi(range),
        getAdminTopSellersApi(range),
        getAdminPaymentSplitApi(range),
      ]);
      setSummary(sum);
      setChartData(chart);
      setCategories(cats);
      setSellers(topSell);
      setPaymentSplit(split);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [range, interval]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const animatedCommission = useCountUp(summary?.total_commission ?? 0);
  const animatedGmv        = useCountUp(summary?.total_gmv ?? 0);
  const animatedEarnings   = useCountUp(summary?.total_seller_earnings ?? 0);
  const animatedUnits      = useCountUp(summary?.total_units_sold ?? 0);

  return (
    <div ref={pageRef} className="pb-8 space-y-4">
      {/* ── 1. Compact Executive Hero Command Bar ── */}
      <div
        className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Platform Reports &amp; Analytics</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Real-time financial breakdown, category commissions, and seller revenue performance
            </p>
          </div>
        </div>

        {/* Timeframe Selector Chips inside Hero */}
        <div className="flex items-center gap-1 bg-neutral-800/90 p-0.5 rounded-xl border border-neutral-700/60 self-end md:self-auto shrink-0">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setRange(t.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                range === t.value
                  ? 'bg-brand-red text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Summary KPI Grid (4 Compact Cards) ── */}
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
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
                <Coins className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">Rate: {summary?.avg_commission_rate ?? 10}%</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-brand-red tracking-tight leading-none">
                ₱{animatedCommission.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Platform Commission</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Total platform take-rate revenue</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{summary?.total_orders ?? 0} orders</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedGmv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Gross Merchandise Value</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Total marketplace volume</p>
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
                ₱{animatedEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Seller Payout Earnings</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Disbursed store partner revenue</p>
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
                {animatedUnits.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Total Units Sold</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Across all item categories</p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Main Revenue Over Time Chart ── */}
      {loading ? (
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-72 animate-pulse" />
      ) : (
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Platform Revenue Over Time</h2>
              <p className="text-[11px] text-gray-400">Gross Merchandise Value (GMV) vs Platform Commission Net</p>
            </div>

            {range !== '12m' && (
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
                  formatter={(value: any, name: any) => [
                    `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                    name === 'gmv' ? 'Gross GMV' : 'Platform Commission',
                  ]}
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
        </div>
      )}

      {/* ── 4. Category Breakdown & Payment Channels (2-Column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Category Breakdown (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Category Sales &amp; Commission Breakdown</h2>
              <p className="text-[11px] text-gray-400">
                Food &amp; Grocery has an 8% commission override vs 10% standard rate
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
                    <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        {cat.category}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          cat.commission_rate <= 8 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {cat.commission_rate}% {cat.commission_rate <= 8 ? '(Override)' : ''}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-gray-900">
                        ₱{cat.gross_sales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-600">
                        {cat.units_sold.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-brand-red text-right">
                        ₱{cat.commission_earned.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Methods Split Bar (1 col) */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Payment Channels</h2>
              <PieChartIcon className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400">GCash Direct Scan vs Cash on Delivery</p>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-sky-50/50 border border-sky-100 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#007DFE] flex items-center gap-1"><QrCode className="w-3 h-3" /> GCash</span>
                <span className="font-mono text-gray-500 text-[10px]">{paymentSplit?.gcash.count ?? 0} orders</span>
              </div>
              <p className="text-base font-black text-gray-900">
                ₱{(paymentSplit?.gcash.volume ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <div className="w-full bg-sky-200/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#007DFE] h-full"
                  style={{
                    width: `${paymentSplit?.total_volume ? ((paymentSplit.gcash.volume / paymentSplit.total_volume) * 100) : 50}%`,
                  }}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-blue-700 flex items-center gap-1"><Truck className="w-3 h-3" /> COD</span>
                <span className="font-mono text-gray-500 text-[10px]">{paymentSplit?.cod.count ?? 0} orders</span>
              </div>
              <p className="text-base font-black text-gray-900">
                ₱{(paymentSplit?.cod.volume ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <div className="w-full bg-blue-200/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full"
                  style={{
                    width: `${paymentSplit?.total_volume ? ((paymentSplit.cod.volume / paymentSplit.total_volume) * 100) : 50}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex justify-between text-xs font-bold text-gray-700">
            <span>Total Captured:</span>
            <span>₱{(paymentSplit?.total_volume ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* ── 5. Seller Performance Leaderboard ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Top Seller Performance Leaderboard</h2>
            <p className="text-[11px] text-gray-400">Ranked by gross sales volume and platform commission generated</p>
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
                    No active seller revenue records found for this period.
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
                      <p className="text-[10px] text-gray-400">{s.seller_name} · {s.email}</p>
                    </td>
                    <td className="px-3.5 py-2.5 font-bold text-gray-900">
                      ₱{s.gross_sales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-600 font-medium">
                      {s.orders_count}
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-600">
                      {s.units_sold}
                    </td>
                    <td className="px-3.5 py-2.5 font-bold text-brand-red">
                      ₱{s.commission_generated.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2.5 font-bold text-emerald-600 text-right">
                      ₱{s.net_payout_credited.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
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
