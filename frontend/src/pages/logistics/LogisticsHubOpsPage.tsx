import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScanLine, ArrowDownToLine, Shuffle, ArrowUpFromLine, CheckCircle2, AlertTriangle, XCircle, Inbox, Bike, Store, MapPin, Loader2, History,
} from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListError, relativeTime } from '../../components/admin/listKit';
import CustomSelect from '../../components/ui/CustomSelect';
import TrackingScanner from '../../components/logistics/TrackingScanner';
import { HeroStats, Panel, RiderAvailabilityStrip, useRiderAvailability } from '../../components/logistics/CourierKit';
import {
  getHubOpsApi, getHubZonesApi, scanInboundApi, scanSortApi, scanOutboundApi, type HubOpsParcel, type HubBoard,
} from '../../api/courierOps';
import { apiProblem } from '../../utils/apiError';

type Station = 'inbound' | 'sort' | 'outbound';
type LogLine = { id: number; station: Station; tracking: string; tone: 'ok' | 'warn' | 'bad'; text: string; at: Date };

const STATIONS: { key: Station; title: string; verb: string; hint: string; icon: typeof ArrowDownToLine }[] = [
  { key: 'inbound', title: 'Inbound', verb: 'Receive', hint: 'A rider brings a picked-up parcel in. It becomes At the hub.', icon: ArrowDownToLine },
  { key: 'sort', title: 'Sort', verb: 'Sort', hint: 'Puts a received parcel in its delivery zone.', icon: Shuffle },
  { key: 'outbound', title: 'Outbound', verb: 'Hand over', hint: 'Hands a sorted parcel to a delivery rider.', icon: ArrowUpFromLine },
];

const TONE_STYLE = {
  ok: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  warn: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  bad: { box: 'border-red-200 bg-red-50 text-red-900', icon: XCircle },
} as const;

/**
 * Scanning at the company's hubs (L5): Inbound, Sort by zone and Outbound, in that order, each once, and only on the
 * company's own parcels (anything else is refused with the reason and nothing changes). Scan with the camera, a
 * barcode scanner or the keyboard, or act on a parcel straight from the list of what is waiting at the station.
 */
