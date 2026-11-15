import { useCallback, useEffect, useState } from 'react';
import { http } from '../../api/client';
import { peso } from '../../utils/adminReports';

type Funding = { id: number; amount: string; reference: string; sent_at: string; confirmed_at: string | null };
type Company = { company_id: number; name: string; account: { number: string | null; name: string | null }; due: string; order_ids: number[]; order_count: number; history: Funding[] };
export default function PlatformCourierFunding({ admin = false }: { admin?: boolean }) {
  const base = `/${admin ? 'admin' : 'logistics'}/platform-funding`;
  const [rows, setRows] = useState<Company[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { http.get<{ data: Company[] }>(base).then(r => setRows(r.data.data)).catch(() => setError('Courier funding could not be loaded.')); }, [base]);
  useEffect(load, [load]);
  const send = async () => {
    if (!selected || !receipt) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('amount', selected.due); form.append('reference', reference); form.append('receipt', receipt);
      selected.order_ids.forEach(id => form.append('order_ids[]', String(id)));
      await http.post(`${base}/companies/${selected.company_id}`, form);
      setSelected(null); setReference(''); setReceipt(null); load();
    } catch (e) { setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Transfer could not be recorded.'); }
    finally { setBusy(false); }
  };
  const confirm = async (id: number) => {
    setBusy(true); setError('');
    try { await http.post(`${base}/${id}/confirm`, { received_in_gcash: true }); load(); }
    catch { setError('Receipt confirmation failed. Please try again.'); } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
    <div><h2 className="text-base font-bold text-gray-900">Loved-IT courier funding</h2><p className="mt-1 text-xs text-gray-500">Delivered platform-paid orders only. Loved-IT funds shipping once; the courier pays pickup, delivery, hubs and transport using the agreed shares.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {rows.map(c => <div key={c.company_id} className="rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-sm font-semibold">{c.name}</h3><p className="text-xs text-gray-500">{c.order_count} delivered orders awaiting funding</p></div><strong className="text-xl">{peso(Number(c.due))}</strong></div>
      {admin && Number(c.due) > 0 && <><p className="text-xs text-gray-600">Send to {c.account.name ?? 'Account not configured'} · {c.account.number ?? 'Ask the courier to configure its payout account'}</p><button type="button" disabled={!c.account.number} onClick={() => { setSelected(c); setReference(''); setReceipt(null); }} className="rounded-xl bg-brand-red px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Record manual GCash transfer</button></>}
      <details><summary className="cursor-pointer text-xs font-semibold text-gray-600">Transfer history ({c.history.length})</summary><ul className="mt-3 divide-y text-xs">{c.history.map(f => <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span><strong>{peso(Number(f.amount))}</strong> · {f.reference}<span className="block text-gray-500">{f.confirmed_at ? 'Courier confirmed receipt' : 'Sent · awaiting courier confirmation'}</span></span>{!admin && !f.confirmed_at && <button disabled={busy} onClick={() => void confirm(f.id)} className="rounded-lg border px-3 py-2 font-semibold">I checked GCash and received this</button>}</li>)}</ul></details>
    </div>)}
    {selected && <form onSubmit={e => { e.preventDefault(); void send(); }} className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3"><h3 className="text-sm font-semibold">Record {peso(Number(selected.due))} sent to {selected.name}</h3><p className="text-xs text-blue-900">Send the money in GCash first. Recording here does not transfer funds.</p><input aria-label="Transfer reference" required pattern="[0-9]{13}" maxLength={13} inputMode="numeric" placeholder="13-digit transfer reference" value={reference} onChange={e => setReference(e.target.value.replace(/\D/g, ''))} className="w-full rounded-xl border p-3 text-sm" /><input aria-label="GCash receipt" required type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setReceipt(e.target.files?.[0] ?? null)} className="block text-xs" /><div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-brand-red px-4 py-2 text-xs font-semibold text-white">Record sent transfer</button><button type="button" onClick={() => setSelected(null)} className="px-3 text-xs">Cancel</button></div></form>}
  </section>;
}
