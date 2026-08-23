import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, ShoppingCart, Package, AlertTriangle,
  ArrowRight, Wallet, ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import type { SellerDashboardStats, SellerChartPoint, SellerTopProduct, SellerAttentionItem } from '../../types';

// ─── Mock data (replace with real API calls) ──────────────────────────────────

const MOCK_STATS: SellerDashboardStats = {
  today_sales: 4820,
  orders_to_pack: 7,
  total_products: 34,
  low_stock_count: 3,
  balance: { pending: 12400, available: 8750, total_paid_out: 31200 },
};

const MOCK_CHART_7D: SellerChartPoint[] = [
  { date: 'Mon', sales: 1200, orders: 4 },
  { date: 'Tue', sales: 2100, orders: 7 },
  { date: 'Wed', sales: 800,  orders: 3 },
  { date: 'Thu', sales: 3400, orders: 11 },
  { date: 'Fri', sales: 2900, orders: 9 },
  { date: 'Sat', sales: 4820, orders: 15 },
  { date: 'Sun', sales: 1600, orders: 5 },
];

const MOCK_CHART_14D: SellerChartPoint[] = [
  { date: '6/1',  sales: 900,  orders: 3 },
  { date: '6/2',  sales: 1500, orders: 5 },
  { date: '6/3',  sales: 2200, orders: 7 },
  { date: '6/4',  sales: 1100, orders: 4 },
  { date: '6/5',  sales: 3100, orders: 10 },
  { date: '6/6',  sales: 2700, orders: 9 },
  { date: '6/7',  sales: 1800, orders: 6 },
  { date: '6/8',  sales: 1200, orders: 4 },
  { date: '6/9',  sales: 2100, orders: 7 },
  { date: '6/10', sales: 800,  orders: 3 },
  { date: '6/11', sales: 3400, orders: 11 },
  { date: '6/12', sales: 2900, orders: 9 },
  { date: '6/13', sales: 4820, orders: 15 },
  { date: '6/14', sales: 1600, orders: 5 },
];

const MOCK_ATTENTION: SellerAttentionItem[] = [
  { type: 'new_order',       id: 1, label: 'New order #VL-00421',        sub: 'Placed 12 minutes ago — needs packing',    link: '/seller/orders' },
  { type: 'low_stock',       id: 2, label: 'Classic White Tee (S) — 2 left', sub: 'Restock soon to avoid lost sales',     link: '/seller/inventory' },
  { type: 'unread_message',  id: 3, label: '3 unread messages',           sub: 'Buyers are waiting for your reply',        link: '/seller/messages' },
  { type: 'rejected_product',id: 4, label: 'Wireless Earbuds listing rejected', sub: 'Tap to see reason and resubmit',    link: '/seller/products' },
];

