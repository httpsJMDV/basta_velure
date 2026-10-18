import { Ticket } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import VoucherManager from '../../components/vouchers/VoucherManager';

/** Loved-IT's platform and shipping vouchers (A8: funded by Loved-IT, never from a shop's earnings). */
export default function AdminVouchersPage() {
  return (
    <div className="space-y-4 w-full pb-8">
      <PageHero icon={Ticket} eyebrow="Commerce" title="Platform vouchers" subtitle="Platform vouchers for the whole order and shipping vouchers, claimable or by code." />
      <VoucherManager admin />
    </div>
  );
}
