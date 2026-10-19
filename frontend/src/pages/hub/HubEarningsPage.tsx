import { useCallback, useState } from 'react';
import { AlertCircle, CalendarDays, CalendarRange, Coins, PackageCheck, Wallet } from 'lucide-react';
import { getHubEarningsApi, getPayoutAccountApi, updatePayoutAccountApi } from '../../api/client';
import { PayoutAccountForm } from '../../components/payments/GcashKit';
import { useLivePolling } from '../../hooks/useLivePolling';
import type { HubEarningsSummary } from '../../types';
import { PageHeader, SectionHeader, StatCard, StatCardSkeleton } from './hubKit';

function peso(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const loadGcash = () => getPayoutAccountApi('hub');
const saveGcash = (p: { gcash_number: string | null; gcash_name: string | null }) => updatePayoutAccountApi('hub', p);

/** The hub's share of the delivery fee on every parcel it handled that was delivered. Read-only, and live. */
export default function HubEarningsPage() {
  const [data, setData] = useState<HubEarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getHubEarningsApi());
      setError(null);
    } catch {
      setError((prev) => prev ?? 'Earnings could not be loaded. Check your connection.');
    }
  }, []);
  const { lastUpdated } = useLivePolling(load, 30_000);

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        accent="emerald"
        updatedAt={lastUpdated}
        icon={Wallet}
        title="Earnings"
        subtitle={
          data
            ? `Your hub keeps ${data.split.hub_percent}% of the ${peso(data.delivery_fee)} delivery fee on every parcel it handles that is delivered. The riders get ${data.split.rider_percent}%: ${data.split.pickup_percent}% to the pickup rider, ${data.split.delivery_percent}% to the delivery rider.`
            : 'Your hub’s share of the delivery fee on delivered parcels.'
        }
       />

      {error && !data && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <section aria-label="Earnings summary" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {!data ? (
          [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard money icon={Coins} label="Today" value={Number(data.today.total)} subtext={`${data.today.deliveries_count} delivered`} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <StatCard money icon={CalendarDays} label="This week" value={Number(data.week.total)} subtext={`${data.week.deliveries_count} delivered`} iconBg="bg-blue-50" iconColor="text-blue-600" />
            <StatCard money icon={CalendarRange} label="This month" value={Number(data.month.total)} subtext={`${data.month.deliveries_count} delivered`} iconBg="bg-violet-50" iconColor="text-violet-600" />
            <StatCard money icon={Wallet} label="All time" value={Number(data.lifetime.total)} subtext={`${data.lifetime.deliveries_count} delivered`} iconBg="bg-amber-50" iconColor="text-amber-600" />
          </>
        )}
      </section>

      <section aria-label="How your hub is paid" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <div className="bg-white border border-gray-200/80 shadow-xs rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Not paid yet</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-gray-900 tabular-nums">{data ? peso(data.unpaid_total ?? '0') : '—'}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Your courier company pays your share by GCash and records the reference. Paid parcels are marked below.</p>
        </div>
        <PayoutAccountForm load={loadGcash} save={saveGcash} who="your courier" tone="gray" />
      </section>

      <section className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden" aria-label="Recent earnings">
        <div className="p-4 pb-2">
          <SectionHeader title="Recent deliveries" icon={PackageCheck} />
        </div>
        {data && data.recent.length === 0 ? (
          <div className="px-4 pb-8 pt-4 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <PackageCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-gray-900">No earnings yet</p>
            <p className="text-xs text-gray-500">Your share appears here as soon as a parcel your hub handled is delivered.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(data?.recent ?? []).map((row, i) => (
              <li key={`${row.tracking_number}-${i}`} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 items-center">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-gray-900 break-all">{row.tracking_number}</p>
                  <p className="text-[11px] text-gray-500">
                    {row.order_number && `Order ${row.order_number}`}
                    {row.rider_name && ` · Rider ${row.rider_name}`}
                    {row.earned_at && ` · ${formatDateTime(row.earned_at)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-700">+{peso(row.amount)}</p>
                  {row.delivery_fee && <p className="text-[11px] text-gray-400">of {peso(row.delivery_fee)} fee</p>}
                  {row.paid_at !== undefined && <p className={`text-[10px] font-bold uppercase tracking-wide ${row.paid_at ? 'text-gray-400' : 'text-amber-600'}`}>{row.paid_at ? 'Paid' : 'Unpaid'}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
