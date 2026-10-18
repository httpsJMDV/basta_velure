import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, ArrowDownToLine, Shuffle, ArrowUpFromLine, CheckCircle2, AlertTriangle, XCircle, MapPinned } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListCard, ListError, relativeTime } from '../../components/admin/listKit';
import CustomSelect from '../../components/ui/CustomSelect';
import {
  getHubOpsApi, getHubZonesApi, scanInboundApi, scanSortApi, scanOutboundApi, getDispatchRidersApi,
  type HubOpsParcel, type DispatchRider,
} from '../../api/courierOps';
import { apiProblem } from '../../utils/apiError';

type Station = 'inbound' | 'sort' | 'outbound';
type LogLine = { id: number; tracking: string; tone: 'ok' | 'warn' | 'bad'; text: string; at: Date };

const STATIONS: { key: Station; title: string; hint: string; icon: typeof ArrowDownToLine }[] = [
  { key: 'inbound', title: 'Inbound', hint: 'A rider brings a picked-up parcel in: it becomes At Hub.', icon: ArrowDownToLine },
  { key: 'sort', title: 'Sort', hint: 'Puts the parcel in its delivery zone\'s list.', icon: Shuffle },
  { key: 'outbound', title: 'Outbound', hint: 'Hands a sorted parcel to a delivery rider.', icon: ArrowUpFromLine },
];

/**
 * Scanning at the company's hubs (L5). Each station takes a tracking number from a scanner or the keyboard. Scans only
 * work in order (Inbound, Sort, Outbound), each once, and only on the company's own parcels: anything else is refused
 * with the reason and nothing changes.
 */
