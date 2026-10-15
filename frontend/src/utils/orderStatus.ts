import {
  Clock, CheckCircle2, Package, PackageCheck, Truck, Warehouse, ListChecks, Bike, Navigation,
  PackageOpen, BadgeCheck, AlertTriangle, Undo2, XCircle, ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminOrderGroupKey, OrderStatus } from '../types';

export interface OrderStatusMeta {
  label: string;
  shortLabel: string;
  badgeCls: string;
  description: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  PLACED: {
    label: 'Order Placed',
    shortLabel: 'Placed',
    badgeCls: 'bg-amber-50 text-amber-700 border border-amber-200',
    description: 'Order placed by customer, pending payment verification / seller confirmation.',
  },
  CONFIRMED: {
    label: 'Order Confirmed',
    shortLabel: 'Confirmed',
    badgeCls: 'bg-blue-50 text-blue-700 border border-blue-200',
    description: 'Payment verified and order confirmed by seller.',
  },
  PREPARING: {
    label: 'Preparing Package',
    shortLabel: 'Preparing',
    badgeCls: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    description: 'Seller is actively picking, packing, and boxing the items.',
  },
  READY_FOR_PICKUP: {
    label: 'Ready for Pickup',
    shortLabel: 'Ready for Pickup',
    badgeCls: 'bg-violet-50 text-violet-700 border border-violet-200',
    description: 'Package packed and ready for first-mile rider pickup.',
  },
  PICKED_UP: {
    label: 'Picked Up by Rider',
    shortLabel: 'Picked Up',
    badgeCls: 'bg-purple-50 text-purple-700 border border-purple-200',
    description: 'First-mile rider picked up package from seller.',
  },
  AT_SORTING_CENTER: {
    label: 'At Sorting Center',
    shortLabel: 'At Hub',
    badgeCls: 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200',
    description: 'Received and checked into the logistics sorting hub.',
  },
  SORTED: {
    label: 'Sorted for Dispatch',
    shortLabel: 'Sorted',
    badgeCls: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
    description: 'Sorted to destination route and ready for rider assignment.',
  },
  ASSIGNED_TO_RIDER: {
    label: 'Assigned to Rider',
    shortLabel: 'Assigned',
    badgeCls: 'bg-sky-50 text-sky-700 border border-sky-200',
    description: 'Assigned to a last-mile delivery rider.',
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for Delivery',
    shortLabel: 'Out for Delivery',
    badgeCls: 'bg-orange-50 text-orange-700 border border-orange-200',
    description: 'Delivery rider is on the way to the buyer address.',
  },
  DELIVERED: {
    label: 'Delivered',
    shortLabel: 'Delivered',
    badgeCls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    description: 'Package delivered to the buyer. Waiting for the buyer to confirm receipt.',
  },
  COMPLETED: {
    label: 'Order Completed',
    shortLabel: 'Completed',
    badgeCls: 'bg-teal-50 text-teal-800 border border-teal-200',
    description: 'Order fully complete and finalized.',
  },
  DELIVERY_FAILED: {
    label: 'Delivery Attempt Failed',
    shortLabel: 'Delivery Failed',
    badgeCls: 'bg-amber-100 text-amber-800 border border-amber-300',
    description: 'Recipient unavailable or address unreachable. Returned to hub for reschedule.',
  },
  RETURNED: {
    label: 'Returned to Seller',
    shortLabel: 'Returned',
    badgeCls: 'bg-rose-50 text-rose-700 border border-rose-200',
    description: 'Package returned to merchant (return accepted or RTS failed delivery).',
  },
  CANCELLED: {
    label: 'Order Cancelled',
    shortLabel: 'Cancelled',
    badgeCls: 'bg-gray-100 text-gray-600 border border-gray-200',
    description: 'Order was cancelled before fulfillment.',
  },
  DISPUTED: {
    label: 'Disputed / Return Requested',
    shortLabel: 'Disputed',
    badgeCls: 'bg-red-50 text-red-700 border border-red-200',
    description: 'Buyer requested a return/refund. Awaiting seller response or mediation.',
  },
};

// Fallback lookup for legacy lowercase strings during transition
const LEGACY_MAP: Record<string, OrderStatus> = {
  pending:          'PLACED',
  confirmed:        'CONFIRMED',
  packed:           'PREPARING',
  shipped:          'READY_FOR_PICKUP',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered:        'DELIVERED',
  cancelled:        'CANCELLED',
  returned:         'RETURNED',
};

