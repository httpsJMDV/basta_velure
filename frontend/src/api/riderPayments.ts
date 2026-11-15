import { http } from './client';

export type RiderPaymentRole = 'rider' | 'hub' | 'logistics';
export type RiderPaymentStatus = 'pending' | 'processing' | 'completed' | 'rejected';
export interface RiderPayment {
  id: number; reference_code: string; amount: string; status: RiderPaymentStatus;
  rider_name: string; hub_name: string; gcash_name: string; gcash_number: string;
  assigned_to: number | null; processor_name: string | null; can_process: boolean;
  breakdown: { earnings_count: number; trips_count: number; earnings_amount: string; trips_amount: string };
  transfer_reference: string | null; has_receipt: boolean; note: string | null; report_note: string | null;
  created_at: string; sent_at: string | null; completed_at: string | null;
}
export interface RiderPaymentSummary {
  available: string; has_open_request: boolean; gcash_number: string | null; gcash_name: string | null; hub_name: string | null; can_request: boolean;
}
export interface RiderPaymentList {
  data: RiderPayment[]; summary?: RiderPaymentSummary; meta: { current_page: number; last_page: number; total: number };
}
const base = (role: RiderPaymentRole) => role === 'rider' ? '/rider/payment-requests' : `/${role}/rider-payment-requests`;
export const getRiderPayments = (role: RiderPaymentRole, page: number, status: string) =>
  http.get<RiderPaymentList>(base(role), { params: { page, status } }).then(r => r.data);
export const requestRiderPayment = (summary: RiderPaymentSummary) => http.post(base('rider'), {
  confirmed: true, expected_amount: summary.available, expected_gcash_number: summary.gcash_number, expected_gcash_name: summary.gcash_name,
});
export const sendRiderPayment = (role: RiderPaymentRole, id: number, reference: string, receipt: File) => {
  const form = new FormData(); form.append('reference', reference); form.append('receipt', receipt); form.append('confirmed', '1');
  return http.post(`${base(role)}/${id}/send`, form);
};
export const rejectRiderPayment = (role: RiderPaymentRole, id: number, note: string) => http.post(`${base(role)}/${id}/reject`, { note });
export const confirmRiderPayment = (id: number) => http.post(`${base('rider')}/${id}/confirm`, { confirmed: true });
export const claimRiderPayment = (role: RiderPaymentRole, id: number) => http.post<{ data: RiderPayment }>(`${base(role)}/${id}/claim`).then(r => r.data.data);
export const releaseRiderPayment = (role: RiderPaymentRole, id: number) => http.post(`${base(role)}/${id}/release`, { not_sent: true });
export const reportRiderPayment = (id: number, note: string) => http.post(`${base('rider')}/${id}/report`, { note });
export const viewRiderPaymentReceipt = async (id: number) => {
  const result = await http.get<Blob>(`/rider-payments/${id}/receipt`, { responseType: 'blob' });
  const url = URL.createObjectURL(result.data); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
