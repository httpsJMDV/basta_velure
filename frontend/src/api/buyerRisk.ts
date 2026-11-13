import { http } from './client';

export interface RiskBuyer {
  id: number; name: string; email: string; status: string;
  score: number; level: 'high' | 'medium' | 'low'; order_count: number;
  buyer_cancellations: number; failed_payments: number; refused_parcels: number; hourly_checkouts: number;
  signals: { code: string; label: string; detail: string }[];
}
export interface RiskOrder {
  id: number; order_number: string; status: string; total: number;
  payment_status: string; payment_method: string; created_at: string; can_cancel: boolean;
}
export interface RiskDetail extends RiskBuyer { orders: RiskOrder[] }
export interface RiskAnalysis { summary: string; checks: string[]; generated_at: string; provider: string }
export interface RiskList {
  data: RiskBuyer[];
  meta: { current_page: number; last_page: number; total: number; window_days: number; checked_at: string;
    summary: { buyers: number; flagged: number; high: number } };
}
export const getBuyerRiskApi = (params: { page: number; search: string; level: string }, signal?: AbortSignal) =>
  http.get<RiskList>('/admin/buyer-risk', { params, signal }).then(r => r.data);
export const getBuyerRiskDetailApi = (id: number, signal?: AbortSignal) =>
  http.get<{ data: RiskDetail }>(`/admin/buyer-risk/${id}`, { signal }).then(r => r.data.data);
export const analyzeBuyerRiskApi = (id: number) =>
  http.post<{ data: RiskAnalysis }>(`/admin/buyer-risk/${id}/analyze`, {}, { timeout: 120000 }).then(r => r.data.data);
export const cancelRiskOrderApi = (buyer: number, order: number, reason: string) =>
  http.post(`/admin/buyer-risk/${buyer}/orders/${order}/cancel`, { reason, confirmed: true }).then(r => r.data);
