import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Package, Eye } from 'lucide-react';
import { HeroStats } from '../../components/logistics/CourierKit';
import type { LogisticsOutletContext } from './LogisticsLayout';
import { PageHero } from '../../components/admin/dashboardKit';
import CustomSelect from '../../components/ui/CustomSelect';
import TrackPackageButton from '../../components/tracking/TrackPackageButton';
import {
  FilterPanel, SearchField, StatusTabs, ListCard, ListEmpty, ListError, ListPager, Pill, SkeletonRows, TH, TD,
  useDebouncedSearch, relativeTime, type ListMeta, type PillTone,
} from '../../components/admin/listKit';
import { getLogisticsParcelsApi, getLogisticsHubsApi } from '../../api/client';
import CourierParcelPanel from '../../components/logistics/CourierParcelPanel';
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
  RETURN_TO_SENDER: ['Return to sender', 'red'],
  RETURNED: ['Returned to seller', 'gray'],
  LOST: ['Lost', 'red'],
  DAMAGED: ['Damaged', 'red'],
};

/** How far along the trip a parcel is: 1 ready, 2 picked up, 3 at the hub, 4 with the rider, 5 delivered. */
const STAGE: Record<string, number> = {
  READY_FOR_PICKUP: 1, PICKED_UP: 2, AT_SORTING_CENTER: 3, SORTED: 3, ASSIGNED_TO_RIDER: 4, OUT_FOR_DELIVERY: 4, DELIVERED: 5, DELIVERY_FAILED: 4,
};
const PROBLEM = new Set(['DELIVERY_FAILED', 'RETURN_TO_SENDER', 'RETURNED', 'LOST', 'DAMAGED']);

function StageBar({ status }: { status: string }) {
  const at = STAGE[status] ?? 0;
  const bad = PROBLEM.has(status);
  return (
    <span className="flex gap-0.5 mt-1.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1 w-5 rounded-full ${i <= at ? (bad ? 'bg-red-400' : at === 5 ? 'bg-emerald-500' : 'bg-brand-red') : 'bg-gray-200'}`} />
      ))}
    </span>
  );
}

/**
 * Any parcel in the courier's network, by tracking number, order number, order ID or buyer name (L6); "Problems" lists
 * failed, returning, returned, lost and damaged ones. A row opens the parcel with its timeline, audit trail and fixes.
 */
export default function LogisticsParcelsPage() {
  const { dashboard: d } = useOutletContext<LogisticsOutletContext>();
  const [params, setParams] = useSearchParams();
  const problems = params.get('problems') === '1';
  const search = params.get('search') ?? '';
  const hubId = params.get('hub') ?? '';
  const page = Number(params.get('page') ?? 1);

  const [rows, setRows] = useState<LogisticsParcelRow[] | null>(null);
  const [meta, setMeta] = useState<ListMeta>({ current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null });
  const [hubs, setHubs] = useState<LogisticsHubRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

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
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={Package} eyebrow="Operations" title="Parcels" subtitle="Find any parcel in your network and keep an eye on failed deliveries and returns">
        {d && (
          <HeroStats items={[
            { label: 'Awaiting pickup', value: d.parcels_now.awaiting_pickup },
            { label: 'At hubs', value: d.parcels_now.at_hubs },
            { label: 'Out for delivery', value: d.parcels_now.out_for_delivery, tone: 'good' },
            { label: 'Failed', value: d.parcels_now.failed, tone: d.parcels_now.failed ? 'bad' : 'default' },
          ]} />
        )}
      </PageHero>

      <FilterPanel>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <StatusTabs
            label="Which parcels"
            value={problems ? 'problems' : 'all'}
            onChange={(v) => set('problems', v === 'problems' ? '1' : '')}
            options={[{ value: 'all', label: 'All parcels' }, { value: 'problems', label: 'Problems' }]}
          />
          <div className="flex flex-col gap-2 sm:flex-row lg:w-[560px]">
            <SearchField value={searchInput} onChange={setSearchInput} label="Search parcels" placeholder="Tracking, order number or ID, buyer name…" />
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
                  <th scope="col" className={`${TH} hidden lg:table-cell text-right`}>Payment</th>
                  <th scope="col" className={`${TH} hidden xl:table-cell`}>Updated</th>
                  <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!rows && <SkeletonRows cols={7} />}
                {rows && rows.length === 0 && (
                  <tr><td colSpan={7}><ListEmpty icon={Package} title={problems ? 'No problem parcels' : 'No parcels yet'} hint={problems ? 'Nothing failed or returned. Nice.' : 'Parcels appear once buyers choose your courier.'} filtered={Boolean(search || hubId)} onClear={() => { setSearchInput(''); setParams(new URLSearchParams(problems ? { problems: '1' } : {})); }} /></td></tr>
                )}
                {rows?.map((p) => {
                  const [label, tone] = STATUS[p.status] ?? [p.status, 'gray' as PillTone];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => setOpen(p.id)}>
                      <td className={TD}>
                        <div className="flex items-center gap-2.5">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${PROBLEM.has(p.status) ? 'bg-red-50 text-red-600' : 'bg-rose-50 text-brand-red'}`}><Package className="w-4 h-4" aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <p className="font-mono font-semibold text-brand-black">{p.tracking_number}</p>
                            <p className="text-[11px] text-gray-400 font-mono">{p.order_number ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${TD} text-gray-700`}>{p.hub_name ?? <span className="text-gray-400">Not received yet</span>}</td>
                      <td className={`${TD} hidden md:table-cell text-gray-600`}>{p.barangay ?? '—'}</td>
                      <td className={TD}>
                        <Pill tone={tone}>{label}</Pill>
                        <StageBar status={p.status} />
                        {p.attempts > 0 && <p className="mt-1 text-[11px] text-gray-400">{p.attempts} attempt{p.attempts > 1 ? 's' : ''}</p>}
                      </td>
                      <td className={`${TD} hidden lg:table-cell text-right`}>
                        {p.cod_amount !== null
                          ? <><p className="tabular-nums font-semibold text-gray-900">₱{p.cod_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p><p className="text-[11px] text-gray-400">Cash on delivery</p></>
                          : <span className="text-[12px] text-gray-500">Prepaid</span>}
                      </td>
                      <td className={`${TD} hidden xl:table-cell text-[12px] text-gray-500 whitespace-nowrap`}>{relativeTime(p.updated_at)}</td>
                      <td className={`${TD} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => setOpen(p.id)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:border-brand-red hover:text-brand-red">
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Details
                          </button>
                          <TrackPackageButton trackingNumber={p.tracking_number} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPager meta={meta} perPage={30} perPageOptions={[30]} onPage={(n) => set('page', String(n))} onPerPage={() => {}} noun={['parcel', 'parcels']} />
        </ListCard>
      )}

      {open !== null && <CourierParcelPanel parcelId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
