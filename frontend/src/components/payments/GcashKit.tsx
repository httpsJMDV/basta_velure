// The GCash pieces every money screen shares: who to pay (with copy and QR), the 13-digit reference field, the
// dialog that records a payment, and the form where a rider, hub or courier sets the GCash it is paid on.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, QrCode, X, AlertCircle, Loader2 } from 'lucide-react';
import gcashLogo from '../../assets/brand/gcash-logo.svg';
import type { GcashAccount, PayoutAccount } from '../../types';

export function peso(n: number): string {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 1234567890123 → "1234 567 890123", the grouping GCash receipts use. */
export function formatReference(digits: string): string {
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 13)].filter(Boolean).join(' ');
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(text.replace(/\s/g, '')).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className="h-8 px-3 rounded-full bg-white border border-[#007DFE]/30 text-[12px] font-semibold text-[#0064CC] inline-flex items-center gap-1 shrink-0"
    >
      {done ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> {label}</>}
    </button>
  );
}

/** Who to send money to: name, number (copy) and QR if there is one, with the amount. */
export function GcashPayee({ account, amount, caption = 'Send to' }: { account: GcashAccount; amount?: number; caption?: string }) {
  const [showQr, setShowQr] = useState(false);
  return (
    <div className="rounded-2xl bg-[#007DFE]/[0.06] border border-[#007DFE]/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <img src={gcashLogo} alt="GCash" className="h-5 w-auto" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0064CC]">{caption}</p>
          <p className="text-[14px] font-semibold text-stone-900 truncate">{account.name || 'GCash account'}</p>
          <p className="font-mono text-[18px] font-bold tracking-wide text-stone-900">{account.number}</p>
        </div>
        <div className="text-right">
          {amount !== undefined && (
            <>
              <p className="text-[11px] text-stone-500">Amount</p>
              <p className="text-[20px] font-bold text-brand-red tabular-nums">{peso(amount)}</p>
            </>
          )}
          <div className="mt-1 flex flex-wrap justify-end gap-1.5">
            <CopyButton text={account.number} label="Copy number" />
            {account.qr_url && (
              <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}
                className="h-8 px-3 rounded-full bg-white border border-[#007DFE]/30 text-[12px] font-semibold text-[#0064CC] inline-flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5" /> {showQr ? 'Hide QR' : 'Show QR'}
              </button>
            )}
          </div>
        </div>
      </div>
      {showQr && account.qr_url && (
        <div className="mt-3 flex justify-center rounded-xl bg-white p-3">
          <img src={account.qr_url} alt={`GCash QR of ${account.name ?? 'the account'}`} className="w-48 h-48 object-contain" />
        </div>
      )}
    </div>
  );
}

