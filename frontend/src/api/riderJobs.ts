// The rider's working state (R3, R4, R7, R9): Online/Offline, 60-second pickup offers, return trips to the seller and
// the cash on delivery the rider hands to their courier company.
import { http } from './client';

export interface RiderWorkState {
  online: boolean;
  status: string;
  active_jobs: number;
  max_active_jobs: number;
  online_since: string | null;
}

export interface RiderOffer {
  id: number;
  tracking_number: string;
  expires_at: string;
  seconds_left: number;
  pickup: { shop_name: string; phone: string | null; address: string; barangay: string | null; city: string | null };
  /** Only the area: the recipient and full address come with the delivery leg. */
  dropoff_area: string;
  cod_amount: number | null;
  weight_kg: number | null;
  /** The fixed pickup pay (A3). */
  pay: string;
}

export interface RiderReturnJob {
  tracking_number: string;
  order_number: string | null;
  seller: { shop_name?: string; contact_phone?: string; full_address?: string; barangay?: string; city?: string };
  failures: { attempt: number; reason: string; note: string | null; at: string | null }[];
  assigned_at: string | null;
}

export interface CodRemittanceRow {
  id: number;
  amount: string;
  balance_at_submission: string;
  shortfall: string;
  status: 'pending' | 'confirmed';
  reference: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  rider?: string | null;
  rider_id?: number;
}

export interface RiderCod {
  balance: { collected: string; confirmed: string; pending: string; outstanding: string; can_remit: string };
  collections: { tracking_number: string; order_number: string | null; amount: string; collected_at: string | null }[];
  remittances: CodRemittanceRow[];
}

export const getRiderStatusApi = () => http.get<{ data: RiderWorkState }>('/rider/status').then((r) => r.data.data);

export const setRiderAvailabilityApi = (online: boolean) =>
  http.post<{ message: string; data: RiderWorkState }>('/rider/availability', { online }).then((r) => r.data);

export const getRiderOffersApi = () =>
  http.get<{ data: RiderOffer[]; meta: RiderWorkState }>('/rider/offers').then((r) => r.data);

export const acceptRiderOfferApi = (id: number) =>
  http.post<{ message: string; data: { tracking_number: string } }>(`/rider/offers/${id}/accept`).then((r) => r.data);

export const declineRiderOfferApi = (id: number) => http.post<{ message: string }>(`/rider/offers/${id}/decline`).then((r) => r.data);

export const getRiderReturnsApi = () => http.get<{ data: RiderReturnJob[] }>('/rider/returns').then((r) => r.data.data);

export const markRiderReturnedApi = (tracking: string, note?: string) =>
  http.post<{ message: string }>(`/rider/returns/${encodeURIComponent(tracking)}/delivered`, note ? { note } : {}).then((r) => r.data);

export const getRiderCodApi = () => http.get<{ data: RiderCod }>('/rider/cod').then((r) => r.data.data);

export const remitRiderCodApi = (amount: string, reference: string | undefined, idempotencyKey: string) =>
  http.post<{ message: string; data: CodRemittanceRow }>('/rider/cod/remittances', { amount, reference: reference || undefined }, {
    headers: { 'Idempotency-Key': idempotencyKey },
  }).then((r) => r.data);
