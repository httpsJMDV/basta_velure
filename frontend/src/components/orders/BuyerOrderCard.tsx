import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Store, ShoppingBag, Star, X, Clock, Gift, Zap, ImagePlus, AlertCircle, CheckCircle2, ShieldAlert, KeyRound } from 'lucide-react';
import type { Order } from '../../types';
import { getStatusLabel, getStatusBadgeClass, normalizeOrderStatus } from '../../utils/orderStatus';
import OrderStatusTimeline from './OrderStatusTimeline';
import BuyerReceiptConfirm from './BuyerReceiptConfirm';
import TrackPackageButton from '../tracking/TrackPackageButton';
import { Dialog, BUTTON } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import {
  BUYER_CANCEL_REASONS, RETURN_REASONS, cancelBuyerOrderApi, escalateReturnApi, payAgainApi, requestReturnApi,
} from '../../api/commerce';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';
import { pesoCompact as peso } from '../../utils/pricing';

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const METHOD: Record<string, string> = { cod: 'Cash on delivery', gcash: 'GCash to the shop', e_wallet: 'E-wallet', card: 'Card' };

/**
 * One order as the buyer sees it (B10 to B12): where it stands, what it cost (vouchers included), and the actions
 * its status allows: pay, cancel with a reason (until Ready for Pickup), confirm receipt, request a return within 7
 * days of delivery, escalate a rejected return once, rate the items once the order is completed.
 */
