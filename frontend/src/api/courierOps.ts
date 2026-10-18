// The courier company's operations (Logistics L1, L4 to L9): dispatch, hub scanning, one parcel's detail and fixes,
// Return to Sender, COD reconciliation and exports.
import { http } from './client';
import type { CodRemittanceRow } from './riderJobs';

// ── Dispatch (L4) ─────────────────────────────────────────────────────────────

export type DispatchState = 'unassigned' | 'offering' | 'assigned';

export interface DispatchRow {
  id: number;
  tracking_number: string;
  order_number: string | null;
  shop_name: string | null;
  pickup_area: string;
  dropoff_area: string | null;
  cod_amount: number | null;
  ready_at: string | null;
  state: DispatchState;
  attempts: number;
  max_attempts: number;
  rider: { id: number; name: string } | null;
  offer: { rider: string; expires_at: string } | null;
  history: { rider: string; status: string; at: string | null }[];
}

export interface DispatchRider {
  id: number;
  name: string;
  online: boolean;
  status: string;
  active_jobs: number;
  assignable: boolean;
  problem: string | null;
  distance: string | null;
  rank: number | null;
}

export const getDispatchApi = (state: DispatchState | 'all' = 'all') =>
  http.get<{ data: DispatchRow[]; counts: Record<DispatchState, number> }>('/logistics/dispatch', { params: { state } }).then((r) => r.data);

export const getDispatchRidersApi = (parcelId?: number) =>
  http.get<{ data: DispatchRider[]; unavailable: DispatchRider[]; max_active_jobs: number }>('/logistics/dispatch/riders', { params: parcelId ? { parcel_id: parcelId } : {} }).then((r) => r.data);

export const autoAssignApi = (parcelIds?: number[]) =>
  http.post<{ message: string; data: { offered: number; unassigned: number } }>('/logistics/dispatch/auto-assign', parcelIds ? { parcel_ids: parcelIds } : {}).then((r) => r.data);

export const assignParcelsApi = (parcelIds: number[], riderId: number) =>
  http.post<{ message: string; data: { assigned: string[]; skipped: { parcel_id: number; tracking_number: string | null; reason: string }[] } }>(
    '/logistics/dispatch/assign', { parcel_ids: parcelIds, rider_id: riderId },
  ).then((r) => r.data);

// ── Hub scanning (L5) ─────────────────────────────────────────────────────────

export interface HubOpsParcel {
  id: number;
  tracking_number: string;
  order_number: string | null;
  status: string;
  zone: string | null;
  barangay: string | null;
  scanned_in_at: string | null;
  sorted_at: string | null;
}

export const getHubOpsApi = () =>
  http.get<{ data: { hubs: { id: number; name: string; city: string | null }[]; counts: { incoming: number; at_hub: number; sorted: number; outbound: number } } }>('/logistics/hub-ops').then((r) => r.data.data);

export const getHubZonesApi = () =>
  http.get<{ data: { to_sort: HubOpsParcel[]; zones: { zone: string; parcels: HubOpsParcel[] }[] } }>('/logistics/hub-ops/zones').then((r) => r.data.data);

export const scanInboundApi = (tracking: string, hubId?: number) =>
  http.post<{ message: string; data: HubOpsParcel }>('/logistics/hub-ops/inbound', { tracking_number: tracking, hub_id: hubId }).then((r) => r.data);

export const scanSortApi = (tracking: string) =>
  http.post<{ message: string; data: HubOpsParcel }>('/logistics/hub-ops/sort', { tracking_number: tracking }).then((r) => r.data);

export const scanOutboundApi = (tracking: string, riderId: number) =>
  http.post<{ message: string; data: HubOpsParcel }>('/logistics/hub-ops/outbound', { tracking_number: tracking, rider_id: riderId }).then((r) => r.data);

// ── One parcel (L6, L7) ───────────────────────────────────────────────────────

