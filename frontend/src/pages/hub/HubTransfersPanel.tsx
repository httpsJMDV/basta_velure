import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, ChevronDown, ChevronUp, Clock, Plane, RefreshCw, Ship, Truck, Undo2 } from 'lucide-react';
import { getHubTransfersApi, getHubTruckDriversApi, getHubTruckTripsApi, receiveHubTruckTripApi, sendHubTransferApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type { HubTransferGroup, HubTransfersResponse, HubTruckDriver, LegMode, TruckTrip } from '../../types';

const POLL_MS = 30000;

function waited(iso: string | null): string {
  if (!iso) return 'just now';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
}

function day(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';
}

/** A YYYY-MM-DD date some days from today, in Manila. */
function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

const isCargo = (mode?: LegMode | null) => mode === 'sea' || mode === 'air';

function ModeIcon({ mode, className = 'w-5 h-5' }: { mode?: LegMode | null; className?: string }) {
  if (mode === 'sea') return <Ship className={className} aria-hidden="true" />;
  if (mode === 'air') return <Plane className={className} aria-hidden="true" />;
  return <Truck className={className} aria-hidden="true" />;
}

/**
 * One truck, ship or plane on the way, to or from this hub: who carries it, and how many of its parcels the next hub
 * has scanned. One coming here can be received in one go, like scanning one sack: tick any parcel that was not on it.
 */
function TripRow({ trip, incoming, onReceived }: { trip: TruckTrip; incoming: boolean; onReceived?: () => void }) {
  const { showToast } = useToast();
  const other = incoming ? trip.from_hub : trip.to_hub;
  const done = trip.received_count;
  const pct = trip.parcel_count > 0 ? Math.round((done / trip.parcel_count) * 100) : 0;
  const waiting = (trip.parcels ?? []).filter((p) => !p.received && p.tracking_number);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cargo = isCargo(trip.mode);

  const receive = async () => {
    setBusy(true);
    try {
      showToast((await receiveHubTruckTripApi(trip.id, missing)).message);
      setOpen(false);
      setMissing([]);
      onReceived?.();
    } catch (err: unknown) {
      showToast(axios.isAxiosError(err) ? err.response?.data?.message ?? 'The trip could not be received.' : 'The trip could not be received.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex items-start min-w-0 gap-3">
        <span className={`mt-0.5 shrink-0 ${cargo ? 'text-sky-600' : 'text-gray-500'}`}><ModeIcon mode={trip.mode} className="w-4 h-4" /></span>
        <div className="min-w-0">
          <p className="text-sm text-gray-900">
            <span className="font-bold">{incoming ? 'From' : 'To'} {other?.name ?? 'another hub'}</span>
            <span className="ml-2 font-mono text-xs text-gray-500">{trip.code}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {cargo ? (
              <>
                {trip.carrier_name}
                {trip.carrier_reference && <span className="font-mono"> · {trip.carrier_reference}</span>}
                <span> · left {day(trip.departed_at)}</span>
                {trip.eta_at && <span className="font-semibold text-sky-800"> · due {day(trip.eta_at)}</span>}
              </>
            ) : (
              <>
                {trip.driver?.name ?? 'Driver'}
                {trip.plate_number && <span className="font-mono"> · {trip.plate_number}</span>}
                {trip.driver?.phone && <span> · {trip.driver.phone}</span>}
                <span> · left {clock(trip.departed_at)}</span>
                {trip.driver_arrived_at && <span className="font-semibold text-emerald-700"> · at {incoming ? 'your' : 'their'} dock since {clock(trip.driver_arrived_at)}</span>}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <div className="w-28 h-1.5 overflow-hidden bg-gray-100 rounded-full" aria-hidden="true">
          <div className="h-full bg-gray-800 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-gray-700 tabular-nums whitespace-nowrap">
          {done} of {trip.parcel_count} scanned in
        </span>
        {incoming && waiting.length > 0 && !open && (
          <button type="button" onClick={() => setOpen(true)} className="px-3 text-xs font-semibold text-white rounded-lg min-h-9 bg-gray-900 hover:bg-black whitespace-nowrap">
            Receive all {waiting.length}
          </button>
        )}
      </div>
      {open && (
        <div className="p-3 border border-gray-200 sm:col-span-2 rounded-xl bg-gray-50">
          <p className="text-xs text-gray-700">
            Count the parcels off the {cargo ? 'cargo' : 'truck'}. Tick any that is <span className="font-semibold">not</span> there; it stays expected until someone scans it in.
          </p>
          <ul className="grid gap-1 mt-2 sm:grid-cols-2 lg:grid-cols-3">
            {waiting.map((p) => {
              const tn = p.tracking_number as string;
              const off = missing.includes(tn);
              return (
                <li key={tn}>
                  <label className="flex items-center gap-2 font-mono text-xs text-gray-800 cursor-pointer min-h-8">
                    <input type="checkbox" checked={off} onChange={() => setMissing((m) => (off ? m.filter((x) => x !== tn) : [...m, tn]))} className="accent-brand-red" />
                    <span className={off ? 'line-through text-gray-400' : ''}>{tn}</span>
                    {p.kind && p.kind !== 'parcel' && <span className="font-sans text-[10px] font-semibold text-amber-700">{p.kind === 'buyer_return' ? 'Return' : 'Back to seller'}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => { setOpen(false); setMissing([]); }} className="px-3 text-xs font-semibold text-gray-700 rounded-lg min-h-9 hover:bg-gray-100">Cancel</button>
            <button type="button" disabled={busy || missing.length === waiting.length} onClick={() => void receive()}
              className="inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white rounded-lg min-h-9 bg-brand-red hover:bg-brand-red-dark disabled:opacity-50">
              {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Receive {waiting.length - missing.length} parcel{waiting.length - missing.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** The ship or plane form at an island gateway: which carrier, its reference, and the day it is due. */
function CargoFields({ mode, setMode, carrier, setCarrier, reference, setReference, eta, setEta, meta }: {
  mode: 'sea' | 'air'; setMode: (m: 'sea' | 'air') => void; carrier: string; setCarrier: (v: string) => void;
  reference: string; setReference: (v: string) => void; eta: string; setEta: (v: string) => void; meta: HubTransfersResponse['meta'] | null;
}) {
  const suggestions = meta?.carriers?.[mode] ?? [];
  const field = 'block w-full px-3 mt-1 text-sm font-normal text-gray-900 bg-white border border-gray-300 rounded-xl min-h-11 focus:border-gray-900 focus:outline-none';

  return (
    <div className="grid flex-1 min-w-0 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="text-xs font-semibold text-gray-700">Send by</span>
        <div className="grid grid-cols-2 gap-2 mt-1" role="radiogroup" aria-label="Send by">
          {(['sea', 'air'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setCarrier(''); setEta(inDays(meta?.cargo_days?.[m] ?? (m === 'sea' ? 3 : 1))); }}
              className={`flex items-center gap-2.5 px-3 text-left border rounded-xl min-h-12 ${mode === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-800 hover:border-gray-500'}`}>
              <ModeIcon mode={m} className="w-4 h-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{m === 'sea' ? 'Ship' : 'Plane'}</span>
                <span className={`block text-[11px] ${mode === m ? 'text-white/70' : 'text-gray-500'}`}>
                  About {meta?.cargo_days?.[m] ?? (m === 'sea' ? 3 : 1)} {(meta?.cargo_days?.[m] ?? 1) === 1 ? 'day' : 'days'}{m === 'sea' ? ', for anything' : ', light parcels'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <label className="text-xs font-semibold text-gray-700">
        {mode === 'sea' ? 'Ship or sailing' : 'Flight or cargo service'}
        <input list={`carriers-${mode}`} value={carrier} maxLength={80} onChange={(e) => setCarrier(e.target.value)}
          placeholder={mode === 'sea' ? 'e.g. Roll-on/roll-off ferry, 6 PM sailing' : 'e.g. Domestic air cargo, morning flight'} className={field} />
        <datalist id={`carriers-${mode}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <label className="text-xs font-semibold text-gray-700">
        {mode === 'sea' ? 'Bill of lading no.' : 'Air waybill no.'}
        <input value={reference} maxLength={40} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder={mode === 'sea' ? 'BL-2026-000123' : 'AWB 123-45678901'} className={`${field} font-mono`} />
      </label>
      <label className="text-xs font-semibold text-gray-700 sm:col-span-2 sm:max-w-[240px]">
        Due at the other gateway
        <input type="date" value={eta} min={inDays(0)} onChange={(e) => setEta(e.target.value)} className={field} />
      </label>
    </div>
  );
}

/**
 * Hub to hub: parcels this hub received for a barangay another hub of the courier covers, parcels going back to their
 * seller, and buyers' returns on their way to a shop. A regular hub loads them on one of the courier's trucks; an
 * island gateway puts the ones crossing to another island group on a ship or a plane. The next hub scans them in on
 * its Parcel Intake page. Also lists what is on the way to and from this hub. Shows nothing when there is nothing to do.
 */
export default function HubTransfersPanel() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<HubTransferGroup[]>([]);
  const [meta, setMeta] = useState<HubTransfersResponse['meta'] | null>(null);
  const [drivers, setDrivers] = useState<HubTruckDriver[]>([]);
  const [incoming, setIncoming] = useState<TruckTrip[]>([]);
  const [outgoing, setOutgoing] = useState<TruckTrip[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<number | ''>('');
  const [cargoMode, setCargoMode] = useState<'sea' | 'air'>('sea');
  const [carrier, setCarrier] = useState('');
  const [reference, setReference] = useState('');
  const [eta, setEta] = useState(inDays(3));
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, ins, outs, people] = await Promise.all([
        getHubTransfersApi(),
        getHubTruckTripsApi('in'),
        getHubTruckTripsApi('out'),
        getHubTruckDriversApi(),
      ]);
      setGroups(res.data);
      setMeta(res.meta);
      setIncoming(ins.data.filter((t) => t.status === 'on_the_way'));
      setOutgoing(outs.data.filter((t) => t.status === 'on_the_way'));
      setDrivers(people);
    } catch {
      // Sorting still works without this panel. The next poll tries again.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  const keyOf = (g: HubTransferGroup) => `${g.hub.id}-${isCargo(g.mode) ? 'cargo' : 'truck'}`;

  const startConfirm = (group: HubTransferGroup) => {
    setConfirming(keyOf(group));
    setDriverId(drivers.find((d) => !d.busy)?.id ?? '');
    setCargoMode('sea');
    setCarrier('');
    setReference('');
    setEta(inDays(meta?.cargo_days?.sea ?? 3));
  };

  const send = async (group: HubTransferGroup) => {
    const cargo = isCargo(group.mode);
    if (!cargo && drivers.length > 0 && driverId === '') {
      showToast('Choose the truck driver taking these parcels.', 'error');
      return;
    }
    if (cargo && (!carrier.trim() || !reference.trim())) {
      showToast(`Enter the ${cargoMode === 'sea' ? 'ship' : 'flight'} and its ${cargoMode === 'sea' ? 'bill of lading' : 'air waybill'} number.`, 'error');
      return;
    }
    setSending(true);
    try {
      const res = await sendHubTransferApi(group.tracking_numbers, {
        returnCodes: group.return_codes ?? [],
        ...(cargo ? { mode: cargoMode, carrierName: carrier.trim(), carrierReference: reference.trim(), eta } : { driverId: driverId === '' ? null : driverId }),
      });
      showToast(`${res.message} ${group.hub.name} scans them in when they arrive.`);
      setConfirming(null);
      setOpen(null);
      await load();
    } catch (err: unknown) {
      showToast(axios.isAxiosError(err) ? err.response?.data?.message ?? 'The parcels could not be sent.' : 'The parcels could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  const onTheWayHere = meta?.on_the_way_here ?? 0;
  // Trips coming here are listed with their trip; the banner counts the parcels that came without one.
  const looseHere = Math.max(0, onTheWayHere - incoming.reduce((n, t) => n + (t.parcel_count - t.received_count), 0));
  if (groups.length === 0 && onTheWayHere === 0 && incoming.length === 0 && outgoing.length === 0) return null;
  const freeDrivers = drivers.filter((d) => !d.busy);
  const crossing = groups.some((g) => isCargo(g.mode));

  return (
    <section aria-label="Parcels for other hubs" className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      {looseHere > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm border-b border-blue-100 bg-blue-50 text-blue-950">
          <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">
            <span className="font-bold">{looseHere} parcel{looseHere === 1 ? '' : 's'}</span> on the way from other hubs.
          </span>
          <Link to="/hub/intake" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            Scan them in <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="border-b border-gray-100">
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h2 className="text-sm font-bold text-gray-900">Coming here</h2>
            <Link to="/hub/intake" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 underline underline-offset-2 min-h-11">
              Scan them in <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {incoming.map((trip) => <TripRow key={trip.id} trip={trip} incoming onReceived={() => void load()} />)}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">For other hubs</h2>
              {meta?.gateway && <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-indigo-50 text-indigo-700">{meta.gateway}</span>}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {crossing
                ? 'This is an island gateway: the ones marked by sea cross to another island group. Put them on a ship, or a plane when they are urgent and light.'
                : 'Another hub of your courier is next on their way. Load them on a truck instead of sorting them here.'}
              {drivers.length === 0 && !crossing && ' Your courier has no truck drivers yet, so they go without one.'}
            </p>
          </div>
          <ul className="p-3 space-y-2">
            {groups.map((group) => {
              const key = keyOf(group);
              const cargo = isCargo(group.mode);
              const isOpen = open === key;
              const count = group.parcel_count;
              const word = `${count} parcel${count === 1 ? '' : 's'}`;
              const back = (group.counts?.return_to_sender ?? 0) + (group.counts?.buyer_returns ?? 0);
              const finals = group.final_hubs ?? [];
              const moreFinals = (group.final_hub_count ?? finals.length) - finals.length;
              return (
                <li key={key} className={`border rounded-xl ${cargo ? 'border-sky-200' : 'border-gray-200'}`}>
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex items-start flex-1 min-w-0 gap-3">
                      <span className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${cargo ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-700'}`}>
                        <ModeIcon mode={group.mode} />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-gray-900 break-words">
                          {group.hub.name}
                          {group.hub.gateway && <span className="text-[11px] font-semibold text-indigo-700">{group.hub.gateway}</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {[group.hub.city, group.hub.province].filter(Boolean).join(', ')}
                          {cargo && <span className="font-semibold text-sky-800"> · by sea</span>}
                        </p>
                        {finals.length > 0 && (
                          <p className="mt-0.5 text-xs text-gray-500">Then on to {finals.join(', ')}{moreFinals > 0 ? ` and ${moreFinals} more` : ''}</p>
                        )}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
                          <span className="font-semibold">{word}</span>
                          {back > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-800">
                              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> {back} going back to {back === 1 ? 'a shop' : 'shops'}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Waiting {waited(group.oldest_scanned_in_at)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}
                        className="inline-flex items-center gap-1 px-3 text-xs font-semibold text-gray-700 rounded-lg min-h-11 hover:bg-gray-100">
                        {isOpen ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                        Parcels
                      </button>
                      {confirming !== key && (
                        <button type="button" onClick={() => startConfirm(group)} className="px-4 text-sm font-semibold text-white rounded-xl min-h-11 bg-brand-red hover:bg-brand-red-dark">
                          {cargo ? 'Load on a ship or plane' : drivers.length > 0 ? 'Load on a truck' : 'Send'}
                        </button>
                      )}
                    </div>
                  </div>

                  {confirming === key && (
                    <div className="flex flex-col gap-3 px-3 pb-3 sm:flex-row sm:items-end">
                      {cargo ? (
                        <CargoFields mode={cargoMode} setMode={setCargoMode} carrier={carrier} setCarrier={setCarrier}
                          reference={reference} setReference={setReference} eta={eta} setEta={setEta} meta={meta} />
                      ) : drivers.length > 0 && (
                        <label className="flex-1 min-w-0 text-xs font-semibold text-gray-700">
                          Truck driver
                          <select value={driverId} onChange={(e) => setDriverId(e.target.value === '' ? '' : Number(e.target.value))}
                            className="block w-full px-3 mt-1 text-sm font-normal text-gray-900 bg-white border border-gray-300 rounded-xl min-h-11 focus:border-gray-900 focus:outline-none">
                            {freeDrivers.length === 0 && <option value="">Every driver is on a trip</option>}
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id} disabled={d.busy}>
                                {d.name} · {d.vehicle_type}{d.plate_number ? ` ${d.plate_number}` : ''}
                                {d.busy ? ` · on a trip to ${d.on_trip_to ?? 'another hub'}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="flex items-center gap-2 sm:justify-end">
                        <button type="button" disabled={sending} onClick={() => setConfirming(null)} className="px-3 text-xs font-semibold text-gray-700 rounded-lg min-h-11 hover:bg-gray-100 disabled:opacity-50">
                          Cancel
                        </button>
                        <button type="button" disabled={sending || (!cargo && drivers.length > 0 && driverId === '')} onClick={() => void send(group)}
                          className="inline-flex items-center gap-1.5 px-4 text-sm font-semibold text-white rounded-xl min-h-11 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 whitespace-nowrap">
                          {sending && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
                          Yes, send {word}
                        </button>
                      </div>
                    </div>
                  )}

                  {isOpen && (
                    <ul className="grid gap-1 px-4 py-3 border-t border-gray-100 sm:grid-cols-2 lg:grid-cols-3">
                      {group.tracking_numbers.map((number) => (
                        <li key={number} className="font-mono text-xs text-gray-700 break-all">{number}</li>
                      ))}
                      {(group.return_codes ?? []).map((code) => (
                        <li key={code} className="font-mono text-xs text-amber-800 break-all">{code} <span className="font-sans text-[10px] font-semibold">buyer return</span></li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {outgoing.length > 0 && (
        <div className="border-t border-gray-100">
          <h2 className="px-4 pt-4 text-sm font-bold text-gray-900">Left here</h2>
          <ul className="divide-y divide-gray-100">
            {outgoing.map((trip) => <TripRow key={trip.id} trip={trip} incoming={false} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
