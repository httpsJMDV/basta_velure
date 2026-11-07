import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Plus, Wallet, XCircle } from 'lucide-react';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { ListEmpty, ListError, Pill, StatusTabs, SkeletonRows, TH, TD, relativeTime } from '../../components/admin/listKit';
import { HeroStats, Panel } from '../../components/logistics/CourierKit';
import { ReasonDialog, SidePanel, BUTTON } from '../../components/ui/Overlay';
import Input from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { closeTruckTripApi, getLogisticsTruckDriversApi, getLogisticsTruckTripsApi, payTruckDriverApi, setTruckTripRateApi } from '../../api/client';
import type { LogisticsTruckDriver, LogisticsTruckDriversResponse, TruckTrip } from '../../types';
import { apiErrorMessage } from '../../utils/apiError';

type TripTab = 'on_the_way' | 'unpaid' | 'all';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TRIP_TONE: Record<TruckTrip['status'], 'amber' | 'emerald' | 'gray'> = { on_the_way: 'amber', completed: 'emerald', closed: 'gray' };
const TRIP_LABEL: Record<TruckTrip['status'], string> = { on_the_way: 'On the way', completed: 'Completed', closed: 'Closed' };

/** Pay a driver for every finished trip not paid yet, with the GCash or bank reference. */
function PayPanel({ driver, onClose, onPaid }: { driver: LogisticsTruckDriver | null; onClose: () => void; onPaid: (msg: string) => void }) {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pay = async () => {
    if (!driver) return;
    setBusy(true);
    setError('');
    try {
      onPaid((await payTruckDriverApi(driver.id, reference.trim() || undefined)).message);
    } catch (e) {
      setError(apiErrorMessage(e, 'The payment was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel open={driver !== null} onClose={onClose} title={driver ? `Pay ${driver.name}` : ''}
      subtitle="Send the money first by GCash or bank, then mark it paid here. The driver is told right away."
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={BUTTON.primary} onClick={() => void pay()} disabled={busy}>{busy ? 'Saving…' : `Mark ${peso(driver?.unpaid_amount ?? 0)} paid`}</button>
        </div>
      )}
    >
      {driver && (
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">{error}</p>}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 border rounded-xl border-stone-200"><dt className="text-[11px] text-stone-500">Trips to pay</dt><dd className="text-lg font-black tabular-nums">{driver.unpaid_trips}</dd></div>
            <div className="p-3 border rounded-xl border-stone-200"><dt className="text-[11px] text-stone-500">Amount</dt><dd className="text-lg font-black tabular-nums">{peso(driver.unpaid_amount)}</dd></div>
          </dl>
          <Input id="pay-ref" label="GCash or bank reference (optional)" value={reference} maxLength={40} onChange={(e) => setReference(e.target.value)} />
        </div>
      )}
    </SidePanel>
  );
}

/**
 * Truck drivers (line-haul). The hubs hand parcels for another hub to one of these drivers; the trip is complete once
 * the next hub scans every parcel in. The company pays each driver a set amount per trip from its own money, so the
 * shipping fee split between riders and hubs does not change.
 */
export default function LogisticsTrucksPage() {
  const { showToast } = useToast();
  const [drivers, setDrivers] = useState<LogisticsTruckDriversResponse | null>(null);
  const [trips, setTrips] = useState<TruckTrip[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<TripTab>('on_the_way');
  const [paying, setPaying] = useState<LogisticsTruckDriver | null>(null);
  const [closing, setClosing] = useState<TruckTrip | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [rate, setRate] = useState('');
  const [rateBusy, setRateBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getLogisticsTruckDriversApi(), getLogisticsTruckTripsApi()])
      .then(([d, t]) => { setDrivers(d); setTrips(t); setRate((r) => r || String(d.summary.rate)); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const shown = useMemo(() => (trips ?? []).filter((t) => tab === 'all'
    || (tab === 'on_the_way' ? t.status === 'on_the_way' : t.status !== 'on_the_way' && !t.paid_at)), [trips, tab]);
  const s = drivers?.summary;

  const saveRate = async () => {
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) { showToast('Enter what one trip pays, in pesos.', 'error'); return; }
    setRateBusy(true);
    try {
      showToast((await setTruckTripRateApi(value)).message);
      load();
    } catch (e) {
      showToast(apiErrorMessage(e, 'The trip pay was not saved.'), 'error');
    } finally {
      setRateBusy(false);
    }
  };

  const closeTrip = async (reason: string) => {
    if (!closing) return;
    setCloseBusy(true);
    setCloseError('');
    try {
      showToast((await closeTruckTripApi(closing.id, reason)).message);
      setClosing(null);
      load();
    } catch (e) {
      setCloseError(apiErrorMessage(e, 'The trip was not closed.'));
    } finally {
      setCloseBusy(false);
    }
  };

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={Container} eyebrow="Network" title="Truck drivers"
        subtitle="Your drivers carry parcels between your hubs. You pay each one per trip; it does not come out of the riders' or hubs' share.">
        <div className="flex flex-wrap items-center gap-3">
          {s && (
            <HeroStats items={[
              { label: 'Drivers', value: s.active },
              { label: 'On the road', value: s.on_the_way, tone: s.on_the_way ? 'good' : 'default' },
              { label: 'You owe', value: peso(s.unpaid_amount), tone: s.unpaid_amount ? 'warn' : 'default' },
            ]} />
          )}
          <Link to="/logistics/riders?add=truck" className={HERO_BUTTON}><Plus className="w-4 h-4" aria-hidden="true" /> Add truck driver</Link>
        </div>
      </PageHero>

      {failed ? <ListError message="The truck drivers could not be loaded." onRetry={load} /> : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Panel icon={Container} title="Drivers" subtitle="Who is on the road and what you owe each one.">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className={TH}>Driver</th>
                      <th className={TH}>Truck</th>
                      <th className={TH}>Now</th>
                      <th className={`${TH} text-right`}>This week</th>
                      <th className={`${TH} text-right`}>Unpaid</th>
                      <th className={TH}><span className="sr-only">Pay</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!drivers && <SkeletonRows cols={6} rows={3} />}
                    {drivers && drivers.data.length === 0 && (
                      <tr><td colSpan={6}><ListEmpty icon={Container} title="No truck drivers yet" hint="Add one, and your hubs pick a driver whenever they send parcels to another hub." /></td></tr>
                    )}
                    {drivers?.data.map((d) => (
                      <tr key={d.id}>
                        <td className={TD}>
                          <p className="font-semibold text-brand-black">{d.name}</p>
                          <p className="text-[11px] text-gray-400">{d.phone ?? d.email}{d.home_hub ? ` · ${d.home_hub}` : ''}</p>
                        </td>
                        <td className={`${TD} text-gray-600 whitespace-nowrap`}>{d.vehicle_type} · <span className="font-mono text-[12px]">{d.plate_number}</span></td>
                        <td className={TD}>
                          {d.status === 'PENDING' ? (
                            <Link to="/logistics/riders" className="inline-flex"><Pill tone="amber">Application: review in Riders</Pill></Link>
                          ) : d.status !== 'ACTIVE' ? <Pill tone="gray">{d.status === 'PENDING_ACTIVATION' ? 'Not activated yet' : d.status.toLowerCase()}</Pill>
                            : d.current_trip ? (
                              <span className="text-[12px] text-gray-700">To {d.current_trip.to_hub?.name} · {d.current_trip.received_count}/{d.current_trip.parcel_count}</span>
                            ) : <span className="text-[12px] text-gray-400">Free</span>}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{d.trips_this_week}</td>
                        <td className={`${TD} text-right tabular-nums font-semibold`}>{d.unpaid_amount ? peso(d.unpaid_amount) : '—'}</td>
                        <td className={`${TD} text-right`}>
                          {d.unpaid_trips > 0 && (
                            <button type="button" className={BUTTON.ghost} onClick={() => setPaying(d)}>
                              <Wallet className="w-4 h-4" aria-hidden="true" /> Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel icon={Wallet} title="Pay per trip" subtitle="New trips use this amount. Trips on the road keep theirs.">
              <div className="p-4 space-y-3">
                <Input id="trip-rate" label="Pesos per trip" type="number" min={0} step="50" value={rate} onChange={(e) => setRate(e.target.value)} />
                <button type="button" className={`${BUTTON.dark} w-full`} onClick={() => void saveRate()} disabled={rateBusy}>{rateBusy ? 'Saving…' : 'Save trip pay'}</button>
                <p className="text-[12px] leading-relaxed text-stone-500">
                  A trip is one truck from one hub to another. It counts when the other hub has scanned in every parcel, or when you close it.
                </p>
              </div>
            </Panel>
          </div>

          <Panel icon={Container} title="Trips"
            actions={(
              <StatusTabs<TripTab> label="Trips" value={tab} onChange={setTab} options={[
                { value: 'on_the_way', label: 'On the road', count: trips ? trips.filter((t) => t.status === 'on_the_way').length : null },
                { value: 'unpaid', label: 'Not paid', count: trips ? trips.filter((t) => t.status !== 'on_the_way' && !t.paid_at).length : null },
                { value: 'all', label: 'All', count: trips ? trips.length : null },
              ]} />
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className={TH}>Trip</th>
                    <th className={TH}>Route</th>
                    <th className={TH}>Driver</th>
                    <th className={`${TH} text-right`}>Scanned in</th>
                    <th className={TH}>Status</th>
                    <th className={`${TH} text-right`}>Pay</th>
                    <th className={TH}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {!trips && <SkeletonRows cols={7} rows={4} />}
                  {trips && shown.length === 0 && (
                    <tr><td colSpan={7}><ListEmpty icon={Container} title={tab === 'on_the_way' ? 'No truck on the road' : 'No trips here'} hint="Trips start when a hub loads parcels for another hub on a truck." /></td></tr>
                  )}
                  {shown.map((t) => (
                    <tr key={t.id} className="align-top">
                      <td className={TD}>
                        <p className="font-mono font-semibold text-brand-black">{t.code}</p>
                        <p className="text-[11px] text-gray-400">{relativeTime(t.departed_at)}</p>
                      </td>
                      <td className={`${TD} text-gray-700 min-w-[200px]`}>
                        {t.from_hub?.name} → {t.to_hub?.name}
                        {t.close_reason && <p className="text-[11px] text-gray-500">Closed: {t.close_reason}</p>}
                      </td>
                      <td className={`${TD} text-gray-700 whitespace-nowrap`}>{t.driver?.name}<span className="block font-mono text-[11px] text-gray-400">{t.plate_number}</span></td>
                      <td className={`${TD} text-right tabular-nums`}>{t.received_count}/{t.parcel_count}</td>
                      <td className={TD}><Pill tone={TRIP_TONE[t.status]}>{TRIP_LABEL[t.status]}</Pill></td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <span className="font-semibold tabular-nums">{peso(t.pay_amount)}</span>
                        <span className="block text-[11px] text-gray-400">{t.paid_at ? 'Paid' : t.status === 'on_the_way' ? 'After the trip' : 'Not paid'}</span>
                      </td>
                      <td className={`${TD} text-right`}>
                        {t.status === 'on_the_way' && (
                          <button type="button" className={BUTTON.quiet} onClick={() => { setCloseError(''); setClosing(t); }}>
                            <XCircle className="w-4 h-4" aria-hidden="true" /> Close
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <PayPanel key={paying?.id ?? 0} driver={paying} onClose={() => setPaying(null)} onPaid={(msg) => { setPaying(null); showToast(msg); load(); }} />
      <ReasonDialog open={closing !== null} onClose={() => setClosing(null)} onConfirm={(r) => void closeTrip(r)} busy={closeBusy} error={closeError}
        title={closing ? `Close trip ${closing.code}` : ''} confirmLabel="Close trip" min={5} max={500}
        intro={closing ? `${closing.parcel_count - closing.received_count} of ${closing.parcel_count} parcels were not scanned in at ${closing.to_hub?.name}. The driver is still paid for the trip. Say what happened.` : undefined}
        quickPicks={['Parcels went missing on the way.', 'The truck broke down; the parcels came another way.']} />
    </div>
  );
}
