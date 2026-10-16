import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminOrdersApi, getAdminOrderApi, getAdminOrderSummaryApi, updateAdminOrderStatusApi } from '../../api/client';
import type {
  AdminOrder, AdminOrderGroupKey, AdminOrderListParams, AdminOrderSummary, OrderStatus,
} from '../../types';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import DateRangeBar from '../../components/admin/DateRangeBar';
import OrderStatusTimeline from '../../components/orders/OrderStatusTimeline';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  Search, X, ChevronLeft, ChevronRight, Package, ClipboardList, Clock, Truck, PackageCheck, AlertTriangle, Wallet,
  ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, SearchX, ShoppingBag,
} from 'lucide-react';
import {
  getStatusLabel,
  getStatusBadgeClass,
  normalizeOrderStatus,
  ALLOWED_ADMIN_NEXT_STATUSES,
  ADMIN_ORDER_GROUPS,
  ORDER_STATUS_ICON,
} from '../../utils/orderStatus';
import { NA, peso, whole, lastDays, formatDay, manilaToday } from '../../utils/adminReports';
import TrackPackageButton from '../../components/tracking/TrackPackageButton';
import PrintWaybillButton from '../../components/orders/PrintWaybillButton';

const PER_PAGE = 20;

type DatePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
const DATE_PRESETS: { value: Exclude<DatePreset, 'custom'>; label: string; days: number | null }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: 'all', label: 'All time', days: null },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'All payment methods' },
  { value: 'gcash', label: 'GCash' },
  { value: 'cod', label: 'Cash on delivery' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All payment statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
];

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  pending_verification: 'bg-amber-50 text-amber-700 border border-amber-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  pending: 'Pending',
  pending_verification: 'Awaiting verification',
  failed: 'Failed',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

// ─── Small display pieces ─────────────────────────────────────────────────────

