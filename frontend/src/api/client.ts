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
  ProductFilters,
  CatalogResponse,
  ProductDetail,
  ProductReviewsResponse,
  CatalogMeta,
  Product,
  SellerProduct,
  SellerDashboardStats,
  SellerChartPoint,
  SellerAttentionItem,
  SellerTopProduct,
  WishlistItem,
  FollowedStore,
  PublicShopProfile,
  PublicShopReview,
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

export const applyAsSellerApi = (form: FormData) =>
  http.post<{ data: User }>('/auth/apply-seller', form, {
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

export const getSellerIdImageUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/seller-applications/${id}/id-image`;

export const getSellerIdImageBackUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/seller-applications/${id}/id-image-back`;
export const getSellerSelfieUrl = (id: number): string =>
  `${http.defaults.baseURL}/admin/seller-applications/${id}/selfie`;

export const getSellerBusinessPermitUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/seller-applications/${id}/business-permit`;

export const getSellerDtiSecRegistrationUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/seller-applications/${id}/dti-sec-registration`;

export const getSellerFdaLtoUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/seller-applications/${id}/fda-lto`;

// Admin — seller applications
export const getSellerApplicationsApi = (params?: { status?: string; search?: string; sort?: string; page?: number; per_page?: number }) =>
  http
    .get<PaginatedResponse<SellerApplication>>('/admin/seller-applications', { params })
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

// Products — public catalog
export const getProductsApi = (filters: ProductFilters = {}) => {
  const params: Record<string, string | number | boolean> = {};
  if (filters.q)                  params.q                  = filters.q;
  if (filters.parent_category_id) params.parent_category_id = filters.parent_category_id;
  if (filters.category_id)        params.category_id        = filters.category_id;
  if (filters.seller_ids?.length) params.seller_ids         = filters.seller_ids.join(',');
  if (filters.min_price != null)  params.min_price          = filters.min_price;
  if (filters.max_price != null)  params.max_price          = filters.max_price;
  if (filters.min_rating != null) params.min_rating         = filters.min_rating;
  if (filters.free_shipping)      params.free_shipping      = true;
  if (filters.cod)                params.cod                = true;
  if (filters.on_sale)            params.on_sale            = true;
  if (filters.has_voucher)        params.has_voucher        = true;
  if (filters.new_arrivals)       params.new_arrivals       = true;
  if (filters.provinces?.length)  params.provinces          = filters.provinces.join(',');
  if (filters.sort)               params.sort               = filters.sort;
  if (filters.page)               params.page               = filters.page;
  if (filters.per_page)           params.per_page           = filters.per_page;
  return http.get<CatalogResponse>('/products', { params }).then((r) => r.data);
};

// Products — detail & reviews
export const getProductApi = (id: number) =>
  http.get<{ data: ProductDetail }>(`/products/${id}`).then((r) => r.data.data);

export const getProductReviewsApi = (id: number, params?: { rating?: number; sort?: 'recent' | 'relevance'; page?: number }) =>
  http.get<ProductReviewsResponse>(`/products/${id}/reviews`, { params }).then((r) => r.data);

export const getRelatedProductsApi = (id: number) =>
  http.get<{ data: Product[]; meta: CatalogMeta }>(`/products/${id}/related`).then((r) => r.data);

export const toggleWishlistApi = (productId: number) =>
  http.post<{ wishlisted: boolean }>(`/wishlist/toggle`, { product_id: productId }).then((r) => r.data);

export const addToCartApi = (variantId: number, quantity: number) =>
  http.post('/cart/items', { variant_id: variantId, quantity });

// Wishlist
export const getWishlistApi = (params?: { sort?: string; page?: number }) =>
  http.get<{ data: WishlistItem[]; meta: { current_page: number; last_page: number; total: number } }>('/wishlist', { params }).then((r) => r.data);

export const removeFromWishlistApi = (productId: number) =>
  http.post<{ wishlisted: boolean }>('/wishlist/toggle', { product_id: productId }).then((r) => r.data);

// Store follows
export const getFollowedStoresApi = (params?: { sort?: string; page?: number }) =>
  http.get<{ data: FollowedStore[]; meta: { current_page: number; last_page: number; total: number } }>('/store-follows', { params }).then((r) => r.data);

export const toggleStoreFollowApi = (sellerId: number) =>
  http.post<{ following: boolean }>('/store-follows/toggle', { seller_id: sellerId }).then((r) => r.data);

// Public Shop Profile & Reviews
export const getPublicShopProfileApi = (slugOrId: string | number) =>
  http.get<{ data: PublicShopProfile }>(`/shops/${slugOrId}`).then((r) => r.data.data);

export const getShopReviewsApi = (slugOrId: string | number, params?: { rating?: number; page?: number }) =>
  http.get<{ data: PublicShopReview[]; meta: { current_page: number; last_page: number; total: number } }>(`/shops/${slugOrId}/reviews`, { params }).then((r) => r.data);

// Seller — dashboard
export const getSellerDashboardStatsApi = () =>
  http.get<{ data: SellerDashboardStats }>('/seller/dashboard/stats').then((r) => r.data.data);

export const getSellerDashboardChartApi = (range: '7d' | '14d') =>
  http.get<{ data: SellerChartPoint[] }>('/seller/dashboard/chart', { params: { range } }).then((r) => r.data.data);

export const getSellerDashboardAttentionApi = () =>
  http.get<{ data: SellerAttentionItem[] }>('/seller/dashboard/attention').then((r) => r.data.data);

export const getSellerTopProductsApi = () =>
  http.get<{ data: SellerTopProduct[] }>('/seller/dashboard/top-products').then((r) => r.data.data);

// Seller — shop profile
export interface SellerShopProfile {
  shop_name: string;
  shop_slug: string;
  shop_category: string | null;
  shop_description: string | null;
  address_province: string | null;
  address_city: string | null;
  address_barangay: string | null;
  address_street: string | null;
  shop_contact_number: string | null;
  return_policy: string | null;
  shipping_policy: string | null;
  business_hours: string | null;
  response_time: string | null;
  logo_url: string | null;
  banner_url: string | null;
  application_status: string;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string | null;
  avg_rating: number | null;
  total_products: number;
  shop_bio: string | null;
  follower_count: number;
}

export const getSellerShopProfileApi = () =>
  http.get<{ data: SellerShopProfile }>('/seller/shop-profile').then((r) => r.data.data);

export const updateSellerShopProfileApi = (form: FormData) =>
  http.post<{ data: SellerShopProfile }>('/seller/shop-profile', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data.data);

// Seller — products
export const getSellerProductsApi = () =>
  http.get<{ data: SellerProduct[] }>('/seller/products').then((r) => r.data.data);

export const getSellerProductApi = (id: number) =>
  http.get<{ data: SellerProduct }>(`/seller/products/${id}`).then((r) => r.data.data);

export const createSellerProductApi = (form: FormData) =>
  http.post<{ data: SellerProduct }>('/seller/products', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data.data);

export const updateSellerProductApi = (id: number, form: FormData) =>
  http.post<{ data: SellerProduct }>(`/seller/products/${id}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data.data);

export const updateSellerProductStockApi = (id: number, stock: number) =>
  http.patch(`/seller/products/${id}/stock`, { stock });

export const updateSellerProductPriceApi = (id: number, price: number) =>
  http.patch(`/seller/products/${id}/price`, { price });

export const archiveSellerProductApi = (id: number, status: 'active' | 'archived') =>
  http.patch<{ data: SellerProduct }>(`/seller/products/${id}/status`, { status }).then((r) => r.data.data);

export const submitSellerProductForReviewApi = (id: number) =>
  http.patch<{ data: SellerProduct }>(`/seller/products/${id}/status`, { status: 'pending_review' }).then((r) => r.data.data);

export const deleteSellerProductApi = (id: number) =>
  http.delete(`/seller/products/${id}`);

// Admin — products
export interface AdminProduct {
  id: number;
  name: string;
  description: string | null;
  status: string;
  rejection_reason: string | null;
  archive_reason: string | null;
  archived_by: 'admin' | 'seller' | null;
  base_price: number;
  units_sold: number;
  thumbnail_url: string | null;
  images: { id: number; url: string; is_primary: boolean; sort_order: number }[];
  variants: { id: number; label: string; sku: string | null; price: number; stock_quantity: number }[];
  seller: { id: number; full_name: string; email: string } | null;
  created_at: string;
}

export const reactivateAdminProductApi = (id: number) =>
  http.post<{ data: AdminProduct }>(`/admin/products/${id}/reactivate`).then((r) => r.data.data);

export const getAdminProductsApi = (params?: { status?: string; search?: string; seller_id?: number; page?: number; per_page?: number }) =>
  http.get<PaginatedResponse<AdminProduct>>('/admin/products', { params }).then((r) => r.data);

export const getAdminProductStatsApi = () =>
  http.get<{ data: { pending_review: number; active: number; rejected: number; archived: number } }>('/admin/products/stats').then((r) => r.data.data);

export const archiveAdminProductApi = (id: number, reason: string) =>
  http.post<{ data: AdminProduct }>(`/admin/products/${id}/archive`, { reason }).then((r) => r.data.data);

export const approveAdminProductApi = (id: number) =>
  http.post<{ data: AdminProduct }>(`/admin/products/${id}/approve`).then((r) => r.data.data);

export const rejectAdminProductApi = (id: number, reason: string) =>
  http.post<{ data: AdminProduct }>(`/admin/products/${id}/reject`, { reason }).then((r) => r.data.data);

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
