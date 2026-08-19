import axios from 'axios';
import type {
  AuthResponse,
  BuyerApplicationsResponse,
  PaginatedResponse,
  SellerApplication,
  User,
  Address,
  Order,
  AdminStats,
  ActivityLogEntry,
  DashboardFeed,
  AdminOrder,
  AdminOrderStats,
  AdminPayment,
  AdminPaymentStats,
  AdminDispute,
  AdminDisputeStats,
  AdminReview,
  AdminReviewStats,
  OrderStatus,
  PaymentStatus,
  DisputeStatus,
  ModerationStatus,
  Conversation,
  ChatMessage,
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

export const registerBuyerApi = (data: Record<string, string> | FormData) =>
  http.post<AuthResponse>('/auth/register', data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }).then((r) => r.data);

export const googleAuthApi = (credential: string) =>
  http.post<AuthResponse & { profile_incomplete?: boolean; google_avatar_url?: string | null }>('/auth/google', { credential }).then((r) => r.data);

export const registerSellerApi = (form: FormData) =>
  http.post<AuthResponse>('/auth/register/seller', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const logoutApi = () => http.post('/auth/logout');

export const getMeApi = () =>
  http.get<{ data: User }>('/auth/me').then((r) => r.data.data);

export const updateProfileApi = (data: { first_name?: string; middle_name?: string; last_name?: string; phone?: string; date_of_birth?: string; sex?: string }) =>
  http.patch<{ data: User }>('/auth/profile', data).then((r) => r.data.data);

export const uploadAvatarApi = (file: Blob) => {
  const form = new FormData();
  form.append('avatar', file, 'avatar.jpg');
  return http.post<{ data: User }>('/auth/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data.data);
};

export const completeProfileApi = (form: FormData) =>
  http.post<{ data: User }>('/auth/complete-profile', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data.data);

export const forgotPasswordApi = (email: string) =>
  http.post('/auth/forgot-password', { email });

export const resetPasswordApi = (data: {
  token: string; email: string; password: string; password_confirmation: string;
}) => http.post('/auth/reset-password', data);

// Admin — dashboard stats
export const getAdminStatsApi = () =>
  http.get<{ data: AdminStats }>('/admin/stats').then((r) => r.data.data);

export const getAdminDashboardFeedApi = () =>
  http.get<{ data: DashboardFeed }>('/admin/dashboard-feed').then((r) => r.data.data);

// Admin — users
export const getAdminUsersApi = (params?: { role?: string; status?: string; search?: string; page?: number; per_page?: number }) =>
  http.get<PaginatedResponse<User>>('/admin/users', { params }).then((r) => r.data);

export const suspendUserApi = (id: number) =>
  http.patch<{ data: User }>(`/admin/users/${id}/suspend`).then((r) => r.data.data);

export const reactivateUserApi = (id: number) =>
  http.patch<{ data: User }>(`/admin/users/${id}/reactivate`).then((r) => r.data.data);

// Admin — activity log
export const getActivityLogApi = (params?: { action?: string; page?: number }) =>
  http.get<PaginatedResponse<ActivityLogEntry>>('/admin/activity-log', { params }).then((r) => r.data);

// Admin — buyer applications
export const getBuyerApplicationsApi = (params?: { status?: string; search?: string; sort?: string; page?: number; per_page?: number }) =>
  http.get<BuyerApplicationsResponse>('/admin/buyer-applications', { params }).then((r) => r.data);

export const approveBuyerApi = (id: number) =>
  http.post(`/admin/buyer-applications/${id}/approve`);

export const rejectBuyerApi = (id: number, reason: string) =>
  http.post(`/admin/buyer-applications/${id}/reject`, { reason });

export const getBuyerIdImageUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/buyer-applications/${id}/id-image`;

export const getBuyerIdImageBackUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/buyer-applications/${id}/id-image-back`;

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

// Admin — orders
export const getAdminOrdersApi = (params?: { status?: OrderStatus; search?: string; page?: number }) =>
  http.get<PaginatedResponse<AdminOrder>>('/admin/orders', { params }).then((r) => r.data);

export const getAdminOrderApi = (id: number) =>
  http.get<{ data: AdminOrder }>(`/admin/orders/${id}`).then((r) => r.data.data);

export const updateAdminOrderStatusApi = (id: number, status: OrderStatus) =>
  http.patch<{ data: AdminOrder }>(`/admin/orders/${id}/status`, { status }).then((r) => r.data.data);

export const getAdminOrderStatsApi = () =>
  http.get<{ data: AdminOrderStats }>('/admin/orders/stats').then((r) => r.data.data);

// Admin — payments
export const getAdminPaymentsApi = (params?: { status?: PaymentStatus; search?: string; page?: number }) =>
  http.get<PaginatedResponse<AdminPayment>>('/admin/payments', { params }).then((r) => r.data);

export const markPaymentPaidApi = (id: number, reference_number?: string) =>
  http.patch<{ data: AdminPayment }>(`/admin/payments/${id}/mark-paid`, { reference_number }).then((r) => r.data.data);

export const getAdminPaymentStatsApi = () =>
  http.get<{ data: AdminPaymentStats }>('/admin/payments/stats').then((r) => r.data.data);

// Admin — disputes
export const getAdminDisputesApi = (params?: { status?: DisputeStatus; search?: string; page?: number }) =>
  http.get<PaginatedResponse<AdminDispute>>('/admin/disputes', { params }).then((r) => r.data);

export const getAdminDisputeApi = (id: number) =>
  http.get<{ data: AdminDispute }>(`/admin/disputes/${id}`).then((r) => r.data.data);

export const resolveDisputeApi = (id: number, status: 'resolved' | 'closed', resolution_note: string) =>
  http.patch<{ data: AdminDispute }>(`/admin/disputes/${id}/resolve`, { status, resolution_note }).then((r) => r.data.data);

export const getAdminDisputeStatsApi = () =>
  http.get<{ data: AdminDisputeStats }>('/admin/disputes/stats').then((r) => r.data.data);

// Admin — reviews
export const getAdminReviewsApi = (params?: { moderation_status?: ModerationStatus; flagged?: boolean; search?: string; page?: number }) =>
  http.get<PaginatedResponse<AdminReview>>('/admin/reviews', { params: { ...params, flagged: params?.flagged ? 'true' : undefined } }).then((r) => r.data);

export const moderateReviewApi = (id: number, moderation_status: ModerationStatus) =>
  http.patch<{ data: AdminReview }>(`/admin/reviews/${id}/moderate`, { moderation_status }).then((r) => r.data.data);

export const getAdminReviewStatsApi = () =>
  http.get<{ data: AdminReviewStats }>('/admin/reviews/stats').then((r) => r.data.data);

// Admin — conversations
export const getConversationsApi = () =>
  http.get<{ data: Conversation[] }>('/admin/conversations').then((r) => r.data.data);

export const openConversationForSellerApi = (sellerId: number) =>
  http.get<{ data: Conversation }>(`/admin/conversations/seller/${sellerId}`).then((r) => r.data.data);

export const getConversationMessagesApi = (conversationId: number, since?: string) =>
  http.get<{ data: ChatMessage[] }>(`/admin/conversations/${conversationId}/messages`, {
    params: since ? { since } : undefined,
  }).then((r) => r.data.data);

export const sendConversationMessageApi = (conversationId: number, body: string) =>
  http.post<{ data: ChatMessage }>(`/admin/conversations/${conversationId}/messages`, { body }).then((r) => r.data.data);