/** Status as an icon and text, never colour alone. */
function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeOrderStatus(status);
  const Icon = ORDER_STATUS_ICON[normalized];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusBadgeClass(status)}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {getStatusLabel(status)}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${PAYMENT_STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function buyerName(o: AdminOrder) {
  return o.buyer ? `${o.buyer.first_name} ${o.buyer.last_name}` : NA;
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function OrderDetailDrawer({
  orderId,
  onClose,
  onUpdated,
}: {
  orderId: number;
  onClose: () => void;
  onUpdated: (o: AdminOrder) => void;
}) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLoading(true);
    setLoadFailed(false);
    getAdminOrderApi(orderId).then(setOrder).catch(() => setLoadFailed(true)).finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleStatus(status: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    setActionError('');
    try {
      const updated = await updateAdminOrderStatusApi(order.id, status);
      setOrder(updated);
      onUpdated(updated);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(message ?? 'The status could not be changed. Please try again.');
    } finally {
      setUpdating(false);
    }
  }

  const nextStatuses = order ? (ALLOWED_ADMIN_NEXT_STATUSES[normalizeOrderStatus(order.status)] ?? []) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={order ? `Order ${order.order_number}` : 'Order detail'}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="text-[14px] font-bold text-brand-black">
            {order ? `Order ${order.order_number}` : 'Order Detail'}
          </p>
          <button ref={closeRef} onClick={onClose} aria-label="Close order detail" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 px-5 py-4 space-y-3 animate-pulse" aria-busy="true">
            <div className="h-6 bg-gray-100 rounded w-1/3" />
            <div className="h-16 bg-gray-100 rounded" />
            <div className="h-24 bg-gray-100 rounded" />
          </div>
        )}

        {!loading && loadFailed && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5 text-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <p className="text-sm text-gray-600">This order could not be loaded.</p>
            <Button variant="ghost" onClick={() => { setLoading(true); setLoadFailed(false); getAdminOrderApi(orderId).then(setOrder).catch(() => setLoadFailed(true)).finally(() => setLoading(false)); }}>Retry</Button>
          </div>
        )}

        {!loading && order && (
          <div className="flex-1 px-5 py-4 space-y-5">
            {/* Status + actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={order.status} />
              <PaymentBadge status={order.payment_status} />
            </div>

            {order.tracking_number && (
              <div className="flex items-center gap-2 text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Tracking:</span>
                <span className="font-mono font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
                  {order.tracking_number}
                </span>
                <span className="ml-auto">
                  <PrintWaybillButton orderId={order.id} className="inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:underline disabled:opacity-60">
                    Print waybill
                  </PrintWaybillButton>
                </span>
                <TrackPackageButton trackingNumber={order.tracking_number} />
              </div>
            )}

            {actionError && (
              <p role="alert" className="px-3 py-2 text-xs text-red-800 border border-red-200 bg-red-50 rounded-lg">{actionError}</p>
            )}

            {nextStatuses.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Advance Status</p>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((s) => (
                    <Button
                      key={s}
                      variant="primary"
                      loading={updating}
                      onClick={() => handleStatus(s)}
                      className="text-[12px] py-1.5 px-3"
                    >
                      Mark as {getStatusLabel(s)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Buyer and shop */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Buyer</p>
                {order.buyer ? (
                  <p className="text-[13px] text-brand-black">
                    {order.buyer.first_name} {order.buyer.last_name}
                    <span className="block text-[11px] text-gray-400 truncate">{order.buyer.email}</span>
                  </p>
                ) : (
                  <p className="text-[13px] text-gray-400">{NA}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Shop</p>
                <p className="text-[13px] text-brand-black">{order.shop?.name ?? NA}</p>
              </div>
            </div>

            {/* Items */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="w-10 h-10 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-gray-200 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-brand-black truncate">{item.product_name}</p>
                      <p className="text-[11px] text-gray-400">{item.variant_label} · qty {item.quantity}</p>
                    </div>
                    <p className="text-[12px] font-semibold text-brand-black shrink-0">{peso(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              <div className="flex justify-between text-[12px] text-gray-500">
                <span>Subtotal</span><span>{peso(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-gray-500">
                <span>Shipping</span><span>{peso(order.shipping_fee)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-bold text-brand-black">
                <span>Total</span><span>{peso(order.total)}</span>
              </div>
            </div>

            {/* Payment */}
            {order.payment && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Payment</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Method</span>
                    <span className="font-semibold text-brand-black uppercase">{order.payment.method}</span>
                  </div>
                  {order.payment.reference_number && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-gray-500">Reference</span>
                      <span className="font-mono text-brand-black">{order.payment.reference_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Status</span>
                    <PaymentBadge status={order.payment.status} />
                  </div>
                  {order.payment.paid_at && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-gray-500">Paid at</span>
                      <span className="text-brand-black">{formatDate(order.payment.paid_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tracking History Timeline */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Tracking History</p>
              <OrderStatusTimeline history={order.status_history} currentStatus={order.status} />
            </div>

            <p className="text-[11px] text-gray-400">Placed {formatDate(order.created_at)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'total';

export default function AdminOrdersPage() {
  const [orders, setOrders]     = useState<AdminOrder[]>([]);
  const [meta, setMeta]         = useState({ current_page: 1, last_page: 1, total: 0, from: null as number | null, to: null as number | null });
  const [summary, setSummary]   = useState<AdminOrderSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [failed, setFailed]     = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);

  // The Reviews page links here with ?search=<order number>.
  const [searchParams] = useSearchParams();
  const initialSearch = (searchParams.get('search') ?? '').trim();
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch]           = useState(initialSearch);
  const [group, setGroup]             = useState<AdminOrderGroupKey | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'' | 'gcash' | 'cod'>('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [preset, setPreset]           = useState<DatePreset>('30d');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo, setCustomTo]       = useState('');
  const [sort, setSort]               = useState<SortKey>('date');
  const [direction, setDirection]     = useState<'asc' | 'desc'>('desc');
  const [page, setPage]               = useState(1);
  const [selected, setSelected]       = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Wait for typing to pause before asking the server.
  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const dateRange = useMemo<{ from?: string; to?: string }>(() => {
    if (preset === 'custom') {
      return customFrom && customTo && customFrom <= customTo ? { from: customFrom, to: customTo } : {};
    }
    const days = DATE_PRESETS.find((p) => p.value === preset)?.days;
    return days ? lastDays(days) : {};
  }, [preset, customFrom, customTo]);

  // The days in force, as the date pickers show them ('' for an open end).
  const shownFrom = preset === 'custom' ? customFrom : dateRange.from ?? '';
  const shownTo = preset === 'custom' ? customTo : dateRange.to ?? '';

  // The filters both the list and the summary share. The status group only narrows the list.
  const sharedFilters = useMemo(() => ({
    ...dateRange,
    search: search || undefined,
    payment_method: paymentMethod || undefined,
    payment_status: paymentStatus || undefined,
  }), [dateRange, search, paymentMethod, paymentStatus]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params: AdminOrderListParams = { ...sharedFilters, group: group || undefined, sort, direction, page, per_page: PER_PAGE };
      const res = await getAdminOrdersApi(params);
      setOrders(res.data);
      setMeta({ current_page: res.meta.current_page, last_page: res.meta.last_page, total: res.meta.total, from: (res.meta as { from?: number | null }).from ?? null, to: (res.meta as { to?: number | null }).to ?? null });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [sharedFilters, group, sort, direction, page]);

  const loadSummary = useCallback(async () => {
    setSummaryFailed(false);
    try {
      setSummary(await getAdminOrderSummaryApi(sharedFilters));
    } catch {
      setSummaryFailed(true);
    }
  }, [sharedFilters]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  function chooseGroup(next: AdminOrderGroupKey | '') {
    setGroup((current) => (current === next ? '' : next));
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(key);
      setDirection('desc');
    }
    setPage(1);
  }

  const filtersActive = Boolean(group || search || paymentMethod || paymentStatus || preset !== '30d');

  function clearFilters() {
    setGroup('');
    setSearchInput('');
    setSearch('');
    setPaymentMethod('');
    setPaymentStatus('');
    setPreset('30d');
    setCustomFrom('');
    setCustomTo('');
    setPage(1);
  }

  function openOrder(id: number, el: HTMLElement) {
    openerRef.current = el;
    setSelected(id);
  }

  const closeDrawer = useCallback(() => {
    setSelected(null);
    // Give focus back to the row that opened the drawer.
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  function handleUpdated() {
    // A status change moves the order between groups: refresh the list and the counts.
    loadList();
    loadSummary();
  }

  const rangeLabel = dateRange.from && dateRange.to ? `${formatDay(dateRange.from)} to ${formatDay(dateRange.to)}` : preset === 'custom' ? 'Choose both dates' : 'All time';
  const groupCount = (key: AdminOrderGroupKey) => summary?.groups[key];

  const sortIcon = (key: SortKey) => (sort !== key ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown);
  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' => (sort !== key ? 'none' : direction === 'asc' ? 'ascending' : 'descending');

  return (
    <div className="pb-8 space-y-3">
      <PageHero
        icon={ShoppingBag}
        eyebrow="Commerce"
        title="Orders & Fulfillment"
        subtitle={<>Every order on the platform, counted in Philippine time · {rangeLabel}</>}
      />

      <DateRangeBar
        presets={DATE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        preset={preset === 'custom' ? '' : preset}
        from={shownFrom}
        to={shownTo}
        today={manilaToday()}
        fromPlaceholder="Since the first order"
        toPlaceholder="Today"
        onPreset={(value) => { setPreset(value as DatePreset); setPage(1); }}
        onRange={(from, to) => { setCustomFrom(from); setCustomTo(to); setPreset('custom'); setPage(1); }}
      />

      {/* ── KPI row ── */}
      {summaryFailed ? (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
          <span>The order totals could not be loaded.</span>
          <button onClick={loadSummary} className="px-3 py-1 text-xs font-bold text-white bg-brand-red rounded-lg hover:bg-[#8e2424]">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {!summary ? (
            [1, 2, 3, 4, 5, 6].map((i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard compact icon={ClipboardList} label="Total orders" value={summary.total} subtext="Matching the filters" iconBg="bg-violet-50" iconColor="text-violet-600"
                onClick={() => chooseGroup('')} active={group === ''} />
              <StatCard compact icon={Clock} label="Awaiting action" value={groupCount('awaiting_action')} subtext="Placed to ready for pickup" iconBg="bg-amber-50" iconColor="text-amber-600"
                onClick={() => chooseGroup('awaiting_action')} active={group === 'awaiting_action'} />
              <StatCard compact icon={Truck} label="In transit" value={groupCount('in_transit')} subtext="Picked up to out for delivery" iconBg="bg-blue-50" iconColor="text-blue-600"
                onClick={() => chooseGroup('in_transit')} active={group === 'in_transit'} />
              <StatCard compact icon={PackageCheck} label="Delivered / completed" value={groupCount('delivered_completed')} subtext="With the buyer" iconBg="bg-emerald-50" iconColor="text-emerald-600"
                onClick={() => chooseGroup('delivered_completed')} active={group === 'delivered_completed'} />
              <StatCard compact icon={AlertTriangle} label="Problem orders" value={groupCount('problem')} subtext="Failed, returned or disputed" iconBg="bg-red-50" iconColor="text-red-600"
                onClick={() => chooseGroup('problem')} active={group === 'problem'} />
              <StatCard compact icon={Wallet} label="GMV" value={summary.gmv} money subtext="Not counting cancelled or returned" iconBg="bg-rose-50" iconColor="text-brand-red" />
            </>
          )}
        </div>
      )}

      {/* ── Filters: status chips, then search and the dropdowns ── */}
      <div className="p-3 space-y-3 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status group">
          <button
            type="button"
            onClick={() => chooseGroup('')}
            aria-pressed={group === ''}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
              group === '' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            All <span className={`px-1.5 rounded-full text-[10px] ${group === '' ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{summary ? whole(summary.total) : NA}</span>
          </button>
          {ADMIN_ORDER_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => chooseGroup(g.key)}
              aria-pressed={group === g.key}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
                group === g.key ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {g.label}
              <span className={`px-1.5 rounded-full text-[10px] ${group === g.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{summary ? whole(summary.groups[g.key]) : NA}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search orders"
              placeholder="Order #, tracking #, buyer or shop"
              className="w-full min-h-[44px] pl-10 pr-9 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
            />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <CustomSelect
            className="lg:w-56"
            value={paymentMethod}
            onChange={(v) => { setPaymentMethod(v as '' | 'gcash' | 'cod'); setPage(1); }}
            options={PAYMENT_METHOD_OPTIONS}
          />
          <CustomSelect
            className="lg:w-56"
            value={paymentStatus}
            onChange={(v) => { setPaymentStatus(v); setPage(1); }}
            options={PAYMENT_STATUS_OPTIONS}
          />
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="self-start px-2 text-xs font-bold text-brand-red hover:underline lg:self-auto">
              Clear filters
            </button>
          )}
        </div>
      </div>
      {/* ── List ── */}
      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center bg-white border border-red-200 rounded-xl">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-gray-700">The orders could not be loaded.</p>
          <Button variant="primary" onClick={loadList}>Retry</Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden" aria-busy={loading}>
          {/* Table, from the md breakpoint up */}
          <div className="hidden md:block max-h-[68vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left">
                  {['Order', 'Buyer', 'Shop', 'Status', 'Payment'].map((h) => (
                    <th key={h} scope="col" className="sticky top-0 z-10 px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">{h}</th>
                  ))}
                  <th scope="col" aria-sort={ariaSort('total')} className="sticky top-0 z-10 px-4 py-3 text-right bg-gray-50 border-b border-gray-100">
                    <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wide hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red rounded">
                      Total {(() => { const I = sortIcon('total'); return <I className="w-3 h-3" aria-hidden="true" />; })()}
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort('date')} className="sticky top-0 z-10 px-4 py-3 text-left bg-gray-50 border-b border-gray-100">
                    <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wide hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red rounded">
                      Date {(() => { const I = sortIcon('date'); return <I className="w-3 h-3" aria-hidden="true" />; })()}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && orders.length === 0 && [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    {[0, 1, 2, 3, 4, 5, 6].map((c) => <td key={c} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded w-3/4" /></td>)}
                  </tr>
                ))}
                {!loading && orders.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12"><OrdersEmpty filtersActive={filtersActive} onClear={clearFilters} /></td></tr>
                )}
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    tabIndex={0}
                    onClick={(e) => openOrder(o.id, e.currentTarget)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrder(o.id, e.currentTarget); } }}
                    className={`cursor-pointer transition-colors hover:bg-red-50/40 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red ${loading ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-brand-black">{o.order_number}</p>
                      <p className="text-[10px] font-mono text-violet-700">{o.tracking_number ?? <span className="text-gray-300">No tracking yet</span>}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{buyerName(o)}</td>
                    <td className="px-4 py-3 text-gray-700">{o.shop?.name ?? NA}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3">
                      <p className="text-[11px] font-bold text-gray-700 uppercase">{o.payment_method}</p>
                      <PaymentBadge status={o.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-black">{peso(o.total)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards, below the md breakpoint */}
          <div className="md:hidden divide-y divide-gray-100">
            {loading && orders.length === 0 && [0, 1, 2, 3].map((i) => (
              <div key={i} className="p-4 space-y-2 animate-pulse"><div className="h-3 bg-gray-100 rounded w-1/2" /><div className="h-3 bg-gray-100 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/3" /></div>
            ))}
            {!loading && orders.length === 0 && <div className="px-4 py-10"><OrdersEmpty filtersActive={filtersActive} onClear={clearFilters} /></div>}
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={(e) => openOrder(o.id, e.currentTarget)}
                className={`block w-full p-4 text-left space-y-2 hover:bg-red-50/40 focus:outline-none focus-visible:bg-red-50/60 ${loading ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-brand-black truncate">{o.order_number}</p>
                    <p className="text-[10px] font-mono text-violet-700">{o.tracking_number ?? 'No tracking yet'}</p>
                  </div>
                  <p className="text-[13px] font-bold text-brand-black shrink-0">{peso(o.total)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={o.status} />
                  <PaymentBadge status={o.payment_status} />
                  <span className="text-[10px] font-bold text-gray-500 uppercase">{o.payment_method}</span>
                </div>
                <p className="text-xs text-gray-500">{buyerName(o)} · {o.shop?.name ?? NA}</p>
                <p className="text-[11px] text-gray-400">{formatDate(o.created_at)}</p>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {meta.total > 0 && (
            <div className="flex flex-col items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 sm:flex-row">
              <p className="text-[12px] text-gray-500">
                Showing <span className="font-semibold text-gray-800">{meta.from ?? 0}–{meta.to ?? 0}</span> of <span className="font-semibold text-gray-800">{whole(meta.total)}</span> {meta.total === 1 ? 'order' : 'orders'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <span className="text-[12px] text-gray-600">Page {meta.current_page} of {meta.last_page}</span>
                <button
                  disabled={page >= meta.last_page || loading}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected !== null && (
        <OrderDetailDrawer orderId={selected} onClose={closeDrawer} onUpdated={handleUpdated} />
      )}
    </div>
  );
}

function OrdersEmpty({ filtersActive, onClear }: { filtersActive: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center justify-center w-10 h-10 border border-gray-100 rounded-xl bg-gray-50">
        {filtersActive ? <SearchX className="w-5 h-5 text-gray-300" aria-hidden="true" /> : <ShoppingBag className="w-5 h-5 text-gray-300" aria-hidden="true" />}
      </div>
      <p className="text-sm font-semibold text-gray-700">{filtersActive ? 'No orders match these filters' : 'No orders in this period yet'}</p>
      <p className="max-w-sm text-xs text-gray-400">
        {filtersActive ? 'Try a wider date range or clear the filters.' : 'Orders appear here as soon as buyers check out.'}
      </p>
      {filtersActive && <button type="button" onClick={onClear} className="text-xs font-bold text-brand-red hover:underline">Clear filters</button>}
    </div>
  );
}
