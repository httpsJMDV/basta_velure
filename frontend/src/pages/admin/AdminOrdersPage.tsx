import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminOrdersApi, getAdminOrderApi, getAdminOrderSummaryApi, updateAdminOrderStatusApi } from '../../api/client';
import type { AdminOrder, AdminOrderGroupKey, AdminOrderListParams, AdminOrderSummary, OrderStatus } from '../../types';
import CustomSelect from '../../components/ui/CustomSelect';
import DateRangeBar from '../../components/admin/DateRangeBar';
import OrderStatusTimeline from '../../components/orders/OrderStatusTimeline';
import { PageHero } from '../../components/admin/dashboardKit';
import { type ListMeta, SearchField, ListPager, ListError, Pill, type PillTone, TH, TD, ROW, relativeTime } from '../../components/admin/listKit';
import { X, Package, ShoppingBag, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, SearchX, Copy, Check, ChevronRight, Truck } from 'lucide-react';
import { getStatusLabel, normalizeOrderStatus, ALLOWED_ADMIN_NEXT_STATUSES, ADMIN_ORDER_GROUPS } from '../../utils/orderStatus';
import { NA, peso, whole, lastDays, formatDay, manilaToday } from '../../utils/adminReports';
import TrackPackageButton from '../../components/tracking/TrackPackageButton';
import PrintWaybillButton from '../../components/orders/PrintWaybillButton';

const PER_PAGE_OPTIONS = [20, 50, 100];
const EMPTY_META: ListMeta = { current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null };

type DatePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
const DATE_PRESETS: { value: Exclude<DatePreset, 'custom'>; label: string; days: number | null }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: 'all', label: 'All time', days: null },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'Any payment status' },
  { value: 'pending', label: 'Pending' },
  { value: 'pending_verification', label: 'Awaiting verification' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
];

const PAYMENT_LABEL: Record<string, string> = { paid: 'Paid', pending: 'Pending', pending_verification: 'Awaiting verification', failed: 'Failed' };
const PAYMENT_TONE: Record<string, string> = { paid: 'text-emerald-700', pending: 'text-amber-700', pending_verification: 'text-amber-700', failed: 'text-red-700' };

/** Each status group's colour, shared by the pipeline, its bar and the status pills. */
const GROUP_STYLE: Record<AdminOrderGroupKey, { tone: PillTone; bar: string }> = {
  awaiting_action: { tone: 'amber', bar: 'bg-amber-400' },
  in_transit: { tone: 'blue', bar: 'bg-sky-500' },
  delivered_completed: { tone: 'emerald', bar: 'bg-emerald-500' },
  problem: { tone: 'red', bar: 'bg-red-500' },
  cancelled: { tone: 'gray', bar: 'bg-gray-300' },
};

function groupOf(status: string): AdminOrderGroupKey {
  const s = normalizeOrderStatus(status);
  return ADMIN_ORDER_GROUPS.find((g) => g.statuses.includes(s))?.key ?? 'awaiting_action';
}

function StatusPill({ status }: { status: string }) {
  return <Pill tone={GROUP_STYLE[groupOf(status)].tone}>{getStatusLabel(status)}</Pill>;
}

function buyerName(o: AdminOrder) {
  return o.buyer ? `${o.buyer.first_name} ${o.buyer.last_name}`.trim() : NA;
}

function placedAt(iso: string) {
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
}

/** "Oct 17, 2026" in Manila time. */
function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  const I = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return <I className="w-3 h-3" aria-hidden="true" />;
}

function itemCount(o: AdminOrder) {
  return o.items.reduce((n, i) => n + (i.quantity || 0), 0);
}

/** Up to three item photos, overlapped, with a "+n" for the rest. */
function ItemStack({ order, size = 'w-10 h-10' }: { order: AdminOrder; size?: string }) {
  const shown = order.items.slice(0, 3);
  const more = order.items.length - shown.length;
  return (
    <span className="flex items-center -space-x-3 shrink-0">
      {shown.map((i) => (
        <span key={i.id} className={`${size} rounded-lg overflow-hidden bg-gray-100 ring-2 ring-white`}>
          {i.image_url ? <img src={i.image_url} alt="" loading="lazy" className="object-cover w-full h-full" /> : <span className="flex items-center justify-center w-full h-full text-gray-300"><Package className="w-4 h-4" /></span>}
        </span>
      ))}
      {more > 0 && <span className={`${size} rounded-lg bg-gray-900 text-white text-[11px] font-bold ring-2 ring-white flex items-center justify-center`}>+{more}</span>}
      {shown.length === 0 && <span className={`${size} rounded-lg bg-gray-100 text-gray-300 flex items-center justify-center`}><Package className="w-4 h-4" /></span>}
    </span>
  );
}

