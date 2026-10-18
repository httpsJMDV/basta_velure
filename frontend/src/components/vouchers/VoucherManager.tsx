import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Ticket, Lock, Square, AlertTriangle } from 'lucide-react';
import { SidePanel, Dialog, BUTTON } from '../ui/Overlay';
import CustomSelect from '../ui/CustomSelect';
import { useToast } from '../ui/Toast';
import { createVoucherApi, endVoucherApi, getManagedVouchersApi, updateVoucherApi } from '../../api/commerce';
import type { ManagedVoucher } from '../../api/commerce';
import { getSellerProductsApi } from '../../api/client';
import type { SellerProduct } from '../../types';
import { apiProblem } from '../../utils/apiError';
import { pesoCompact as peso } from '../../utils/pricing';

const TZ = 'Asia/Manila';
function toInput(d: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(typeof d === 'string' ? new Date(d) : d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const STATUS_STYLE: Record<string, string> = {
  upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
  ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  ended: 'bg-gray-50 text-gray-500 border-gray-200',
};

/**
 * Vouchers for their owner (S9, and Loved-IT's platform and shipping vouchers). Codes are 4 to 12 letters and
 * digits in uppercase, unique on Loved-IT (A26). Once a buyer has claimed a voucher only its end date (later) and
 * total usage (higher) can change (A27). Ending one takes it out of every wallet; placed orders keep their discount.
 */
export default function VoucherManager({ admin = false }: { admin?: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ManagedVoucher[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ManagedVoucher | 'new' | null>(null);
  const [ending, setEnding] = useState<ManagedVoucher | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [products, setProducts] = useState<SellerProduct[]>([]);

  const load = () => {
    getManagedVouchersApi(admin).then(setRows).catch((e) => setError(apiProblem(e, 'Vouchers could not be loaded.').message));
  };
  useEffect(load, [admin]);
  useEffect(() => { if (!admin) getSellerProductsApi().then(setProducts).catch(() => undefined); }, [admin]);

  const end = async () => {
    if (!ending) return;
    setEndBusy(true);
    try {
      const res = await endVoucherApi(ending.id, admin);
      showToast(res.message, 'success');
      setEnding(null);
      load();
    } catch (e) { showToast(apiProblem(e, 'The voucher could not be ended.').message, 'error'); }
    finally { setEndBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-gray-500 max-w-2xl">
          {admin
            ? 'Platform vouchers take money off the whole order and shipping vouchers off the shipping. Loved-IT pays for both; they never reduce a shop\'s earnings.'
            : 'Store vouchers are paid by your shop and come off your earnings before the 5% commission. Claimable vouchers show on your shop and product pages; code-only vouchers work when a buyer types the code.'}
        </p>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark">
          <Plus className="w-4 h-4" /> New voucher
        </button>
      </div>

      {error && <p role="alert" className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-100 bg-red-50 text-[13px] text-red-700"><AlertTriangle className="w-4 h-4" />{error}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {rows === null ? (
          <div className="p-5 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-14 px-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center"><Ticket className="w-6 h-6 text-gray-300" /></div>
            <p className="text-[14px] font-bold text-gray-800">No vouchers yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <th className="text-left px-4 py-3">Voucher</th>
                  <th className="text-left px-4 py-3">Rule</th>
                  <th className="text-left px-4 py-3">Valid</th>
                  <th className="text-center px-4 py-3">Used</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-gray-900">{v.code}</p>
                      <p className="text-[11.5px] text-gray-500">{v.name}{v.claimable ? ' · claimable' : ' · code only'}{v.scope !== 'store' ? ` · ${v.scope}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <p className="font-semibold">{v.label}</p>
                      <p className="text-[11.5px] text-gray-500">Min. spend {peso(v.min_spend)}{v.applies_to === 'products' ? ` · ${v.product_ids.length} product(s)` : ''} · {v.per_buyer_limit} per buyer</p>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-600">{when(v.starts_at)}<br />to {when(v.ends_at)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-800">{v.used_count}{v.total_limit ? ` of ${v.total_limit}` : ''}<p className="text-[10.5px] text-gray-400">{v.claimed_count} claimed</p></td>
                    <td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_STYLE[v.status]}`}>{v.status === 'ongoing' ? 'Ongoing' : v.status === 'upcoming' ? 'Upcoming' : 'Ended'}</span></td>
                    <td className="px-4 py-3">
                      {v.status !== 'ended' && (
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setEditing(v)} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1">
                            {v.locked && <Lock className="w-3 h-3" />} Edit
                          </button>
                          <button type="button" onClick={() => setEnding(v)} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-gray-600 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1"><Square className="w-3 h-3" /> End</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <VoucherForm admin={admin} editing={editing === 'new' ? null : editing} products={products} onClose={() => setEditing(null)}
          onSaved={(m) => { showToast(m, 'success'); setEditing(null); load(); }} />
      )}

      <Dialog open={!!ending} onClose={() => !endBusy && setEnding(null)} title={`End ${ending?.code ?? ''} now?`}
        footer={<>
          <button type="button" className={BUTTON.ghost} disabled={endBusy} onClick={() => setEnding(null)}>Keep it</button>
          <button type="button" className={BUTTON.danger} disabled={endBusy} onClick={end}>{endBusy ? 'Ending…' : 'End voucher'}</button>
        </>}>
        <p className="text-[13.5px] text-stone-600">It disappears from every buyer's wallet and can no longer be used. Orders already placed with it keep their discount.</p>
      </Dialog>
    </div>
  );
}

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-stone-800">{label}</label>
      {children}
      {error ? <p role="alert" className="text-[11.5px] font-medium text-red-600">{error}</p> : hint ? <p className="text-[11.5px] text-stone-500">{hint}</p> : null}
    </div>
  );
}
const input = (error?: string, disabled?: boolean) => [
  'w-full px-3.5 py-2.5 text-[13.5px] border rounded-xl outline-none bg-white focus:ring-2 focus:ring-red-100',
  error ? 'border-red-400' : 'border-stone-300 focus:border-brand-red',
  disabled ? 'bg-stone-50 text-stone-500' : '',
].join(' ');

function VoucherForm({ admin, editing, products, onClose, onSaved }: {
  admin: boolean; editing: ManagedVoucher | null; products: SellerProduct[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const locked = !!editing?.locked;
  const [scope, setScope] = useState<'platform' | 'shipping'>(editing?.scope === 'shipping' ? 'shipping' : 'platform');
  const [code, setCode] = useState(editing?.code ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<'fixed' | 'percent'>(editing?.discount_type ?? 'fixed');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [cap, setCap] = useState(editing?.max_discount != null ? String(editing.max_discount) : '');
  const [minSpend, setMinSpend] = useState(editing ? String(editing.min_spend) : '');
  const [total, setTotal] = useState(editing?.total_limit != null ? String(editing.total_limit) : '');
  const [perBuyer, setPerBuyer] = useState(editing ? String(editing.per_buyer_limit) : '1');
  const [claimable, setClaimable] = useState(editing?.claimable ?? true);
  const [appliesTo, setAppliesTo] = useState<'all' | 'products'>(editing?.applies_to ?? 'all');
  const [picked, setPicked] = useState<number[]>(editing?.product_ids ?? []);
  const [start, setStart] = useState(() => (editing ? toInput(editing.starts_at) : toInput(new Date(Date.now() + 5 * 60000))));
  const [end, setEnd] = useState(() => (editing ? toInput(editing.ends_at) : toInput(new Date(Date.now() + 30 * 86400000))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useMemo(() => products.filter((p) => p.status === 'active' || p.status === 'draft'), [products]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!locked) {
      const c = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(c)) e.code = 'The code must be 4 to 12 letters and digits, with no spaces or symbols.';
      if (name.trim().length < 3) e.name = 'Give the voucher a name of at least 3 characters.';
      const a = Number(amount);
      if (!amount || !Number.isFinite(a) || a <= 0) e.amount = 'The discount must be more than ₱0.';
      else if (type === 'percent' && (!Number.isInteger(a) || a < 1 || a > 99)) e.amount = 'The percentage must be a whole number from 1% to 99%.';
      else if (type === 'fixed' && scope !== 'shipping' && a > Number(minSpend || 0)) e.amount = 'The discount cannot be more than the minimum spend.';
      if (type === 'percent' && cap !== '' && !(Number(cap) > 0)) e.max_discount = 'The cap must be more than ₱0.';
      if (total !== '' && (!/^\d+$/.test(total) || Number(total) < 1)) e.total_limit = 'The total usage limit must be at least 1.';
      if (!/^\d+$/.test(perBuyer) || Number(perBuyer) < 1) e.per_buyer_limit = 'The per-buyer limit must be at least 1.';
      else if (total !== '' && Number(perBuyer) > Number(total)) e.per_buyer_limit = 'The per-buyer limit cannot be more than the total usage limit.';
      if (!admin && appliesTo === 'products' && picked.length === 0) e.product_ids = 'Choose at least one product.';
    }
    if (new Date(`${end}:00+08:00`) <= new Date(`${start}:00+08:00`)) e.ends_at = 'The end must be after the start.';
    setErrors(e);
    setSummary('');
    if (Object.keys(e).length) return;

    const payload: Record<string, unknown> = locked
      ? { ends_at: end, total_limit: total === '' ? null : Number(total) }
      : {
          code: code.trim().toUpperCase(), name: name.trim(), discount_type: type, amount: Number(amount),
          max_discount: type === 'percent' && cap !== '' ? Number(cap) : null, min_spend: minSpend === '' ? 0 : Number(minSpend),
          total_limit: total === '' ? null : Number(total), per_buyer_limit: Number(perBuyer), claimable,
          applies_to: admin ? 'all' : appliesTo, product_ids: !admin && appliesTo === 'products' ? picked : [],
          starts_at: start, ends_at: end, ...(admin ? { scope } : {}),
        };
    setBusy(true);
    try {
      const res = editing ? await updateVoucherApi(editing.id, payload, admin) : await createVoucherApi(payload, admin);
      onSaved(res.message);
    } catch (err) {
      const p = apiProblem(err, 'The voucher could not be saved.');
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.fields)) f[k.startsWith('product_ids') ? 'product_ids' : k] = v;
      setErrors(f);
      setSummary(Object.keys(f).length ? '' : p.message);
    } finally { setBusy(false); }
  };

  return (
    <SidePanel open onClose={onClose} title={editing ? `Edit ${editing.code}` : 'New voucher'}
      subtitle={locked ? 'Buyers have claimed this voucher, so only the end date (later) and the usage limit (higher) can change.' : undefined}
      footer={<div className="flex justify-end gap-2">
        <button type="button" className={BUTTON.ghost} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BUTTON.primary} onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save voucher'}</button>
      </div>}>
      {summary && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{summary}</p>}
      <div className="space-y-4">
        {admin && (
          <Field label="Kind" error={errors.scope}>
            <div className="grid grid-cols-2 gap-2">
              {(['platform', 'shipping'] as const).map((s) => (
                <button key={s} type="button" disabled={!!editing} onClick={() => setScope(s)} aria-pressed={scope === s}
                  className={`px-3 py-2.5 rounded-xl border text-[13px] font-semibold disabled:opacity-60 ${scope === s ? 'border-brand-red bg-red-50 text-brand-red' : 'border-stone-300 text-stone-700'}`}>
                  {s === 'platform' ? 'Platform (whole order)' : 'Shipping'}
                </button>
              ))}
            </div>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" htmlFor="v-code" error={errors.code} hint="4 to 12 letters and digits">
            <input id="v-code" value={code} disabled={!!editing} onChange={(e) => setCode(e.target.value)} className={input(errors.code, !!editing) + ' font-mono uppercase'} placeholder="e.g. MCH50" />
          </Field>
          <Field label="Name" htmlFor="v-name" error={errors.name}>
            <input id="v-name" value={name} disabled={locked} onChange={(e) => setName(e.target.value)} className={input(errors.name, locked)} placeholder="e.g. Fifty off" />
          </Field>
        </div>
        <Field label="Discount" error={errors.amount}>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <CustomSelect value={type} onChange={(v) => setType(v as 'fixed' | 'percent')} disabled={locked}
              options={[{ value: 'fixed', label: scope === 'shipping' ? 'Up to an amount' : 'Fixed amount (₱)' }, { value: 'percent', label: 'Percentage (%)' }]} />
            <input aria-label="Discount amount" inputMode="decimal" value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)} className={input(errors.amount, locked)} placeholder={type === 'percent' ? '10' : '50.00'} />
          </div>
        </Field>
        {type === 'percent' && (
          <Field label="Cap (₱)" htmlFor="v-cap" error={errors.max_discount} hint="Optional. The most the percentage can take off.">
            <input id="v-cap" inputMode="decimal" value={cap} disabled={locked} onChange={(e) => setCap(e.target.value)} className={input(errors.max_discount, locked)} placeholder="100.00" />
          </Field>
        )}
        <Field label="Minimum spend (₱)" htmlFor="v-min" error={errors.min_spend} hint="Counted on the price the buyer pays, after sales.">
          <input id="v-min" inputMode="decimal" value={minSpend} disabled={locked} onChange={(e) => setMinSpend(e.target.value)} className={input(errors.min_spend, locked)} placeholder="300.00" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Total usage" htmlFor="v-total" error={errors.total_limit} hint={locked ? 'Can only go up.' : 'Leave empty for no limit.'}>
            <input id="v-total" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className={input(errors.total_limit)} placeholder="100" />
          </Field>
          <Field label="Per buyer" htmlFor="v-per" error={errors.per_buyer_limit}>
            <input id="v-per" inputMode="numeric" value={perBuyer} disabled={locked} onChange={(e) => setPerBuyer(e.target.value)} className={input(errors.per_buyer_limit, locked)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="v-start" error={errors.starts_at}>
            <input id="v-start" type="datetime-local" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} className={input(errors.starts_at, locked)} />
          </Field>
          <Field label="Ends" htmlFor="v-end" error={errors.ends_at} hint={locked ? 'Can only be extended.' : undefined}>
            <input id="v-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={input(errors.ends_at)} />
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-[13px] text-stone-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-brand-red" checked={claimable} disabled={locked} onChange={(e) => setClaimable(e.target.checked)} />
          <span><span className="font-semibold">Show it for buyers to claim.</span> Unticked, the voucher is code-only: it is never listed and works when a buyer types the code.</span>
        </label>
        {!admin && (
          <Field label="Applies to" error={errors.product_ids}>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'products'] as const).map((a) => (
                <button key={a} type="button" disabled={locked} onClick={() => setAppliesTo(a)} aria-pressed={appliesTo === a}
                  className={`px-3 py-2 rounded-xl border text-[13px] font-semibold disabled:opacity-60 ${appliesTo === a ? 'border-brand-red bg-red-50 text-brand-red' : 'border-stone-300 text-stone-700'}`}>
                  {a === 'all' ? 'All my products' : 'Selected products'}
                </button>
              ))}
            </div>
            {appliesTo === 'products' && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-stone-300 divide-y divide-stone-100">
                {live.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer hover:bg-stone-50">
                    <input type="checkbox" disabled={locked} className="w-4 h-4 accent-brand-red" checked={picked.includes(p.id)}
                      onChange={() => setPicked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        )}
      </div>
    </SidePanel>
  );
}
