import { useCallback, useEffect, useState } from 'react';
import { Check, Container, MapPin, RefreshCw, Wallet } from 'lucide-react';
import { getRiderTripsApi, reportTripArrivalApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import type { RiderTripsResponse, TruckTrip } from '../../types';
import { KpiSkeleton, KpiTile, PageHero, SectionCard, StateCard } from './RiderUi';
import { BTN_PRIMARY } from './riderStyles';
import { errorMessage, formatDateTime } from './earningsFormat';

type TripsData = RiderTripsResponse['data'];

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS: Record<TruckTrip['status'], { label: string; cls: string }> = {
  on_the_way: { label: 'On the way', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  closed: { label: 'Closed by courier', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
};

/** The trip on the road now: where it goes, the parcels on board, and the button for when the truck is at the dock. */
function CurrentTrip({ trip, onArrived, busy }: { trip: TruckTrip; onArrived: () => void; busy: boolean }) {
  const parcels = trip.parcels ?? [];
  return (
    <section aria-label="Current trip" className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Trip <span className="font-mono">{trip.code}</span> · {trip.plate_number ?? 'no plate'}
          </p>
          <div className="flex flex-wrap items-center mt-2 text-base font-bold text-gray-900 gap-x-2">
            <span>{trip.from_hub?.name}</span>
            <span aria-hidden="true" className="text-gray-400">→</span>
            <span>{trip.to_hub?.name}</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {trip.parcel_count} parcel{trip.parcel_count === 1 ? '' : 's'} on board · left {trip.departed_at ? formatDateTime(trip.departed_at) : '—'}
            {trip.to_hub?.city && <> · drop at {trip.to_hub.city}</>}
          </p>
        </div>
        {trip.driver_arrived_at ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <Check className="w-4 h-4" aria-hidden="true" /> Hub told you are there · {trip.received_count} of {trip.parcel_count} scanned in
          </p>
        ) : (
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={onArrived}>
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <MapPin className="w-4 h-4" aria-hidden="true" />}
            I'm at {trip.to_hub?.name ?? 'the hub'}
          </button>
        )}
      </div>
      {parcels.length > 0 && (
        <ul className="grid gap-x-6 gap-y-1 px-4 py-3 border-t border-gray-100 sm:grid-cols-2 lg:grid-cols-3">
          {parcels.map((p) => (
            <li key={p.tracking_number ?? ''} className="flex items-center gap-2 font-mono text-xs text-gray-700">
              <span className={`w-1.5 h-1.5 rounded-full ${p.received ? 'bg-emerald-600' : 'bg-gray-300'}`} aria-hidden="true" />
              <span className="break-all">{p.tracking_number}</span>
              <span className="sr-only">{p.received ? 'scanned in' : 'not scanned yet'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A truck driver's home: the trip on the road now, past trips and the trip pay. The courier company pays a set amount
 * per trip and marks it paid; the next hub's scans finish the trip.
 */
export default function RiderTripsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<TripsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getRiderTripsApi());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Your trips could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);
  useLiveRefresh(() => void load(), 20_000);

  const arrived = async (trip: TruckTrip) => {
    setReporting(true);
    try {
      const res = await reportTripArrivalApi(trip.id);
      showToast(res.message);
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Could not tell the hub. Try again.'), 'error');
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="pb-4 space-y-4">
      <PageHero icon={Container} title="Trips" subtitle="Parcels you drive from one hub to another. Your courier pays per trip." />

      {error && !data && <StateCard icon={Container} title="Trips not loaded" message={error} tone="red" alert />}
      {!data && !error && <KpiSkeleton count={3} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile icon={Wallet} label="Not paid yet" value={peso(data.pay.unpaid_total)} hint={`${data.pay.unpaid_trips} trip${data.pay.unpaid_trips === 1 ? '' : 's'}`} />
            <KpiTile icon={Check} tone="emerald" label="Paid so far" value={peso(data.pay.paid_total)} />
            <KpiTile icon={Container} tone="gray" label="Trips this week" value={String(data.pay.trips_this_week)} />
            <KpiTile icon={Wallet} tone="amber" label="Pay per trip" value={peso(data.pay.rate)} hint="Set by your courier" />
          </div>

          {data.current ? (
            <CurrentTrip trip={data.current} busy={reporting} onArrived={() => void arrived(data.current as TruckTrip)} />
          ) : (
            <StateCard icon={Container} title="No trip right now" message="When a hub loads parcels on your truck, the trip shows here and on your phone." />
          )}

          <SectionCard title="Past trips" subtitle="Newest first">
            {data.trips.length === 0 ? (
              <p className="text-xs text-gray-500">No trips yet.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-2 font-bold">Trip</th>
                      <th className="px-4 py-2 font-bold">Route</th>
                      <th className="px-4 py-2 font-bold text-right">Parcels</th>
                      <th className="px-4 py-2 font-bold">Status</th>
                      <th className="px-4 py-2 font-bold text-right">Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.trips.map((t) => (
                      <tr key={t.id} className="align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <p className="font-mono font-semibold text-gray-900">{t.code}</p>
                          <p className="text-[11px] text-gray-500">{t.departed_at ? formatDateTime(t.departed_at) : ''}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-800 min-w-[180px]">
                          {t.from_hub?.name} → {t.to_hub?.name}
                          {t.close_reason && <p className="text-[11px] text-gray-500">Closed: {t.close_reason}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{t.received_count}/{t.parcel_count}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <p className="font-semibold text-gray-900 tabular-nums">{peso(t.pay_amount)}</p>
                          <p className="text-[11px] text-gray-500">{t.paid_at ? `Paid${t.paid_reference ? ` · ${t.paid_reference}` : ''}` : t.status === 'on_the_way' ? 'After the trip' : 'Not paid yet'}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
