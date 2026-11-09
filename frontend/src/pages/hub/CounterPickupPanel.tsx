import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, Camera, Loader2, PackageCheck, Phone, X } from 'lucide-react';
import { getHubCounterApi, handOverAtCounterApi, type HubCounterParcel } from '../../api/client';
import { useLivePolling } from '../../hooks/useLivePolling';
import { useToast } from '../../components/ui/Toast';
import { apiProblem } from '../../utils/apiError';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The handover at the counter: a photo, the name of who took it, and the exact cash for COD. */
function HandOverSheet({ parcel, onClose, onDone }: { parcel: HubCounterParcel; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState(parcel.recipient.name);
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const problems: Record<string, string> = {};
    if (!photo) problems.proof_photo = 'Take a photo of the parcel being handed over.';
    if (!name.trim()) problems.received_by = 'Enter the name of who took the parcel.';
    if (parcel.cod_amount !== null && Math.round(Number(cash) * 100) !== Math.round(parcel.cod_amount * 100)) {
      problems.cod_amount = `Collect exactly ${peso(parcel.cod_amount)}.`;
    }
    setErrors(problems);
    if (Object.keys(problems).length) return;

    const form = new FormData();
    form.append('proof_photo', photo as File);
    form.append('received_by', name.trim());
    if (parcel.cod_amount !== null) form.append('cod_amount', cash);
    setBusy(true);
    try {
      await handOverAtCounterApi(parcel.tracking_number, form);
      showToast(`${parcel.tracking_number} handed over to the buyer.`);
      onDone();
    } catch (err) {
      const problem = apiProblem(err, 'The handover could not be saved. Try again.');
      setErrors(problem.fields);
      if (Object.keys(problem.fields).length === 0) showToast(problem.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center sm:p-4" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="counter-title" className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="counter-title" className="text-lg font-black text-gray-900">Hand over at the counter</h2>
            <p className="font-mono text-xs text-gray-500">{parcel.tracking_number}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p className="rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
          Check a valid ID: the name should match <span className="font-bold text-gray-900">{parcel.recipient.name}</span>, or a person they sent.
        </p>

        <label className="block">
          <span className="text-xs font-bold text-gray-700">Photo of the handover</span>
          <span className={`mt-1 flex items-center gap-2 min-h-11 px-3 rounded-xl border ${errors.proof_photo ? 'border-brand-red' : 'border-gray-300'} cursor-pointer hover:border-gray-500`}>
            <Camera className="w-4 h-4 text-gray-500" aria-hidden="true" />
            <span className="text-sm text-gray-700 truncate">{photo ? photo.name : 'Take or choose a photo'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </span>
          {errors.proof_photo && <span className="mt-1 block text-xs font-semibold text-brand-red">{errors.proof_photo}</span>}
        </label>

        <label className="block">
          <span className="text-xs font-bold text-gray-700">Taken by</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`mt-1 w-full h-11 px-3 rounded-xl border text-sm outline-none ${errors.received_by ? 'border-brand-red' : 'border-gray-300 focus:border-gray-900'}`} />
          {errors.received_by && <span className="mt-1 block text-xs font-semibold text-brand-red">{errors.received_by}</span>}
        </label>

        {parcel.cod_amount !== null && (
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900"><Banknote className="w-4 h-4" aria-hidden="true" /> Cash collected: exactly {peso(parcel.cod_amount)}</span>
            <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" placeholder={parcel.cod_amount.toFixed(2)} className={`mt-1 w-full h-11 px-3 rounded-xl border text-sm outline-none tabular-nums ${errors.cod_amount ? 'border-brand-red' : 'border-amber-300 focus:border-amber-600'}`} />
            {errors.cod_amount && <span className="mt-1 block text-xs font-semibold text-brand-red">{errors.cod_amount}</span>}
          </label>
        )}

        <button type="button" onClick={submit} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-black">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PackageCheck className="w-4 h-4" aria-hidden="true" />}
          Handed to the buyer
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Buyers from very remote towns (no branch near them) who chose to collect their parcel here. These parcels skip the
 * riders: when the buyer comes, the hub checks an ID, takes a photo and, for cash on delivery, the exact amount.
 */
export default function CounterPickupPanel() {
  const [parcels, setParcels] = useState<HubCounterParcel[]>([]);
  const [open, setOpen] = useState<HubCounterParcel | null>(null);

  const load = useCallback(async () => {
    try {
      setParcels((await getHubCounterApi()).data);
    } catch {
      // The panel is an extra; if it cannot load it stays as it was.
    }
  }, []);
  useLivePolling(load, 20_000);

  if (parcels.length === 0) return null;

  return (
    <section aria-label="Buyers picking up at the counter" className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center" aria-hidden="true">
          <PackageCheck className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-gray-900">Buyers picking up at the counter</h2>
          <p className="text-[11px] text-gray-500">
            {parcels.length} {parcels.length === 1 ? 'parcel' : 'parcels'} from remote towns. Keep them here; they need no rider.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-gray-100">
        {parcels.map((p) => (
          <li key={p.tracking_number} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{p.recipient.name}</p>
              <p className="text-xs text-gray-500 truncate">
                <span className="font-mono">{p.tracking_number}</span> &bull; {[p.recipient.barangay, p.recipient.city].filter(Boolean).join(', ')}
                {p.cod_amount !== null && <> &bull; <span className="font-semibold text-amber-800">COD {peso(p.cod_amount)}</span></>}
              </p>
            </div>
            {p.recipient.phone && (
              <a href={`tel:${p.recipient.phone}`} className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">
                <Phone className="w-4 h-4" aria-hidden="true" /> Call
              </a>
            )}
            <button type="button" onClick={() => setOpen(p)} className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              <PackageCheck className="w-4 h-4" aria-hidden="true" /> Hand over
            </button>
          </li>
        ))}
      </ul>
      {open && <HandOverSheet parcel={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); void load(); }} />}
    </section>
  );
}