// ─── Pipeline: where every order in the period stands ─────────────────────────

function Pipeline({ summary, group, onPick }: { summary: AdminOrderSummary | null; group: AdminOrderGroupKey | ''; onPick: (g: AdminOrderGroupKey | '') => void }) {
  const total = summary?.total ?? 0;
  return (
    <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[repeat(6,minmax(0,1fr))_minmax(0,1.3fr)] divide-x divide-y xl:divide-y-0 divide-gray-100">
        <PipelineCell label="All orders" value={summary?.total} note="in this period" active={group === ''} onClick={() => onPick('')} />
        {ADMIN_ORDER_GROUPS.map((g) => {
          const count = summary?.groups[g.key];
          return (
            <PipelineCell
              key={g.key}
              label={g.label}
              dot={GROUP_STYLE[g.key].bar}
              value={count}
              note={summary && total > 0 ? `${Math.round(((count ?? 0) / total) * 100)}% of orders` : summary ? '0% of orders' : undefined}
              active={group === g.key}
              onClick={() => onPick(g.key)}
            />
          );
        })}
        <div className="px-4 py-3 bg-gray-50/80 col-span-2 sm:col-span-3 xl:col-span-1">
          <p className="text-[11px] font-semibold text-gray-500">Gross merchandise value</p>
          <p className="mt-1 text-[22px] font-bold tracking-tight text-gray-900 tabular-nums">{summary ? peso(summary.gmv) : '…'}</p>
          <p className="text-[11px] text-gray-400">Not counting cancelled or returned orders</p>
        </div>
      </div>
      {/* The share of each group, as one bar */}
      <div className="flex h-1.5 bg-gray-100" aria-hidden="true">
        {summary && total > 0 && ADMIN_ORDER_GROUPS.map((g) => (
          <span key={g.key} className={`${GROUP_STYLE[g.key].bar} transition-[width] duration-500`} style={{ width: `${(summary.groups[g.key] / total) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function PipelineCell({ label, value, note, dot, active, onClick }: { label: string; value: number | undefined; note?: string; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red ${active ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}
    >
      {active && <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-red" aria-hidden="true" />}
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />}
        {label}
      </span>
      <span className={`block mt-1 text-[22px] font-bold tracking-tight tabular-nums ${active ? 'text-brand-red' : 'text-gray-900'}`}>{value === undefined ? '…' : whole(value)}</span>
      <span className="block text-[11px] text-gray-400 h-4">{note}</span>
    </button>
  );
}

// ─── Order sheet ──────────────────────────────────────────────────────────────

/** The fulfilment milestones, and which statuses count as having reached each. */
const MILESTONES: { label: string; reached: OrderStatus[] }[] = [
  { label: 'Placed', reached: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'] },
  { label: 'Packed', reached: ['PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'] },
  { label: 'Picked up', reached: ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'] },
  { label: 'At the hub', reached: ['AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'] },
  { label: 'Out for delivery', reached: ['OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'] },
  { label: 'Delivered', reached: ['DELIVERED', 'COMPLETED'] },
];

function FulfilmentTrack({ status }: { status: string }) {
  const s = normalizeOrderStatus(status);
  const g = groupOf(s);
  if (g === 'problem' || g === 'cancelled') {
    return (
      <p className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12.5px] ${g === 'problem' ? 'bg-red-50 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
        <AlertCircle className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
        {g === 'problem' ? `${getStatusLabel(s)}: this order left the normal delivery flow. The history below shows what happened.` : 'This order was cancelled before delivery.'}
      </p>
    );
  }
  const reachedCount = MILESTONES.filter((m) => m.reached.includes(s)).length;
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Fulfilment progress">
      {MILESTONES.map((m, i) => {
        const done = i < reachedCount;
        const current = i === reachedCount - 1;
        return (
          <li key={m.label} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${done ? (current ? 'bg-brand-red' : 'bg-gray-900') : 'bg-gray-200'}`} />
            <span className={`block mt-1.5 text-[10.5px] leading-tight truncate ${current ? 'font-bold text-gray-900' : done ? 'text-gray-600' : 'text-gray-400'}`}>{m.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-gray-400">{label}</p>
      <div className="mt-0.5 text-[13px] text-gray-900">{children}</div>
    </div>
  );
}

function OrderSheet({ orderId, onClose, onUpdated }: { orderId: number; onClose: () => void; onUpdated: () => void }) {
  const [result, setResult] = useState<{ id: number; order: AdminOrder | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [updating, setUpdating] = useState<OrderStatus | null>(null);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const order = result?.id === orderId ? result.order : null;
  const loading = result?.id !== orderId;
  const failed = !loading && result?.failed;

  useEffect(() => {
    let alive = true;
    getAdminOrderApi(orderId)
      .then((o) => { if (alive) setResult({ id: orderId, order: o, failed: false }); })
      .catch(() => { if (alive) setResult({ id: orderId, order: null, failed: true }); });
    return () => { alive = false; };
  }, [orderId, attempt]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function advance(status: OrderStatus) {
    if (!order) return;
    setUpdating(status);
    setActionError('');
    try {
      const updated = await updateAdminOrderStatusApi(order.id, status);
      setResult({ id: orderId, order: updated, failed: false });
      onUpdated();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(message ?? 'The status could not be changed. Try again.');
    } finally {
      setUpdating(null);
    }
  }

  const copyNumber = () => {
    if (!order) return;
    navigator.clipboard?.writeText(order.order_number).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const nextStatuses = order ? ALLOWED_ADMIN_NEXT_STATUSES[normalizeOrderStatus(order.status)] ?? [] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={order ? `Order ${order.order_number}` : 'Order'}>
      <div className="absolute inset-0 bg-gray-950/40" onClick={onClose} />
      <div className="relative flex flex-col w-full h-full max-w-[560px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400">Order</p>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-[17px] font-bold text-gray-900 truncate">{order?.order_number ?? '…'}</h2>
              {order && (
                <button type="button" onClick={copyNumber} aria-label="Copy the order number" title="Copy" className="flex items-center justify-center text-gray-400 rounded-md w-7 h-7 hover:bg-gray-100 hover:text-gray-800">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {order && <p className="text-[12px] text-gray-500">Placed {placedAt(order.created_at)}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex items-center justify-center text-gray-500 rounded-lg w-9 h-9 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-6 py-5 space-y-4 animate-pulse" aria-busy="true">
              <div className="w-1/3 h-4 bg-gray-100 rounded" />
              <div className="h-2 bg-gray-100 rounded" />
              <div className="h-24 bg-gray-100 rounded-xl" />
              <div className="h-32 bg-gray-100 rounded-xl" />
            </div>
          )}

          {failed && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <p className="text-sm text-gray-600">This order could not be loaded.</p>
              <button type="button" onClick={() => { setResult(null); setAttempt((a) => a + 1); }} className="h-9 px-4 rounded-lg bg-brand-red text-white text-xs font-bold">Retry</button>
            </div>
          )}

          {order && (
            <>
              <section className="px-6 py-5 space-y-4 border-b border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={order.status} />
                  <span className="text-[12px] text-gray-500">
                    <span className="font-semibold uppercase text-gray-700">{order.payment_method}</span>
                    {' · '}
                    <span className={`font-semibold ${PAYMENT_TONE[order.payment_status] ?? 'text-gray-600'}`}>{PAYMENT_LABEL[order.payment_status] ?? order.payment_status}</span>
                  </span>
                </div>
                <FulfilmentTrack status={order.status} />
              </section>

              <section className="grid grid-cols-2 px-6 py-5 border-b border-gray-100 gap-x-6 gap-y-4">
                <Fact label="Buyer">
                  <span className="block font-semibold truncate">{buyerName(order)}</span>
                  {order.buyer?.email && <span className="block text-[12px] text-gray-500 truncate">{order.buyer.email}</span>}
                </Fact>
                <Fact label="Shop"><span className="block font-semibold truncate">{order.shop?.name ?? NA}</span></Fact>
                <Fact label="Ship to">
                  {order.shipping ? (
                    <>
                      <span className="block font-semibold">{order.shipping.name || buyerName(order)}</span>
                      {order.shipping.phone && <span className="block text-[12px] text-gray-500">{order.shipping.phone}</span>}
                      <span className="block text-[12px] text-gray-600 leading-snug">{order.shipping.address}</span>
                      {order.shipping.notes && <span className="block mt-1 text-[12px] italic text-gray-500">“{order.shipping.notes}”</span>}
                    </>
                  ) : NA}
                </Fact>
                <Fact label="Courier">
                  <span className="flex items-center gap-1.5 font-semibold"><Truck className="w-3.5 h-3.5 text-gray-400" />{order.courier?.name ?? 'Not assigned'}</span>
                  {order.tracking_number
                    ? <span className="block font-mono text-[12px] text-gray-600 mt-0.5">{order.tracking_number}</span>
                    : <span className="block text-[12px] text-gray-400">No tracking number until the shop marks it ready</span>}
                  {order.tracking_number && (
                    <span className="flex flex-wrap items-center gap-2 mt-2">
                      <TrackPackageButton trackingNumber={order.tracking_number} />
                      <PrintWaybillButton orderId={order.id} className="text-[12px] font-bold text-brand-red hover:underline disabled:opacity-60">Print waybill</PrintWaybillButton>
                    </span>
                  )}
                </Fact>
              </section>

              <section className="px-6 py-5 border-b border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 mb-3">{itemCount(order)} item{itemCount(order) === 1 ? '' : 's'}</p>
                <ul className="space-y-3">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <span className="overflow-hidden bg-gray-100 rounded-lg w-12 h-12 shrink-0">
                        {item.image_url ? <img src={item.image_url} alt="" className="object-cover w-full h-full" /> : <span className="flex items-center justify-center w-full h-full text-gray-300"><Package className="w-4 h-4" /></span>}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-gray-900 truncate">{item.product_name}</span>
                        <span className="block text-[12px] text-gray-500">{[item.variant_label, `${item.quantity} × ${peso(item.unit_price)}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{peso(item.subtotal)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="pt-3 mt-4 space-y-1.5 border-t border-dashed border-gray-200 text-[13px]">
                  <div className="flex justify-between text-gray-600"><dt>Subtotal</dt><dd className="tabular-nums">{peso(order.subtotal)}</dd></div>
                  <div className="flex justify-between text-gray-600"><dt>Delivery</dt><dd className="tabular-nums">{peso(order.shipping_fee)}</dd></div>
                  <div className="flex justify-between pt-1.5 text-[15px] font-bold text-gray-900"><dt>Total</dt><dd className="tabular-nums">{peso(order.total)}</dd></div>
                </dl>
                {order.payment && (
                  <p className="mt-3 text-[12px] text-gray-500">
                    {order.payment.method === 'gcash' ? 'GCash' : 'Cash on delivery'}
                    {order.payment.reference_number && <> · ref <span className="font-mono text-gray-700">{order.payment.reference_number}</span></>}
                    {order.payment.paid_at && <> · paid {shortDay(order.payment.paid_at)}</>}
                  </p>
                )}
              </section>

              <section className="px-6 py-5">
                <p className="text-[11px] font-semibold text-gray-400 mb-3">History</p>
                <OrderStatusTimeline history={order.status_history} currentStatus={order.status} />
              </section>
            </>
          )}
        </div>

        {order && nextStatuses.length > 0 && (
          <footer className="px-6 py-4 border-t border-gray-100 bg-gray-50/80">
            {actionError && <p role="alert" className="mb-2 text-[12px] text-red-700">{actionError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-[12px] text-gray-500">Move this order to</span>
              {nextStatuses.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  disabled={updating !== null}
                  onClick={() => advance(s)}
                  className={`h-9 px-3.5 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-50 ${i === 0 ? 'bg-brand-red text-white hover:bg-brand-red-dark' : 'border border-gray-300 bg-white text-gray-800 hover:border-gray-500'}`}
                >
                  {updating === s ? 'Saving…' : getStatusLabel(s)}
                </button>
              ))}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'total';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_META);
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);

  // Other pages link here with ?search=<order number>.
  const [searchParams] = useSearchParams();
  const initialSearch = (searchParams.get('search') ?? '').trim();
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [group, setGroup] = useState<AdminOrderGroupKey | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'' | 'gcash' | 'cod'>('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [preset, setPreset] = useState<DatePreset>(initialSearch ? 'all' : '30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selected, setSelected] = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const dateRange = useMemo<{ from?: string; to?: string }>(() => {
    if (preset === 'custom') return customFrom && customTo && customFrom <= customTo ? { from: customFrom, to: customTo } : {};
    const days = DATE_PRESETS.find((p) => p.value === preset)?.days;
    return days ? lastDays(days) : {};
  }, [preset, customFrom, customTo]);

  const shownFrom = preset === 'custom' ? customFrom : dateRange.from ?? '';
  const shownTo = preset === 'custom' ? customTo : dateRange.to ?? '';

  // The list and the pipeline share these; the status group only narrows the list.
  const sharedFilters = useMemo(() => ({
    ...dateRange,
    search: search || undefined,
    payment_method: paymentMethod || undefined,
    payment_status: paymentStatus || undefined,
  }), [dateRange, search, paymentMethod, paymentStatus]);

  const loadList = useCallback(() => {
    setLoading(true);
    setFailed(false);
    const params: AdminOrderListParams = { ...sharedFilters, group: group || undefined, sort, direction, page, per_page: perPage };
    getAdminOrdersApi(params)
      .then((res) => { setOrders(res.data); setMeta({ ...EMPTY_META, ...res.meta }); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [sharedFilters, group, sort, direction, page, perPage]);

  const loadSummary = useCallback(() => {
    setSummaryFailed(false);
    getAdminOrderSummaryApi(sharedFilters).then(setSummary).catch(() => setSummaryFailed(true));
  }, [sharedFilters]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const pickGroup = (next: AdminOrderGroupKey | '') => { setGroup(next); setPage(1); };

  function toggleSort(key: SortKey) {
    if (sort === key) setDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSort(key); setDirection('desc'); }
    setPage(1);
  }

  const filtersActive = Boolean(group || search || paymentMethod || paymentStatus || preset !== '30d');
  function clearFilters() {
    setGroup(''); setSearchInput(''); setSearch(''); setPaymentMethod(''); setPaymentStatus('');
    setPreset('30d'); setCustomFrom(''); setCustomTo(''); setPage(1);
  }

  function openOrder(id: number, el: HTMLElement) {
    openerRef.current = el;
    setSelected(id);
  }

  const closeSheet = useCallback(() => {
    setSelected(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  const onUpdated = useCallback(() => { loadList(); loadSummary(); }, [loadList, loadSummary]);

  const rangeLabel = dateRange.from && dateRange.to ? `${formatDay(dateRange.from)} to ${formatDay(dateRange.to)}` : preset === 'custom' ? 'Pick both dates' : 'All time';
  const ariaSort = (k: SortKey): 'ascending' | 'descending' | 'none' => (sort !== k ? 'none' : direction === 'asc' ? 'ascending' : 'descending');

  const empty = (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <span className="flex items-center justify-center w-10 h-10 border border-gray-100 rounded-xl bg-gray-50">
        {filtersActive ? <SearchX className="w-5 h-5 text-gray-300" /> : <ShoppingBag className="w-5 h-5 text-gray-300" />}
      </span>
      <p className="text-sm font-semibold text-gray-700">{filtersActive ? 'No orders match these filters' : 'No orders in this period yet'}</p>
      <p className="max-w-sm text-xs text-gray-400">{filtersActive ? 'Try a wider date range or clear the filters.' : 'Orders show up here as soon as buyers check out.'}</p>
      {filtersActive && <button type="button" onClick={clearFilters} className="text-xs font-bold text-brand-red hover:underline">Clear filters</button>}
    </div>
  );

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={ShoppingBag} eyebrow="Admin / Commerce" title="Orders" subtitle={<>Every order on Loved-IT, in Philippine time · {rangeLabel}</>} />

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

      {summaryFailed
        ? <ListError message="The order counts could not be loaded." onRetry={loadSummary} />
        : <Pipeline summary={summary} group={group} onPick={pickGroup} />}

      <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={loading}>
        {/* Toolbar */}
        <div className="flex flex-col gap-2 p-3 border-b border-gray-100 lg:flex-row lg:items-center">
          <SearchField value={searchInput} onChange={setSearchInput} label="Search orders" placeholder="Order number, tracking number, buyer or shop" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-0.5 rounded-xl bg-gray-100 border border-gray-200" role="radiogroup" aria-label="Payment method">
              {([['', 'All'], ['gcash', 'GCash'], ['cod', 'COD']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={paymentMethod === v}
                  onClick={() => { setPaymentMethod(v); setPage(1); }}
                  className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors ${paymentMethod === v ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <CustomSelect className="w-52" value={paymentStatus} onChange={(v) => { setPaymentStatus(v); setPage(1); }} options={PAYMENT_STATUS_OPTIONS} />
            {filtersActive && <button type="button" onClick={clearFilters} className="px-1 text-xs font-bold text-brand-red hover:underline">Clear</button>}
          </div>
        </div>

        {failed ? <div className="p-3"><ListError message="The orders could not be loaded." onRetry={loadList} /></div> : (
          <>
            {/* Ledger, md and up */}
            <div className="hidden md:block max-h-[70vh] overflow-auto">
              <table className="w-full text-[13px]">
                <thead><tr>
                  <th scope="col" className={TH}>Order</th>
                  <th scope="col" className={TH}>Buyer and shop</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>Payment</th>
                  <th scope="col" aria-sort={ariaSort('total')} className={`${TH} text-right`}>
                    <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-1 uppercase hover:text-gray-900">Total <SortIcon active={sort === 'total'} direction={direction} /></button>
                  </th>
                  <th scope="col" aria-sort={ariaSort('date')} className={TH}>
                    <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 uppercase hover:text-gray-900">Placed <SortIcon active={sort === 'date'} direction={direction} /></button>
                  </th>
                  <th scope="col" className={TH}><span className="sr-only">Open</span></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {loading && orders.length === 0 && Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className={TD}><div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-100 rounded-lg" /><div className="space-y-1.5"><div className="w-28 h-3 bg-gray-100 rounded" /><div className="w-40 h-2.5 bg-gray-100 rounded" /></div></div></td>
                      {[0, 1, 2, 3, 4, 5].map((c) => <td key={c} className={TD}><div className="w-3/4 h-3 bg-gray-100 rounded" /></td>)}
                    </tr>
                  ))}
                  {!loading && orders.length === 0 && <tr><td colSpan={7}>{empty}</td></tr>}
                  {orders.map((o) => (
                    <tr key={o.id} tabIndex={0} onClick={(e) => openOrder(o.id, e.currentTarget)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrder(o.id, e.currentTarget); } }}
                      className={`${ROW} group ${loading ? 'opacity-60' : ''}`}>
                      <td className={TD}>
                        <div className="flex items-center gap-3 min-w-0">
                          <ItemStack order={o} />
                          <div className="min-w-0">
                            <p className="font-mono text-[12.5px] font-semibold text-gray-900">{o.order_number}</p>
                            <p className="text-[11.5px] text-gray-500 truncate max-w-[260px]">
                              {itemCount(o)} item{itemCount(o) === 1 ? '' : 's'}{o.items[0] ? ` · ${o.items[0].product_name}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={TD}>
                        <p className="text-gray-900 truncate max-w-[200px]">{buyerName(o)}</p>
                        <p className="text-[11.5px] text-gray-500 truncate max-w-[200px]">{o.shop?.name ?? NA}{o.courier ? ` · ${o.courier.code}` : ''}</p>
                      </td>
                      <td className={TD}><StatusPill status={o.status} /></td>
                      <td className={`${TD} hidden lg:table-cell`}>
                        <p className="text-[11px] font-bold text-gray-700 uppercase">{o.payment_method}</p>
                        <p className={`text-[11.5px] font-semibold ${PAYMENT_TONE[o.payment_status] ?? 'text-gray-600'}`}>{PAYMENT_LABEL[o.payment_status] ?? o.payment_status}</p>
                      </td>
                      <td className={`${TD} text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap`}>{peso(o.total)}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <p className="text-gray-700">{shortDay(o.created_at)}</p>
                        <p className="text-[11px] text-gray-400">{relativeTime(o.created_at)}</p>
                      </td>
                      <td className={`${TD} text-right`}><ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red" aria-hidden="true" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards, below md */}
            <div className="divide-y divide-gray-100 md:hidden">
              {loading && orders.length === 0 && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse"><div className="w-1/2 h-3 bg-gray-100 rounded" /><div className="w-3/4 h-3 bg-gray-100 rounded" /></div>
              ))}
              {!loading && orders.length === 0 && empty}
              {orders.map((o) => (
                <button key={o.id} type="button" onClick={(e) => openOrder(o.id, e.currentTarget)} className={`flex w-full gap-3 p-4 text-left hover:bg-red-50/40 ${loading ? 'opacity-60' : ''}`}>
                  <ItemStack order={o} size="w-11 h-11" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-gray-900 truncate">{o.order_number}</span>
                      <span className="text-[13px] font-bold text-gray-900 tabular-nums shrink-0">{peso(o.total)}</span>
                    </span>
                    <span className="block text-[12px] text-gray-500 truncate">{buyerName(o)} · {o.shop?.name ?? NA}</span>
                    <span className="flex flex-wrap items-center gap-2 mt-1.5">
                      <StatusPill status={o.status} />
                      <span className="text-[11px] text-gray-400">{relativeTime(o.created_at)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <ListPager meta={meta} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} noun={['order', 'orders']} />
          </>
        )}
      </div>

      {selected !== null && <OrderSheet orderId={selected} onClose={closeSheet} onUpdated={onUpdated} />}
    </div>
  );
}
