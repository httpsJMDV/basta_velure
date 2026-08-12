import axios from 'axios';
import type {
  AuthResponse,
  PaginatedResponse,
  SellerApplication,
  User,
  Address,
  Order,
  AdminStats,
  ActivityLogEntry,
} from '../types';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  headers: { Accept: 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const loginApi = (email: string, password: string) =>
  http.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data);

export const registerBuyerApi = (data: Record<string, string>) =>
  http.post<AuthResponse>('/auth/register', data).then((r) => r.data);

export const googleAuthApi = (credential: string) =>
  http.post<AuthResponse>('/auth/google', { credential }).then((r) => r.data);

export const registerSellerApi = (form: FormData) =>
  http.post<AuthResponse>('/auth/register/seller', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const logoutApi = () => http.post('/auth/logout');

export const getMeApi = () =>
  http.get<{ data: User }>('/auth/me').then((r) => r.data.data);

export const updateProfileApi = (data: { phone?: string; date_of_birth?: string; gender?: string }) =>
  http.patch<{ data: User }>('/auth/profile', data).then((r) => r.data.data);

export const uploadAvatarApi = (file: Blob) => {
  const form = new FormData();
  form.append('avatar', file, 'avatar.jpg');
  return http.post<{ data: User }>('/auth/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data.data);
};

export const forgotPasswordApi = (email: string) =>
  http.post('/auth/forgot-password', { email });

export const resetPasswordApi = (data: {
  token: string; email: string; password: string; password_confirmation: string;
}) => http.post('/auth/reset-password', data);

// Admin — dashboard stats
export const getAdminStatsApi = () =>
  http.get<{ data: AdminStats }>('/admin/stats').then((r) => r.data.data);

// Admin — users
export const getAdminUsersApi = (params?: { role?: string; status?: string; search?: string; page?: number }) =>
  http.get<PaginatedResponse<User>>('/admin/users', { params }).then((r) => r.data);

export const suspendUserApi = (id: number) =>
  http.patch<{ data: User }>(`/admin/users/${id}/suspend`).then((r) => r.data.data);

export const reactivateUserApi = (id: number) =>
  http.patch<{ data: User }>(`/admin/users/${id}/reactivate`).then((r) => r.data.data);

// Admin — activity log
export const getActivityLogApi = (params?: { action?: string; page?: number }) =>
  http.get<PaginatedResponse<ActivityLogEntry>>('/admin/activity-log', { params }).then((r) => r.data);

// Admin — seller applications
export const getSellerApplicationsApi = (status = 'pending', page = 1) =>
  http
    .get<PaginatedResponse<SellerApplication>>('/admin/seller-applications', {
      params: { status, page },
    })
    .then((r) => r.data);

export const approveSellerApi = (id: number) =>
  http.post(`/admin/seller-applications/${id}/approve`);

export const rejectSellerApi = (id: number, reason: string) =>
  http.post(`/admin/seller-applications/${id}/reject`, { reason });

export default http;

// Addresses
export const getAddressesApi = () =>
  http.get<{ data: Address[] }>('/addresses').then((r) => r.data.data);

export const createAddressApi = (data: Omit<Address, 'id' | 'is_default'> & { is_default?: boolean }) =>
  http.post<{ data: Address }>('/addresses', data).then((r) => r.data.data);

export const updateAddressApi = (id: number, data: Partial<Omit<Address, 'id'>>) =>
  http.patch<{ data: Address }>(`/addresses/${id}`, data).then((r) => r.data.data);

export const deleteAddressApi = (id: number) =>
  http.delete(`/addresses/${id}`);

export const setDefaultAddressApi = (id: number) =>
  http.patch<{ data: Address }>(`/addresses/${id}/default`).then((r) => r.data.data);

// Orders
export const getOrdersApi = (params?: { status?: string; search?: string }) =>
  http.get<{ data: Order[] }>('/orders', { params }).then((r) => r.data.data);
