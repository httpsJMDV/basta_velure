import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, Check, Clock, MapPin, Package, Power, RefreshCw, Store, Undo2, Wallet, X } from 'lucide-react';
import {
  acceptRiderOfferApi, declineRiderOfferApi, getRiderCodApi, getRiderOffersApi, getRiderReturnsApi, getRiderStatusApi,
  markRiderReturnedApi, remitRiderCodApi, setRiderAvailabilityApi,
  type RiderCod, type RiderOffer, type RiderReturnJob, type RiderWorkState,
} from '../../api/riderJobs';
import { apiErrorMessage } from '../../utils/apiError';
import { useToast } from '../ui/Toast';
import { SectionCard } from '../../pages/rider/RiderUi';
import { BTN_PRIMARY, BTN_SECONDARY } from '../../pages/rider/riderStyles';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import { compact, firstErrors, paymentReferenceError, squish } from '../../utils/accountRules';

const peso = (v: string | number) => `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Online / Offline (R3) ───────────────────────────────────────────────────

/**
 * The switch that decides whether new jobs come to the rider. Going Offline keeps the jobs already accepted; an open
 * offer moves on to the next rider. Shows how many of the 3 job slots are in use.
 */
export function AvailabilityToggle({ onChange }: { onChange?: (s: RiderWorkState) => void }) {
  const { showToast } = useToast();
  const [state, setState] = useState<RiderWorkState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { getRiderStatusApi().then((s) => { setState(s); onChange?.(s); }).catch(() => {}); }, [onChange]);
  useEffect(() => { load(); }, [load]);
  // A suspension or re-verification is pushed over Reverb; the poll is the fallback.
  useLiveRefresh(load, 30_000, busy);

  const toggle = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const res = await setRiderAvailabilityApi(!state.online);
      setState(res.data);
      onChange?.(res.data);
      showToast(res.message, 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'Could not change your status. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const online = state?.online ?? false;

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xs ${online ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-gray-200/80'}`}>
      <span className={`relative flex w-3 h-3 shrink-0`} aria-hidden="true">
        {online && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
        <span className={`relative inline-flex w-3 h-3 rounded-full ${online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900">{state ? (online ? 'You are Online' : 'You are Offline') : 'Checking your status…'}</p>
        <p className="text-[11px] text-gray-500">
          {state ? `${state.active_jobs} of ${state.max_active_jobs} job slots in use · ${online ? 'new offers come to you' : 'no new offers'}` : ' '}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        aria-label={online ? 'Go Offline' : 'Go Online'}
        onClick={() => void toggle()}
        disabled={!state || busy}
        className={`relative inline-flex items-center h-8 w-14 rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50 ${online ? 'bg-emerald-500' : 'bg-gray-300'}`}
      >
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-white shadow transition-transform ${online ? 'translate-x-7' : 'translate-x-1'}`}>
          {busy ? <RefreshCw className="w-3 h-3 animate-spin text-gray-500" /> : <Power className={`w-3 h-3 ${online ? 'text-emerald-600' : 'text-gray-400'}`} />}
        </span>
      </button>
    </div>
  );
}

// ─── Offers (R4) ─────────────────────────────────────────────────────────────

