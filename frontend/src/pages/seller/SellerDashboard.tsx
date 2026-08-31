import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, ShoppingCart, Package, AlertTriangle,
  ArrowRight, Wallet, ChevronRight, Activity, Minus, MessageSquare,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';
import type { SellerDashboardStats, SellerChartPoint, SellerTopProduct, SellerAttentionItem } from '../../types';
import {
  getSellerDashboardStatsApi,
  getSellerDashboardChartApi,
  getSellerDashboardAttentionApi,
  getSellerTopProductsApi,
} from '../../api/client';

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trendDir(current: number, previous: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, dir: current > 0 ? 'up' : 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

// ─── TrendBadge ───────────────────────────────────────────────────────────────

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const { pct, dir } = trendDir(current, previous);
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  prefix?: string;
  sub?: string;
  to?: string;
  trend?: React.ReactNode;
  actionItem?: boolean;
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, prefix, sub, to, trend, actionItem }: StatCardProps) {
  const numericTarget = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericTarget);
  const displayValue = typeof value === 'number'
    ? `${prefix ?? ''}${animated.toLocaleString('en-PH')}`
    : value;

  const isActionable = actionItem && typeof value === 'number' && value > 0;

  const inner = (
    <div className={[
      'bg-white rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 h-full',
      isActionable
        ? 'border border-red-100 shadow-sm shadow-red-50'
        : 'border border-gray-100 shadow-sm',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-1">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {isActionable && (
          <span className="text-[9px] font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-wide leading-none border border-red-100">
            Action
          </span>
        )}
      </div>
      <div>
        <p className="text-[13px] text-gray-500 font-medium">{label}</p>
        <p className={`text-3xl font-black mt-0.5 leading-none ${isActionable ? 'text-brand-red' : 'text-gray-900'}`}>
          {displayValue}
        </p>
        {trend && <div className="mt-1.5">{trend}</div>}
        {sub && !trend && <p className="text-[12px] text-gray-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// ─── AttentionFeedItem ────────────────────────────────────────────────────────

const ATTENTION_META: Record<
  SellerAttentionItem['type'],
  { icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  new_order:        { icon: ShoppingCart,  iconBg: 'bg-blue-50',  iconColor: 'text-blue-500' },
  low_stock:        { icon: AlertTriangle, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
  unread_message:   { icon: MessageSquare, iconBg: 'bg-red-50',   iconColor: 'text-brand-red' },
  rejected_product: { icon: Package,       iconBg: 'bg-red-50',   iconColor: 'text-red-600' },
};

function AttentionFeedItem({ item }: { item: SellerAttentionItem }) {
  const meta = ATTENTION_META[item.type];
  const Icon = meta.icon;
  return (
    <Link
      to={item.link}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-gray-50 transition-colors group"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
        <Icon className={`w-4 h-4 ${meta.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-gray-800 truncate">{item.label}</p>
        <p className="text-[12px] text-gray-400 truncate mt-0.5">{item.sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </Link>
  );
}

// ─── TopProductRow ────────────────────────────────────────────────────────────

function TopProductRow({ product, rank }: { product: SellerTopProduct; rank: number }) {
  return (
    <Link
      to={`/seller/products/${product.id}/edit`}
      className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-5 px-5 transition-colors group"
    >
      <span className="w-6 text-center text-[13px] font-bold text-gray-300 shrink-0">{rank}</span>
      <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0 overflow-hidden">
        {product.thumbnail_url
          ? <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package className="w-4 h-4" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-gray-800 truncate group-hover:text-brand-red transition-colors">{product.name}</p>
        <p className="text-[12px] text-gray-400 mt-0.5">{product.units_sold} sold</p>
      </div>
      <p className="text-[13.5px] font-bold text-gray-800 shrink-0">{fmt(product.revenue)}</p>
    </Link>
  );
}

// ─── WelcomeHeader ────────────────────────────────────────────────────────────

function WelcomeHeader({ firstName, shopName, available }: { firstName: string; shopName: string; available: number }) {
  const animatedBalance = useCountUp(available);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-400 font-medium">Welcome back,</p>
        <h1 className="text-2xl font-black text-gray-900 leading-tight mt-0.5">
          {firstName} <span className="text-gray-400 font-semibold text-lg">· {shopName}</span>
        </h1>
      </div>
      <div className="flex items-center gap-5 sm:border-l sm:border-gray-100 sm:pl-6">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Available Balance</p>
          </div>
          <p className="text-3xl font-black text-gray-900 leading-none">
            ₱{animatedBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <Link
          to="/seller/earnings"
          className="shrink-0 px-4 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors whitespace-nowrap"
        >
          Request Payout
        </Link>
      </div>
    </div>
  );
}

// ─── NeedsAttentionSection ────────────────────────────────────────────────────

function NeedsAttentionSection({ items, loading }: { items: SellerAttentionItem[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          {items.length > 0 && <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />}
          <h2 className="text-[14px] font-bold text-gray-900">Needs Attention</h2>
        </div>
        {items.length > 0 && (
          <span className="text-[12px] text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      {loading ? (
        <div className="px-5 py-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded-full w-3/5" />
                <div className="h-2.5 bg-gray-100 rounded-full w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-gray-800 mt-1">All caught up</p>
          <p className="text-xs text-gray-400">No items need your attention right now.</p>
        </div>
      ) : (
        <div className="px-2 py-2 divide-y divide-gray-50">
          {items.map((item) => (
            <AttentionFeedItem key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SalesTrendChart ──────────────────────────────────────────────────────────

function SalesTrendChart({ loading, data }: { loading: boolean; data: SellerChartPoint[] }) {
  const isEmpty = !loading && data.every((d) => d.sales === 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="text-[14px] font-bold text-gray-900">Sales Trend</h2>
      </div>
      {loading ? (
        <div className="px-4 py-8 animate-pulse">
          <div className="h-[220px] bg-gray-50 rounded-xl" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
            <Activity className="w-4 h-4 text-gray-300" />
          </div>
          <p className="text-[12px] font-semibold text-gray-400">No sales yet</p>
          <p className="text-[11px] text-gray-300">Your sales chart will appear once you get your first order.</p>
        </div>
      ) : (
        <div className="px-2 py-4" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="seller-sales-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#A32D2D" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#A32D2D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                width={44}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                labelStyle={{ fontWeight: 700, color: '#111', marginBottom: 2 }}
                formatter={(value: number) => [fmt(value), 'Sales']}
              />
              <Area
                type="monotoneX" dataKey="sales"
                stroke="#A32D2D" strokeWidth={2.5}
                fill="url(#seller-sales-fill)"
                dot={false}
                activeDot={{ r: 5, fill: '#A32D2D', strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── TopProductsSection ───────────────────────────────────────────────────────

function TopProductsSection({ products, loading }: { products: SellerTopProduct[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="text-[14px] font-bold text-gray-900">Top Products</h2>
        <Link to="/seller/products" className="flex items-center gap-1 text-[12px] text-brand-red font-semibold hover:underline">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {loading ? (
        <div className="px-5 py-3 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 py-2 animate-pulse">
              <div className="w-6 h-3 bg-gray-100 rounded-full shrink-0" />
              <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded-full w-2/5" />
                <div className="h-2.5 bg-gray-100 rounded-full w-1/5" />
              </div>
              <div className="h-3 bg-gray-100 rounded-full w-16 shrink-0" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Package className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-sm font-bold text-gray-800 mt-1">No products yet</p>
          <p className="text-xs text-gray-400">List your first product to start selling.</p>
          <Link
            to="/seller/products/new"
            className="mt-2 px-4 py-2 rounded-xl bg-brand-red text-white text-[12px] font-bold hover:bg-brand-red-dark transition-colors"
          >
            Add Product
          </Link>
        </div>
      ) : (
        <div className="px-5 py-2">
          {products.map((p, i) => (
            <TopProductRow key={p.id} product={p} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SellerDashboard ──────────────────────────────────────────────────────────

export default function SellerDashboard() {
  const { user } = useAuth();
  const pageRef = useMountAnim();

  const [stats, setStats] = useState<SellerDashboardStats | null>(null);
  const [chart, setChart] = useState<SellerChartPoint[]>([]);
  const [attention, setAttention] = useState<SellerAttentionItem[]>([]);
  const [topProducts, setTopProducts] = useState<SellerTopProduct[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);
  const [loadingAttention, setLoadingAttention] = useState(true);
  const [loadingTop, setLoadingTop] = useState(true);

  useEffect(() => {
    getSellerDashboardStatsApi()
      .then(setStats)
      .catch(() => null)
      .finally(() => setLoadingStats(false));

    getSellerDashboardChartApi('7d')
      .then(setChart)
      .catch(() => null)
      .finally(() => setLoadingChart(false));

    getSellerDashboardAttentionApi()
      .then(setAttention)
      .catch(() => null)
      .finally(() => setLoadingAttention(false));

    getSellerTopProductsApi()
      .then(setTopProducts)
      .catch(() => null)
      .finally(() => setLoadingTop(false));
  }, []);

  return (
    <div ref={pageRef} className="max-w-4xl mx-auto space-y-5">
      {/* Welcome + balance */}
      <WelcomeHeader
        firstName={user?.first_name ?? ''}
        shopName={user?.seller_profile?.shop_name ?? ''}
        available={stats?.balance.available ?? 0}
      />

      {/* Key stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="Today's Sales"
          value={loadingStats ? '—' : stats?.today_sales ?? 0}
          prefix="₱"
          trend={
            stats
              ? <TrendBadge current={stats.today_sales} previous={stats.yesterday_sales ?? 0} label="yesterday" />
              : undefined
          }
        />
        <StatCard
          icon={ShoppingCart}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Orders to Pack"
          value={loadingStats ? '—' : stats?.orders_to_pack ?? 0}
          sub="awaiting fulfillment"
          to="/seller/orders"
          actionItem
        />
        <StatCard
          icon={Package}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          label="Products Listed"
          value={loadingStats ? '—' : stats?.total_products ?? 0}
          sub="active listings"
          to="/seller/products"
        />
        <StatCard
          icon={AlertTriangle}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          label="Low Stock Items"
          value={loadingStats ? '—' : stats?.low_stock_count ?? 0}
          sub="need restocking"
          to="/seller/inventory"
          actionItem
        />
      </div>

      {/* Needs attention */}
      <NeedsAttentionSection items={attention} loading={loadingAttention} />

      {/* Sales trend chart */}
      <SalesTrendChart data={chart} loading={loadingChart} />

      {/* Top products */}
      <TopProductsSection products={topProducts} loading={loadingTop} />
    </div>
  );
}
