import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Copy, MapPinned, Plane, Ship, Warehouse } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListEmpty, ListError, SearchField, SkeletonRows, StatusTabs, TH, TD, useDebouncedSearch } from '../../components/admin/listKit';
import { HeroStats, Panel } from '../../components/logistics/CourierKit';
import { getCourierCoverageApi, getCourierCoverageHubsApi } from '../../api/client';
import type { CoverageHubRow, CoverageRegion, CoverageSummary } from '../../types';

type Show = 'all' | 'no_riders' | 'gateways';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const num = (n: number) => n.toLocaleString('en-PH');

/** How much of a region the hubs cover (dark) and how many of its hubs can deliver, i.e. have a rider (red). */
function RegionRow({ region, active, onPick }: { region: CoverageRegion; active: boolean; onPick: () => void }) {
  const covered = pct(region.barangays_covered, region.barangays);
  const staffed = pct(region.hubs_with_riders, region.hubs);

  return (
    <li>
      <button type="button" onClick={onPick} aria-pressed={active}
        className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left rounded-xl transition-colors ${active ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold truncate">{region.short}</span>
          <span className={`block text-[11px] truncate ${active ? 'text-white/60' : 'text-gray-500'}`}>
            {region.gateway ? `Gateway ${region.gateway.city}` : 'No gateway yet'}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[13px] font-black tabular-nums">{num(region.hubs)}</span>
          <span className={`block text-[11px] ${active ? 'text-white/60' : 'text-gray-500'}`}>hubs</span>
        </span>
        <span className="col-span-2 grid grid-cols-[1fr_auto] items-center gap-2 text-[10.5px]">
          <span className={`h-1.5 rounded-full overflow-hidden ${active ? 'bg-white/15' : 'bg-gray-100'}`} aria-hidden="true">
            <span className={`block h-full rounded-full ${active ? 'bg-white' : 'bg-gray-800'}`} style={{ width: `${covered}%` }} />
          </span>
          <span className={`tabular-nums ${active ? 'text-white/70' : 'text-gray-500'}`}>{covered}% of barangays</span>
          <span className={`h-1.5 rounded-full overflow-hidden ${active ? 'bg-white/15' : 'bg-gray-100'}`} aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-red" style={{ width: `${staffed}%` }} />
          </span>
          <span className={`tabular-nums ${active ? 'text-white/70' : 'text-gray-500'}`}>{num(region.hubs_with_riders)} with riders</span>
        </span>
      </button>
    </li>
  );
}

/** The three island gateways and how parcels cross between them. */
function CrossingStrip({ islands }: { islands: CoverageSummary['islands'] }) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {islands.map((island, i) => (
        <div key={island.key} className="contents">
          <div className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl bg-white">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-gray-400">{island.name}</p>
            <p className="text-[13px] font-bold text-gray-900 truncate">{island.gateway ? island.gateway.city : 'No island gateway'}</p>
            <p className="text-[11px] text-gray-500 truncate">{island.gateway?.name ?? 'Parcels cannot cross to or from here yet'}</p>
          </div>
          {i < islands.length - 1 && (
            <div className="flex items-center justify-center gap-1.5 text-sky-700 sm:flex-col sm:px-1" aria-label="By ship or plane">
              <span className="flex items-center gap-1"><Ship className="w-3.5 h-3.5" aria-hidden="true" /><Plane className="w-3.5 h-3.5" aria-hidden="true" /></span>
              <span className="text-[10px] font-semibold whitespace-nowrap">sea or air</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CopyApplyLink({ hubId }: { hubId: number }) {
  const [done, setDone] = useState(false);
  const url = `${window.location.origin}/register/rider?hub=${hubId}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <button type="button" onClick={() => void copy()} title={url}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11.5px] font-semibold text-gray-700 hover:border-gray-400 whitespace-nowrap">
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      {done ? 'Copied' : 'Rider sign-up link'}
    </button>
  );
}

/**
 * Coverage: where the courier delivers, island by island and region by region. A hub covers its barangays; it can
 * only deliver once it has riders, so hubs without one are easy to find (and share a sign-up link for).
 */
export default function LogisticsCoveragePage() {
  const [params, setParams] = useSearchParams();
  const region = params.get('region') ?? '';
  const province = params.get('province') ?? '';
  const show = (params.get('show') ?? 'all') as Show;
  const search = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;

  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [hubs, setHubs] = useState<CoverageHubRow[] | null>(null);
  const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);

  const set = useCallback((next: Record<string, string>) => {
    setParams((p) => {
      const out = new URLSearchParams(p);
      for (const [k, v] of Object.entries(next)) { if (v) out.set(k, v); else out.delete(k); }
      if (!('page' in next)) out.delete('page');
      return out;
    }, { replace: true });
  }, [setParams]);
  const [input, setInput] = useDebouncedSearch(search, (v) => set({ q: v }));

  const loadSummary = useCallback(() => {
    setFailed(false);
    getCourierCoverageApi(region || undefined).then(setSummary).catch(() => setFailed(true));
  }, [region]);
  useEffect(() => {
    const first = setTimeout(loadSummary, 0);
    return () => clearTimeout(first);
  }, [loadSummary]);

  useEffect(() => {
    let live = true;
    const first = setTimeout(() => {
      setHubs(null);
      getCourierCoverageHubsApi({ region: region || undefined, province: province || undefined, search: search || undefined, show, page })
        .then((r) => { if (live) { setHubs(r.data); setMeta(r.meta); } })
        .catch(() => { if (live) setHubs([]); });
    }, 0);
    return () => { live = false; clearTimeout(first); };
  }, [region, province, search, show, page]);

  const regions = useMemo(() => summary?.islands.flatMap((i) => i.regions) ?? [], [summary]);
  const picked = regions.find((r) => r.code === region) ?? null;
  const t = summary?.totals;

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={MapPinned} eyebrow="Network" title="Coverage"
        subtitle="Where you deliver: your hubs in every city and town, the gateways that link them, and the hubs still without riders.">
        {t && (
          <HeroStats items={[
            { label: 'Hubs', value: t.hubs },
            { label: 'Barangays covered', value: `${pct(t.barangays_covered, t.barangays)}%` },
            { label: 'Riders', value: t.riders },
            { label: 'Hubs with no rider', value: t.hubs - t.hubs_with_riders, tone: t.hubs - t.hubs_with_riders > 0 ? 'warn' : 'good' },
          ]} />
        )}
      </PageHero>

      {failed ? <ListError message="The coverage could not be loaded." onRetry={loadSummary} /> : (
        <>
          <Panel icon={Ship} title="Between islands" subtitle="Each island group has one gateway. Parcels for another island group gather there and cross by ship, or by plane when they are urgent.">
            <div className="p-4">{summary ? <CrossingStrip islands={summary.islands} /> : <div className="h-16 rounded-xl bg-gray-100 animate-pulse" />}</div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            {(summary?.islands ?? [null, null, null]).map((island, i) => (
              <Panel key={island?.key ?? i} title={island ? island.name : '…'}
                subtitle={island ? `${island.regions.length} regions · ${num(island.regions.reduce((n, r) => n + r.hubs, 0))} hubs` : undefined}>
                {!island ? <div className="p-4 space-y-2">{[1, 2, 3, 4].map((k) => <div key={k} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}</div> : (
                  <ul className="p-2 space-y-0.5">
                    {island.regions.map((r) => (
                      <RegionRow key={r.code} region={r} active={r.code === region}
                        onPick={() => set({ region: r.code === region ? '' : r.code, province: '' })} />
                    ))}
                  </ul>
                )}
              </Panel>
            ))}
          </div>

          {picked && summary?.region && (
            <Panel icon={MapPinned} title={summary.region.name}
              subtitle={`${num(picked.hubs)} hubs · ${num(picked.barangays_covered)} of ${num(picked.barangays)} barangays · ${num(picked.riders)} riders${picked.gateway ? ` · gateway ${picked.gateway.name}` : ''}`}
              actions={<button type="button" onClick={() => set({ region: '', province: '' })} className="text-xs font-semibold text-gray-600 underline underline-offset-2">All regions</button>}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className={TH}>{picked.code === '130000000' ? 'City' : 'Province'}</th>
                      <th className={`${TH} text-right`}>Cities and towns</th>
                      <th className={`${TH} text-right`}>Hubs</th>
                      <th className={`${TH} text-right`}>With riders</th>
                      <th className={`${TH} text-right`}>Riders</th>
                      <th className={TH}><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summary.region.provinces.map((p) => (
                      <tr key={p.code} className={p.code === province ? 'bg-red-50/50' : undefined}>
                        <td className={`${TD} font-semibold text-gray-900`}>{p.name}</td>
                        <td className={`${TD} text-right tabular-nums text-gray-600`}>{p.cities}</td>
                        <td className={`${TD} text-right tabular-nums`}>{p.hubs}</td>
                        <td className={`${TD} text-right tabular-nums ${p.hubs_with_riders < p.hubs ? 'text-amber-700 font-semibold' : 'text-gray-700'}`}>{p.hubs_with_riders}</td>
                        <td className={`${TD} text-right tabular-nums`}>{p.riders}</td>
                        <td className={`${TD} text-right`}>
                          <button type="button" onClick={() => set({ province: p.code === province ? '' : p.code })}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-red hover:underline">
                            {p.code === province ? 'Showing' : 'Hubs'} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel icon={Warehouse} title="Hubs"
            subtitle={[picked?.short, summary?.region?.provinces.find((p) => p.code === province)?.name].filter(Boolean).join(' · ') || 'Every region'}
            actions={(
              <StatusTabs<Show> label="Show" value={show} onChange={(v) => set({ show: v === 'all' ? '' : v })} options={[
                { value: 'all', label: 'All' },
                { value: 'gateways', label: 'Gateways' },
                { value: 'no_riders', label: 'No rider yet' },
              ]} />
            )}>
            <div className="p-3 border-b border-gray-100">
              <SearchField value={input} onChange={setInput} label="Search hubs" placeholder="Search a hub, city or province" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className={TH}>Hub</th>
                    <th className={TH}>Place</th>
                    <th className={`${TH} text-right`}>Barangays</th>
                    <th className={`${TH} text-right`}>Riders</th>
                    <th className={`${TH} text-right`}>Parcels here</th>
                    <th className={TH}><span className="sr-only">Sign-up link</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {!hubs && <SkeletonRows cols={6} rows={6} />}
                  {hubs && hubs.length === 0 && (
                    <tr><td colSpan={6}><ListEmpty icon={Warehouse} title={show === 'no_riders' ? 'Every hub here has a rider' : 'No hub matches'} hint="Try another region, or clear the search." /></td></tr>
                  )}
                  {hubs?.map((h) => (
                    <tr key={h.id}>
                      <td className={`${TD} min-w-[220px]`}>
                        <p className="font-semibold text-gray-900">{h.name}</p>
                        {h.gateway && <p className="text-[11px] font-semibold text-indigo-700">{h.gateway}</p>}
                      </td>
                      <td className={`${TD} text-gray-600 whitespace-nowrap`}>{h.city}<span className="block text-[11px] text-gray-400">{h.province} · {h.region}</span></td>
                      <td className={`${TD} text-right tabular-nums`}>{h.barangays}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold ${h.riders === 0 ? 'text-amber-700' : 'text-gray-900'}`}>{h.riders === 0 ? 'None' : h.riders}</td>
                      <td className={`${TD} text-right tabular-nums`}>{h.parcels_here || '—'}</td>
                      <td className={`${TD} text-right`}>{h.riders === 0 && <CopyApplyLink hubId={h.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta && meta.last_page > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-600">
                <span className="tabular-nums">Page {meta.current_page} of {meta.last_page} · {num(meta.total)} hubs</span>
                <span className="flex gap-2">
                  <button type="button" disabled={meta.current_page <= 1} onClick={() => set({ page: String(meta.current_page - 1) })}
                    className="h-8 px-3 rounded-lg border border-gray-200 font-semibold disabled:opacity-40">Previous</button>
                  <button type="button" disabled={meta.current_page >= meta.last_page} onClick={() => set({ page: String(meta.current_page + 1) })}
                    className="h-8 px-3 rounded-lg border border-gray-200 font-semibold disabled:opacity-40">Next</button>
                </span>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
