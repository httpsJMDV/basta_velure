import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  AlertTriangle,
  ArrowRight,
  Wallet,
  Activity,
  Minus,
  MessageSquare,
  Plus,
  QrCode,
  Truck,
  CheckCircle2,
  Store,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';
import type {
  SellerDashboardStats,
  SellerChartPoint,
  SellerTopProduct,
  SellerAttentionItem,
} from '../../types';
import {
  getSellerDashboardStatsApi,
  getSellerDashboardChartApi,
  getSellerDashboardAttentionApi,
  getSellerTopProductsApi,
} from '../../api/client';

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function trendDir(current: number, previous: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, dir: current > 0 ? 'up' : 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const { pct, dir } = trendDir(current, previous);
  if (dir === 'flat') {
    return (
      <span className="text-[10px] text-gray-400 flex items-center gap-0.5 font-medium">
        <Minus className="w-2.5 h-2.5" /> No change vs {label}
      </span>
    );
  }
  const up = dir === 'up';
  return (
    <span
      className={`text-[10px] flex items-center gap-0.5 font-bold ${
        up ? 'text-emerald-600' : 'text-rose-500'
      }`}
    >
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '↑' : '↓'} {pct}% vs {label}
    </span>
  );
}

function getInitials(text: string): string {
  if (!text) return '??';
  const clean = text.replace(/^(Order #|Low stock:|Review on)/i, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const pageRef = useMountAnim();

  const [stats, setStats] = useState<SellerDashboardStats | null>(null);
  const [chartData, setChartData] = useState<SellerChartPoint[]>([]);
  const [attentionItems, setAttentionItems] = useState<SellerAttentionItem[]>([]);
  const [topProducts, setTopProducts] = useState<SellerTopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes, aRes, tRes] = await Promise.all([
        getSellerDashboardStatsApi(),
        getSellerDashboardChartApi('14d'),
        getSellerDashboardAttentionApi(),
        getSellerTopProductsApi(),
      ]);
      setStats(sRes);
      setChartData(cRes);
      setAttentionItems(aRes);
      setTopProducts(tRes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Animated KPI numbers
  const animatedGmv = useCountUp(stats?.today_sales ?? 0);
  const animatedOrdersToPack = useCountUp(stats?.orders_to_pack ?? 0);
  const animatedProducts = useCountUp(stats?.total_products ?? 0);
  const animatedLowStock = useCountUp(stats?.low_stock_count ?? 0);
  const animatedBalance = useCountUp(stats?.balance?.available ?? 0);

  const ATTENTION_META: Record<
    SellerAttentionItem['type'],
    { label: string; bg: string; text: string; initialBg: string; icon: React.ElementType }
  > = {
    new_order:        { label: 'New Order',       bg: 'bg-blue-50 border-blue-200/80',   text: 'text-blue-700',    initialBg: 'bg-blue-600 text-white',     icon: ShoppingCart },
    low_stock:        { label: 'Low Stock',       bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-700',  initialBg: 'bg-amber-600 text-white',    icon: AlertTriangle },
    unread_message:   { label: 'Unread Message',  bg: 'bg-rose-50 border-rose-200/80',   text: 'text-rose-700',   initialBg: 'bg-brand-red text-white',    icon: MessageSquare },
    rejected_product: { label: 'Listing Review',  bg: 'bg-red-50 border-red-200/80',     text: 'text-red-700',    initialBg: 'bg-red-600 text-white',      icon: Package },
  };

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Modern White / Pearl-Gray Executive Hero Command Bar ── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-gray-900 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-brand-red shrink-0 border border-rose-100">
            <Store className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                Merchant Store · {user?.first_name} {user?.last_name}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Real-time merchant sales, pending order verifications, and available payout balance
            </p>
          </div>
        </div>

        {/* Balance metric and Quick Actions inside Hero */}
        <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
          <div className="text-right pr-2 border-r border-gray-200 hidden sm:block">
            <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Available Balance</span>
            <span className="text-sm sm:text-base font-black text-gray-900">
              ₱{animatedBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <Link
            to="/seller/earnings"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors"
          >
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            Payouts
          </Link>

          <Link
            to="/seller/products/add"
            className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold bg-brand-red hover:bg-[#8e2424] text-white shadow-xs rounded-xl transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </Link>
        </div>
      </div>

      {/* ── 2. Compact 4-Card Merchant Performance KPI Row ── */}
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
          {/* Gross Sales Today */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
                <ShoppingCart className="w-3.5 h-3.5" />
              </div>
              <TrendBadge current={stats?.today_sales ?? 0} previous={stats?.yesterday_sales ?? 0} label="yesterday" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedGmv.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Today's Sales</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Total customer gross volume</p>
            </div>
          </div>

          {/* Orders to Pack / Dispatch */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Truck className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                To Ship
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {animatedOrdersToPack.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Orders to Pack</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Awaiting parcel dispatch</p>
            </div>
          </div>

          {/* Active Products Listed */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">Live Catalog</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {animatedProducts.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Active Listings</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Live on marketplace search</p>
            </div>
          </div>

          {/* Low Stock Items */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Low Stock
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                {animatedLowStock.toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Low Stock Alerts</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Variants requiring restock</p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Sales Trend Chart & Merchant Operations (Row 3 - Switched Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Sales Trend Chart (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Store Sales Trend (Last 14 Days)</h2>
              <p className="text-[11px] text-gray-400">Daily Gross Sales volume performance</p>
            </div>
            <Link
              to="/seller/reports"
              className="text-xs font-bold text-brand-red hover:underline flex items-center gap-1"
            >
              Full Analytics <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Recharts area with no focus outline */}
          <div className="h-56 w-full pt-2 [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_.recharts-wrapper]:outline-none focus:outline-none select-none">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                No recent sales activity to graph yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
                  <defs>
                    <linearGradient id="sellerSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A32D2D" stopOpacity={0.2} />
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
                    formatter={(value: any) => [
                      `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                      'Sales Revenue',
                    ]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#A32D2D"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#sellerSalesGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Merchant Operations Panel (5 Cols - Switched here next to chart) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 font-bold">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Merchant Operations</h3>
              <p className="text-[10px] text-gray-400">Essential store management shortcuts</p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <Link
              to="/seller/orders?tab=pending_verification"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-rose-50/60 hover:text-brand-red transition-all font-semibold text-gray-700 border border-gray-100"
            >
              <span className="flex items-center gap-2.5">
                <QrCode className="w-4 h-4 text-blue-600" /> Verify GCash Payments
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </Link>

            <Link
              to="/seller/orders?tab=confirmed"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-rose-50/60 hover:text-brand-red transition-all font-semibold text-gray-700 border border-gray-100"
            >
              <span className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-amber-600" /> Ready to Ship Queue
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </Link>

            <Link
              to="/seller/products/add"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-rose-50/60 hover:text-brand-red transition-all font-semibold text-gray-700 border border-gray-100"
            >
              <span className="flex items-center gap-2.5">
                <Plus className="w-4 h-4 text-emerald-600" /> Create New Listing
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </Link>

            <Link
              to="/seller/earnings"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-rose-50/60 hover:text-brand-red transition-all font-semibold text-gray-700 border border-gray-100"
            >
              <span className="flex items-center gap-2.5">
                <Wallet className="w-4 h-4 text-violet-600" /> Request Payout Withdrawal
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 4. Needs Attention Queue & Top Performing Products (Row 4 - Switched Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Needs Attention Queue (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between p-3.5 border-b border-gray-100">
            <h3 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Needs Attention Queue</h3>
            <span className="text-[10px] font-bold text-brand-red bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
              {attentionItems.length} Action{attentionItems.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="divide-y divide-gray-100 overflow-y-auto max-h-[260px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {attentionItems.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 space-y-1">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                <p className="font-bold text-gray-800">All Clear &amp; Fulfillable</p>
                <p className="text-[11px] text-gray-400">No urgent orders or low-stock alerts right now.</p>
              </div>
            ) : (
              attentionItems.map((item) => {
                const meta = ATTENTION_META[item.type] ?? {
                  label: item.type,
                  bg: 'bg-gray-50 border-gray-200',
                  text: 'text-gray-700',
                  initialBg: 'bg-gray-600 text-white',
                  icon: Activity,
                };

                return (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={item.link}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50/80 transition-colors group"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[9px] tracking-tight shrink-0 shadow-2xs ${meta.initialBg}`}>
                      {getInitials(item.label)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${meta.bg} ${meta.text}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs font-bold leading-tight text-gray-900 truncate transition-colors group-hover:text-brand-red">
                        {item.label}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.sub}</p>
                    </div>

                    <div className="flex items-center justify-center w-6 h-6 text-gray-400 transition-all rounded-md bg-gray-50 group-hover:bg-brand-red group-hover:text-white shrink-0">
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="px-3.5 py-2 bg-gray-50/60 border-t border-gray-100 text-center">
            <span className="text-[10px] text-gray-400">Process pending orders within 24h to maintain fast dispatch rating</span>
          </div>
        </div>

        {/* Top Performing Products Leaderboard (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div>
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Top Performing Products</h3>
              <p className="text-[11px] text-gray-400">Best-selling merchandise by gross volume</p>
            </div>
            <Link
              to="/seller/products"
              className="text-xs font-bold text-brand-red hover:underline flex items-center gap-1"
            >
              Manage Catalog <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {topProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                No product sales records logged yet.
              </div>
            ) : (
              topProducts.slice(0, 5).map((product, idx) => (
                <div
                  key={product.id || idx}
                  className="py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50/70 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-5 text-center font-mono font-bold text-gray-400 text-xs">
                      #{idx + 1}
                    </span>
                    <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0 overflow-hidden border border-gray-200/60">
                      {product.thumbnail_url ? (
                        <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate leading-tight">{product.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{product.units_sold} units fulfilled</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-gray-900 block">{fmt(product.revenue || (product as any).gross_sales || 0)}</span>
                    <span className="text-[10px] text-emerald-600 font-bold">Gross Revenue</span>
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