export function normalizeOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PLACED';
  const upper = status.toUpperCase() as OrderStatus;
  if (ORDER_STATUS_META[upper]) return upper;
  if (LEGACY_MAP[status.toLowerCase()]) return LEGACY_MAP[status.toLowerCase()];
  return 'PLACED';
}

export function getStatusLabel(status: string | null | undefined): string {
  const norm = normalizeOrderStatus(status);
  return ORDER_STATUS_META[norm]?.label || norm;
}

export function getStatusBadgeClass(status: string | null | undefined): string {
  const norm = normalizeOrderStatus(status);
  return ORDER_STATUS_META[norm]?.badgeCls || 'bg-gray-100 text-gray-700 border border-gray-200';
}

// ─── Filter Groupings ────────────────────────────────────────────────────────

export const BUYER_FILTER_GROUPS = {
  all:        [] as OrderStatus[],
  to_pay:     ['PLACED'] as OrderStatus[],
  to_ship:    ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] as OrderStatus[],
  to_receive: ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED'] as OrderStatus[],
  to_review:  ['COMPLETED'] as OrderStatus[],
  returns:    ['CANCELLED', 'RETURNED', 'DISPUTED', 'DELIVERY_FAILED'] as OrderStatus[],
};

export const SELLER_TAB_STATUSES = {
  all:                  [] as OrderStatus[],
  pending_verification: ['PLACED'] as OrderStatus[],
  to_ship:              ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] as OrderStatus[],
  in_transit:           ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY'] as OrderStatus[],
  delivered:            ['DELIVERED', 'COMPLETED'] as OrderStatus[],
  cancelled:            ['CANCELLED', 'RETURNED', 'DISPUTED', 'DELIVERY_FAILED'] as OrderStatus[],
};

// ─── State Machine Transition Lookups ────────────────────────────────────────

export const ALLOWED_ADMIN_NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PLACED:            ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:         ['PREPARING', 'CANCELLED'],
  PREPARING:         ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP:  ['PICKED_UP', 'CANCELLED'],
  PICKED_UP:         ['AT_SORTING_CENTER', 'CANCELLED'],
  AT_SORTING_CENTER: ['SORTED', 'CANCELLED'],
  SORTED:            ['ASSIGNED_TO_RIDER', 'CANCELLED'],
  ASSIGNED_TO_RIDER: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY:  ['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
  DELIVERED:         ['COMPLETED', 'DISPUTED'],
  DELIVERY_FAILED:   ['ASSIGNED_TO_RIDER', 'RETURNED'],
  DISPUTED:          ['RETURNED'],
  COMPLETED:         [],
  RETURNED:          [],
  CANCELLED:         [],
};

// ─── Admin Orders page groups and icons ───────────────────────────────────────

/**
 * The groups the admin Orders page filters and counts by. They partition every status, and the backend uses the same
 * lists (AdminOrderController::statusGroups()); the page sends the group key and shows the count the API returns.
 */
export const ADMIN_ORDER_GROUPS: { key: AdminOrderGroupKey; label: string; statuses: OrderStatus[] }[] = [
  { key: 'awaiting_action',     label: 'Awaiting action',      statuses: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] },
  { key: 'in_transit',          label: 'In transit',           statuses: ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY'] },
  { key: 'delivered_completed', label: 'Delivered / completed', statuses: ['DELIVERED', 'COMPLETED'] },
  { key: 'problem',             label: 'Problem orders',       statuses: ['DELIVERY_FAILED', 'RETURNED', 'DISPUTED'] },
  { key: 'cancelled',           label: 'Cancelled',            statuses: ['CANCELLED'] },
];

/** An icon per status, so a status badge never relies on colour alone. */
export const ORDER_STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  PLACED:            Clock,
  CONFIRMED:         CheckCircle2,
  PREPARING:         Package,
  READY_FOR_PICKUP:  PackageCheck,
  PICKED_UP:         Truck,
  AT_SORTING_CENTER: Warehouse,
  SORTED:            ListChecks,
  ASSIGNED_TO_RIDER: Bike,
  OUT_FOR_DELIVERY:  Navigation,
  DELIVERED:         PackageOpen,
  COMPLETED:         BadgeCheck,
  DELIVERY_FAILED:   AlertTriangle,
  RETURNED:          Undo2,
  CANCELLED:         XCircle,
  DISPUTED:          ShieldAlert,
};