const MOCK_TOP_PRODUCTS: SellerTopProduct[] = [
  { id: 1, name: 'Classic White Tee',       thumbnail_url: null, units_sold: 142, revenue: 28400 },
  { id: 2, name: 'Wireless Earbuds Pro',    thumbnail_url: null, units_sold: 89,  revenue: 53400 },
  { id: 3, name: 'Leather Crossbody Bag',   thumbnail_url: null, units_sold: 67,  revenue: 40200 },
  { id: 4, name: 'Stainless Tumbler 500ml', thumbnail_url: null, units_sold: 54,  revenue: 10800 },
  { id: 5, name: 'Yoga Mat Non-Slip',       thumbnail_url: null, units_sold: 41,  revenue: 16400 },
];

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  sub?: string;
  to?: string;
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub, to }: StatCardProps) {
  const inner = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow h-full">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-[13px] text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-black text-gray-900 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-[12px] text-gray-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// ─── AttentionFeedItem ────────────────────────────────────────────────────────

const ATTENTION_META: Record<
  SellerAttentionItem['type'],
  { dot: string; icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  new_order:        { dot: 'bg-blue-500',   icon: ShoppingCart,  iconBg: 'bg-blue-50',   iconColor: 'text-blue-500' },
  low_stock:        { dot: 'bg-amber-500',  icon: AlertTriangle, iconBg: 'bg-amber-50',  iconColor: 'text-amber-500' },
  unread_message:   { dot: 'bg-brand-red',  icon: TrendingUp,    iconBg: 'bg-red-50',    iconColor: 'text-brand-red' },
  rejected_product: { dot: 'bg-red-600',    icon: Package,       iconBg: 'bg-red-50',    iconColor: 'text-red-600' },
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
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0">
      <span className="w-6 text-center text-[13px] font-bold text-gray-300 shrink-0">{rank}</span>
      <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0 overflow-hidden">
        {product.thumbnail_url
          ? <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Package className="w-4 h-4" />
            </div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-gray-800 truncate">{product.name}</p>
        <p className="text-[12px] text-gray-400 mt-0.5">{product.units_sold} sold</p>
      </div>
      <p className="text-[13.5px] font-bold text-gray-800 shrink-0">{fmt(product.revenue)}</p>
    </div>
  );
}

// ─── WelcomeHeader ────────────────────────────────────────────────────────────

function WelcomeHeader({
  firstName,
  shopName,
  available,
}: {
  firstName: string;
  shopName: string;
  available: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
      {/* Greeting */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-400 font-medium">Welcome back,</p>
        <h1 className="text-2xl font-black text-gray-900 leading-tight mt-0.5">
          {firstName} <span className="text-gray-400 font-semibold text-lg">· {shopName}</span>
        </h1>
      </div>

      {/* Balance standout */}
      <div className="flex items-center gap-5 sm:border-l sm:border-gray-100 sm:pl-6">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Available Balance</p>
          </div>
          <p className="text-3xl font-black text-gray-900 leading-none">{fmt(available)}</p>
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

function NeedsAttentionSection({ items }: { items: SellerAttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
          <h2 className="text-[14px] font-bold text-gray-900">Needs Attention</h2>
        </div>
        <span className="text-[12px] text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="px-2 py-2 divide-y divide-gray-50">
        {items.map((item) => (
          <AttentionFeedItem key={`${item.type}-${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── SalesTrendChart ──────────────────────────────────────────────────────────

function SalesTrendChart({
  data7d,
  data14d,
}: {
  data7d: SellerChartPoint[];
  data14d: SellerChartPoint[];
}) {
  const [range, setRange] = useState<'7d' | '14d'>('7d');
  const data = range === '7d' ? data7d : data14d;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="text-[14px] font-bold text-gray-900">Sales Trend</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['7d', '14d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                'px-3 py-1 rounded-md text-[12px] font-semibold transition-all',
                range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {r === '7d' ? 'Last 7 days' : 'Last 14 days'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 py-4" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
              width={44}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(value: number) => [fmt(value), 'Sales']}
            />
            <Line
              type="monotone"
              dataKey="sales"
              stroke="#C0001A"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#C0001A', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── TopProductsSection ───────────────────────────────────────────────────────

function TopProductsSection({ products }: { products: SellerTopProduct[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="text-[14px] font-bold text-gray-900">Top Products</h2>
        <Link
          to="/seller/products"
          className="flex items-center gap-1 text-[12px] text-brand-red font-semibold hover:underline"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="px-5 py-2">
        {products.map((p, i) => (
          <TopProductRow key={p.id} product={p} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

// ─── SellerDashboard ──────────────────────────────────────────────────────────

export default function SellerDashboard() {
  const { user } = useAuth();
  const stats = MOCK_STATS; // TODO: replace with useSellerDashboardStats() hook

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Welcome + balance */}
      <WelcomeHeader
        firstName={user?.first_name ?? ''}
        shopName={user?.seller_profile?.shop_name ?? ''}
        available={stats.balance.available}
      />

      {/* Key stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="Today's Sales"
          value={fmt(stats.today_sales)}
          sub="vs. yesterday"
        />
        <StatCard
          icon={ShoppingCart}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Orders to Pack"
          value={stats.orders_to_pack}
          sub="awaiting fulfillment"
          to="/seller/orders"
        />
        <StatCard
          icon={Package}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          label="Products Listed"
          value={stats.total_products}
          sub="active listings"
          to="/seller/products"
        />
        <StatCard
          icon={AlertTriangle}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          label="Low Stock Items"
          value={stats.low_stock_count}
          sub="need restocking"
          to="/seller/inventory"
        />
      </div>

      {/* Needs attention */}
      <NeedsAttentionSection items={MOCK_ATTENTION} />

      {/* Sales trend chart */}
      <SalesTrendChart data7d={MOCK_CHART_7D} data14d={MOCK_CHART_14D} />

      {/* Top products */}
      <TopProductsSection products={MOCK_TOP_PRODUCTS} />
    </div>
  );
}