export default function LogisticsHubOpsPage() {
  const [hubs, setHubs] = useState<{ id: number; name: string }[]>([]);
  const [counts, setCounts] = useState<{ incoming: number; at_hub: number; sorted: number; outbound: number } | null>(null);
  const [hubId, setHubId] = useState('');
  const [board, setBoard] = useState<{ to_sort: HubOpsParcel[]; zones: { zone: string; parcels: HubOpsParcel[] }[] } | null>(null);
  const [riders, setRiders] = useState<DispatchRider[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getHubOpsApi(), getHubZonesApi()])
      .then(([ops, zones]) => {
        setHubs(ops.hubs);
        setCounts(ops.counts);
        setBoard(zones);
        setHubId((h) => h || (ops.hubs.length === 1 ? String(ops.hubs[0].id) : h));
      })
      .catch(() => setFailed(true));
    getDispatchRidersApi().then((r) => setRiders(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={ScanLine} eyebrow="Network" title="Hub scanning" subtitle="Inbound, sort by zone and outbound, in that order. A repeat or a foreign tracking number changes nothing.">
        {counts && (
          <span className="text-[11px] text-white/70 tabular-nums">
            <b className="text-white">{counts.incoming}</b> on the way in · <b className="text-white">{counts.at_hub}</b> to sort · <b className="text-white">{counts.sorted}</b> sorted · {counts.outbound} out
          </span>
        )}
      </PageHero>

      {failed && <ListError message="The hub could not be loaded." onRetry={load} />}

      {hubs.length > 1 && (
        <div className="flex items-center gap-2 bg-white border border-gray-200/80 rounded-2xl px-4 py-2.5 shadow-xs">
          <span className="text-[12px] font-semibold text-gray-600">Scanning at</span>
          <CustomSelect className="w-64" value={hubId} onChange={setHubId} options={[{ value: '', label: 'The parcel\'s own hub' }, ...hubs.map((h) => ({ value: String(h.id), label: h.name }))]} />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {STATIONS.map((s) => (
          <ScanStation key={s.key} station={s} hubId={hubId ? Number(hubId) : undefined} riders={riders} onScanned={load} />
        ))}
      </div>

      <ListCard title="Zones">
        {!board ? <div className="h-32 m-4 rounded-xl bg-gray-100 animate-pulse" /> : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            <ZoneColumn title="To sort" tone="amber" parcels={board.to_sort} empty="Nothing waiting to be sorted." />
            {board.zones.map((z) => <ZoneColumn key={z.zone} title={z.zone} tone="gray" parcels={z.parcels} empty="" />)}
            {board.zones.length === 0 && (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 p-4 text-[12.5px] text-gray-500">
                <MapPinned className="w-4 h-4" /> Sorted parcels show here, one list per delivery zone.
              </p>
            )}
          </div>
        )}
      </ListCard>
    </div>
  );
}

function ZoneColumn({ title, tone, parcels, empty }: { title: string; tone: 'amber' | 'gray'; parcels: HubOpsParcel[]; empty: string }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/50">
      <header className={`flex items-center justify-between px-3 py-2 border-b border-gray-200 ${tone === 'amber' ? 'text-amber-800' : 'text-gray-800'}`}>
        <h3 className="text-[12px] font-bold uppercase tracking-wide">{title}</h3>
        <span className="text-[11px] font-semibold tabular-nums">{parcels.length}</span>
      </header>
      {parcels.length === 0 ? <p className="px-3 py-3 text-[12px] text-gray-400">{empty || 'Empty.'}</p> : (
        <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100">
          {parcels.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
              <span className="font-mono font-semibold text-gray-900">{p.tracking_number}</span>
              <span className="text-gray-500 truncate">{p.barangay ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScanStation({ station, hubId, riders, onScanned }: {
  station: (typeof STATIONS)[number];
  hubId?: number;
  riders: DispatchRider[];
  onScanned: () => void;
}) {
  const [value, setValue] = useState('');
  const [rider, setRider] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const Icon = station.icon;

  const scan = async () => {
    const tracking = value.trim().toUpperCase();
    if (!tracking || busy) return;
    if (station.key === 'outbound' && !rider) {
      setLog((l) => [{ id: ++seq.current, tracking, tone: 'bad' as const, text: 'Choose the delivery rider first.', at: new Date() }, ...l].slice(0, 8));
      return;
    }
    setBusy(true);
    try {
      const res = station.key === 'inbound' ? await scanInboundApi(tracking, hubId)
        : station.key === 'sort' ? await scanSortApi(tracking)
        : await scanOutboundApi(tracking, Number(rider));
      setLog((l) => [{ id: ++seq.current, tracking, tone: 'ok' as const, text: res.message, at: new Date() }, ...l].slice(0, 8));
      onScanned();
    } catch (e) {
      const p = apiProblem(e, 'The scan did not go through.');
      setLog((l) => [{ id: ++seq.current, tracking, tone: p.status === 409 ? 'warn' as const : 'bad' as const, text: p.message, at: new Date() }, ...l].slice(0, 8));
    } finally {
      setBusy(false);
      setValue('');
      input.current?.focus();
    }
  };

  return (
    <section className="bg-white border border-gray-200/80 rounded-2xl shadow-xs p-4 space-y-3">
      <header className="flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-50 text-brand-red shrink-0"><Icon className="w-4 h-4" /></span>
        <div>
          <h2 className="text-[13px] font-bold text-gray-900">{station.title}</h2>
          <p className="text-[11.5px] text-gray-500">{station.hint}</p>
        </div>
      </header>
      {station.key === 'outbound' && (
        <CustomSelect value={rider} onChange={setRider}
          options={[{ value: '', label: riders.length ? 'Choose the delivery rider' : 'No rider can take a job' }, ...riders.map((r) => ({ value: String(r.id), label: `${r.name} · ${r.active_jobs} jobs` }))]} />
      )}
      <form onSubmit={(e) => { e.preventDefault(); void scan(); }} className="flex gap-2">
        <label className="sr-only" htmlFor={`scan-${station.key}`}>{station.title} tracking number</label>
        <input id={`scan-${station.key}`} ref={input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Scan or type the tracking number"
          autoComplete="off" spellCheck={false}
          className="flex-1 h-11 px-3 font-mono text-[13px] uppercase border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10" />
        <button type="submit" disabled={busy || !value.trim()} className="h-11 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[12px] font-bold disabled:opacity-40">
          {busy ? '…' : 'Scan'}
        </button>
      </form>
      <ul className="space-y-1.5 min-h-[3rem]" aria-live="polite">
        {log.length === 0 && <li className="text-[11.5px] text-gray-400">Scans appear here.</li>}
        {log.map((line) => (
          <li key={line.id} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${line.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : line.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-900'}`}>
            {line.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : line.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span className="min-w-0">
              <span className="font-mono font-semibold">{line.tracking}</span> · {line.text}
              <span className="block text-[10.5px] opacity-60">{relativeTime(line.at.toISOString())}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
