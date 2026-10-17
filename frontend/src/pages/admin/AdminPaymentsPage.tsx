import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, Check, X, ChevronLeft, ChevronRight, Wallet, ReceiptText, ArrowUpRight, ExternalLink, ImageOff, Percent } from 'lucide-react';
import { getAdminPaymentListApi, getAdminPayoutsApi, markAdminPayoutSentApi, completeAdminPayoutApi, rejectAdminPayoutApi } from '../../api/client';
import type { AdminPaymentListItem, PayoutRequest } from '../../types';
import { PageHero } from '../../components/admin/dashboardKit';
import { SearchField, ListError, Pill, type PillTone, TH, TD, ROW, rowKeys, relativeTime, RowAction } from '../../components/admin/listKit';
import { getStatusLabel } from '../../utils/orderStatus';
import { peso, whole } from '../../utils/adminReports';
import AdminCommissionPanel from './AdminCommissionPanel';

type Tab = 'payments' | 'payouts' | 'commission';
type PageMeta = { current_page: number; last_page: number; total: number };
const PAGE_SIZE = 20; // both endpoints paginate by 20
const EMPTY_PAGE: PageMeta = { current_page: 1, last_page: 1, total: 0 };

const PAYMENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending_verification', label: 'Receipt to check' },
  { value: 'paid', label: 'Paid' },
  { value: 'verification_failed', label: 'Not received' },
  { value: 'cod', label: 'Cash on delivery' },
];

