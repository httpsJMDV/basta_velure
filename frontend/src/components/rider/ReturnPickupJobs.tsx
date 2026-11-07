import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Camera, MapPin, Package, Phone, RefreshCw, Store, UserRound, X } from 'lucide-react';
import { collectReturnPickupApi, deliverReturnPickupApi, failReturnPickupApi, getReturnPickupsApi, type ReturnPickupView } from '../../api/commerce';
import { apiErrorMessage } from '../../utils/apiError';
import { downscaleImage } from '../../utils/imageDownscale';
import { useToast } from '../ui/Toast';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import { SectionCard } from '../../pages/rider/RiderUi';
import { BTN_PRIMARY, BTN_SECONDARY } from '../../pages/rider/riderStyles';

const MISSED = ['Nobody was home.', 'The buyer did not answer calls or texts.', 'The buyer was not ready to hand it over.'];

/**
 * Return pickups given to this rider: go to the buyer, take a photo of the item as you collect it (or record a missed
 * visit), then hand it to the shop. Three missed visits cancel the pickup. Hidden when there are none.
 */
export default function ReturnPickupJobs() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<ReturnPickupView[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [missing, setMissing] = useState<number | null>(null);
  const [reason, setReason] = useState(MISSED[0]);
  const photoFor = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // A failed refresh keeps the list: a blip must not hide an item the rider is carrying.
  const load = useCallback(() => {
    getReturnPickupsApi('rider')
      .then((res) => setJobs(res.data.filter((j) => j.status === 'assigned' || j.status === 'collected')))
      .catch(() => setJobs((prev) => prev ?? []));
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);
  useLiveRefresh(load, 30_000, busy !== null);

  if (!jobs || jobs.length === 0) return null;

  const run = async (id: number, work: () => Promise<{ message: string }>) => {
    setBusy(id);
    try {
      showToast((await work()).message, 'success');
      setMissing(null);
      load();
    } catch (e) {
      showToast(apiErrorMessage(e, 'That did not save. Try again.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const pickPhoto = (id: number) => {
    photoFor.current = id;
    input.current?.click();
  };

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = photoFor.current;
    e.target.value = '';
    if (!file || id === null) return;
    const small = await downscaleImage(file);
    await run(id, () => collectReturnPickupApi(id, small.file));
  };

  return (
    <SectionCard title="Return pickups" subtitle="Collect returned items from buyers and bring them to the shop." id="rider-return-pickups">
      <input ref={input} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onPhoto(e)} />
      <ul className="space-y-3">
        {jobs.map((j) => {
          const collected = j.status === 'collected';
          return (
            <li key={j.id} className="p-3 space-y-2 border rounded-xl border-sky-200 bg-sky-50/40">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] font-semibold text-gray-600">{j.code} · {j.order_number}</p>
                <span className="text-[10px] font-bold uppercase text-sky-800">{collected ? 'Bring to the shop' : 'Collect from the buyer'}</span>
              </div>
              <div className={`flex items-start gap-2 ${collected ? 'opacity-60' : ''}`}>
                <UserRound className="w-4 h-4 mt-0.5 text-sky-700 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900">{j.buyer?.name ?? 'Buyer'}</p>
                  <p className="text-xs text-gray-700"><MapPin className="inline w-3 h-3 mr-0.5" aria-hidden="true" />{j.buyer?.full_address}</p>
                </div>
                {j.buyer?.phone && !collected && (
                  <a href={`tel:${j.buyer.phone}`} className={BTN_SECONDARY} aria-label={`Call ${j.buyer.name ?? 'the buyer'}`}>
                    <Phone className="w-4 h-4" aria-hidden="true" /> Call
                  </a>
                )}
              </div>
              <div className={`flex items-start gap-2 ${collected ? '' : 'opacity-60'}`}>
                <Store className="w-4 h-4 mt-0.5 text-sky-700 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{j.shop?.shop_name ?? 'Shop'}</p>
                  <p className="text-xs text-gray-700">{j.shop?.full_address}</p>
                </div>
                {j.shop?.phone && collected && (
                  <a href={`tel:${j.shop.phone}`} className={BTN_SECONDARY} aria-label={`Call ${j.shop.shop_name ?? 'the shop'}`}>
                    <Phone className="w-4 h-4" aria-hidden="true" /> Call
                  </a>
                )}
              </div>
              {j.attempts > 0 && !collected && (
                <p className="text-[11px] text-amber-800">Missed visit {j.attempts} of {j.max_attempts}{j.last_failure ? `: ${j.last_failure}` : ''}</p>
              )}

              {collected ? (
                <button type="button" className={`${BTN_PRIMARY} w-full`} disabled={busy !== null} onClick={() => void run(j.id, () => deliverReturnPickupApi(j.id))}>
                  {busy === j.id ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Package className="w-4 h-4" aria-hidden="true" />}
                  Handed to the shop
                </button>
              ) : missing === j.id ? (
                <div className="p-2.5 space-y-2 bg-white border rounded-xl border-amber-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-900">Why couldn't you collect it?</p>
                    <button type="button" onClick={() => setMissing(null)} className="p-1 text-gray-500 rounded-lg hover:bg-gray-100" aria-label="Close"><X className="w-4 h-4" /></button>
                  </div>
                  {MISSED.map((m) => (
                    <label key={m} className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer min-h-9">
                      <input type="radio" name={`missed-${j.id}`} checked={reason === m} onChange={() => setReason(m)} className="accent-brand-red" /> {m}
                    </label>
                  ))}
                  <button type="button" className={`${BTN_PRIMARY} w-full`} disabled={busy !== null} onClick={() => void run(j.id, () => failReturnPickupApi(j.id, reason))}>
                    Save missed visit
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => { setReason(MISSED[0]); setMissing(j.id); }}>
                    Couldn't collect
                  </button>
                  <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => pickPhoto(j.id)}>
                    {busy === j.id ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
                    Collected: take photo
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