export interface ParcelFailure { attempt: number; reason: string; note: string | null; at: string | null }

export interface CourierParcelDetail {
  id: number;
  tracking_number: string;
  status: string;
  status_label: string;
  order: { id: number; order_number: string; status: string; payment_method: string; total: number; buyer: string | null; refund_status: string | null } | null;
  shop: { shop_name?: string; full_address?: string; contact_phone?: string };
  recipient: { name?: string; barangay?: string; city?: string; province?: string; full_address?: string };
  zone: string | null;
  weight_kg: number | null;
  cod_amount: number | null;
  hub: string | null;
  riders: { pickup: string | null; delivery: string | null; return: string | null };
  attempts: number;
  max_attempts: number;
  failures: ParcelFailure[];
  exception: { type: 'lost' | 'damaged'; reason: string; at: string | null; photo_url: string | null } | null;
  override_targets: { value: string; label: string }[];
  can_mark_exception: boolean;
  timeline: { status: string; event: string | null; note: string | null; actor: string; at: string | null }[];
  audit: { id: number; action: string; from: Record<string, unknown> | null; to: Record<string, unknown> | null; reason: string | null; by: string | null; at: string | null }[];
}

export const getCourierParcelApi = (id: number) =>
  http.get<{ data: CourierParcelDetail }>(`/logistics/parcels/${id}`).then((r) => r.data.data);

export const overrideParcelApi = (id: number, status: string, reason: string) =>
  http.post<{ message: string }>(`/logistics/parcels/${id}/override`, { status, reason }).then((r) => r.data);

export const markParcelExceptionApi = (id: number, type: 'lost' | 'damaged', reason: string, photo?: File | null) => {
  const form = new FormData();
  form.append('type', type);
  form.append('reason', reason);
  if (photo) form.append('photo', photo);
  return http.post<{ message: string }>(`/logistics/parcels/${id}/exception`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export const rescheduleParcelApi = (id: number, riderId: number) =>
  http.post<{ message: string }>(`/logistics/parcels/${id}/reschedule`, { rider_id: riderId }).then((r) => r.data);

export interface ReturnRow {
  id: number;
  tracking_number: string;
  order_number: string | null;
  payment_method: string | null;
  shop: string | null;
  shop_area: string;
  since: string | null;
  failures: ParcelFailure[];
  rider: { id: number; name: string } | null;
}

export const getCourierReturnsApi = () => http.get<{ data: ReturnRow[] }>('/logistics/returns').then((r) => r.data.data);

export const assignReturnApi = (id: number, riderId: number) =>
  http.post<{ message: string }>(`/logistics/returns/${id}/assign`, { rider_id: riderId }).then((r) => r.data);

// ── COD and exports (L9) ──────────────────────────────────────────────────────

export interface CodRiderDay {
  rider_id: number;
  rider: string;
  collected: string;
  remitted: string;
  difference: string;
  shortfall: boolean;
  balance: string;
  orders: { tracking_number: string; order_number: string | null; amount: string; collected_at: string | null }[];
  remittances: CodRemittanceRow[];
}

export interface CodDay {
  date: string;
  riders: CodRiderDay[];
  totals: { collected: string; remitted: string; difference: string };
  pending: CodRemittanceRow[];
}

export const getCodDayApi = (date?: string) => http.get<{ data: CodDay }>('/logistics/cod', { params: date ? { date } : {} }).then((r) => r.data.data);

export const confirmRemittanceApi = (id: number) =>
  http.post<{ message: string }>(`/logistics/cod/remittances/${id}/confirm`).then((r) => r.data);

/** Downloads an export as a file; an empty range gives a file with the header row only. */
export async function downloadCourierExport(type: 'deliveries' | 'cod', format: 'csv' | 'xlsx', from: string, to: string): Promise<void> {
  const res = await http.get('/logistics/exports', { params: { type, format, from, to }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type}-${from}_to_${to}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