const PAYOUT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Waiting' },
  { value: 'processing', label: 'Sent' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

function day(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '—';
}

/** A payment's state, worded for each method: a COD order has nothing to check until the rider collects. */
function paymentState(p: Pick<AdminPaymentListItem, 'payment_method' | 'payment_status'>): { label: string; tone: PillTone } {
  if (p.payment_method === 'cod') return p.payment_status === 'paid' ? { label: 'Collected', tone: 'emerald' } : { label: 'Due on delivery', tone: 'gray' };
  switch (p.payment_status) {
    case 'pending_verification': return { label: 'Receipt to check', tone: 'amber' };
    case 'paid': return { label: 'Paid', tone: 'emerald' };
    case 'verification_failed': return { label: 'Not received', tone: 'red' };
    default: return { label: String(p.payment_status).replace(/_/g, ' '), tone: 'gray' };
  }
}

const PAYOUT_STATE: Record<PayoutRequest['status'], { label: string; tone: PillTone }> = {
  pending: { label: 'Waiting', tone: 'amber' },
  processing: { label: 'Sent', tone: 'blue' },
  completed: { label: 'Completed', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'red' },
};

function CopyText({ text, mono = true }: { text: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={`${mono ? 'font-mono' : ''} truncate`}>{text}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Copy ${text}`}
        title="Copy"
        className="flex items-center justify-center w-6 h-6 text-gray-400 rounded-md shrink-0 hover:bg-gray-100 hover:text-gray-800"
      >
        {done ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
}

function Segmented({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap p-0.5 rounded-xl bg-gray-100 border border-gray-200">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors ${value === o.value ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Pager({ meta, count, onPage, noun }: { meta: PageMeta; count: number; onPage: (p: number) => void; noun: [string, string] }) {
  if (meta.total === 0) return null;
  const from = (meta.current_page - 1) * PAGE_SIZE + 1;
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100">
      <p className="text-[12px] text-gray-500">
        <span className="font-semibold text-gray-800">{from}–{from + count - 1}</span> of <span className="font-semibold text-gray-800">{whole(meta.total)}</span> {meta.total === 1 ? noun[0] : noun[1]}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(meta.current_page - 1)} disabled={meta.current_page <= 1} aria-label="Previous page" className="flex items-center justify-center w-8 h-8 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <span className="px-2 text-[12px] text-gray-600 tabular-nums">{meta.current_page} / {meta.last_page}</span>
        <button type="button" onClick={() => onPage(meta.current_page + 1)} disabled={meta.current_page >= meta.last_page} aria-label="Next page" className="flex items-center justify-center w-8 h-8 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

/** A row of figures on one card, divided by hairlines (the money strip of each tab). */
function Strip({ cells, footer }: { cells: { label: string; value: string; note: string; strong?: boolean }[]; footer?: React.ReactNode }) {
  return (
    <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className={`grid grid-cols-2 divide-x divide-y lg:divide-y-0 divide-gray-100 ${cells.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {cells.map((c) => (
          <div key={c.label} className={`px-4 py-3 ${c.strong ? 'bg-gray-50/80' : ''}`}>
            <p className="text-[11px] font-semibold text-gray-500">{c.label}</p>
            <p className="mt-1 text-[22px] font-bold tracking-tight text-gray-900 tabular-nums">{c.value}</p>
            <p className="text-[11px] text-gray-400">{c.note}</p>
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}

// ─── Payment sheet ────────────────────────────────────────────────────────────

function PaymentSheet({ payment, onClose }: { payment: AdminPaymentListItem; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  const state = paymentState(payment);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoom) setZoom(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, zoom]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Payment for order ${payment.order_number}`}>
      <div className="absolute inset-0 bg-gray-950/40" onClick={onClose} />
      <div className="relative flex flex-col w-full h-full max-w-[520px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400">Payment for order</p>
            <h2 className="font-mono text-[17px] font-bold text-gray-900 truncate">{payment.order_number}</h2>
            <p className="text-[12px] text-gray-500">Placed {day(payment.created_at)} · order {getStatusLabel(payment.order_status).toLowerCase()}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex items-center justify-center text-gray-500 rounded-lg w-9 h-9 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <section className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400">{payment.payment_method === 'gcash' ? 'Paid by GCash' : 'Cash on delivery'}</p>
                <p className="text-[28px] font-bold tracking-tight text-gray-900 tabular-nums">{peso(payment.amount)}</p>
              </div>
              <Pill tone={state.tone}>{state.label}</Pill>
            </div>
            {payment.rejection_reason && <p className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-[12.5px] text-red-800">{payment.rejection_reason}</p>}
          </section>

          {payment.payment_method === 'gcash' && (
            <section className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400">GCash receipt the buyer uploaded</p>
                {payment.payment_reference && <span className="text-[12.5px] text-gray-800"><CopyText text={payment.payment_reference} /></span>}
              </div>
              {payment.payment_proof_url ? (
                <button type="button" onClick={() => setZoom(true)} className="block w-full overflow-hidden bg-gray-100 border border-gray-200 rounded-xl cursor-zoom-in" aria-label="Enlarge the receipt">
                  <img src={payment.payment_proof_url} alt="GCash receipt" className="object-contain w-full max-h-[360px]" />
                </button>
              ) : (
                <p className="flex items-center gap-2 px-3 py-6 justify-center rounded-xl bg-gray-50 text-[12.5px] text-gray-500"><ImageOff className="w-4 h-4" /> No receipt was attached.</p>
              )}
              <p className="mt-2 text-[11.5px] text-gray-400">The shop checks this receipt against its GCash history. It is shown here for audits.</p>
            </section>
          )}

          <section className="grid grid-cols-2 gap-6 px-6 py-5 border-b border-gray-100">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400">Buyer</p>
              <p className="text-[13px] font-semibold text-gray-900 truncate">{payment.buyer?.name ?? '—'}</p>
              {payment.buyer?.email && <p className="text-[12px] text-gray-500 truncate">{payment.buyer.email}</p>}
              {payment.buyer?.phone && <p className="text-[12px] text-gray-500">{payment.buyer.phone}</p>}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400">Shop</p>
              <p className="text-[13px] font-semibold text-gray-900 truncate">{payment.seller?.shop_name ?? '—'}</p>
              {payment.seller?.name && <p className="text-[12px] text-gray-500 truncate">{payment.seller.name}</p>}
            </div>
          </section>

          <section className="px-6 py-5">
            <p className="text-[11px] font-semibold text-gray-400 mb-3">{payment.items_count} item{payment.items_count === 1 ? '' : 's'}</p>
            <ul className="space-y-2">
              {payment.items?.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-gray-800">{item.product_name} <span className="text-gray-400">× {item.quantity}</span></span>
                  <span className="font-semibold text-gray-900 tabular-nums">{peso(item.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between pt-3 mt-3 text-[14px] font-bold border-t border-dashed border-gray-200"><span>Total with delivery</span><span className="tabular-nums">{peso(payment.amount)}</span></div>
            <Link to={`/admin/orders?search=${encodeURIComponent(payment.order_number)}`} className="inline-flex items-center gap-1 mt-4 text-[12.5px] font-bold text-brand-red hover:underline">
              Open the order <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </section>
        </div>
      </div>

      {zoom && payment.payment_proof_url && (
        <div className="fixed inset-0 z-[70] bg-gray-950/90 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoom(false)}>
          <img src={payment.payment_proof_url} alt="GCash receipt, enlarged" className="max-h-[92vh] max-w-[92vw] object-contain rounded-xl" />
        </div>
      )}
    </div>,
    document.body,
  );
}

// ─── Payout dialogs ───────────────────────────────────────────────────────────

type PayoutAction = { kind: 'send' | 'complete' | 'reject'; payout: PayoutRequest };

function PayoutDialog({ action, busy, error, onConfirm, onCancel }: { action: PayoutAction; busy: boolean; error: string; onConfirm: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const { kind, payout } = action;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const copy = {
    send: { title: 'Mark the payout as sent', confirm: 'Mark as sent', field: 'GCash reference of your transfer (optional)', placeholder: 'For example 9012 345 678901', intro: <>Send <b>{peso(payout.amount)}</b> to <b>{payout.gcash_name}</b> ({payout.gcash_number}) in GCash first, then record it here.</> },
    complete: { title: 'Complete the payout', confirm: 'Complete payout', field: 'Note (optional)', placeholder: 'For example: seller confirmed receipt', intro: <>Confirm that <b>{payout.seller?.shop_name || payout.seller?.name}</b> received <b>{peso(payout.amount)}</b>. This closes the request.</> },
    reject: { title: 'Reject the payout', confirm: 'Reject payout', field: 'Reason the seller will see', placeholder: 'For example: the GCash name does not match the account', intro: <>The <b>{peso(payout.amount)}</b> goes back to the seller&apos;s balance, and they can request again.</> },
  }[kind];
  const needsText = kind === 'reject';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
      <div className="absolute inset-0 bg-gray-950/50" onClick={onCancel} />
      <form
        onSubmit={(e) => { e.preventDefault(); if (!needsText || text.trim()) onConfirm(text.trim()); }}
        className="relative w-full max-w-md p-5 bg-white border border-gray-100 shadow-2xl rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] text-gray-400">{payout.reference_code}</p>
            <h2 className="text-[15px] font-bold text-gray-900">{copy.title}</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex items-center justify-center w-8 h-8 text-gray-400 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <p className="mt-2 text-[13px] text-gray-600 leading-relaxed">{copy.intro}</p>
        <label className="block mt-4 text-[12px] font-semibold text-gray-700">{copy.field}</label>
        {kind === 'reject' ? (
          <textarea autoFocus required rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder}
            className="w-full mt-1 px-3 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 resize-none" />
        ) : (
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder}
            className="w-full h-10 mt-1 px-3 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10" />
        )}
        {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || (needsText && !text.trim())}
            className={`flex-1 h-10 rounded-xl text-white text-[13px] font-bold disabled:opacity-50 ${kind === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-red hover:bg-brand-red-dark'}`}>
            {busy ? 'Saving…' : copy.confirm}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (['payouts', 'commission'] as const).find((t) => t === searchParams.get('tab')) ?? 'payments';
  const setTab = (t: Tab) => setSearchParams({ tab: t });

  // Payments
  const [payments, setPayments] = useState<AdminPaymentListItem[]>([]);
  const [paymentMeta, setPaymentMeta] = useState<PageMeta>(EMPTY_PAGE);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [paymentInput, setPaymentInput] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  const [openPayment, setOpenPayment] = useState<AdminPaymentListItem | null>(null);

  // Payouts
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [payoutMeta, setPayoutMeta] = useState<PageMeta>(EMPTY_PAGE);
  const [payoutFilter, setPayoutFilter] = useState('');
  const [payoutInput, setPayoutInput] = useState('');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [payoutPage, setPayoutPage] = useState(1);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [payoutsFailed, setPayoutsFailed] = useState(false);
  const [queue, setQueue] = useState<{ waiting: number; sent: number } | null>(null);
  const [action, setAction] = useState<PayoutAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => { setPaymentSearch(paymentInput.trim()); setPaymentPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [paymentInput]);
  useEffect(() => {
    const id = window.setTimeout(() => { setPayoutSearch(payoutInput.trim()); setPayoutPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [payoutInput]);

  const loadPayments = useCallback(() => {
    setLoadingPayments(true);
    setPaymentsFailed(false);
    getAdminPaymentListApi({ status: paymentFilter || undefined, search: paymentSearch || undefined, page: paymentPage })
      .then((res) => { setPayments(res.data); setPaymentMeta(res.meta); if (res.stats) setStats(res.stats); })
      .catch(() => setPaymentsFailed(true))
      .finally(() => setLoadingPayments(false));
  }, [paymentFilter, paymentSearch, paymentPage]);

  const loadPayouts = useCallback(() => {
    setLoadingPayouts(true);
    setPayoutsFailed(false);
    getAdminPayoutsApi({ status: payoutFilter || undefined, search: payoutSearch || undefined, page: payoutPage })
      .then((res) => { setPayouts(res.data); setPayoutMeta(res.meta); })
      .catch(() => setPayoutsFailed(true))
      .finally(() => setLoadingPayouts(false));
  }, [payoutFilter, payoutSearch, payoutPage]);

  // How many payout requests wait on the admin (the tab badge and the payout strip).
  const loadQueue = useCallback(() => {
    Promise.all([getAdminPayoutsApi({ status: 'pending' }), getAdminPayoutsApi({ status: 'processing' })])
      .then(([w, s]) => setQueue({ waiting: w.meta.total, sent: s.meta.total }))
      .catch(() => {});
  }, []);

  useEffect(() => { if (tab === 'payments') loadPayments(); }, [tab, loadPayments]);
  useEffect(() => { if (tab === 'payouts') loadPayouts(); }, [tab, loadPayouts]);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  const runAction = async (text: string) => {
    if (!action) return;
    setActionBusy(true);
    setActionError('');
    const { kind, payout } = action;
    try {
      if (kind === 'send') await markAdminPayoutSentApi(payout.id, text ? `GCash ref ${text}` : 'GCash funds sent by Admin');
      else if (kind === 'complete') await completeAdminPayoutApi(payout.id, text || 'Completed via GCash transfer');
      else await rejectAdminPayoutApi(payout.id, text);
      setAction(null);
      loadPayouts();
      loadQueue();
    } catch (err) {
      setActionError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'That did not go through. Try again.');
    } finally {
      setActionBusy(false);
    }
  };

  const gcash = stats?.gcash_volume ?? 0;
  const cod = stats?.cod_volume ?? 0;
  const gcashShare = gcash + cod > 0 ? (gcash / (gcash + cod)) * 100 : 0;

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Wallet} eyebrow="Admin / Money" title="Payments & Payouts"
        subtitle="Buyers pay shops directly. Check GCash receipts, settle older payouts, and confirm the commission shops send each month." />

      <div role="tablist" aria-label="Section" className="flex gap-6 px-1 border-b border-gray-200">
        {([['payments', 'Buyer payments', ReceiptText, stats?.pending_verification], ['payouts', 'Seller payouts', ArrowUpRight, queue?.waiting], ['commission', 'Commission', Percent, 0]] as const).map(([key, label, Icon, badge]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`relative inline-flex items-center gap-2 pb-2.5 text-[13px] font-semibold transition-colors ${tab === key ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
            {!!badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-red text-white text-[11px] font-bold flex items-center justify-center">{badge}</span>}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-brand-red rounded-full" />}
          </button>
        ))}
      </div>

      {tab === 'payments' ? (
        <>
          <Strip
            cells={[
              { label: 'All orders, not cancelled', value: stats ? peso(stats.total_volume) : '…', note: 'GCash and cash on delivery', strong: true },
              { label: 'GCash', value: stats ? peso(gcash) : '…', note: `${Math.round(gcashShare)}% of the value` },
              { label: 'Cash on delivery', value: stats ? peso(cod) : '…', note: `${stats ? 100 - Math.round(gcashShare) : 0}% of the value` },
              { label: 'Receipts to check', value: stats ? whole(stats.pending_verification) : '…', note: stats?.pending_verification ? 'Shops have not confirmed these yet' : 'Nothing waiting' },
            ]}
            footer={(
              <div className="flex h-1.5 bg-gray-100" aria-hidden="true">
                <span className="bg-[#007DFE] transition-[width] duration-500" style={{ width: `${gcashShare}%` }} />
                <span className="bg-amber-400 transition-[width] duration-500" style={{ width: `${gcash + cod > 0 ? 100 - gcashShare : 0}%` }} />
              </div>
            )}
          />

          <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={loadingPayments}>
            <div className="flex flex-col gap-2 p-3 border-b border-gray-100 lg:flex-row lg:items-center">
              <Segmented options={PAYMENT_FILTERS} value={paymentFilter} onChange={(v) => { setPaymentFilter(v); setPaymentPage(1); }} label="Payment status" />
              <SearchField value={paymentInput} onChange={setPaymentInput} label="Search payments" placeholder="Order number, buyer or GCash reference" />
            </div>

            {paymentsFailed ? <div className="p-3"><ListError message="The payments could not be loaded." onRetry={loadPayments} /></div> : (
              <>
                <div className="overflow-auto max-h-[68vh]">
                  <table className="w-full text-[13px]">
                    <thead><tr>
                      <th scope="col" className={TH}>Order</th>
                      <th scope="col" className={TH}>Buyer and shop</th>
                      <th scope="col" className={`${TH} hidden lg:table-cell`}>GCash reference</th>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={`${TH} text-right`}>Amount</th>
                      <th scope="col" className={`${TH} hidden md:table-cell`}>Placed</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {loadingPayments && payments.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">{[0, 1, 2, 3, 4, 5].map((c) => <td key={c} className={TD}><div className="w-3/4 h-3 bg-gray-100 rounded" /></td>)}</tr>
                      ))}
                      {!loadingPayments && payments.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-14 text-center text-[13px] text-gray-500">{paymentSearch || paymentFilter ? 'No payments match these filters.' : 'No payments yet.'}</td></tr>
                      )}
                      {payments.map((p) => {
                        const s = paymentState(p);
                        return (
                          <tr key={p.id} {...rowKeys(() => setOpenPayment(p))} className={`${ROW} ${loadingPayments ? 'opacity-60' : ''}`}>
                            <td className={TD}>
                              <p className="font-mono text-[12.5px] font-semibold text-gray-900">{p.order_number}</p>
                              <p className="text-[11.5px] text-gray-500"><span className={p.payment_method === 'gcash' ? 'font-semibold text-[#0064CC]' : 'font-semibold text-gray-700'}>{p.payment_method === 'gcash' ? 'GCash' : 'COD'}</span> · {p.items_count} item{p.items_count === 1 ? '' : 's'}</p>
                            </td>
                            <td className={TD}>
                              <p className="text-gray-900 truncate max-w-[200px]">{p.buyer?.name ?? '—'}</p>
                              <p className="text-[11.5px] text-gray-500 truncate max-w-[200px]">{p.seller?.shop_name ?? '—'}</p>
                            </td>
                            <td className={`${TD} hidden lg:table-cell text-gray-700`}>{p.payment_reference ? <CopyText text={p.payment_reference} /> : <span className="text-gray-300">—</span>}</td>
                            <td className={TD}><Pill tone={s.tone}>{s.label}</Pill></td>
                            <td className={`${TD} text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap`}>{peso(p.amount)}</td>
                            <td className={`${TD} hidden md:table-cell whitespace-nowrap`}>
                              <p className="text-gray-700">{day(p.created_at)}</p>
                              <p className="text-[11px] text-gray-400">{relativeTime(p.created_at)}</p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager meta={paymentMeta} count={payments.length} onPage={setPaymentPage} noun={['payment', 'payments']} />
              </>
            )}
          </div>
        </>
      ) : tab === 'commission' ? (
        <AdminCommissionPanel />
      ) : (
        <>
          <Strip
            cells={[
              { label: 'Waiting for you', value: queue ? whole(queue.waiting) : '…', note: queue?.waiting ? 'Send these in GCash, then mark them sent' : 'No requests waiting', strong: true },
              { label: 'Sent, not completed', value: queue ? whole(queue.sent) : '…', note: 'Complete once the seller has the money' },
              { label: 'Requests in this list', value: whole(payoutMeta.total), note: payoutFilter ? `Filtered: ${PAYOUT_FILTERS.find((f) => f.value === payoutFilter)?.label.toLowerCase()}` : 'Every status' },
            ]}
          />

          <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={loadingPayouts}>
            <div className="flex flex-col gap-2 p-3 border-b border-gray-100 lg:flex-row lg:items-center">
              <Segmented options={PAYOUT_FILTERS} value={payoutFilter} onChange={(v) => { setPayoutFilter(v); setPayoutPage(1); }} label="Payout status" />
              <SearchField value={payoutInput} onChange={setPayoutInput} label="Search payouts" placeholder="Shop, payout reference or GCash number" />
            </div>

            {payoutsFailed ? <div className="p-3"><ListError message="The payouts could not be loaded." onRetry={loadPayouts} /></div> : (
              <>
                <div className="overflow-auto max-h-[68vh]">
                  <table className="w-full text-[13px]">
                    <thead><tr>
                      <th scope="col" className={TH}>Request</th>
                      <th scope="col" className={TH}>Shop</th>
                      <th scope="col" className={TH}>Send to (GCash)</th>
                      <th scope="col" className={`${TH} text-right`}>Amount</th>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {loadingPayouts && payouts.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">{[0, 1, 2, 3, 4, 5].map((c) => <td key={c} className={TD}><div className="w-3/4 h-3 bg-gray-100 rounded" /></td>)}</tr>
                      ))}
                      {!loadingPayouts && payouts.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-14 text-center text-[13px] text-gray-500">{payoutSearch || payoutFilter ? 'No payout requests match these filters.' : 'No payout requests yet.'}</td></tr>
                      )}
                      {payouts.map((p) => {
                        const s = PAYOUT_STATE[p.status];
                        return (
                          <tr key={p.id} className={`transition-colors hover:bg-gray-50/70 ${loadingPayouts ? 'opacity-60' : ''}`}>
                            <td className={TD}>
                              <p className="font-mono text-[12.5px] font-semibold text-gray-900">{p.reference_code}</p>
                              <p className="text-[11px] text-gray-400">{day(p.created_at)} · {relativeTime(p.created_at)}</p>
                            </td>
                            <td className={TD}>
                              <p className="font-semibold text-gray-900 truncate max-w-[200px]">{p.seller?.shop_name || p.seller?.name}</p>
                              <p className="text-[11.5px] text-gray-500 truncate max-w-[200px]">{p.seller?.email}</p>
                            </td>
                            <td className={TD}>
                              <p className="text-gray-900 truncate max-w-[180px]">{p.gcash_name}</p>
                              <p className="text-[12px] text-gray-600"><CopyText text={p.gcash_number} /></p>
                            </td>
                            <td className={`${TD} text-right font-bold text-gray-900 tabular-nums whitespace-nowrap`}>{peso(p.amount)}</td>
                            <td className={TD}>
                              <Pill tone={s.tone}>{s.label}</Pill>
                              {p.rejection_reason && <p className="mt-1 text-[11px] text-red-700 max-w-[180px] truncate" title={p.rejection_reason}>{p.rejection_reason}</p>}
                              {p.admin_notes && p.status !== 'rejected' && <p className="mt-1 text-[11px] text-gray-400 max-w-[180px] truncate" title={p.admin_notes}>{p.admin_notes}</p>}
                            </td>
                            <td className={`${TD} text-right`}>
                              <div className="flex items-center justify-end gap-1.5">
                                {p.status === 'pending' && (
                                  <>
                                    <RowAction onClick={() => { setActionError(''); setAction({ kind: 'send', payout: p }); }} label={`Mark ${p.reference_code} sent`}>Mark sent</RowAction>
                                    <RowAction tone="danger" onClick={() => { setActionError(''); setAction({ kind: 'reject', payout: p }); }} label={`Reject ${p.reference_code}`}>Reject</RowAction>
                                  </>
                                )}
                                {p.status === 'processing' && (
                                  <RowAction tone="success" onClick={() => { setActionError(''); setAction({ kind: 'complete', payout: p }); }} label={`Complete ${p.reference_code}`}>Complete</RowAction>
                                )}
                                {(p.status === 'completed' || p.status === 'rejected') && <span className="text-[11px] text-gray-400">{p.processed_at ? day(p.processed_at) : 'Closed'}</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager meta={payoutMeta} count={payouts.length} onPage={setPayoutPage} noun={['request', 'requests']} />
              </>
            )}
          </div>
        </>
      )}

      {openPayment && <PaymentSheet payment={openPayment} onClose={() => setOpenPayment(null)} />}
      {action && <PayoutDialog key={`${action.kind}-${action.payout.id}`} action={action} busy={actionBusy} error={actionError} onConfirm={runAction} onCancel={() => setAction(null)} />}
    </div>
  );
}
