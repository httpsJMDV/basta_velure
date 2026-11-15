import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, QrCode, ShieldCheck, XCircle } from 'lucide-react';
import type { SellerOrder } from '../../types';
import { canReviewGcashPayment } from '../../utils/sellerPayments';

export default function SellerGcashReview({ order, busy, onConfirm, onReject, onViewProof, onCopy }: {
  order: SellerOrder; busy: boolean; onConfirm: () => void; onReject: () => void; onViewProof: () => void; onCopy: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const reviewable = canReviewGcashPayment(order), paid = order.payment_status === 'paid', rejected = order.payment_status === 'verification_failed';
  const amount = Number(order.order_total ?? order.seller_subtotal ?? 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
  return (
    <section aria-label="GCash payment review" className="overflow-hidden rounded-2xl border border-stone-200 bg-white text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 bg-blue-50/50 p-4">
        <div className="flex items-center gap-2.5"><span className="rounded-xl border border-blue-100 bg-white p-2 text-blue-600"><QrCode className="h-4 w-4" /></span><div><h3 className="font-bold text-stone-900">GCash payment review</h3><p className="mt-1 text-[11px] text-stone-500">Direct transfer to your shop · seller verification</p></div></div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : rejected ? 'border-red-200 bg-red-50 text-red-700' : reviewable ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>{paid ? 'Payment received' : rejected ? 'Not verified' : reviewable ? 'Awaiting your review' : 'Review closed'}</span>
      </div>
      <div className="space-y-4 p-4">
        <dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-stone-50 p-3"><dt className="text-[10px] font-medium text-stone-500">Expected in your GCash</dt><dd className="mt-1 text-xl font-black tabular-nums text-stone-900">{amount}</dd></div><div className="rounded-xl border border-stone-100 p-3"><dt className="text-[10px] font-medium text-stone-500">Buyer’s transaction reference</dt><dd className="mt-1 flex items-center justify-between gap-2"><span className="break-all font-mono font-semibold text-stone-800">{order.payment_reference || 'No reference submitted'}</span>{order.payment_reference && <button type="button" onClick={onCopy} aria-label="Copy GCash reference" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"><Copy className="h-3.5 w-3.5" /></button>}</dd></div></dl>
        {(order.checkout_orders_count ?? 0) > 1 && <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11px] leading-relaxed text-blue-800">This checkout contains {order.checkout_orders_count} orders. Check only your shop’s {amount} payment; each shop verifies its own transfer.</p>}
        {order.payment_proof_url ? <button type="button" onClick={onViewProof} aria-label="Enlarge GCash receipt" className="group block w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-50"><img src={order.payment_proof_url} alt="Buyer-submitted GCash receipt" className="mx-auto max-h-60 w-full object-contain" /><span className="flex items-center justify-center gap-1.5 border-t border-stone-100 bg-white py-2 text-[11px] font-medium text-blue-700"><ExternalLink className="h-3 w-3" /> View receipt</span></button> : <p className="rounded-xl bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-500">No receipt was attached. Check your actual GCash transaction history before taking action.</p>}
        {paid && <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" /><p>Recorded as received{order.payment_verified_at ? ` on ${new Date(order.payment_verified_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })} · Manila time` : ''}. This confirmation does not charge the buyer again.</p></div>}
        {rejected && order.rejection_reason && <p className="rounded-xl border border-red-100 bg-red-50 p-3 leading-relaxed text-red-800">Review note: {order.rejection_reason}</p>}
        {reviewable && <div className="space-y-3 border-t border-stone-100 pt-4">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-stone-500"><ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />Compare the amount and reference with your GCash transaction history. A submitted screenshot alone does not confirm that funds arrived.</p>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 p-3 text-[11px] leading-relaxed text-stone-700"><input type="checkbox" checked={checked} disabled={busy} onChange={e => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-red" />I checked my GCash account and received this order’s full amount.</label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !checked} onClick={onConfirm} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 py-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />{busy ? 'Saving…' : 'Confirm payment received'}</button><button type="button" disabled={busy} onClick={onReject} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"><XCircle className="h-4 w-4" />Not received</button></div>
          <p className="text-[10px] leading-relaxed text-stone-400">Confirmation records the payment as received and accepts this order for packing. Loved-IT does not transfer money or charge the buyer through this button.</p>
        </div>}
      </div>
    </section>
  );
}
