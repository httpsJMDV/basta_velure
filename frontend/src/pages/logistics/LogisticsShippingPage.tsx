import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPinned, Plus, Pencil, Trash2, X, History, Route as RouteIcon } from 'lucide-react';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { HeroStats } from '../../components/logistics/CourierKit';
import { StatusTabs, ListCard, ListEmpty, ListError, Pill, SkeletonRows, TH, TD, relativeTime } from '../../components/admin/listKit';
import { SidePanel, Dialog, BUTTON } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import {
  getShippingTableApi, createZoneApi, updateZoneApi, deleteZoneApi, upsertRateApi, deleteRateApi, getShippingAuditApi,
  type ShippingTable, type ShippingZoneRow, type ShippingRateRow, type ZoneArea,
} from '../../api/commerce';
import { PH_REGIONS } from '../../data/ph-regions';
import { apiProblem } from '../../utils/apiError';

type Tab = 'rates' | 'zones' | 'history';
type AuditRow = Awaited<ReturnType<typeof getShippingAuditApi>>[number];
type PsgcItem = { code: string; name: string };

const PSGC = 'https://psgc.gitlab.io/api';
const NCR = '130000000';
const LEVEL_LABEL: Record<ZoneArea['level'], string> = { region: 'Region', province: 'Province', city: 'City / municipality' };

const peso = (n: number) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const byName = (list: PsgcItem[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

/** The same rules the server applies (LOG-RATE-002): a number above ₱0 with at most 2 decimals. */
function feeError(value: string, what: string): string | null {
  const v = value.trim();
  if (!v) return `Enter the fee for ${what}.`;
  if (!/^-?\d*\.?\d+$/.test(v)) return 'Enter the fee as a number, like 50 or 49.50.';
  if (Number(v) <= 0) return 'The fee must be more than ₱0.';
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'The fee can have at most 2 decimal places.';
  if (Number(v) > 100000) return 'The fee can be at most ₱100,000.';
  return null;
}

/**
 * The courier's delivery zones and the rate for every route between them (A20, LOG-RATE). Checkout prices a parcel
 * from the shop's pickup zone to the buyer's zone: the first kilogram, plus each extra whole kilogram. A changed
 * rate applies to new checkouts only; placed orders keep the fee they were quoted. An address outside every zone
 * cannot be checked out.
 */
export default function LogisticsShippingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['rates', 'zones', 'history'] as Tab[]).find((t) => t === params.get('tab')) ?? 'rates';
  const { showToast } = useToast();

  const [table, setTable] = useState<ShippingTable | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingRate, setEditingRate] = useState<{ origin: ShippingZoneRow; destination: ShippingZoneRow; rate: ShippingRateRow | null } | null>(null);
  const [editingZone, setEditingZone] = useState<ShippingZoneRow | 'new' | null>(null);
  const [deletingZone, setDeletingZone] = useState<ShippingZoneRow | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getShippingTableApi().then(setTable).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rateFor = useMemo(() => {
    const map = new Map<string, ShippingRateRow>();
    for (const r of table?.rates ?? []) map.set(`${r.origin_zone_id}-${r.destination_zone_id}`, r);
    return (o: number, d: number) => map.get(`${o}-${d}`) ?? null;
  }, [table]);

  const zones = table?.zones ?? [];
  const routes = zones.length * zones.length;
  const offered = table?.rates.length ?? 0;

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={MapPinned} eyebrow="Network" title="Delivery zones & rates"
        subtitle="Where you deliver and what each route costs. Checkout uses these rates; a change applies to new checkouts only.">
        {table && (
          <HeroStats items={[
            { label: 'Delivery zones', value: zones.length },
            { label: 'Routes priced', value: `${offered}/${routes}`, tone: offered < routes ? 'warn' : 'good' },
          ]} />
        )}
        <button type="button" className={HERO_BUTTON} onClick={() => setEditingZone('new')}>
          <Plus className="w-4 h-4" /> Add zone
        </button>
      </PageHero>

      <StatusTabs<Tab>
        label="Section"
        value={tab}
        onChange={(t) => setParams(t === 'rates' ? {} : { tab: t }, { replace: true })}
        options={[
          { value: 'rates', label: 'Rates' },
          { value: 'zones', label: 'Zones', count: table ? zones.length : null },
          { value: 'history', label: 'Change history' },
        ]}
      />

      {failed ? (
        <ListError message="The delivery zones could not be loaded." onRetry={load} />
      ) : tab === 'rates' ? (
        <RateMatrix table={table} rateFor={rateFor} onEdit={(origin, destination) => setEditingRate({ origin, destination, rate: rateFor(origin.id, destination.id) })} onAddZone={() => setEditingZone('new')} />
      ) : tab === 'zones' ? (
        <ZoneList table={table} onEdit={setEditingZone} onDelete={setDeletingZone} onAdd={() => setEditingZone('new')} />
      ) : (
        <ChangeHistory />
      )}

      {editingRate && (
        <RateDialog
          {...editingRate}
          onClose={() => setEditingRate(null)}
          onSaved={(t, message) => { setTable(t); setEditingRate(null); showToast(message); }}
        />
      )}
      {editingZone && (
        <ZonePanel
          zone={editingZone === 'new' ? null : editingZone}
          onClose={() => setEditingZone(null)}
          onSaved={(t, message) => { setTable(t); setEditingZone(null); showToast(message); }}
        />
      )}
      {deletingZone && (
        <DeleteZoneDialog
          zone={deletingZone}
          rateCount={(table?.rates ?? []).filter((r) => r.origin_zone_id === deletingZone.id || r.destination_zone_id === deletingZone.id).length}
          onClose={() => setDeletingZone(null)}
          onDeleted={(t, message) => { setTable(t); setDeletingZone(null); showToast(message); }}
        />
      )}
    </div>
  );
}

