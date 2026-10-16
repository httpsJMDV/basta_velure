import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import CustomSelect from '../../components/ui/CustomSelect';
import { FilterPanel, SearchField, StatusTabs, ListCard, ListEmpty, ListError, Avatar, Pill, SkeletonRows, TH, TD, type PillTone } from '../../components/admin/listKit';
import { getLogisticsRidersApi, getLogisticsHubsApi } from '../../api/client';
import type { LogisticsRiderRow, LogisticsHubRow, RiderStatus } from '../../types';

const TONE: Record<RiderStatus, PillTone> = { ACTIVE: 'emerald', PENDING: 'amber', DISAPPROVED: 'red' };
const LABEL: Record<RiderStatus, string> = { ACTIVE: 'Active', PENDING: 'Waiting for hub', DISAPPROVED: 'Not approved' };

/** Every rider in the network, read-only: each hub approves and manages its own riders. */
export default function LogisticsRidersPage() {
  const [riders, setRiders] = useState<LogisticsRiderRow[] | null>(null);
  const [hubs, setHubs] = useState<LogisticsHubRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<'' | RiderStatus>('');
  const [hubId, setHubId] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setFailed(false);
    getLogisticsRidersApi().then(setRiders).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); getLogisticsHubsApi({ status: 'APPROVED' }).then(setHubs).catch(() => {}); }, [load]);

  const count = (s: RiderStatus) => riders?.filter((r) => r.status === s).length ?? null;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (riders ?? []).filter((r) => (!status || r.status === status) && (!hubId || String(r.hub_id) === hubId)
      && (!q || r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q) || r.plate_number.toLowerCase().includes(q)));
  }, [riders, status, hubId, search]);

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Bike} eyebrow="Network" title="Riders" subtitle="Every courier delivering for your hubs. Hubs approve and manage their own riders." />

      <FilterPanel>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <StatusTabs
            label="Filter by rider status"
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: 'All', count: riders?.length ?? null },
              { value: 'ACTIVE', label: 'Active', count: count('ACTIVE') },
              { value: 'PENDING', label: 'Waiting for hub', count: count('PENDING') },
              { value: 'DISAPPROVED', label: 'Not approved', count: count('DISAPPROVED') },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row lg:w-[520px]">
            <SearchField value={search} onChange={setSearch} label="Search riders" placeholder="Search name, email or plate…" />
            <CustomSelect className="sm:w-48" value={hubId} onChange={setHubId}
              options={[{ value: '', label: 'All hubs' }, ...hubs.map((h) => ({ value: String(h.id), label: h.hub_name }))]} />
          </div>
        </div>
      </FilterPanel>

      {failed ? <ListError message="The riders could not be loaded." onRetry={load} /> : (
        <ListCard title="Riders" count={shown.length} busy={!riders}>
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Rider</th>
                  <th scope="col" className={TH}>Hub</th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>Vehicle</th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>Phone</th>
                  <th scope="col" className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!riders && <SkeletonRows cols={5} />}
                {riders && shown.length === 0 && (
                  <tr><td colSpan={5}><ListEmpty icon={Bike} title="No riders yet" hint="Riders apply to one of your hubs and appear here once they do." filtered={Boolean(search || status || hubId)} onClear={() => { setSearch(''); setStatus(''); setHubId(''); }} /></td></tr>
                )}
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className={TD}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={r.name} src={r.avatar_url} size="md" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate text-brand-black">{r.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} text-gray-700`}>{r.hub_name ?? '—'}</td>
                    <td className={`${TD} hidden md:table-cell text-gray-600`}>{r.vehicle_type} · <span className="font-mono text-[12px]">{r.plate_number}</span></td>
                    <td className={`${TD} hidden lg:table-cell text-gray-600 tabular-nums`}>{r.phone || '—'}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>
                        {r.account_status === 'suspended' && <Pill tone="red">Account suspended</Pill>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListCard>
      )}
    </div>
  );
}