/** A ring that empties over the offer's 60 seconds. */
function Countdown({ expiresAt, total = 60 }: { expiresAt: string; total?: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))), 250);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  const r = 18;
  const c = 2 * Math.PI * r;
  const urgent = left <= 10;

  return (
    <div className="relative w-12 h-12 shrink-0" role="timer" aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-gray-100" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} className={`fill-none transition-[stroke-dashoffset] duration-200 ${urgent ? 'stroke-brand-red' : 'stroke-emerald-500'}`}
          strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / total)} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums ${urgent ? 'text-brand-red' : 'text-gray-900'}`}>{left}</span>
    </div>
  );
}

/**
 * Pickup jobs offered to this rider, each open for 60 seconds. Accept or decline; when the time runs out the job goes
 * to the next rider. Checked every few seconds while the rider is Online.
 */
export function JobOffers({ onAccepted }: { onAccepted?: () => void }) {
  const { showToast } = useToast();
  const [offers, setOffers] = useState<RiderOffer[]>([]);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    getRiderOffersApi().then((res) => { setOffers(res.data); setOnline(res.meta.online); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  // A new offer is pushed over Reverb the moment it is made; the short poll covers a dropped connection.
  useLiveRefresh(load, 5_000);

  // Drop an offer the moment its time is up.
  useEffect(() => {
    if (offers.length === 0) return;
    const t = window.setInterval(() => setOffers((list) => list.filter((o) => new Date(o.expires_at).getTime() > Date.now())), 1000);
    return () => window.clearInterval(t);
  }, [offers.length]);

  const respond = async (offer: RiderOffer, accept: boolean) => {
    setBusy(offer.id);
    try {
      const res = accept ? await acceptRiderOfferApi(offer.id) : await declineRiderOfferApi(offer.id);
      showToast(res.message, 'success');
      setOffers((list) => list.filter((o) => o.id !== offer.id));
      if (accept) onAccepted?.();
    } catch (e) {
      showToast(apiErrorMessage(e, 'That did not go through.'), 'error');
      load();
    } finally {
      setBusy(null);
    }
  };

  if (offers.length === 0) {
    return online ? (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-3 text-xs text-gray-500">
        <Clock className="w-4 h-4 text-gray-400" aria-hidden="true" /> Waiting for job offers. The nearest Online rider gets each new pickup first.
      </p>
    ) : null;
  }

  return (
    <div className="space-y-3" aria-live="polite">
      {offers.map((o) => (
        <article key={o.id} className="bg-white rounded-2xl border-2 border-brand-red/30 shadow-md p-4 space-y-3">
          <header className="flex items-start gap-3">
            <Countdown expiresAt={o.expires_at} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-brand-red">New pickup job</p>
              <p className="text-base font-black text-gray-900 truncate">{o.pickup.shop_name}</p>
              <p className="text-[11px] font-mono text-gray-500">{o.tracking_number}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-bold uppercase text-gray-400">You earn</p>
              <p className="text-lg font-black text-emerald-700 tabular-nums">{peso(o.pay)}</p>
            </div>
          </header>
          <dl className="grid gap-2 text-xs">
            <div className="flex items-start gap-2">
              <Store className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div><dt className="sr-only">Pickup</dt><dd className="text-gray-800"><b>Pickup:</b> {o.pickup.address}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div><dt className="sr-only">Drop-off area</dt><dd className="text-gray-800"><b>Drop-off area:</b> {o.dropoff_area || '—'}</dd></div>
            </div>
            <div className="flex items-start gap-2">
              <Banknote className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div><dt className="sr-only">Payment</dt><dd className="text-gray-800">
                {o.cod_amount !== null ? <><b>COD:</b> collect {peso(o.cod_amount)} on delivery</> : 'Prepaid: nothing to collect'}
                {o.weight_kg ? <span className="text-gray-500"> · {o.weight_kg} kg</span> : null}
              </dd></div>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => void respond(o, false)}>
              <X className="w-4 h-4" aria-hidden="true" /> Decline
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => void respond(o, true)}>
              {busy === o.id ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />} Accept
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

// ─── Return to sender (R7) ───────────────────────────────────────────────────

/** Parcels this rider is taking back to the seller after a failed delivery. Hidden when there are none. */
export function ReturnJobs() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<RiderReturnJob[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // A failed refresh keeps the list: a blip must not hide a parcel the rider is carrying back.
  const load = useCallback(() => { getRiderReturnsApi().then(setJobs).catch(() => setJobs((prev) => prev ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  // Live: a return the hub hands this rider appears on its own.
  useLiveRefresh(load, 30_000, busy !== null);

  if (!jobs || jobs.length === 0) return null;

  const done = async (job: RiderReturnJob) => {
    setBusy(job.tracking_number);
    try {
      const res = await markRiderReturnedApi(job.tracking_number);
      showToast(res.message, 'success');
      load();
    } catch (e) {
      showToast(apiErrorMessage(e, 'Could not record the return.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard title="Return to sender" subtitle="Take these back to the shop. The shop confirms it received them." id="rider-returns">
      <ul className="space-y-3">
        {jobs.map((j) => (
          <li key={j.tracking_number} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Undo2 className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-900 truncate">{j.seller.shop_name ?? 'Shop'}</p>
                <p className="text-xs text-gray-700">{j.seller.full_address}</p>
                <p className="text-[11px] font-mono text-gray-500">{j.tracking_number}</p>
              </div>
            </div>
            <ol className="text-[11px] text-amber-900 space-y-0.5 pl-6 list-decimal">
              {j.failures.map((f) => <li key={f.attempt}>{f.reason}{f.note ? `: ${f.note}` : ''}</li>)}
            </ol>
            <button type="button" className={`${BTN_PRIMARY} w-full`} disabled={busy !== null} onClick={() => void done(j)}>
              {busy === j.tracking_number ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Package className="w-4 h-4" aria-hidden="true" />}
              Handed back to the shop
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ─── Cash on delivery (R9) ───────────────────────────────────────────────────

/**
 * The cash the rider holds for their company: the balance, the orders behind it, and a remittance form. A remittance
 * stays Pending, and the balance does not change, until the company confirms it.
 */
export function CodRemittanceCard() {
  const { showToast } = useToast();
  const [cod, setCod] = useState<RiderCod | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; reference?: string; form?: string }>({});
  // One key per remittance, so a double tap or a retry never sends it twice.
  const key = useRef<string | null>(null);

  const load = useCallback(() => { getRiderCodApi().then(setCod).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  // Live: the company confirming a remittance (or a new COD delivery) updates the balance on its own.
  useLiveRefresh(load, 30_000, busy);

  if (!cod) return <div className="h-40 bg-white border border-gray-200/80 rounded-2xl animate-pulse" aria-label="Loading cash on delivery" />;

  const pending = cod.remittances.find((r) => r.status === 'pending');
  const canRemit = Number(cod.balance.can_remit);

  const submit = async () => {
    const v = amount.trim();
    const local = compact({
      amount: !/^\d+(\.\d{1,2})?$/.test(v) || Number(v) <= 0
        ? 'Enter the amount you are handing over, like 1800 or 1800.00.'
        : Number(v) > canRemit ? `You can remit at most ${peso(canRemit)}.` : undefined,
      reference: paymentReferenceError(reference),
    });
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      key.current ??= `rem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const res = await remitRiderCodApi(v, squish(reference), key.current);
      showToast(res.message, 'success');
      key.current = null;
      setAmount('');
      setReference('');
      load();
    } catch (e) {
      const fields = firstErrors((e as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors);
      setErrors(fields.amount || fields.reference ? fields : { form: apiErrorMessage(e, 'The remittance was not sent.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Cash on delivery" subtitle="What you collected and still have to hand to your company" id="rider-cod">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['To remit', cod.balance.outstanding, 'text-gray-900'],
          ['Pending', cod.balance.pending, 'text-amber-700'],
          ['Confirmed', cod.balance.confirmed, 'text-emerald-700'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-base font-black tabular-nums ${color}`}>{peso(value)}</p>
          </div>
        ))}
      </div>

      {pending ? (
        <p className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {peso(pending.amount)} ({pending.reference}) is waiting for your company to confirm. Your balance changes once they do.
        </p>
      ) : canRemit > 0 ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block">
              <span className="sr-only">Amount to remit</span>
              <span className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">₱</span>
                <input inputMode="decimal" value={amount}
                  onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setErrors(({ amount: _drop, ...rest }) => rest); }}
                  placeholder={Number(cod.balance.can_remit).toFixed(2)} aria-invalid={errors.amount ? true : undefined}
                  className={`w-full min-h-11 pl-7 pr-3 rounded-xl border text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-red/40 ${errors.amount ? 'border-red-500' : 'border-gray-300'}`} />
              </span>
            </label>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>
              {busy ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Wallet className="w-4 h-4" aria-hidden="true" />} Remit
            </button>
          </div>
          {errors.amount && <p role="alert" className="text-xs font-semibold text-red-700">{errors.amount}</p>}
          <label className="block">
            <span className="sr-only">GCash or deposit reference (optional)</span>
            <input value={reference} maxLength={40} placeholder="GCash or deposit reference (optional)" autoComplete="off"
              onChange={(e) => { setReference(e.target.value); setErrors(({ reference: _drop, ...rest }) => rest); }}
              aria-invalid={errors.reference ? true : undefined}
              className={`w-full min-h-10 px-3 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-brand-red/40 ${errors.reference ? 'border-red-500' : 'border-gray-200'}`} />
          </label>
          {errors.reference && <p role="alert" className="text-xs font-semibold text-red-700">{errors.reference}</p>}
          {errors.form && <p role="alert" className="text-xs font-semibold text-red-700">{errors.form}</p>}
        </form>
      ) : (
        <p className="text-xs text-gray-500">Nothing to remit right now.</p>
      )}

      {cod.collections.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-gray-700">Orders behind the balance ({cod.collections.length})</summary>
          <ul className="mt-2 divide-y divide-gray-100 text-xs">
            {cod.collections.map((c) => (
              <li key={c.tracking_number} className="flex items-center justify-between py-1.5">
                <span className="font-mono text-gray-600">{c.order_number ?? c.tracking_number}</span>
                <span className="font-bold tabular-nums text-gray-900">{peso(c.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {cod.remittances.length > 0 && (
        <ul className="divide-y divide-gray-100 text-xs">
          {cod.remittances.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-gray-600">{r.reference} · {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}</span>
              <span className="flex items-center gap-2">
                {Number(r.shortfall) > 0 && <span className="text-[10px] font-bold text-red-700">short {peso(r.shortfall)}</span>}
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${r.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{r.status === 'confirmed' ? 'Confirmed' : 'Pending'}</span>
                <span className="font-bold tabular-nums text-gray-900">{peso(r.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