export default function BuyerOrderCard({ order, onUpdated, multiShop }: { order: Order; onUpdated: (o: Order) => void; multiShop?: boolean }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const status = normalizeOrderStatus(order.status);
  const [history, setHistory] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const dispute = order.dispute ?? null;
  const toPay = order.tab === 'to_pay';
  const gcashPending = order.payment_method === 'gcash' && order.payment_status === 'pending_verification';
  const trackable = order.tracking_number && ['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'DELIVERY_FAILED'].includes(String(order.status));
  const discounts = (order.promo_discount ?? 0) + (order.store_voucher_discount ?? 0) + (order.platform_voucher_discount ?? 0);

  const pay = async () => {
    if (order.payment_token) { navigate(`/pay/${order.payment_token}`); return; }
    setBusy('pay');
    try {
      const s = await payAgainApi(order.id);
      navigate(`/pay/${s.token}`);
    } catch (e) {
      showToast(apiErrorMessage(e, 'This order can no longer be paid.'), 'error');
    } finally { setBusy(null); }
  };

  const escalate = async () => {
    setBusy('escalate');
    try {
      const res = await escalateReturnApi<Order>(order.id);
      onUpdated(res.data);
      showToast(res.message, 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'The request could not be escalated.'), 'error');
    } finally { setBusy(null); }
  };

  return (
    <article className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 border-b border-stone-100">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-900 min-w-0">
          <Store className="w-4 h-4 text-stone-400 shrink-0" /><span className="truncate max-w-[220px]">{order.items[0]?.shop_name ?? 'Shop'}</span>
        </span>
        <span className="text-[12px] text-stone-400"><span className="font-mono">#{order.order_number}</span> · {day(order.created_at)}</span>
        <span className="ml-auto">
          {toPay ? (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${order.payment_status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
              {order.payment_status === 'failed' ? 'Payment failed' : 'To pay'}
            </span>
          ) : gcashPending ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-amber-50 text-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Shop is checking your GCash</span>
          ) : (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${getStatusBadgeClass(status)}`}>{returnLabel(dispute?.status) ?? getStatusLabel(status)}</span>
          )}
        </span>
      </header>

      <ul className="px-4 divide-y divide-stone-100">
        {order.items.map((item) => {
          const inner = (
            <>
              <span className="w-14 h-14 rounded-xl bg-stone-100 overflow-hidden shrink-0 ring-1 ring-stone-200">
                {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-stone-300"><ShoppingBag className="w-5 h-5" /></span>}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-medium text-stone-900 leading-snug line-clamp-2">{item.product_name}</span>
                <span className="block mt-0.5 text-[12px] text-stone-500">
                  {[item.variant_label, `× ${item.quantity}`, `${peso(Number(item.unit_price))} each`].filter(Boolean).join(' · ')}
                  {item.price_source === 'flash' && <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-stone-700"><Zap className="w-3 h-3 text-amber-500 fill-amber-500" />Flash</span>}
                  {item.price_source === 'sale' && <span className="ml-1.5 font-semibold text-brand-red">Sale</span>}
                </span>
                {item.is_gift && <span className="block text-[12px] font-semibold text-emerald-700"><Gift className="inline w-3 h-3 -mt-0.5" /> Free with a shop promotion</span>}
              </span>
              <span className="text-[13px] font-semibold text-stone-900 tabular-nums shrink-0">{peso(Number(item.subtotal) - Number(item.promo_share ?? 0))}</span>
            </>
          );
          return (
            <li key={item.id}>
              {item.product_id
                ? <Link to={`/products/${item.product_id}`} className="flex items-center gap-3 py-3">{inner}</Link>
                : <div className="flex items-center gap-3 py-3">{inner}</div>}
            </li>
          );
        })}
      </ul>

      <div className="px-4 pb-3 space-y-2">
        {toPay && order.payment_due_at && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <Clock className="w-4 h-4 shrink-0" /> Pay by {when(order.payment_due_at)}, or the order is cancelled and its items released.
          </p>
        )}
        {order.delivery_otp && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-brand-red/40 bg-red-50/40 px-3 py-2.5">
            <KeyRound className="w-5 h-5 text-brand-red shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-stone-700">Your delivery code</p>
              <p className="text-[11.5px] text-stone-500">Give it to the rider at the door. Never share it before the parcel is in your hands.</p>
            </div>
            <span className="font-mono text-[22px] font-bold tracking-[0.25em] text-stone-900 tabular-nums" aria-label={`Delivery code ${order.delivery_otp.split('').join(' ')}`}>{order.delivery_otp}</span>
          </div>
        )}
        {order.returning_to_seller ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            Delivery failed, so the parcel is going back to the shop. The order will be cancelled{order.payment_method === 'cod' ? '' : ' and your payment refunded in full'}.
          </p>
        ) : order.delivery_attempt && status === 'DELIVERY_FAILED' && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            Delivery attempt {order.delivery_attempt.failed} of {order.delivery_attempt.max} failed. The courier will try again.
          </p>
        )}
        {order.payment_status === 'verification_failed' && order.rejection_reason && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-800"><span className="font-semibold">From the shop: </span>{order.rejection_reason}</p>
        )}
        {status === 'CANCELLED' && (
          <p className="rounded-xl bg-stone-50 px-3 py-2 text-[12.5px] text-stone-700">
            <span className="font-semibold">Cancelled{order.cancel_reason === 'Failed delivery' ? '' : order.cancelled_by ? ` by ${order.cancelled_by === 'buyer' ? 'you' : order.cancelled_by === 'seller' ? 'the shop' : 'Loved-IT'}` : ''}</span>
            {order.cancel_reason && <>: {order.cancel_reason}</>}
            {order.refund_status && <span className="block mt-0.5">{refundLine(order)}</span>}
          </p>
        )}
        {dispute && <ReturnStatus order={order} onEscalate={escalate} escalating={busy === 'escalate'} />}
        {multiShop && <p className="text-[12px] text-stone-500">Part of a checkout with several shops; each shop ships its own parcel.</p>}
        {status === 'DELIVERED' && <BuyerReceiptConfirm order={order} onUpdated={onUpdated} />}
      </div>

      <footer className="px-4 py-3 bg-stone-50/70 border-t border-stone-100">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 text-[12px] text-stone-500 space-y-0.5">
            <p>
              <span className="font-semibold text-stone-700">{METHOD[order.payment_method] ?? order.payment_method}</span>
              {order.payment_reference && <> · ref <span className="font-mono">{order.payment_reference}</span></>}
              {order.tracking_number && <> · tracking <span className="font-mono">{order.tracking_number}</span></>}
            </p>
            {(order.vouchers?.length ?? 0) > 0 && (
              <p>{order.vouchers!.map((v) => <span key={v.scope} className="mr-2">{v.code} −{peso(v.discount)}</span>)}</p>
            )}
          </div>
          <div className="ml-auto text-right text-[12px] text-stone-500 space-y-0.5">
            <p>Items {peso(Number(order.subtotal))}{discounts > 0 && <> · discounts −{peso(discounts)}</>}</p>
            <p>Shipping {order.free_delivery ? 'free' : peso(Number(order.shipping_fee) - Number(order.shipping_voucher_discount ?? 0))}{order.chargeable_weight_kg ? ` · ${order.chargeable_weight_kg} kg` : ''}</p>
            <p><span className="mr-1.5">Order total</span><span className="text-[16px] font-bold text-stone-900 tabular-nums">{peso(Number(order.total || 0))}</span></p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setHistory((v) => !v)} aria-expanded={history} className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-stone-600 hover:bg-white hover:text-stone-900">
            {history ? 'Hide history' : 'Order history'}
          </button>
          {trackable && <TrackPackageButton trackingNumber={order.tracking_number!} />}
          {order.can_cancel && (
            <button type="button" onClick={() => setCancelOpen(true)} className="h-8 px-3.5 rounded-full border border-stone-300 bg-white text-[12.5px] font-semibold text-stone-800 hover:border-stone-900">Cancel order</button>
          )}
          {order.can_return && (
            <button type="button" onClick={() => setReturnOpen(true)} className="h-8 px-3.5 rounded-full border border-stone-300 bg-white text-[12.5px] font-semibold text-stone-800 hover:border-stone-900">Return or refund</button>
          )}
          {toPay && (
            <button type="button" onClick={pay} disabled={busy === 'pay'} className="h-8 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[12.5px] font-semibold disabled:opacity-60">
              {order.payment_status === 'failed' ? 'Pay again' : 'Pay now'}
            </button>
          )}
          {status === 'COMPLETED' && (
            <Link to={`/settings/reviews?order=${order.id}`} className="h-8 px-3.5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> Rate items
            </Link>
          )}
        </div>
      </footer>

      {history && (
        <div className="px-4 py-4 border-t border-stone-100"><OrderStatusTimeline history={order.status_history} currentStatus={order.status} /></div>
      )}

      <CancelDialog open={cancelOpen} order={order} onClose={() => setCancelOpen(false)} onDone={(o, m) => { onUpdated(o); setCancelOpen(false); showToast(m, 'success'); }} />
      <ReturnDialog open={returnOpen} order={order} onClose={() => setReturnOpen(false)} onDone={(o, m) => { onUpdated(o); setReturnOpen(false); showToast(m, 'success'); }} />
    </article>
  );
}

function returnLabel(status?: string): string | null {
  switch (status) {
    case 'pending': return 'Return requested';
    case 'approved': return 'Return approved';
    case 'rejected': return 'Return rejected';
    case 'escalated': return 'In dispute';
    case 'closed': return 'Return closed';
    default: return null;
  }
}

function refundLine(order: Order) {
  if (order.refund_status === 'refunded') return `${peso(Number(order.refund_amount ?? 0))} refunded to your ${order.payment_method === 'card' ? 'card' : order.payment_method === 'cod' ? 'refund account' : 'payment method'}.`;
  if (order.refund_status === 'pending') return `${peso(Number(order.refund_amount ?? 0))} to be refunded by the shop to your GCash.`;
  return '';
}

function ReturnStatus({ order, onEscalate, escalating }: { order: Order; onEscalate: () => void; escalating: boolean }) {
  const d = order.dispute!;
  const tone = d.status === 'approved' ? 'bg-emerald-50 text-emerald-900' : d.status === 'rejected' ? 'bg-red-50 text-red-900' : d.status === 'escalated' ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900';
  return (
    <div className={`rounded-xl px-3 py-2.5 text-[12.5px] ${tone}`}>
      <p className="font-semibold">{returnLabel(d.status) ?? 'Return request'} · {d.reason}</p>
      <p className="mt-0.5 opacity-90">{d.description}</p>
      {d.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.photos.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Return evidence" className="w-12 h-12 rounded-lg object-cover ring-1 ring-black/10" /></a>)}
        </div>
      )}
      {d.status === 'pending' && d.respond_by && <p className="mt-1.5">The shop answers by {when(d.respond_by)}. If it does not, the return is approved.</p>}
      {d.status === 'rejected' && (
        <div className="mt-1.5">
          <p><span className="font-semibold">The shop's reason:</span> {d.seller_reason}</p>
          {d.can_escalate ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={onEscalate} disabled={escalating} className="h-8 px-3.5 rounded-full bg-stone-900 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                <ShieldAlert className="w-3.5 h-3.5" /> Escalate to Loved-IT
              </button>
              {d.escalate_by && <span className="opacity-80">You can escalate until {when(d.escalate_by)}.</span>}
            </div>
          ) : <p className="mt-1 opacity-80">The time to escalate has passed.</p>}
        </div>
      )}
      {d.status === 'escalated' && <p className="mt-1.5">Loved-IT is reviewing the request with you and the shop. Neither side can change it now.</p>}
      {d.status === 'approved' && (
        <p className="mt-1.5 inline-flex items-start gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{d.auto_approved ? 'Approved because the shop did not answer in 3 days. ' : ''}{refundLine(order) || 'Your refund is on its way.'} Pack the item with its tags and hand it to the courier when they contact you.</span>
        </p>
      )}
      {d.status === 'closed' && d.resolution_note && <p className="mt-1.5">{d.resolution_note}</p>}
    </div>
  );
}

function CancelDialog({ open, order, onClose, onDone }: { open: boolean; order: Order; onClose: () => void; onDone: (o: Order, message: string) => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const other = reason === 'Other';
  const detailsOk = !other || (details.trim().length >= 10 && details.trim().length <= 300);

  const submit = async () => {
    if (busy) return;
    if (!reason) { setError('Choose a reason for cancelling.'); return; }
    if (!detailsOk) { setError('Tell the shop why, in 10 to 300 characters.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await cancelBuyerOrderApi<Order>(order.id, reason, other ? details.trim() : undefined);
      onDone(res.data, res.message);
      setReason('');
      setDetails('');
    } catch (e) {
      setError(apiProblem(e, 'The order could not be cancelled.').message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={`Cancel order #${order.order_number}?`}
      footer={<>
        <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={busy}>Keep the order</button>
        <button type="button" className={BUTTON.danger} onClick={submit} disabled={busy || !reason || !detailsOk}>{busy ? 'Cancelling…' : 'Cancel order'}</button>
      </>}>
      <p className="text-[13px] text-stone-600 mb-3">
        The items go back to the shop and any vouchers you used return to My Vouchers.{order.payment_status === 'paid' ? ` You will be refunded ${peso(Number(order.total))}.` : ''}
      </p>
      <div className="space-y-1.5" role="radiogroup" aria-label="Reason">
        {BUYER_CANCEL_REASONS.map((r) => (
          <label key={r} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-[13px] ${reason === r ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
            <input type="radio" name={`cancel-${order.id}`} checked={reason === r} onChange={() => { setReason(r); setError(''); }} className="accent-brand-red" /> {r}
          </label>
        ))}
      </div>
      {other && (
        <div className="mt-3">
          <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell the shop why you are cancelling"
            className="w-full px-3 py-2 text-[13px] rounded-xl border border-stone-300 outline-none focus:border-brand-red resize-none" />
          <p className="text-[11px] text-stone-400 tabular-nums">{details.trim().length}/300 · at least 10</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-brand-red">{error}</p>}
    </Dialog>
  );
}

const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

function ReturnDialog({ open, order, onClose, onDone }: { open: boolean; order: Order; onClose: () => void; onDone: (o: Order, message: string) => void }) {
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...photos];
    let problem = '';
    for (const f of Array.from(list)) {
      if (!['image/jpeg', 'image/png'].includes(f.type)) { problem = `${f.name}: only JPG or PNG photos.`; continue; }
      if (f.size > MAX_BYTES) { problem = `${f.name}: larger than 5 MB.`; continue; }
      if (next.length >= MAX_PHOTOS) { problem = `You can add up to ${MAX_PHOTOS} photos.`; break; }
      next.push(f);
    }
    setPhotos(next);
    setErrors((e) => ({ ...e, photos: problem }));
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    const text = description.trim();
    if (text.length < 10) e.description = 'Describe the problem in at least 10 characters.';
    if (text.length > 500) e.description = 'The description can be at most 500 characters.';
    if (photos.length === 0) e.photos = 'Add at least one photo of the problem.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const form = new FormData();
    form.append('reason', reason);
    form.append('description', text);
    photos.forEach((p) => form.append('photos[]', p));
    setBusy(true);
    try {
      const res = await requestReturnApi<Order>(order.id, form);
      onDone(res.data, res.message);
      setDescription('');
      setPhotos([]);
    } catch (err) {
      const p = apiProblem(err, 'The return request was not sent. Try again.');
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.fields)) mapped[k.startsWith('photos') ? 'photos' : k] = v;
      setErrors(Object.keys(mapped).length ? mapped : { form: p.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title="Request a return or refund" size="max-w-lg"
      footer={<>
        <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BUTTON.primary} onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      </>}>
      <p className="text-[12.5px] text-stone-500 mb-3">
        Order <span className="font-mono">#{order.order_number}</span>{order.return_window_ends_at ? ` · request by ${when(order.return_window_ends_at)}` : ''}. The shop has 3 days to answer.
      </p>
      <p className="text-[13px] font-semibold text-stone-800 mb-1.5">What went wrong?</p>
      <div className="grid sm:grid-cols-2 gap-1.5" role="radiogroup">
        {RETURN_REASONS.map((r) => (
          <label key={r} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-[13px] ${reason === r ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
            <input type="radio" name={`return-${order.id}`} checked={reason === r} onChange={() => setReason(r)} className="accent-brand-red" /> {r}
          </label>
        ))}
      </div>
      <label htmlFor={`return-desc-${order.id}`} className="mt-4 block text-[13px] font-semibold text-stone-800">Describe the problem</label>
      <textarea id={`return-desc-${order.id}`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Basket arrived with a broken rim." aria-invalid={!!errors.description}
        className={`mt-1.5 w-full px-3.5 py-2.5 text-[13px] rounded-xl border outline-none focus:ring-2 focus:ring-brand-red/10 resize-none ${errors.description ? 'border-brand-red' : 'border-stone-300 focus:border-brand-red'}`} />
      <p className={`text-[11px] tabular-nums ${errors.description ? 'text-brand-red font-medium' : 'text-stone-400'}`}>{errors.description ?? `${description.trim().length}/500 · at least 10`}</p>

      <p className="mt-3 text-[13px] font-semibold text-stone-800">Photos <span className="font-normal text-stone-500">(1 to 5, JPG or PNG up to 5 MB)</span></p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <span key={src} className="relative">
            <img src={src} alt={`Photo ${i + 1}`} className="w-16 h-16 rounded-xl object-cover ring-1 ring-stone-200" />
            <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-900 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="w-16 h-16 rounded-xl border-2 border-dashed border-stone-300 hover:border-brand-red text-stone-400 hover:text-brand-red flex items-center justify-center cursor-pointer">
            <ImagePlus className="w-5 h-5" />
            <input type="file" accept="image/jpeg,image/png" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {errors.photos && <p role="alert" className="mt-1.5 text-[12px] font-medium text-brand-red">{errors.photos}</p>}
      {errors.form && <p role="alert" className="mt-3 flex items-center gap-1.5 text-[12.5px] text-brand-red"><AlertCircle className="w-4 h-4" />{errors.form}</p>}
    </Dialog>
  );
}