// ─── Rates: origin zones down, destination zones across ──────────────────────

function RateMatrix({ table, rateFor, onEdit, onAddZone }: {
  table: ShippingTable | null;
  rateFor: (o: number, d: number) => ShippingRateRow | null;
  onEdit: (origin: ShippingZoneRow, destination: ShippingZoneRow) => void;
  onAddZone: () => void;
}) {
  if (!table) {
    return <ListCard title="Rate table"><table className="w-full"><tbody><SkeletonRows cols={5} rows={4} /></tbody></table></ListCard>;
  }
  if (table.zones.length === 0) {
    return (
      <ListCard title="Rate table">
        <ListEmpty icon={MapPinned} title="No delivery zones yet" hint="Add a zone for each area you deliver to, then price the routes between them." />
        <div className="flex justify-center pb-6"><button type="button" className={BUTTON.primary} onClick={onAddZone}>Add your first zone</button></div>
      </ListCard>
    );
  }

  return (
    <ListCard title="Rate table">
      <p className="px-4 pt-3 text-[12px] text-gray-500">
        Each cell is the fee for the first kilogram, then each extra kilogram. Weight is rounded up to whole kilograms. Click a cell to change it.
      </p>
      <div className="p-4 overflow-x-auto">
        <table className="min-w-full text-[12.5px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-white">From ↓ &nbsp;To →</th>
              {table.zones.map((d) => (
                <th key={d.id} className="px-3 py-2 text-left text-[11px] font-bold text-gray-800 whitespace-nowrap">{d.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.zones.map((o) => (
              <tr key={o.id}>
                <th scope="row" className="sticky left-0 z-10 px-3 py-2 text-left text-[11px] font-bold text-gray-800 bg-white whitespace-nowrap border-t border-gray-100">{o.name}</th>
                {table.zones.map((d) => {
                  const r = rateFor(o.id, d.id);
                  return (
                    <td key={d.id} className="p-1 border-t border-gray-100">
                      <button type="button" onClick={() => onEdit(o, d)}
                        aria-label={r ? `${o.name} to ${d.name}: ${peso(r.first_kg)} first kilogram, ${peso(r.additional_kg)} each extra. Change` : `${o.name} to ${d.name}: not offered. Add a rate`}
                        className={`w-full min-w-[118px] text-left px-3 py-2 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
                          r ? 'bg-white border-gray-200 hover:border-brand-red/60 hover:bg-red-50/30' : 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-500'}`}>
                        {r ? (
                          <>
                            <span className="block font-bold text-gray-900 tabular-nums">{peso(r.first_kg)}</span>
                            <span className="block text-[11px] text-gray-500 tabular-nums">+ {peso(r.additional_kg)} / kg</span>
                          </>
                        ) : (
                          <>
                            <span className="block font-semibold text-gray-400">Not offered</span>
                            <span className="block text-[11px] text-gray-400">Add a rate</span>
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ListCard>
  );
}

function RateDialog({ origin, destination, rate, onClose, onSaved }: {
  origin: ShippingZoneRow;
  destination: ShippingZoneRow;
  rate: ShippingRateRow | null;
  onClose: () => void;
  onSaved: (t: ShippingTable, message: string) => void;
}) {
  const [first, setFirst] = useState(rate ? String(rate.first_kg) : '');
  const [extra, setExtra] = useState(rate ? String(rate.additional_kg) : '');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [server, setServer] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const clearServer = (key: string) => setServer((s) => { const next = { ...s }; delete next[key]; return next; });

  const firstErr = feeError(first, 'the first kilogram');
  const extraErr = feeError(extra, 'each additional kilogram');
  const shownFirst = server.first_kg ?? (touched ? firstErr : null);
  const shownExtra = server.additional_kg ?? (touched ? extraErr : null);
  const example = !firstErr && !extraErr ? Number(first) + 2 * Number(extra) : null;

  async function save() {
    setTouched(true);
    if (firstErr || extraErr) return;
    setBusy('save'); setServer({}); setError('');
    try {
      const res = await upsertRateApi({ origin_zone_id: origin.id, destination_zone_id: destination.id, first_kg: first.trim(), additional_kg: extra.trim(), ...(reason.trim() ? { reason: reason.trim() } : {}) });
      onSaved(res.data, res.message);
    } catch (e) {
      const p = apiProblem(e, 'The rate was not saved. Try again.');
      setServer(p.fields); setError(Object.keys(p.fields).some((k) => k === 'first_kg' || k === 'additional_kg') ? '' : p.message);
    } finally { setBusy(null); }
  }

  async function remove() {
    if (!rate) return;
    setBusy('remove'); setError('');
    try {
      const res = await deleteRateApi(rate.id);
      onSaved(res.data, res.message);
    } catch (e) {
      setError(apiProblem(e, 'The rate was not removed. Try again.').message);
    } finally { setBusy(null); }
  }

  const input = (bad: string | null) => `w-full h-11 pl-7 pr-3 text-[14px] tabular-nums border rounded-xl outline-none focus:ring-2 focus:ring-brand-red/10 ${bad ? 'border-red-400 focus:border-red-500' : 'border-stone-300 focus:border-brand-red'}`;

  return (
    <Dialog open onClose={onClose} title={`${origin.name} → ${destination.name}`}
      footer={(
        <>
          {rate && <button type="button" className={`${BUTTON.quiet} mr-auto text-red-700 hover:text-red-800`} onClick={remove} disabled={!!busy}>{busy === 'remove' ? 'Removing…' : 'Stop offering this route'}</button>}
          <button type="button" className={BUTTON.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={BUTTON.primary} onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : rate ? 'Save rate' : 'Add rate'}</button>
        </>
      )}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[12px] font-semibold text-stone-700">
            First kilogram
            <span className="relative block mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[14px]">₱</span>
              <input inputMode="decimal" value={first} onChange={(e) => { setFirst(e.target.value); clearServer('first_kg'); }} onBlur={() => setTouched(true)} className={input(shownFirst)} aria-invalid={!!shownFirst} placeholder="50.00" autoFocus />
            </span>
            {shownFirst && <span className="block mt-1 text-[11.5px] font-medium text-red-700">{shownFirst}</span>}
          </label>
          <label className="block text-[12px] font-semibold text-stone-700">
            Each extra kilogram
            <span className="relative block mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[14px]">₱</span>
              <input inputMode="decimal" value={extra} onChange={(e) => { setExtra(e.target.value); clearServer('additional_kg'); }} onBlur={() => setTouched(true)} className={input(shownExtra)} aria-invalid={!!shownExtra} placeholder="15.00" />
            </span>
            {shownExtra && <span className="block mt-1 text-[11.5px] font-medium text-red-700">{shownExtra}</span>}
          </label>
        </div>
        {rate && (
          <label className="block text-[12px] font-semibold text-stone-700">
            Reason for the change <span className="font-normal text-stone-400">(optional, kept in the history)</span>
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="For example: fuel price adjustment" className="w-full h-10 mt-1 px-3 text-[13px] border border-stone-300 rounded-xl outline-none focus:border-brand-red" />
          </label>
        )}
        <p className="rounded-xl bg-stone-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-stone-600">
          {example !== null
            ? <>A 2.4 kg parcel is charged as 3 kg: {peso(Number(first))} + 2 × {peso(Number(extra))} = <b className="text-stone-900">{peso(example)}</b>.</>
            : 'Weight is rounded up to whole kilograms, with a minimum of 1 kg.'}
          {rate ? ' Orders already placed keep the fee they were quoted.' : ''}
        </p>
        {error && <p role="alert" className="text-[12px] font-medium text-red-700">{error}</p>}
      </form>
    </Dialog>
  );
}

// ─── Zones ────────────────────────────────────────────────────────────────────

function ZoneList({ table, onEdit, onDelete, onAdd }: {
  table: ShippingTable | null;
  onEdit: (z: ShippingZoneRow) => void;
  onDelete: (z: ShippingZoneRow) => void;
  onAdd: () => void;
}) {
  if (!table) return <ListCard title="Zones"><table className="w-full"><tbody><SkeletonRows cols={3} rows={4} /></tbody></table></ListCard>;
  if (table.zones.length === 0) {
    return (
      <ListCard title="Zones">
        <ListEmpty icon={MapPinned} title="No delivery zones yet" hint="A zone is a group of regions, provinces or cities priced the same way." />
        <div className="flex justify-center pb-6"><button type="button" className={BUTTON.primary} onClick={onAdd}>Add your first zone</button></div>
      </ListCard>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {table.zones.map((z) => {
        const included = z.areas.filter((a) => !a.excluded);
        const excluded = z.areas.filter((a) => a.excluded);
        const priced = table.rates.filter((r) => r.origin_zone_id === z.id || r.destination_zone_id === z.id).length;
        return (
          <article key={z.id} className="p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
            <header className="flex items-start gap-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-50 text-brand-red shrink-0"><RouteIcon className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-bold text-gray-900 truncate">{z.name}</h3>
                <p className="text-[11.5px] text-gray-500">{included.length} area{included.length === 1 ? '' : 's'} · {priced} priced route{priced === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => onEdit(z)} className="flex items-center justify-center w-8 h-8 text-gray-500 rounded-lg hover:bg-gray-100" aria-label={`Edit ${z.name}`}><Pencil className="w-4 h-4" /></button>
              <button type="button" onClick={() => onDelete(z)} className="flex items-center justify-center w-8 h-8 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${z.name}`}><Trash2 className="w-4 h-4" /></button>
            </header>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {included.map((a) => (
                <span key={`${a.level}-${a.psgc_code}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[11.5px] font-medium text-gray-700">
                  {a.name}<span className="text-[10px] text-gray-400">{a.level === 'region' ? 'region' : a.level === 'province' ? 'prov.' : 'city'}</span>
                </span>
              ))}
            </div>
            {excluded.length > 0 && (
              <p className="mt-2 text-[11.5px] text-gray-500">
                Except {excluded.map((a) => a.name).join(', ')}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ZonePanel({ zone, onClose, onSaved }: { zone: ShippingZoneRow | null; onClose: () => void; onSaved: (t: ShippingTable, message: string) => void }) {
  const [name, setName] = useState(zone?.name ?? '');
  const [areas, setAreas] = useState<ZoneArea[]>(zone?.areas.map(({ level, psgc_code, name: n, excluded }) => ({ level, psgc_code, name: n, excluded })) ?? []);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The area being picked.
  const [level, setLevel] = useState<ZoneArea['level']>('region');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [exclude, setExclude] = useState(false);
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [loading, setLoading] = useState<'province' | 'city' | null>(null);
  const [pickError, setPickError] = useState('');
  const isNcr = region === NCR;

  // Each pick clears the levels below it; a slow answer for an earlier pick is ignored.
  const request = useRef(0);
  function fetchList(url: string, kind: 'province' | 'city') {
    const id = ++request.current;
    setLoading(kind);
    fetch(url).then((r) => r.json()).then((d: PsgcItem[]) => {
      if (id !== request.current) return;
      if (kind === 'province') setProvinces(byName(d)); else setCities(byName(d));
    }).catch(() => {}).finally(() => { if (id === request.current) setLoading(null); });
  }
  function pickRegion(code: string) {
    setRegion(code); setProvince(''); setCity(''); setProvinces([]); setCities([]); setPickError('');
    if (!code) { request.current++; setLoading(null); return; }
    if (code === NCR) fetchList(`${PSGC}/regions/${NCR}/cities-municipalities/`, 'city');
    else fetchList(`${PSGC}/regions/${code}/provinces/`, 'province');
  }
  function pickProvince(code: string) {
    setProvince(code); setCity(''); setCities([]); setPickError('');
    if (!code) { request.current++; setLoading(null); return; }
    fetchList(`${PSGC}/provinces/${code}/cities-municipalities/`, 'city');
  }

  function addArea() {
    setPickError('');
    let pick: ZoneArea | null = null;
    if (level === 'region' && region) {
      const r = PH_REGIONS.find((x) => x.code === region);
      pick = { level, psgc_code: region, name: r?.short ?? region, excluded: exclude };
    } else if (level === 'province' && province) {
      pick = { level, psgc_code: province, name: provinces.find((p) => p.code === province)?.name ?? province, excluded: exclude };
    } else if (level === 'city' && city) {
      pick = { level, psgc_code: city, name: cities.find((c) => c.code === city)?.name ?? city, excluded: exclude };
    }
    if (!pick) { setPickError(`Choose a ${LEVEL_LABEL[level].toLowerCase()} first.`); return; }
    if (areas.some((a) => a.level === pick!.level && a.psgc_code === pick!.psgc_code)) { setPickError(`${pick.name} is already in this zone.`); return; }
    setAreas((list) => [...list, pick!]);
    setErrors((e) => ({ ...e, areas: '' }));
    setExclude(false);
  }

  async function save() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Name the zone (at least 2 characters).';
    if (!areas.some((a) => !a.excluded)) next.areas = 'Add at least one region, province or city to the zone.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const payload = { name: name.trim(), areas };
      const res = zone ? await updateZoneApi(zone.id, payload) : await createZoneApi(payload);
      onSaved(res.data, res.message);
    } catch (e) {
      const p = apiProblem(e, 'The zone was not saved. Try again.');
      const fieldErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.fields)) fieldErrors[k.startsWith('areas') ? 'areas' : k === 'name' ? 'name' : 'form'] = v;
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: p.message });
    } finally { setBusy(false); }
  }

  const select = 'w-full h-10 px-3 text-[13px] bg-white border border-stone-300 rounded-xl outline-none focus:border-brand-red disabled:bg-stone-50 disabled:text-stone-400';

  return (
    <SidePanel open onClose={onClose} title={zone ? `Edit ${zone.name}` : 'New delivery zone'}
      subtitle="A buyer's address matches the most specific area first: city, then province, then region."
      footer={(
        <div className="flex items-center justify-end gap-2">
          {errors.form && <p role="alert" className="mr-auto text-[12px] font-medium text-red-700">{errors.form}</p>}
          <button type="button" className={BUTTON.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={BUTTON.primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : zone ? 'Save zone' : 'Add zone'}</button>
        </div>
      )}>
      <div className="space-y-5">
        <label className="block text-[12px] font-semibold text-stone-700">
          Zone name
          <input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: '' })); }} placeholder="For example: Batanes"
            className={`w-full h-11 mt-1 px-3 text-[14px] border rounded-xl outline-none ${errors.name ? 'border-red-400' : 'border-stone-300 focus:border-brand-red'}`} aria-invalid={!!errors.name} />
          {errors.name && <span className="block mt-1 text-[11.5px] font-medium text-red-700">{errors.name}</span>}
        </label>

        <section>
          <h3 className="text-[12px] font-semibold text-stone-700">Areas in this zone</h3>
          {areas.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-stone-300 px-3.5 py-3 text-[12.5px] text-stone-500">No areas yet. Pick one below.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100 border border-stone-200 rounded-xl">
              {areas.map((a) => (
                <li key={`${a.level}-${a.psgc_code}`} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[13px] font-semibold truncate ${a.excluded ? 'text-stone-500 line-through decoration-stone-400' : 'text-stone-900'}`}>{a.name}</span>
                    <span className="block text-[11px] text-stone-400">{LEVEL_LABEL[a.level]}</span>
                  </span>
                  {a.excluded && <Pill tone="gray">Excluded</Pill>}
                  <button type="button" onClick={() => setAreas((list) => list.filter((x) => x !== a))} className="flex items-center justify-center w-8 h-8 text-stone-400 rounded-lg hover:bg-stone-100 hover:text-stone-700" aria-label={`Remove ${a.name}`}><X className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {errors.areas && <p className="mt-1 text-[11.5px] font-medium text-red-700">{errors.areas}</p>}
        </section>

        <section className="p-3.5 space-y-3 rounded-2xl bg-stone-50 border border-stone-200">
          <h3 className="text-[12px] font-semibold text-stone-700">Add an area</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Area level">
            {(['region', 'province', 'city'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => { setLevel(l); setPickError(''); }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${level === l ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'}`}>
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
          <select value={region} onChange={(e) => pickRegion(e.target.value)} className={select} aria-label="Region">
            <option value="">Select region</option>
            {PH_REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
          {level !== 'region' && !isNcr && (
            <select value={province} onChange={(e) => pickProvince(e.target.value)} className={select} disabled={!region || loading === 'province'} aria-label="Province">
              <option value="">{loading === 'province' ? 'Loading provinces…' : 'Select province'}</option>
              {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          )}
          {level === 'province' && isNcr && (
            <p className="text-[12px] text-stone-500">Metro Manila has no provinces. Add the whole region, or its cities.</p>
          )}
          {level === 'city' && (
            <select value={city} onChange={(e) => setCity(e.target.value)} className={select} disabled={(!isNcr && !province) || loading === 'city'} aria-label="City or municipality">
              <option value="">{loading === 'city' ? 'Loading cities…' : 'Select city or municipality'}</option>
              {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          )}
          <label className="flex items-start gap-2 text-[12.5px] text-stone-700">
            <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} className="mt-0.5 accent-brand-red" />
            <span>Leave this area out of the zone <span className="block text-[11.5px] text-stone-500">For example, Luzon except Batanes.</span></span>
          </label>
          {pickError && <p className="text-[11.5px] font-medium text-red-700">{pickError}</p>}
          <button type="button" onClick={addArea} className={BUTTON.dark}>
            <span className="inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> {exclude ? 'Add as excluded' : 'Add area'}</span>
          </button>
        </section>
      </div>
    </SidePanel>
  );
}

function DeleteZoneDialog({ zone, rateCount, onClose, onDeleted }: { zone: ShippingZoneRow; rateCount: number; onClose: () => void; onDeleted: (t: ShippingTable, message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try {
      const res = await deleteZoneApi(zone.id);
      onDeleted(res.data, res.message);
    } catch (e) {
      setError(apiProblem(e, 'The zone was not deleted. Try again.').message);
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} title={`Delete ${zone.name}?`}
      footer={(
        <>
          <button type="button" className={BUTTON.ghost} onClick={onClose}>Keep zone</button>
          <button type="button" className={BUTTON.danger} onClick={confirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete zone'}</button>
        </>
      )}>
      <p className="text-[13px] leading-relaxed text-stone-600">
        {rateCount > 0 ? `Its ${rateCount} rate${rateCount === 1 ? '' : 's'} go${rateCount === 1 ? 'es' : ''} with it. ` : ''}
        Buyers in these areas cannot check out with you unless another zone covers them. Orders already placed are not affected.
      </p>
      {error && <p role="alert" className="mt-2 text-[12px] font-medium text-red-700">{error}</p>}
    </Dialog>
  );
}

// ─── Change history ───────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  'shipping.rate_added': 'Rate added',
  'shipping.rate_changed': 'Rate changed',
  'shipping.rate_removed': 'Route stopped',
  'shipping.zone_created': 'Zone added',
  'shipping.zone_updated': 'Zone edited',
  'shipping.zone_deleted': 'Zone deleted',
};

function fee(v: Record<string, unknown> | null) {
  if (!v || v.first_kg === undefined) return null;
  return `${peso(Number(v.first_kg))} + ${peso(Number(v.additional_kg))}/kg`;
}

function ChangeHistory() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { setFailed(false); getShippingAuditApi().then(setRows).catch(() => setFailed(true)); }, []);
  useEffect(() => { load(); }, [load]);

  if (failed) return <ListError message="The change history could not be loaded." onRetry={load} />;

  return (
    <ListCard title="Change history" count={rows?.length}>
      {rows && rows.length === 0 ? (
        <ListEmpty icon={History} title="No changes yet" hint="Every rate and zone change is recorded here, with who made it." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr><th className={TH}>Change</th><th className={TH}>Details</th><th className={TH}>By</th><th className={TH}>When</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {!rows ? <SkeletonRows cols={4} rows={5} /> : rows.map((r) => {
                const before = fee(r.old);
                const after = fee(r.new);
                const subject = (r.new?.route ?? r.old?.route ?? r.new?.name ?? r.old?.name) as string | undefined;
                return (
                  <tr key={r.id}>
                    <td className={`${TD} whitespace-nowrap`}><Pill tone={r.action.endsWith('removed') || r.action.endsWith('deleted') ? 'red' : r.action.endsWith('changed') || r.action.endsWith('updated') ? 'amber' : 'emerald'}>{ACTION_LABEL[r.action] ?? r.action}</Pill></td>
                    <td className={TD}>
                      {subject && <span className="block font-semibold text-gray-900">{subject}</span>}
                      {(before || after) && (
                        <span className="block text-gray-600 tabular-nums">
                          {before && after ? <>{before} <span className="text-gray-400">→</span> <b className="text-gray-900">{after}</b></> : after ?? before}
                        </span>
                      )}
                      {r.reason && <span className="block text-[11.5px] text-gray-500">“{r.reason}”</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-gray-700`}>{r.by ?? '—'}</td>
                    <td className={`${TD} whitespace-nowrap text-gray-500`} title={r.at ? new Date(r.at).toLocaleString('en-PH') : undefined}>{relativeTime(r.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ListCard>
  );
}
