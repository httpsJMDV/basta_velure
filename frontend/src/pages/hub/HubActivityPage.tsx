import { History } from 'lucide-react';
import { PageHeader } from './hubKit';
import ActivityLog from '../../components/logistics/ActivityLog';

/** Everything that happened at this hub: scans, sorting, transfers, deliveries, failed attempts, returns and decisions. */
export default function HubActivityPage() {
  return (
    <div className="pb-8 space-y-4">
      <PageHeader
        icon={History}
        title="Activity log"
        subtitle="Every scan, transfer, delivery, failed attempt, return and cancellation of your parcels, and who did it."
      />
      <ActivityLog scope="hub" emptyHint="Nothing has happened at this hub yet. Scans, transfers and deliveries show here." />
    </div>
  );
}
