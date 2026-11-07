import { History } from 'lucide-react';
import { PageHero } from './RiderUi';
import ActivityLog from '../../components/logistics/ActivityLog';

/** What this rider did, and what the hub or courier decided about the account. */
export default function RiderActivityPage() {
  return (
    <div className="pb-4 space-y-4">
      <PageHero icon={History} title="Activity" subtitle="Your pickups, deliveries, failed attempts, returns and trips, and changes to your account." />
      <ActivityLog scope="rider" emptyHint="Your pickups, deliveries and trips show here." />
    </div>
  );
}
