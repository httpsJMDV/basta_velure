import { useCallback, useState } from 'react';
import { AlertCircle, CalendarDays, CalendarRange, Coins, PackageCheck, Wallet } from 'lucide-react';
import { getHubEarningsApi } from '../../api/client';
import { useLivePolling } from '../../hooks/useLivePolling';
import type { HubEarningsSummary } from '../../types';
import { LiveStamp, PageHero, SectionHeader, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';

function peso(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

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
      <PageHero
        icon={Wallet}
        eyebrow="Insights"
        title="Earnings"
        subtitle={
          data
            ? `Your hub keeps ${data.split.hub_percent}% of the ${peso(data.delivery_fee)} delivery fee on every parcel it handles that is delivered. The rider gets ${data.split.rider_percent}%.`
            : 'Your hub’s share of the delivery fee on delivered parcels.'
        }
      >
        <LiveStamp updatedAt={lastUpdated} />
      </PageHero>

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
            <StatCard compact money icon={Coins} label="Today" value={Number(data.today.total)} subtext={`${data.today.deliveries_count} delivered`} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <StatCard compact money icon={CalendarDays} label="This week" value={Number(data.week.total)} subtext={`${data.week.deliveries_count} delivered`} iconBg="bg-blue-50" iconColor="text-blue-600" />
            <StatCard compact money icon={CalendarRange} label="This month" value={Number(data.month.total)} subtext={`${data.month.deliveries_count} delivered`} iconBg="bg-violet-50" iconColor="text-violet-600" />
            <StatCard compact money icon={Wallet} label="All time" value={Number(data.lifetime.total)} subtext={`${data.lifetime.deliveries_count} delivered`} iconBg="bg-amber-50" iconColor="text-amber-600" />
          </>
        )}
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
