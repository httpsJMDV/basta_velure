import { useState } from 'react';
import { http as api } from '../../api/client';
import type { AdminPaymentListItem } from '../../types';
import { peso } from '../../utils/adminReports';

export default function PlatformGcashReview({ payment, onDone }: { payment: AdminPaymentListItem; onDone: () => void }) {
  const [checked, setChecked] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = payment.collection;
  if (!c) return null;
  const run = async (confirm: boolean) => {
    setBusy(true); setError('');
    try {
      await api.post(`/admin/payments/orders/${payment.id}/${confirm ? 'confirm-gcash' : 'reject-gcash'}`, confirm
        ? { reference: c.reference, received_amount: amount, received_in_gcash: checked }
        : { reference: c.reference, reason });
      onDone();
    } catch (e) { setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Unable to record this review. Refresh and try again.'); }
    finally { setBusy(false); }
  };
  return <section className="m-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
    <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Loved-IT collection</p><h3 className="mt-1 text-2xl font-bold text-gray-900">{peso(Number(c.amount))}</h3><p className="text-xs text-gray-600">One transfer covers {c.order_count} order{c.order_count === 1 ? '' : 's'}. Verify the full amount in {c.payee.name} · {c.payee.number}.</p></div>
    {c.has_cancelled_order && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">This transfer includes a closed order. Recording receipt keeps it closed and opens its refund.</p>}
    {c.can_review && <>
      <label className="block text-xs font-semibold text-gray-700">Amount actually received<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-3 text-sm" /></label>
      <label className="flex items-start gap-2 text-xs text-gray-700"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5 accent-brand-red" />I checked the actual GCash transaction, recipient, reference and full amount. A screenshot alone is not confirmation.</label>
      <button type="button" disabled={busy || !checked || Number(amount) !== Number(c.amount)} onClick={() => void run(true)} className="w-full rounded-xl bg-brand-red p-3 text-sm font-semibold text-white disabled:opacity-40">Confirm Loved-IT received payment</button>
      <details className="text-xs text-gray-600"><summary className="cursor-pointer font-semibold">Payment did not match</summary><textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain what the buyer needs to correct" maxLength={500} className="mt-2 w-full rounded-xl border p-3" /><button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void run(false)} className="mt-2 text-brand-red font-semibold disabled:opacity-40">Record review issue</button></details>
    </>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>;
}