/** The 13-digit GCash reference, typed as digits and shown grouped, with a 0/13 counter. */
export function ReferenceField({ id, value, onChange, error, label = 'GCash reference number', hint }: {
  id: string; value: string; onChange: (digits: string) => void; error?: string; label?: string; hint?: string;
}) {
  const done = value.length === 13;
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium text-stone-600 mb-1.5">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatReference(value)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 13))}
          placeholder="0000 000 000000"
          aria-invalid={Boolean(error)}
          className={`w-full h-11 pl-3.5 pr-20 text-[14px] font-mono tracking-wider bg-white border rounded-xl outline-none transition-colors ${error ? 'border-brand-red ring-2 ring-brand-red/10' : 'border-stone-300 focus:border-brand-red focus:ring-2 focus:ring-brand-red/10'}`}
        />
        <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] tabular-nums ${done ? 'text-emerald-600 font-semibold' : 'text-stone-400'}`}>
          {done ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> 13/13</span> : `${value.length}/13`}
        </span>
      </div>
      {error
        ? <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-brand-red"><AlertCircle className="w-3.5 h-3.5" />{error}</p>
        : <p className="mt-1 text-[12px] text-stone-400">{hint ?? 'The 13-digit "Ref. No." on the GCash receipt.'}</p>}
    </div>
  );
}

/**
 * "I sent this": the payee, the amount and the reference of the transfer. The caller records it; a server error
 * comes back through `error`.
 */
export function RecordPaymentDialog({ title, intro, payee, amount, missingPayee, confirmLabel = 'Record payment', onConfirm, onClose }: {
  title: string;
  intro: ReactNode;
  payee: GcashAccount | null;
  amount: number;
  missingPayee?: string;
  confirmLabel?: string;
  onConfirm: (reference: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async () => {
    if (reference.length !== 13) { setError('Enter the 13-digit reference number of your GCash transfer.'); return; }
    setBusy(true);
    setError('');
    try {
      await onConfirm(reference);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      setError(Object.values(data?.errors ?? {})[0]?.[0] ?? data?.message ?? 'That did not go through. Try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-stone-950/45" onClick={() => !busy && onClose()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 className="text-[16px] font-semibold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="w-9 h-9 -mt-1 -mr-1 rounded-full text-stone-500 hover:bg-stone-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="text-[13.5px] leading-relaxed text-stone-600">{intro}</div>
          {payee ? <GcashPayee account={payee} amount={amount} /> : (
            <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-900">{missingPayee ?? 'They have not set up a GCash account yet. Ask them for it before you send money.'}</p>
          )}
          <ReferenceField id="record-ref" value={reference} onChange={(v) => { setReference(v); setError(''); }} error={error} label="Reference of your transfer" hint="Send the money in GCash first, then type the 13-digit reference from your receipt." />
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 h-11 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-700 hover:border-stone-900">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !payee} className="flex-1 h-11 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Where a rider, hub or courier company is paid: GCash number and the name on the account. */
export function PayoutAccountForm({ load, save, who, tone = 'stone', intro }: {
  load: () => Promise<PayoutAccount>;
  save: (payload: { gcash_number: string | null; gcash_name: string | null }) => Promise<PayoutAccount>;
  who: string;
  tone?: 'stone' | 'gray';
  intro?: string;
}) {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then((a) => { if (!alive) return; setAccount(a); setNumber(a.gcash_number ?? ''); setName(a.gcash_name ?? ''); setEditing(!a.gcash_number); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const saved = await save({ gcash_number: number.trim() || null, gcash_name: name.trim() || null });
      setAccount(saved);
      setNumber(saved.gcash_number ?? '');
      setName(saved.gcash_name ?? '');
      setEditing(!saved.gcash_number);
    } catch (err) {
      const errs = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors ?? {};
      setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]])));
    } finally {
      setBusy(false);
    }
  };

  const border = tone === 'gray' ? 'border-gray-200' : 'border-stone-200';
  const input = `w-full h-11 px-3.5 text-[14px] bg-white border rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 ${border}`;

  if (failed) return <p className="text-[13px] text-red-700">The GCash details could not be loaded.</p>;
  if (!account) return <div className="h-24 rounded-2xl bg-stone-100 animate-pulse" />;

  if (!editing && account.gcash_number) {
    return (
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border ${border} bg-white p-4`}>
        <img src={gcashLogo} alt="GCash" className="h-5 w-auto" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-stone-900 truncate">{account.gcash_name}</p>
          <p className="font-mono text-[14px] text-stone-700">{account.gcash_number}</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="h-9 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900">Change</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`rounded-2xl border ${border} bg-white p-4 space-y-3`} noValidate>
      <p className="text-[13px] text-stone-600">{intro ?? `Where ${who} pays you. Use the GCash account under your own name.`}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`gcash-number-${who}`} className="block text-[12px] font-medium text-stone-600 mb-1.5">GCash number</label>
          <input id={`gcash-number-${who}`} inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0917 123 4567" className={input} />
          {errors.gcash_number && <p className="mt-1 text-[12px] text-brand-red">{errors.gcash_number}</p>}
        </div>
        <div>
          <label htmlFor={`gcash-name-${who}`} className="block text-[12px] font-medium text-stone-600 mb-1.5">Name on the account</label>
          <input id={`gcash-name-${who}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="As GCash shows it" className={input} />
          {errors.gcash_name && <p className="mt-1 text-[12px] text-brand-red">{errors.gcash_name}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-10 px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save GCash'}</button>
        {account.gcash_number && <button type="button" onClick={() => { setEditing(false); setNumber(account.gcash_number ?? ''); setName(account.gcash_name ?? ''); setErrors({}); }} className="h-10 px-4 rounded-full text-[13px] font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>}
      </div>
    </form>
  );
}