export default function LogisticsHubOpsPage() {
  const [station, setStation] = useState<Station>('inbound');
  const [hubs, setHubs] = useState<{ id: number; name: string }[]>([]);
  const [counts, setCounts] = useState<{ incoming: number; at_hub: number; sorted: number; outbound: number } | null>(null);
  const [hubId, setHubId] = useState('');
  const [board, setBoard] = useState<HubBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [riderId, setRiderId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const seq = useRef(0);
  const { riders, reload: reloadRiders } = useRiderAvailability();

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getHubOpsApi(), getHubZonesApi(hubId ? Number(hubId) : undefined)])
      .then(([ops, zones]) => {
        setHubs(ops.hubs);
        setCounts(ops.counts);
        setBoard(zones);
      })
      .catch(() => setFailed(true));
  }, [hubId]);
  useEffect(() => { load(); }, [load]);

  // A rider who stops being available drops out of the choice.
  useEffect(() => {
    if (riderId && riders && !riders.available.some((r) => String(r.id) === riderId)) setRiderId('');
  }, [riders, riderId]);

  const scan = useCallback(async (code: string, at: Station = station) => {
    const tracking = code.trim().toUpperCase();
    if (!tracking || busy) return;
    const add = (tone: LogLine['tone'], text: string) =>
      setLog((l) => [{ id: ++seq.current, station: at, tracking, tone, text, at: new Date() }, ...l].slice(0, 12));
    if (at === 'outbound' && !riderId) {
      add('bad', 'Choose the delivery rider first.');
      return;
    }
    setBusy(tracking);
    try {
      const res = at === 'inbound' ? await scanInboundApi(tracking, hubId ? Number(hubId) : undefined)
        : at === 'sort' ? await scanSortApi(tracking)
          : await scanOutboundApi(tracking, Number(riderId));
      add('ok', res.message);
      load();
      if (at === 'outbound') reloadRiders();
    } catch (e) {
      const p = apiProblem(e, 'The scan did not go through.');
      add(p.status === 409 ? 'warn' : 'bad', p.message);
    } finally {
      setBusy(null);
    }
  }, [station, busy, riderId, hubId, load, reloadRiders]);

  const queue: HubOpsParcel[] = useMemo(() => {
    if (!board) return [];
    if (station === 'inbound') return board.incoming;
    if (station === 'sort') return board.to_sort;
    return board.zones.flatMap((z) => z.parcels);
  }, [board, station]);

  const waiting: Record<Station, number | null> = {
    inbound: board ? board.incoming.length : null,
    sort: board ? board.to_sort.length : null,
    outbound: board ? board.zones.reduce((n, z) => n + z.parcels.length, 0) : null,
  };
  const current = STATIONS.find((s) => s.key === station)!;
  const last = log.find((l) => l.station === station);
  const stationLog = log.filter((l) => l.station === station);

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={ScanLine} eyebrow="Operations" title="Hub scanning"
        subtitle="Inbound, then sort by zone, then outbound to a rider. A repeat or a foreign tracking number changes nothing.">
        {counts && (
          <HeroStats items={[
            { label: 'On the way in', value: counts.incoming },
            { label: 'To sort', value: counts.at_hub, tone: counts.at_hub ? 'warn' : 'default' },
            { label: 'Sorted', value: counts.sorted },
            { label: 'With riders', value: counts.outbound, tone: 'good' },
          ]} />
        )}
      </PageHero>

      {failed && <ListError message="The hub could not be loaded." onRetry={load} />}

      {/* The three stations, in the order a parcel goes through them */}
      <div role="tablist" aria-label="Station" className="grid gap-2 sm:grid-cols-3">
        {STATIONS.map((s, i) => {
          const on = station === s.key;
          return (
            <button key={s.key} type="button" role="tab" aria-selected={on} onClick={() => setStation(s.key)}
              className={`group relative flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${on ? 'border-brand-red bg-white ring-2 ring-brand-red/15 shadow-sm' : 'border-gray-200/80 bg-white hover:border-gray-300'}`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-brand-red text-white' : 'bg-rose-50 text-brand-red'}`}>
                <s.icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Step {i + 1}</span>
                <span className="block text-[14px] font-black text-gray-900">{s.title}</span>
              </span>
              <span className={`min-w-[2rem] text-center rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${waiting[s.key] ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                {waiting[s.key] ?? '…'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
        {/* The scanner */}
        <Panel icon={current.icon} title={`${current.title} scanner`} subtitle={current.hint} className="xl:sticky xl:top-20" bodyClassName="p-4 space-y-4">
          {station === 'inbound' && hubs.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-gray-700">Receiving at</label>
              <CustomSelect value={hubId} onChange={setHubId}
                options={[{ value: '', label: 'The parcel\'s own hub' }, ...hubs.map((h) => ({ value: String(h.id), label: h.name }))]} />
            </div>
          )}
          {station === 'outbound' && (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-gray-700">Delivery rider</label>
              <CustomSelect value={riderId} onChange={setRiderId}
                options={[
                  { value: '', label: riders?.available.length ? 'Choose the rider taking the parcels' : 'No rider can take a job right now' },
                  ...(riders?.available ?? []).map((r) => ({ value: String(r.id), label: `${r.name} · ${r.active_jobs}/${riders?.max ?? 3} jobs` })),
                ]} />
              <RiderAvailabilityStrip riders={riders} />
            </div>
          )}

          <TrackingScanner onScan={(code) => void scan(code)} disabled={busy !== null} label={`${current.title}: tracking number`} autoFocus />

          {busy && (
            <p className="flex items-center gap-2 text-[12.5px] text-gray-500" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Scanning {busy}…</p>
          )}
          {!busy && last && (() => {
            const t = TONE_STYLE[last.tone];
            return (
              <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${t.box}`}>
                <t.icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-bold">{last.tracking}</p>
                  <p className="text-[13px]">{last.text}</p>
                </div>
              </div>
            );
          })()}

          {stationLog.length > 1 && (
            <div>
              <p className="flex items-center gap-1.5 mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-400"><History className="w-3.5 h-3.5" aria-hidden="true" /> Earlier scans</p>
              <ul className="space-y-1">
                {stationLog.slice(1).map((line) => {
                  const t = TONE_STYLE[line.tone];
                  return (
                    <li key={line.id} className="flex items-start gap-2 text-[12px] text-gray-600">
                      <t.icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${line.tone === 'ok' ? 'text-emerald-600' : line.tone === 'warn' ? 'text-amber-600' : 'text-red-600'}`} aria-hidden="true" />
                      <span className="min-w-0"><span className="font-mono font-semibold text-gray-800">{line.tracking}</span> · {line.text}
                        <span className="text-gray-400"> · {relativeTime(line.at.toISOString())}</span></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>

        {/* What is waiting at this station */}
        <Panel
          icon={Inbox}
          title={station === 'inbound' ? 'On the way in' : station === 'sort' ? 'At the hub, to sort' : 'Sorted, ready to go out'}
          subtitle={station === 'inbound' ? 'Picked up from shops; receive each one as it arrives.' : station === 'sort' ? 'Received; sort each into its delivery zone.' : 'By delivery zone; choose the rider, then hand each over.'}
          actions={hubs.length > 1 && station !== 'inbound' ? (
            <CustomSelect className="w-56" value={hubId} onChange={setHubId}
              options={[{ value: '', label: 'Every hub' }, ...hubs.map((h) => ({ value: String(h.id), label: h.name }))]} />
          ) : undefined}
        >
          {!board ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center"><current.icon className="w-5 h-5 text-gray-300" aria-hidden="true" /></span>
              <p className="text-[14px] font-bold text-gray-800">{station === 'inbound' ? 'Nothing on the way in' : station === 'sort' ? 'Nothing to sort' : 'Nothing ready to go out'}</p>
              <p className="max-w-sm text-[12.5px] text-gray-500">
                {station === 'inbound' ? 'Parcels show here once a rider picks them up from a shop.' : station === 'sort' ? 'Received parcels wait here until they are sorted.' : 'Sorted parcels wait here, by zone, for a delivery rider.'}
              </p>
            </div>
          ) : station === 'outbound' ? (
            <div className="divide-y divide-gray-100">
              {board.zones.map((z) => (
                <section key={z.zone}>
                  <h3 className="sticky top-0 z-[1] flex items-center justify-between px-4 py-1.5 bg-gray-50/95 backdrop-blur border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {z.zone}</span>
                    <span className="tabular-nums">{z.parcels.length}</span>
                  </h3>
                  <ul className="divide-y divide-gray-50">
                    {z.parcels.map((p) => <QueueRow key={p.id} p={p} station={station} busy={busy} disabled={!riderId} disabledHint="Choose the delivery rider first" onAct={() => void scan(p.tracking_number, 'outbound')} />)}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {queue.map((p) => <QueueRow key={p.id} p={p} station={station} busy={busy} onAct={() => void scan(p.tracking_number, station)} />)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function QueueRow({ p, station, busy, disabled, disabledHint, onAct }: {
  p: HubOpsParcel; station: Station; busy: string | null; disabled?: boolean; disabledHint?: string; onAct: () => void;
}) {
  const verb = STATIONS.find((s) => s.key === station)!.verb;
  const since = station === 'inbound' ? p.picked_up_at : station === 'sort' ? p.scanned_in_at : p.sorted_at;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13px] font-bold text-gray-900">{p.tracking_number}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-gray-500">
          {p.shop && <span className="inline-flex items-center gap-1"><Store className="w-3 h-3" aria-hidden="true" />{p.shop}</span>}
          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />{[p.barangay, p.city].filter(Boolean).join(', ') || '—'}</span>
          {station === 'inbound' && p.rider && <span className="inline-flex items-center gap-1"><Bike className="w-3 h-3" aria-hidden="true" />{p.rider}</span>}
          {since && <span>{relativeTime(since)}</span>}
        </p>
      </div>
      <button type="button" onClick={onAct} disabled={busy !== null || disabled} title={disabled ? disabledHint : undefined}
        className="min-h-9 px-3.5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
        {busy === p.tracking_number ? 'Working…' : verb}
      </button>
    </li>
  );
}
