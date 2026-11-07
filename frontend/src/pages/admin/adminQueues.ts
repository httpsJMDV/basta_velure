// Every queue that waits for Loved-IT, in the order the admin works them. The sidebar badges, the bell and the
// dashboard's work queue all read this one list, so they always agree (counts: GET /admin/nav-counts).
import { MessageSquare, ShieldAlert, ShoppingBag, Store, Truck, UserCheck, Wallet, Warehouse } from 'lucide-react';
import type { AdminNavCounts } from '../../api/navCounts';

export interface AdminQueue {
  key: keyof AdminNavCounts;
  icon: React.ElementType;
  /** Short name for the dashboard row. */
  title: string;
  /** "3 seller applications" in the bell: already singular or plural for the count. */
  label: string;
  detail: string;
  to: string;
  count: number;
}

const QUEUES: Array<Omit<AdminQueue, 'count' | 'label'> & { one: string; many: string }> = [
  { key: 'seller_applications', icon: Store, title: 'Seller applications', one: 'seller application', many: 'seller applications', detail: 'Shop documents to verify', to: '/admin/seller-applications' },
  { key: 'buyer_applications', icon: UserCheck, title: 'Buyer ID checks', one: 'buyer ID check', many: 'buyer ID checks', detail: 'Government IDs to review', to: '/admin/buyer-applications' },
  { key: 'products', icon: ShoppingBag, title: 'Products on hold', one: 'product on hold', many: 'products on hold', detail: 'Listings held for a check before buyers see them', to: '/admin/products' },
  { key: 'disputes', icon: ShieldAlert, title: 'Returns to decide', one: 'return to decide', many: 'returns to decide', detail: 'Escalated returns and refund reports', to: '/admin/disputes' },
  { key: 'payments', icon: Wallet, title: 'Payments to check', one: 'payment to check', many: 'payments to check', detail: 'GCash receipts and payout requests', to: '/admin/payments' },
  { key: 'courier_applications', icon: Truck, title: 'Courier applications', one: 'courier application', many: 'courier applications', detail: 'Companies asking to deliver', to: '/admin/courier-applications' },
  { key: 'hub_applications', icon: Warehouse, title: 'Hub applications', one: 'hub application', many: 'hub applications', detail: 'Their courier approves; you oversee', to: '/admin/sorting-center-applications' },
  { key: 'messages', icon: MessageSquare, title: 'Unread messages', one: 'unread message', many: 'unread messages', detail: 'From sellers and buyers', to: '/admin/messages' },
];

export function adminQueues(counts: AdminNavCounts | null): AdminQueue[] {
  return QUEUES.map(({ one, many, ...q }) => {
    const count = counts?.[q.key] ?? 0;
    return { ...q, count, label: count === 1 ? one : many };
  });
}
