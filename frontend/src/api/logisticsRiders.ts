// The courier company's riders: add, verify, suspend and reactivate, with Online status and workload.
import { http } from './client';
import type { LogisticsRiderRow, LogisticsRidersSummary } from '../types';

export const getCompanyRidersApi = (params?: { status?: string; search?: string; availability?: 'online' | 'offline' }) =>
  http.get<{ data: LogisticsRiderRow[]; summary: LogisticsRidersSummary }>('/logistics/riders', { params }).then((r) => r.data);

export const getCompanyRiderApi = (id: number) =>
  http.get<{ data: LogisticsRiderRow }>(`/logistics/riders/${id}`).then((r) => r.data.data);

export const addCompanyRiderApi = (form: FormData) =>
  http.post<{ message: string; data: LogisticsRiderRow }>('/logistics/riders', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);

export const resendRiderActivationApi = (id: number) =>
  http.post<{ message: string }>(`/logistics/riders/${id}/resend-activation`).then((r) => r.data);

export const approveCompanyRiderApi = (id: number) =>
  http.post<{ message: string }>(`/logistics/riders/${id}/approve`).then((r) => r.data);

export const rejectCompanyRiderApi = (id: number, reason: string) =>
  http.post<{ message: string }>(`/logistics/riders/${id}/reject`, { reason }).then((r) => r.data);

export const suspendCompanyRiderApi = (id: number, reason: string) =>
  http.post<{ message: string; released_jobs: number }>(`/logistics/riders/${id}/suspend`, { reason }).then((r) => r.data);

export const reactivateCompanyRiderApi = (id: number) =>
  http.post<{ message: string }>(`/logistics/riders/${id}/reactivate`).then((r) => r.data);
