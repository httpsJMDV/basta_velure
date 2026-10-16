import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import CustomSelect from '../../components/ui/CustomSelect';
import TrackPackageButton from '../../components/tracking/TrackPackageButton';
import {
  FilterPanel, SearchField, StatusTabs, ListCard, ListEmpty, ListError, ListPager, Pill, SkeletonRows, TH, TD,
  useDebouncedSearch, type ListMeta, type PillTone,
} from '../../components/admin/listKit';
import { getLogisticsParcelsApi, getLogisticsHubsApi } from '../../api/client';
import type { LogisticsParcelRow, LogisticsHubRow } from '../../types';

const STATUS: Record<string, [string, PillTone]> = {
  READY_FOR_PICKUP: ['Ready for pickup', 'blue'],
  PICKED_UP: ['Picked up', 'blue'],
  AT_SORTING_CENTER: ['At hub', 'violet'],
  SORTED: ['Sorted', 'violet'],
  ASSIGNED_TO_RIDER: ['With rider', 'amber'],
  OUT_FOR_DELIVERY: ['Out for delivery', 'amber'],
  DELIVERED: ['Delivered', 'emerald'],
  DELIVERY_FAILED: ['Delivery failed', 'red'],
  RETURNED: ['Returned', 'gray'],
};

/** Any parcel in the courier's network, by tracking or order number; "Problems" lists failed and returned ones. */
export default function LogisticsParcelsPage() {
  const [params, setParams] = useSearchParams();
  const problems = params.get('problems') === '1';
  const search = params.get('search') ?? '';
  const hubId = params.get('hub') ?? '';
  const page = Number(params.get('page') ?? 1);

  const [rows, setRows] = useState<LogisticsParcelRow[] | null>(null);
  const [meta, setMeta] = useState<ListMeta>({ current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null });
  const [hubs, setHubs] = useState<LogisticsHubRow[]>([]);
  const [failed, setFailed] = useState(false);

  const set = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }, [params, setParams]);

  const [searchInput, setSearchInput] = useDebouncedSearch(search, (v) => set('search', v));

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    getLogisticsParcelsApi({ search: search || undefined, problems: problems ? 1 : undefined, hub_id: hubId ? Number(hubId) : undefined, page })
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .catch(() => setFailed(true));
  }, [search, problems, hubId, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getLogisticsHubsApi({ status: 'APPROVED' }).then(setHubs).catch(() => {}); }, []);

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Package} eyebrow="Network" title="Parcels" subtitle="Find any parcel in your network and keep an eye on failed deliveries and returns" />

      <FilterPanel>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <StatusTabs
            label="Which parcels"
            value={problems ? 'problems' : 'all'}
            onChange={(v) => set('problems', v === 'problems' ? '1' : '')}
            options={[{ value: 'all', label: 'All parcels' }, { value: 'problems', label: 'Problems' }]}
          />
          <div className="flex flex-col gap-2 sm:flex-row lg:w-[560px]">
            <SearchField value={searchInput} onChange={setSearchInput} label="Search parcels" placeholder="Tracking or order number…" />
            <CustomSelect className="sm:w-48" value={hubId} onChange={(v) => set('hub', v)}
              options={[{ value: '', label: 'All hubs' }, ...hubs.map((h) => ({ value: String(h.id), label: h.hub_name }))]} />
          </div>
        </div>
      </FilterPanel>

      {failed ? <ListError message="The parcels could not be loaded." onRetry={load} /> : (
        <ListCard title={problems ? 'Failed and returned' : 'Parcels'} count={meta.total} busy={!rows}>
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Parcel</th>
                  <th scope="col" className={TH}>Hub</th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>Destination</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} hidden lg:table-cell text-right`}>COD</th>
                  <th scope="col" className={`${TH} text-right`}><span className="sr-only">Track</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!rows && <SkeletonRows cols={6} />}
                {rows && rows.length === 0 && (
                  <tr><td colSpan={6}><ListEmpty icon={Package} title={problems ? 'No problem parcels' : 'No parcels yet'} hint={problems ? 'Nothing failed or returned. Nice.' : 'Parcels appear once buyers choose your courier.'} filtered={Boolean(search || hubId)} onClear={() => { setSearchInput(''); setParams(new URLSearchParams(problems ? { problems: '1' } : {})); }} /></td></tr>
                )}
                {rows?.map((p) => {
                  const [label, tone] = STATUS[p.status] ?? [p.status, 'gray' as PillTone];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className={TD}>
                        <p className="font-mono font-semibold text-brand-black">{p.tracking_number}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{p.order_number ?? '—'}</p>
                      </td>
                      <td className={`${TD} text-gray-700`}>{p.hub_name ?? <span className="text-gray-400">Not received yet</span>}</td>
                      <td className={`${TD} hidden md:table-cell text-gray-600`}>{p.barangay ?? '—'}</td>
                      <td className={TD}>
                        <Pill tone={tone}>{label}</Pill>
                        {p.attempts > 0 && <p className="mt-1 text-[11px] text-gray-400">{p.attempts} attempt{p.attempts > 1 ? 's' : ''}</p>}
                      </td>
                      <td className={`${TD} hidden lg:table-cell text-right tabular-nums text-gray-800`}>{p.cod_amount !== null ? `₱${p.cod_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td className={`${TD} text-right`}><TrackPackageButton trackingNumber={p.tracking_number} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPager meta={meta} perPage={30} perPageOptions={[30]} onPage={(n) => set('page', String(n))} onPerPage={() => {}} noun={['parcel', 'parcels']} />
        </ListCard>
      )}
    </div>
  );
}
