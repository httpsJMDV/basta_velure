import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, ChevronDown, ChevronUp, Clock, RefreshCw, Truck } from 'lucide-react';
import { getHubTransfersApi, getHubTruckDriversApi, getHubTruckTripsApi, receiveHubTruckTripApi, sendHubTransferApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type { HubTransferGroup, HubTruckDriver, TruckTrip } from '../../types';

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

/**
 * One truck on the road, to or from this hub: who drives it, and how many of its parcels the next hub has scanned. A
 * truck coming here can be received in one go, like scanning one sack: tick any parcel that was not on it.
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

  const receive = async () => {
    setBusy(true);
    try {
      showToast((await receiveHubTruckTripApi(trip.id, missing)).message);
      setOpen(false);
      setMissing([]);
      onReceived?.();
    } catch (err: unknown) {
      showToast(axios.isAxiosError(err) ? err.response?.data?.message ?? 'The truck could not be received.' : 'The truck could not be received.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm text-gray-900">
          <span className="font-bold">{incoming ? 'From' : 'To'} {other?.name ?? 'another hub'}</span>
          <span className="ml-2 font-mono text-xs text-gray-500">{trip.code}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-600">
          {trip.driver?.name ?? 'Driver'}
          {trip.plate_number && <span className="font-mono"> · {trip.plate_number}</span>}
          {trip.driver?.phone && <span> · {trip.driver.phone}</span>}
          <span> · left {clock(trip.departed_at)}</span>
          {trip.driver_arrived_at && <span className="font-semibold text-emerald-700"> · at {incoming ? 'your' : 'their'} dock since {clock(trip.driver_arrived_at)}</span>}
        </p>
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
            Count the parcels off the truck. Tick any that is <span className="font-semibold">not</span> on it; it stays expected until someone scans it in.
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

/**
 * Hub to hub: parcels this hub received for a barangay another hub of the courier covers. This hub hands them to one
 * of the courier's truck drivers, and that hub scans them in on its Parcel Intake page and sorts them. Also lists the
 * trucks on the road to and from this hub. Shows nothing when there is nothing to do.
 */
export default function HubTransfersPanel() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<HubTransferGroup[]>([]);
  const [onTheWayHere, setOnTheWayHere] = useState(0);
  const [drivers, setDrivers] = useState<HubTruckDriver[]>([]);
  const [incoming, setIncoming] = useState<TruckTrip[]>([]);
  const [outgoing, setOutgoing] = useState<TruckTrip[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | ''>('');
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
      setOnTheWayHere(res.meta.on_the_way_here);
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

  const startConfirm = (id: number) => {
    setConfirming(id);
    setDriverId(drivers.find((d) => !d.busy)?.id ?? '');
  };

  const send = async (group: HubTransferGroup) => {
    if (drivers.length > 0 && driverId === '') {
      showToast('Choose the truck driver taking these parcels.', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await sendHubTransferApi(group.tracking_numbers, driverId === '' ? null : driverId);
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

  // Trucks coming here are listed with their trip; the banner counts the parcels that came without one.
  const looseHere = Math.max(0, onTheWayHere - incoming.reduce((n, t) => n + (t.parcel_count - t.received_count), 0));
  if (groups.length === 0 && onTheWayHere === 0 && incoming.length === 0 && outgoing.length === 0) return null;
  const freeDrivers = drivers.filter((d) => !d.busy);

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
            <h2 className="text-sm font-bold text-gray-900">Trucks coming here</h2>
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
            <h2 className="text-sm font-bold text-gray-900">For other hubs</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Another hub of your courier delivers to these barangays. Load them on a truck instead of sorting them here.
              {drivers.length === 0 && ' Your courier has no truck drivers yet, so they go without one.'}
            </p>
          </div>
          <ul className="p-3 space-y-2">
            {groups.map((group) => {
              const id = group.hub.id;
              const isOpen = open === id;
              const count = group.parcel_count;
              const word = `${count} parcel${count === 1 ? '' : 's'}`;
              return (
                <li key={id} className="border border-gray-200 rounded-xl">
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex items-start flex-1 min-w-0 gap-3">
                      <span className="flex items-center justify-center w-10 h-10 text-gray-700 bg-gray-100 rounded-xl shrink-0">
                        <Truck className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 break-words">{group.hub.name}</p>
                        <p className="text-xs text-gray-500">
                          {[group.hub.city, group.hub.province].filter(Boolean).join(', ')}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
                          <span className="font-semibold">{word}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Waiting {waited(group.oldest_scanned_in_at)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : id)}
                        aria-expanded={isOpen}
                        className="inline-flex items-center gap-1 px-3 text-xs font-semibold text-gray-700 rounded-lg min-h-11 hover:bg-gray-100"
                      >
                        {isOpen ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                        Parcels
                      </button>
                      {confirming !== id && (
                        <button type="button" onClick={() => startConfirm(id)} className="px-4 text-sm font-semibold text-white rounded-xl min-h-11 bg-brand-red hover:bg-brand-red-dark">
                          {drivers.length > 0 ? 'Load on a truck' : 'Send'}
                        </button>
                      )}
                    </div>
                  </div>

                  {confirming === id && (
                    <div className="flex flex-col gap-3 px-3 pb-3 sm:flex-row sm:items-end">
                      {drivers.length > 0 && (
                        <label className="flex-1 min-w-0 text-xs font-semibold text-gray-700">
                          Truck driver
                          <select
                            value={driverId}
                            onChange={(e) => setDriverId(e.target.value === '' ? '' : Number(e.target.value))}
                            className="block w-full px-3 mt-1 text-sm font-normal text-gray-900 bg-white border border-gray-300 rounded-xl min-h-11 focus:border-gray-900 focus:outline-none"
                          >
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
                        <button
                          type="button"
                          disabled={sending || (drivers.length > 0 && driverId === '')}
                          onClick={() => void send(group)}
                          className="inline-flex items-center gap-1.5 px-4 text-sm font-semibold text-white rounded-xl min-h-11 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60"
                        >
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
          <h2 className="px-4 pt-4 text-sm font-bold text-gray-900">Trucks that left here</h2>
          <ul className="divide-y divide-gray-100">
            {outgoing.map((trip) => <TripRow key={trip.id} trip={trip} incoming={false} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
