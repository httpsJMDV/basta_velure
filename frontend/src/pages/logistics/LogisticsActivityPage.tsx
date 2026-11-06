import { History } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import ActivityLog from '../../components/logistics/ActivityLog';

/** The network's activity log: every parcel step across the hubs, and every decision the team made. */
export default function LogisticsActivityPage() {
  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={History} eyebrow="Insights" title="Activity log"
        subtitle="Pickups, hub scans, truck trips, deliveries, failed attempts, returns, cancellations and team decisions across your network." />
      <ActivityLog scope="logistics" emptyHint="Nothing has happened in your network yet." />
    </div>
  );
}
