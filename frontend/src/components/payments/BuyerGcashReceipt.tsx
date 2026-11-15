import { useState } from 'react';
import { http } from '../../api/client';
import type { Order } from '../../types';

export default function BuyerGcashReceipt({ order, onDone }: { order: Order; onDone: () => void }) {
  const [reference, setReference] = useState(order.payment_reference ?? '');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!order.collection_payee || order.payment_status !== 'verification_failed') return null;
  return <form onSubmit={async e => {
    e.preventDefault(); if (!receipt) return; setBusy(true); setError('');
    try { const form = new FormData(); form.append('reference', reference); form.append('receipt', receipt); await http.post(`/buyer/orders/${order.id}/gcash-receipt`, form); onDone(); }
    catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Receipt could not be updated.'); } finally { setBusy(false); }
  }} className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
    <h3 className="text-sm font-semibold text-blue-950">Correct your payment receipt</h3><p className="text-xs text-blue-900">Update the original transfer’s reference and screenshot. This updates every order in the same payment. Contact Loved-IT before sending more money.</p>
    <input aria-label="GCash transfer reference" required inputMode="numeric" pattern="[0-9]{13}" maxLength={13} value={reference} onChange={e => setReference(e.target.value.replace(/\D/g, ''))} className="w-full rounded-xl border bg-white p-3 text-sm" />
    <input aria-label="Corrected GCash receipt" required type="file" accept="image/jpeg,image/png" onChange={e => setReceipt(e.target.files?.[0] ?? null)} className="w-full text-xs" />
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}<button disabled={busy} className="rounded-xl bg-brand-red px-4 py-2 text-xs font-semibold text-white">Submit corrected receipt</button>
  </form>;
}
