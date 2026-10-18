import axios from 'axios';
import type {
  AttachableProduct,
  AttachableOrder,
  FeaturedShop,
  PendingReview,
  BuyerReview,
  ShopPaymentInfo,
  SellerPaymentSettings,
  SettlementWeeks,
  SettlementRecord,
  SellerCommissionMonth,
  CommissionPaymentRecord,
  GcashAccount,
  CourierPayoutRow,
  AdminCommissionReport,
  PayoutAccount,
  CourierOption,
  LogisticsCompanyDetail,
  LogisticsDashboard,
  LogisticsHubRow,
  LogisticsRiderRow,
  LogisticsParcelRow,
  LogisticsReport,
  AuthResponse,
  BuyerApplicationsResponse,
  PaginatedResponse,
  SellerApplication,
  User,
  Address,
  Order,
  AdminStats,
  ActivityLogEntry,
  ActivityLogSummary,
  DashboardFeed,
  AdminOrder,
  AdminOrderStats,
  AdminPayment,
  AdminPaymentStats,
  AdminDispute,
  AdminDisputeStats,
  AdminReview,
  AdminReviewSummary,
  AdminReviewListParams,
  AdminReviewShop,
  AdminFeedback,
  AdminReviewShopSort,
  AdminOrderSummary,
  AdminOrderListParams,
  OrderStatus,
  PaymentStatus,
  DisputeStatus,
  Conversation,
  ChatMessage,
  RiderChatCounterpart,
  RiderChatUnreadItem,
  RiderThread,
  RiderThreadsResponse,
  RiderVehicleUpdate,
  ThreadMessagesResult,
  ThreadAdapter,
  ProductFilters,
  CatalogResponse,
  StorefrontCategory,
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
  SellerOrder,
  WaybillData,
  SellerEarningsSummary,
  SellerOrderEarningsItem,
  PayoutRequest,
  AdminPaymentListItem,
  AdminReportSummary,
  ReportRangeParams,
  AdminRevenueChartPoint,
  CategoryBreakdownItem,
  TopSellerItem,
  PaymentMethodSplit,
  CommissionSettings,
  ReturnPolicySettings,
  SellerReportSummary,
  SellerRevenueChartPoint,
  AdminCategoryParent,
  AdminCategoryMetrics,
  CategoryPayload,
  SortingCenterRegistrationResponse,
  SortingCenterApplicationSummaryItem,
  SortingCenterApplicationDetail,
  HubDashboardMetrics,
  HubParcelLookupResponse,
  HubParcelReceiveResponse,
  HubParcelListResponse,
  RiderDeliveriesResponse,
  RiderDeliveryView,
  RiderStartDeliveryResponse,
  RiderFailureReasonsResponse,
  RiderDeliveredResponse,
  RiderFailedResponse,
  RiderEarningsPeriodType,
  RiderEarningsSummaryResponse,
  RiderEarningsDeliveriesResponse,
  RiderHistoryFilter,
  RiderHistoryResponse,
  HubDeliveriesOutResponse,
  HubReportKind,
  HubReportRiderSort,
  HubReportRiders,
  HubReportSortDirection,
  HubReportSummary,
  HubDeliveriesFailedResponse,
  HubRescheduleResponse,
  HubReturnToSellerResponse,
  HubDispatchBatchesResponse,
  HubDispatchParcelsResponse,
  HubDispatchRidersResponse,
  HubDispatchAssignResponse,
  HubSortingGroupsResponse,
  HubSortingParcelsResponse,
  HubSortingSort,
  HubSortResponse,
  PublicApprovedHub,
  RiderRegistrationResponse,
  HubRidersListResponse,
  HubRiderDetailItem,
  RiderAreaAssignmentItem,
  HubCoverageOptions,
  RiderProfileData,
  RiderPickupsResponse,
  RiderPickedUpResponse,
  RiderVerifyParcelResponse,
  RiderConfirmHandoverResponse,
  RiderAcceptPickupResponse,
  RiderDeclinePickupResponse,
  RiderReleasePickupResponse,
  ParcelTracking,
  RiderLocationStatus,
  HubAwaitingRider,
  HubEarningsSummary,
} from '../types';

export const http = axios.create({
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
    // A 401 from the sign-in call itself just means "wrong credentials": the page shows the message. Redirecting
    // here would reload the page (or pull a rider off /rider/login) and throw the message away.
    const isSignIn = err.config?.url === '/auth/login';
    if (err.response?.status === 401 && !isSignIn) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
/** `identifier` is an email address or a username (docs/api/auth-login.md). */
export const loginApi = (identifier: string, password: string) =>
  http.post<AuthResponse>('/auth/login', { identifier, password }).then((r) => r.data);

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

// Hubs and couriers apply from the signed-in buyer account, like sellers (no second account or email).
export const applyHubApi = (form: FormData) =>
  http.post<SortingCenterRegistrationResponse>('/auth/apply-hub', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const applyRiderApi = (form: FormData) =>
  http.post<RiderRegistrationResponse>('/auth/apply-rider', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

// ─── Courier companies ─────────────────────────────────────────────────────────

/** Approved couriers: the choices at checkout and on the hub application. */
export const getCouriersApi = () =>
  http.get<{ data: CourierOption[] }>('/logistics/couriers').then((r) => r.data.data);

/** The signed-in buyer applies to run a courier company. */
export const applyCourierApi = (form: FormData) =>
  http.post<{ message: string; data: { user: User; company: LogisticsCompanyDetail } }>('/auth/apply-courier', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export interface CourierApplicationsResponse {
  data: LogisticsCompanyDetail[];
  meta: { current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null };
  counts: { pending: number; approved: number; rejected: number; suspended: number };
}

export const getAdminCourierApplicationsApi = (params: { status?: string; search?: string; page?: number; per_page?: number; sort?: string }) =>
  http.get<CourierApplicationsResponse>('/admin/courier-applications', { params }).then((r) => r.data);
export const getAdminCourierApplicationApi = (id: number) =>
  http.get<{ data: LogisticsCompanyDetail }>(`/admin/courier-applications/${id}`).then((r) => r.data.data);
export const decideAdminCourierApi = (id: number, action: 'approve' | 'reject' | 'suspend' | 'reactivate', reason?: string) =>
  http.post<{ message: string; data: LogisticsCompanyDetail }>(`/admin/courier-applications/${id}/${action}`, reason ? { reason } : {}).then((r) => r.data.data);

// The courier company's own portal (/logistics)
export const getLogisticsMeApi = () => http.get<{ data: LogisticsCompanyDetail }>('/logistics/me').then((r) => r.data.data);
export const getLogisticsDashboardApi = (params?: { from?: string; to?: string }) =>
  http.get<{ data: LogisticsDashboard }>('/logistics/dashboard', { params }).then((r) => r.data.data);
export const getLogisticsHubsApi = (params?: { status?: string; search?: string }) =>
  http.get<{ data: LogisticsHubRow[] }>('/logistics/network/hubs', { params }).then((r) => r.data.data);
export const getLogisticsHubApi = (id: number) =>
  http.get<{ data: SortingCenterApplicationDetail }>(`/logistics/network/hubs/${id}`).then((r) => r.data.data);
export const decideLogisticsHubApi = (id: number, action: 'approve' | 'reject' | 'suspend' | 'reactivate', reason?: string) =>
  http.post<{ message: string }>(`/logistics/network/hubs/${id}/${action}`, reason ? { reason } : {}).then((r) => r.data);
export const getLogisticsRidersApi = (params?: { status?: string; search?: string; hub_id?: number }) =>
  http.get<{ data: LogisticsRiderRow[] }>('/logistics/riders', { params }).then((r) => r.data.data);
export const getLogisticsParcelsApi = (params?: { search?: string; status?: string; hub_id?: number; problems?: 0 | 1; page?: number; per_page?: number }) =>
  http.get<{ data: LogisticsParcelRow[]; meta: CourierApplicationsResponse['meta'] }>('/logistics/parcels', { params }).then((r) => r.data);
export const getLogisticsReportsApi = (params?: { from?: string; to?: string }) =>
  http.get<{ data: LogisticsReport }>('/logistics/reports', { params }).then((r) => r.data.data);

/** Opens a private document (permit, ID) that needs the signed-in token, in a new tab. */
export async function openAuthorizedFile(url: string): Promise<void> {
  const res = await http.get(url, { responseType: 'blob', baseURL: '' });
  const objectUrl = URL.createObjectURL(res.data as Blob);
  window.open(objectUrl, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export const getPublicApprovedHubsApi = (params?: { search?: string; limit?: number }) =>
  http.get<{ data: PublicApprovedHub[] }>('/logistics/hubs', { params }).then((r) => r.data.data);

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
export const getActivityLogApi = (params?: { action?: string; area?: string; admin_id?: number; search?: string; period?: string; page?: number; per_page?: number }) =>
  http.get<PaginatedResponse<ActivityLogEntry> & { summary: ActivityLogSummary }>('/admin/activity-log', { params }).then((r) => r.data);

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

// Admin — sorting center applications
export const getSortingCenterApplicationsApi = (params?: { status?: string; search?: string; sort?: string; page?: number; per_page?: number }) =>
  http
    .get<PaginatedResponse<SortingCenterApplicationSummaryItem>>('/admin/sorting-center-applications', { params })
    .then((r) => r.data);

export const getSortingCenterApplicationDetailApi = (id: number) =>
  http
    .get<{ data: SortingCenterApplicationDetail }>(`/admin/sorting-center-applications/${id}`)
    .then((r) => r.data.data);

export const approveSortingCenterApplicationApi = (id: number) =>
  http.post<{ message: string }>(`/admin/sorting-center-applications/${id}/approve`).then((r) => r.data);

export const rejectSortingCenterApplicationApi = (id: number, reason: string) =>
  http.post<{ message: string }>(`/admin/sorting-center-applications/${id}/reject`, { reason }).then((r) => r.data);

export const getSortingCenterDtiPermitUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/sorting-center-applications/${id}/dti-permit`;

export const getSortingCenterIdImageUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/sorting-center-applications/${id}/id-image`;

export const getSortingCenterIdImageBackUrl = (id: number) =>
  `${http.defaults.baseURL}/admin/sorting-center-applications/${id}/id-image-back`;

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
/** The buyer's orders, one tab and page at a time, with the counts of every tab (B10). */
export const getBuyerOrdersPageApi = (params: { tab?: string; page?: number; per_page?: number; search?: string }) =>
  http.get<{ data: Order[]; meta: { current_page: number; last_page: number; total: number }; counts: Record<string, number> }>('/buyer/orders', { params }).then((r) => r.data);

export const getOrdersApi = (params?: { status?: string; search?: string }) =>
  http.get<{ data: Order[] } | PaginatedResponse<Order>>('/buyer/orders', { params }).then((r) =>
    Array.isArray(r.data.data) ? r.data.data : []
  );

// Admin — orders
export const getAdminOrdersApi = (params?: AdminOrderListParams) =>
  http.get<PaginatedResponse<AdminOrder>>('/admin/orders', { params }).then((r) => r.data);

/** The KPI row and chip counts for the same filters as the list (the status and group filters are ignored). */
export const getAdminOrderSummaryApi = (params?: Omit<AdminOrderListParams, 'status' | 'group' | 'sort' | 'direction' | 'page' | 'per_page'>) =>
  http.get<{ data: AdminOrderSummary }>('/admin/orders/summary', { params }).then((r) => r.data.data);

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
/** status: one status, or several separated by commas (escalated,open,in_progress). */
export const getAdminDisputesApi = (params?: { status?: DisputeStatus | string; search?: string; page?: number }) =>
  http.get<PaginatedResponse<AdminDispute>>('/admin/disputes', { params }).then((r) => r.data);

export const getAdminDisputeApi = (id: number) =>
  http.get<{ data: AdminDispute }>(`/admin/disputes/${id}`).then((r) => r.data.data);

/** Record a decision. An escalated return takes decision=refund|reject; an older claim takes status=resolved|closed. */
export const resolveDisputeApi = (
  id: number,
  body: { decision: 'refund' | 'reject'; resolution_note: string } | { status: 'resolved' | 'closed'; resolution_note: string },
) => http.patch<{ data: AdminDispute }>(`/admin/disputes/${id}/resolve`, body).then((r) => r.data.data);

export const getAdminDisputeStatsApi = () =>
  http.get<{ data: AdminDisputeStats }>('/admin/disputes/stats').then((r) => r.data.data);

// Admin — reviews
// Admin: reviews are read-only (no approve or hide), grouped by shop.
export const getAdminReviewsApi = (params?: AdminReviewListParams) =>
  http.get<PaginatedResponse<AdminReview>>('/admin/reviews', { params }).then((r) => r.data);

export const getAdminReviewSummaryApi = () =>
  http.get<{ data: AdminReviewSummary }>('/admin/reviews/summary').then((r) => r.data.data);

export const getAdminReviewShopsApi = (params?: { search?: string; sort?: AdminReviewShopSort; direction?: 'asc' | 'desc'; page?: number; per_page?: number }) =>
  http.get<PaginatedResponse<AdminReviewShop>>('/admin/reviews/shops', { params }).then((r) => r.data);

export const getAdminReviewShopApi = (shopId: number) =>
  http.get<{ data: AdminReviewShop }>(`/admin/reviews/shops/${shopId}`).then((r) => r.data.data);

// Feedback about the site: sent from the storefront, read by the admin.
export const sendFeedbackApi = (message: string, pageUrl?: string) =>
  http.post('/feedback', { message, page_url: pageUrl }).then((r) => r.data);

export const getAdminFeedbackApi = (params: { status?: 'new' | 'read' | 'all'; search?: string; page?: number; per_page?: number }) =>
  http.get<{ data: AdminFeedback[]; meta: PaginatedResponse<AdminFeedback>['meta'] & { counts: { new: number; read: number; all: number } } }>('/admin/feedback', { params }).then((r) => r.data);

export const updateAdminFeedbackApi = (id: number, status: 'new' | 'read') =>
  http.patch<{ data: AdminFeedback }>(`/admin/feedback/${id}`, { status }).then((r) => r.data.data);

// Products — public catalog
export const getProductsApi = (filters: ProductFilters = {}) => {
  const params: Record<string, string | number | boolean> = {};
  if (filters.q)                  params.q                  = filters.q;
  if (filters.parent_category_id) params.parent_category_id = filters.parent_category_id;
  if (filters.category_id)        params.category_id        = filters.category_id;
  if (filters.store_category_id)  params.store_category_id  = filters.store_category_id;
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
  if (filters.seed != null)       params.seed               = filters.seed;
  return http.get<CatalogResponse>('/products', { params }).then((r) => r.data);
};

// Storefront category tree with product counts and cover photos (landing page, header Categories menu)
export const getStorefrontCategoriesApi = () =>
  http.get<{ data: StorefrontCategory[] }>('/categories').then((r) => r.data.data);

// Products — detail & reviews
/** Sets or clears the buyer's reminder for an upcoming flash sale. */
export const setFlashReminderApi = (flashSaleId: number, on: boolean) =>
  (on ? http.post : http.delete)<{ message: string; data: { reminder_set: boolean } }>(`/flash-sales/${flashSaleId}/reminder`).then((r) => r.data);

export const getProductApi = (id: number) =>
  http.get<{ data: ProductDetail }>(`/products/${id}`).then((r) => r.data.data);

export const getProductReviewsApi = (id: number, params?: { rating?: number; sort?: 'recent' | 'relevance'; page?: number }) =>
  http.get<ProductReviewsResponse>(`/products/${id}/reviews`, { params }).then((r) => r.data);

export const getRelatedProductsApi = (id: number) =>
  http.get<{ data: Product[]; meta: CatalogMeta }>(`/products/${id}/related`).then((r) => r.data);

export const toggleWishlistApi = (productId: number) =>
  http.post<{ wishlisted: boolean }>(`/wishlist/toggle`, { product_id: productId }).then((r) => r.data);

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

export const getSellerDashboardChartApi = (range: '7d' | '14d' = '14d') =>
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
  address_province_code?: string | null;
  address_city_code?: string | null;
  address_barangay_code?: string | null;
  address_needs_update?: boolean;
  address_region?: string | null;
  address_region_code?: string | null;
  address_postal_code?: string | null;
  on_vacation?: boolean;
  vacation_started_at?: string | null;
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

// Creating, saving, pricing and publishing products: api/sellerCatalog.ts.
export const uploadDescriptionImageApi = (file: File) => {
  const fd = new FormData();
  fd.append('image', file);
  return http.post<{ url: string }>('/seller/products/description-image', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

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
  weight_kg?: number | null;
  dimension_l_cm?: number | null;
  dimension_w_cm?: number | null;
  dimension_h_cm?: number | null;
  sku?: string | null;
  category?: { id: number; name: string; slug: string } | null;
  thumbnail_url: string | null;
  images: { id: number; url: string; is_primary: boolean; sort_order: number }[];
  variants: { id: number; label: string; sku: string | null; price: number; stock_quantity: number }[];
  seller: {
    id: number;
    full_name: string;
    email: string;
    phone?: string | null;
    shop_name?: string | null;
    shop_slug?: string | null;
    avatar_url?: string | null;
    /** The shop's public profile (null when the seller has no seller profile). */
    shop?: {
      logo_url: string | null;
      banner_url: string | null;
      category: string | null;
      bio: string | null;
      city: string | null;
      province: string | null;
      contact_number: string | null;
      response_time: string | null;
      approved_at: string | null;
    } | null;
  } | null;
  created_at: string;
  fda_lto_on_file?: boolean;
  fda_cpr_on_file?: boolean;
  fda_lto_url?: string | null;
  fda_cpr_url?: string | null;
  net_weight_volume?: string | null;
  expiry_best_before?: string | null;
  ingredients?: string | null;
  storage_instructions?: string | null;
  allergen_info?: string | null;
}

export const getAdminProductApi = (id: number) =>
  http.get<{ data: AdminProduct }>(`/admin/products/${id}`).then((r) => r.data.data);

export const getAdminProductDocBlobUrl = async (productId: number, docType: 'fda-lto' | 'fda-cpr') => {
  const res = await http.get(`/admin/products/${productId}/${docType}`, { responseType: 'blob' });
  const blob = res.data as Blob;
  return {
    url: URL.createObjectURL(blob),
    type: blob.type,
  };
};

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

// ─── Messaging & Chat (Buyer, Seller, Admin) ───────────────────────────────────

export const getConversationsApi = (params?: {
  type?: string;
  status?: string;
  unread_only?: boolean;
  search?: string;
}) =>
  http.get<{ data: Conversation[] }>('/conversations', { params }).then((r) => r.data.data);

export const getUnreadMessagesCountApi = () =>
  http.get<{ data: { unread_count: number } }>('/conversations/unread-count').then((r) => r.data.data.unread_count);

export const startConversationApi = (payload: {
  type: 'buyer_seller' | 'buyer_admin' | 'seller_admin';
  seller_id?: number;
  buyer_id?: number;
  product_id?: number;
  order_id?: number;
  subject?: string;
  initial_message?: string;
}) =>
  http.post<{ data: Conversation }>('/conversations/start', payload).then((r) => r.data.data);

export const getConversationDetailsApi = (conversationId: number) =>
  http.get<{ data: Conversation }>(`/conversations/${conversationId}`).then((r) => r.data.data);

export const getConversationMessagesApi = (conversationId: number, since?: string) =>
  http.get<{ data: ChatMessage[] }>(`/conversations/${conversationId}/messages`, {
    params: since ? { since } : undefined,
  }).then((r) => r.data.data);

export const sendConversationMessageApi = (
  conversationId: number,
  payload: string | FormData | { body?: string; attachment_type?: string; attachment_data?: any }
) => {
  if (payload instanceof FormData) {
    return http.post<{ data: ChatMessage }>(`/conversations/${conversationId}/messages`, payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.data);
  }
  const body = typeof payload === 'string' ? { body: payload } : payload;
  return http.post<{ data: ChatMessage }>(`/conversations/${conversationId}/messages`, body).then((r) => r.data.data);
};

export const getAttachableProductsApi = (conversationId: number, q?: string) =>
  http.get<{ data: AttachableProduct[] }>(`/conversations/${conversationId}/attachable-products`, { params: q ? { q } : undefined }).then((r) => r.data.data);

export const getAttachableOrdersApi = (conversationId: number, q?: string) =>
  http.get<{ data: AttachableOrder[] }>(`/conversations/${conversationId}/attachable-orders`, { params: q ? { q } : undefined }).then((r) => r.data.data);

export const updateConversationStatusApi = (conversationId: number, status: 'open' | 'resolved') =>
  http.patch<{ message: string; data: Conversation }>(`/conversations/${conversationId}/status`, { status }).then((r) => r.data);

export const openConversationForSellerApi = (sellerId: number) =>
  startConversationApi({ type: 'seller_admin', seller_id: sellerId });

export const searchAdminContactsApi = (query: string) =>
  http.get<{ data: Array<{ id: number; role: 'seller' | 'buyer'; name: string; email: string; avatar_url: string | null; shop_name?: string; shop_logo?: string }> }>(
    '/admin/contacts/search',
    { params: { query } }
  ).then((r) => r.data.data);

// ─── Buyer Checkout & Orders ──────────────────────────────────────────────────

export const getBuyerOrdersApi = (params?: { status?: string; page?: number }) =>
  http.get<PaginatedResponse<Order>>('/buyer/orders', { params }).then((r) => r.data);

export const getBuyerOrderApi = (id: number) =>
  http.get<{ data: Order }>(`/buyer/orders/${id}`).then((r) => r.data.data);

export const confirmBuyerOrderReceiptApi = (orderId: number) =>
  http.post<{ message: string; data: Order }>(`/buyer/orders/${orderId}/confirm-receipt`).then((r) => r.data);

/** Fetches the delivery proof photo through the authorized endpoint and returns a blob URL to show it. */
export const getDeliveryProofBlobUrl = async (trackingNumber: string, photo: 1 | 2 = 1): Promise<string> => {
  const res = await http.get(`/parcels/${encodeURIComponent(trackingNumber)}/delivery-proof`, { params: photo === 2 ? { photo: 2 } : undefined, responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
};

// ─── Platform Policies (Hybrid Model) ──────────────────────────────────────────

export const getPlatformPoliciesApi = () =>
  http.get<{ data: { return_policy: any } }>('/platform/policies').then((r) => r.data.data);

export const getAdminReturnPolicySettingsApi = () =>
  http.get<{ data: ReturnPolicySettings }>('/admin/settings/return-policy').then((r) => r.data.data);

export const updateAdminReturnPolicySettingsApi = (payload: Omit<ReturnPolicySettings, 'non_returnable_categories'> & { non_returnable_categories?: Record<string, string> }) =>
  http.post<{ message: string; data: ReturnPolicySettings }>('/admin/settings/return-policy', payload).then((r) => r.data);

// ─── Seller Orders & Payment Verification ─────────────────────────────────────

export const getSellerOrdersApi = (params?: { status?: string; tab?: string; search?: string; page?: number; from?: string; to?: string }) =>
  http.get<PaginatedResponse<SellerOrder> & { counts?: Record<string, number> }>(
    '/seller/orders',
    { params }
  ).then((r) => r.data);

export const getSellerOrderApi = (id: number) =>
  http.get<{ data: SellerOrder }>(`/seller/orders/${id}`).then((r) => r.data.data);

export const getSellerOrderWaybillApi = (id: number) =>
  http.get<{ data: WaybillData }>(`/seller/orders/${id}/waybill`).then((r) => r.data.data);

export const confirmSellerOrderPaymentApi = (orderId: number) =>
  http.post<{ message: string; data: SellerOrder }>(`/seller/orders/${orderId}/confirm-payment`).then((r) => r.data);

export const rejectSellerOrderPaymentApi = (orderId: number, reason: string) =>
  http.post<{ message: string; data: SellerOrder }>(`/seller/orders/${orderId}/reject-payment`, { reason }).then((r) => r.data);

export const updateSellerOrderStatusApi = (orderId: number, status: string) =>
  http.patch<{ message: string; data: SellerOrder }>(`/seller/orders/${orderId}/status`, { status }).then((r) => r.data);

// ─── Seller Earnings & Payouts ─────────────────────────────────────────────────

export const getSellerEarningsSummaryApi = () =>
  http.get<{ data: SellerEarningsSummary }>('/seller/earnings').then((r) => r.data.data);

export const getSellerOrderEarningsApi = (params?: { page?: number }) =>
  http.get<PaginatedResponse<SellerOrderEarningsItem>>('/seller/earnings/orders', { params }).then((r) => r.data);

export const getSellerPayoutsApi = (params?: { page?: number }) =>
  http.get<PaginatedResponse<PayoutRequest>>('/seller/payouts', { params }).then((r) => r.data);

export const requestSellerPayoutApi = (payload: { amount: number; gcash_number: string; gcash_name: string }) =>
  http.post<{ message: string; data: PayoutRequest }>('/seller/payouts/request', payload).then((r) => r.data);

// ─── Admin Payouts ─────────────────────────────────────────────────────────────

export const getAdminPayoutsApi = (params?: { status?: string; search?: string; page?: number }) =>
  http.get<PaginatedResponse<PayoutRequest>>('/admin/payouts', { params }).then((r) => r.data);

export const markAdminPayoutSentApi = (id: number, admin_notes?: string) =>
  http.post<{ message: string }>(`/admin/payouts/${id}/mark-sent`, { admin_notes }).then((r) => r.data);

export const completeAdminPayoutApi = (id: number, admin_notes?: string) =>
  http.post<{ message: string }>(`/admin/payouts/${id}/complete`, { admin_notes }).then((r) => r.data);

export const rejectAdminPayoutApi = (id: number, reason: string) =>
  http.post<{ message: string }>(`/admin/payouts/${id}/reject`, { reason }).then((r) => r.data);

export const getAdminPaymentListApi = (params?: { status?: string; method?: string; search?: string; page?: number }) =>
  http.get<PaginatedResponse<AdminPaymentListItem> & { stats?: Record<string, number> }>('/admin/payments', { params }).then((r) => r.data);

// ─── Admin Reports ─────────────────────────────────────────────────────────────

// Every report takes the same range: explicit `from`/`to` (Manila days, YYYY-MM-DD) or a `range` preset.
export const getAdminReportSummaryApi = (params?: ReportRangeParams) =>
  http.get<{ data: AdminReportSummary }>('/admin/reports/summary', { params }).then((r) => r.data.data);

export const getAdminRevenueChartApi = (params?: ReportRangeParams & { interval?: string }) =>
  http.get<{ data: AdminRevenueChartPoint[] }>('/admin/reports/revenue-chart', { params }).then((r) => r.data.data);

export const getAdminCategoryBreakdownApi = (params?: ReportRangeParams) =>
  http.get<{ data: CategoryBreakdownItem[] }>('/admin/reports/category-breakdown', { params }).then((r) => r.data.data);

export const getAdminTopSellersApi = (params?: ReportRangeParams) =>
  http.get<{ data: TopSellerItem[] }>('/admin/reports/top-sellers', { params }).then((r) => r.data.data);

export const getAdminPaymentSplitApi = (params?: ReportRangeParams) =>
  http.get<{ data: PaymentMethodSplit }>('/admin/reports/payment-method-split', { params }).then((r) => r.data.data);

// ─── Admin Commission Settings ────────────────────────────────────────────────

export const getAdminCommissionSettingsApi = () =>
  http.get<{ data: CommissionSettings }>('/admin/settings/commission').then((r) => r.data.data);

export const updateAdminCommissionSettingsApi = (payload: { base_rate_percent: number; overrides: { category_id: number; rate_percent: number }[] }) =>
  http.post<{ message: string; data: CommissionSettings }>('/admin/settings/commission', payload).then((r) => r.data);

// ─── Seller Reports ────────────────────────────────────────────────────────────

/** A report window: a preset (today, 7d, 30d, 90d, 12m) or a custom from/to in Manila dates, both days included. */
export type SellerReportWindow = { range?: string; from?: string; to?: string };

export const getSellerReportSummaryApi = (params?: SellerReportWindow) =>
  http.get<{ data: SellerReportSummary }>('/seller/reports/summary', { params }).then((r) => r.data.data);

export const getSellerRevenueChartApi = (params?: SellerReportWindow & { interval?: string }) =>
  http.get<{ data: SellerRevenueChartPoint[] }>('/seller/reports/revenue-chart', { params }).then((r) => r.data.data);

export const getSellerPaymentMethodsApi = (params?: SellerReportWindow) =>
  http.get<{ data: PaymentMethodSplit }>('/seller/reports/payment-methods', { params }).then((r) => r.data.data);

export const getSellerReportTopProductsApi = (params?: SellerReportWindow) =>
  http.get<{ data: SellerTopProduct[] }>('/seller/reports/top-products', { params }).then((r) => r.data.data);

// ─── Admin Categories Management ──────────────────────────────────────────────

export const getAdminCategoriesApi = () =>
  http.get<{ data: AdminCategoryParent[]; metrics: AdminCategoryMetrics }>('/admin/categories').then((r) => r.data);

export const createAdminCategoryApi = (payload: CategoryPayload) =>
  http.post<{ message: string; data: any }>('/admin/categories', payload).then((r) => r.data);

export const updateAdminCategoryApi = (id: number, payload: Partial<CategoryPayload>) =>
  http.put<{ message: string; data: any }>(`/admin/categories/${id}`, payload).then((r) => r.data);

export const deleteAdminCategoryApi = (id: number) =>
  http.delete<{ message: string }>(`/admin/categories/${id}`).then((r) => r.data);

// ─── Logistics / Sorting Center Hub Dashboard ───────────────────────────────────

export const getHubDashboardMetricsApi = () =>
  http.get<{ data: HubDashboardMetrics }>('/hub/dashboard/metrics').then((r) => r.data.data);

// ─── Hub Parcel Intake (Feature 1.6) ─────────────────────────────────────────────

export const lookupHubParcelApi = (tracking: string) =>
  http.get<HubParcelLookupResponse>(`/hub/parcels/${encodeURIComponent(tracking)}`).then((r) => r.data);

export const receiveHubParcelApi = (tracking: string) =>
  http
    .post<HubParcelReceiveResponse>(`/hub/parcels/${encodeURIComponent(tracking)}/receive`)
    .then((r) => r.data);

export const getHubExpectedParcelsApi = (params: { page?: number; per_page?: number } = {}) =>
  http.get<HubParcelListResponse>('/hub/intake/expected', { params }).then((r) => r.data);

export const getHubReceivedTodayApi = (params: { page?: number; per_page?: number } = {}) =>
  http.get<HubParcelListResponse>('/hub/intake/received-today', { params }).then((r) => r.data);

// ─── Hub Area Sorting (Feature 1.7) ──────────────────────────────────────────────

export const getHubSortingGroupsApi = (params: { search?: string; sort?: HubSortingSort } = {}) =>
  http.get<HubSortingGroupsResponse>('/hub/sorting/groups', { params }).then((r) => r.data);

export const getHubSortingGroupParcelsApi = (
  barangayCode: string,
  params: { page?: number; per_page?: number } = {}
) =>
  http
    .get<HubSortingParcelsResponse>(`/hub/sorting/groups/${encodeURIComponent(barangayCode)}/parcels`, { params })
    .then((r) => r.data);

export const sortHubParcelsApi = (trackingNumbers: string[]) =>
  http.post<HubSortResponse>('/hub/sorting/sort', { tracking_numbers: trackingNumbers }).then((r) => r.data);

// ─── Rider Delivery Console (Feature 2.6) ────────────────────────────────────────

export const getRiderDeliveriesApi = (view: RiderDeliveryView = 'assigned') =>
  http.get<RiderDeliveriesResponse>('/rider/deliveries', { params: { view } }).then((r) => r.data);

export const startRiderDeliveryApi = (trackingNumbers: string[]) =>
  http
    .post<RiderStartDeliveryResponse>('/rider/deliveries/start', { tracking_numbers: trackingNumbers })
    .then((r) => r.data);

// ─── Rider Delivery Outcomes (Feature 2.7) ───────────────────────────────────────

export const getRiderFailureReasonsApi = () =>
  http.get<RiderFailureReasonsResponse>('/rider/deliveries/failure-reasons').then((r) => r.data.data);

export const markRiderDeliveredApi = (
  trackingNumber: string,
  form: FormData,
  onProgress?: (percent: number) => void
) =>
  http
    .post<RiderDeliveredResponse>(`/rider/deliveries/${encodeURIComponent(trackingNumber)}/delivered`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    })
    .then((r) => r.data);

export const markRiderFailedApi = (trackingNumber: string, reason: string, note: string | null) =>
  http
    .post<RiderFailedResponse>(`/rider/deliveries/${encodeURIComponent(trackingNumber)}/failed`, {
      reason,
      note,
    })
    .then((r) => r.data);

// ─── Hub Delivery Monitoring and Failure Triage (Feature 1.9) ─────────────────────

export const getHubDeliveriesOutApi = (params: { search?: string; rider_id?: number } = {}) =>
  http.get<HubDeliveriesOutResponse>('/hub/deliveries/out', { params }).then((r) => r.data);

export const getHubDeliveriesFailedApi = (
  params: { search?: string; reason?: string; page?: number; per_page?: number } = {}
) => http.get<HubDeliveriesFailedResponse>('/hub/deliveries/failed', { params }).then((r) => r.data);

export const rescheduleHubDeliveryApi = (trackingNumber: string, riderId: number) =>
  http
    .post<HubRescheduleResponse>(`/hub/deliveries/${encodeURIComponent(trackingNumber)}/reschedule`, {
      rider_id: riderId,
    })
    .then((r) => r.data);

export const returnHubDeliveryToSellerApi = (trackingNumber: string, note: string | null) =>
  http
    .post<HubReturnToSellerResponse>(`/hub/deliveries/${encodeURIComponent(trackingNumber)}/return-to-seller`, {
      note,
    })
    .then((r) => r.data);

// ─── Hub Dispatch (Feature 1.8) ──────────────────────────────────────────────────

export const getHubDispatchBatchesApi = (params: { search?: string; sort?: HubSortingSort } = {}) =>
  http.get<HubDispatchBatchesResponse>('/hub/dispatch/batches', { params }).then((r) => r.data);

export const getHubDispatchBatchParcelsApi = (
  barangayCode: string,
  params: { page?: number; per_page?: number } = {}
) =>
  http
    .get<HubDispatchParcelsResponse>(`/hub/dispatch/batches/${encodeURIComponent(barangayCode)}/parcels`, { params })
    .then((r) => r.data);

export const getHubDispatchBatchRidersApi = (barangayCode: string) =>
  http
    .get<HubDispatchRidersResponse>(`/hub/dispatch/batches/${encodeURIComponent(barangayCode)}/riders`)
    .then((r) => r.data);

export const assignHubParcelsApi = (riderId: number, trackingNumbers: string[]) =>
  http
    .post<HubDispatchAssignResponse>('/hub/dispatch/assign', { rider_id: riderId, tracking_numbers: trackingNumbers })
    .then((r) => r.data);

// ─── Logistics / Sorting Center Hub Courier Vetting & Area Mapping ─────────────

export const getHubRidersApi = (params?: {
  status?: string;
  search?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}) =>
  http.get<HubRidersListResponse>('/hub/riders', { params }).then((r) => r.data);

export const getHubRiderDetailApi = (riderId: number) =>
  http.get<{ data: HubRiderDetailItem }>(`/hub/riders/${riderId}`).then((r) => r.data.data);

export const approveHubRiderApi = (
  riderId: number,
  payload?: { area_label?: string; coverage_barangays?: string[] }
) =>
  http.post<{ message: string; data: HubRiderDetailItem }>(`/hub/riders/${riderId}/approve`, payload).then((r) => r.data);

export const disapproveHubRiderApi = (riderId: number, reason: string) =>
  http.post<{ message: string; data: HubRiderDetailItem }>(`/hub/riders/${riderId}/disapprove`, { reason }).then((r) => r.data);

export const getHubCoverageOptionsApi = () =>
  http.get<{ data: HubCoverageOptions }>('/hub/coverage-options').then((r) => r.data.data);

export const getHubRiderAreasApi = (riderId: number) =>
  http.get<{ data: RiderAreaAssignmentItem[] }>(`/hub/riders/${riderId}/areas`).then((r) => r.data.data);

export const createHubRiderAreaApi = (
  riderId: number,
  payload: { area_label: string; coverage_barangays: string[] }
) =>
  http.post<{ message: string; data: RiderAreaAssignmentItem }>(`/hub/riders/${riderId}/areas`, payload).then((r) => r.data);

export const updateHubRiderAreaApi = (
  riderId: number,
  areaId: number,
  payload: { area_label?: string; coverage_barangays?: string[]; is_active?: boolean }
) =>
  http.put<{ message: string; data: RiderAreaAssignmentItem }>(`/hub/riders/${riderId}/areas/${areaId}`, payload).then((r) => r.data);

export const deactivateHubRiderAreaApi = (riderId: number, areaId: number) =>
  http.delete<{ message: string; data: RiderAreaAssignmentItem }>(`/hub/riders/${riderId}/areas/${areaId}`).then((r) => r.data);

// ─── Courier / Rider Workstation ──────────────────────────────────────────────

export const getRiderMeApi = () =>
  http.get<{ data: RiderProfileData }>('/rider/me').then((r) => r.data.data);

// ─── Courier / Rider Pickups (Feature 2.4) ────────────────────────────────────

export const getRiderPickupsApi = (view: 'available' | 'mine' = 'available') =>
  http.get<RiderPickupsResponse>('/rider/pickups', { params: { view } }).then((r) => r.data);

// ─── Courier / Rider Pickup Execution (Feature 2.5) ───────────────────────────

export const getRiderPickedUpApi = () =>
  http.get<RiderPickedUpResponse>('/rider/pickups', { params: { view: 'picked_up' } }).then((r) => r.data);

export const verifyRiderParcelApi = (trackingNumber: string) =>
  http
    .post<RiderVerifyParcelResponse>('/rider/pickups/verify', { tracking_number: trackingNumber })
    .then((r) => r.data);

export const confirmRiderHandoverApi = (trackingNumbers: string[]) =>
  http
    .post<RiderConfirmHandoverResponse>('/rider/pickups/confirm', { tracking_numbers: trackingNumbers })
    .then((r) => r.data);

export const acceptRiderPickupApi = (sellerId: number) =>
  http.post<RiderAcceptPickupResponse>(`/rider/pickups/sellers/${sellerId}/accept`).then((r) => r.data);

export const declineRiderPickupApi = (sellerId: number) =>
  http.post<RiderDeclinePickupResponse>(`/rider/pickups/sellers/${sellerId}/decline`).then((r) => r.data);

export const releaseRiderPickupApi = (sellerId: number) =>
  http.post<RiderReleasePickupResponse>(`/rider/pickups/sellers/${sellerId}/release`).then((r) => r.data);

// ─── Rider Earnings and History (Feature 2.9) ────────────────────────────────────

export const getRiderEarningsSummaryApi = (period: RiderEarningsPeriodType, date?: string) =>
  http
    .get<RiderEarningsSummaryResponse>('/rider/earnings/summary', { params: { period, date } })
    .then((r) => r.data.data);

export const getRiderEarningsDeliveriesApi = (period: RiderEarningsPeriodType, date?: string, page = 1) =>
  http
    .get<RiderEarningsDeliveriesResponse>('/rider/earnings/deliveries', { params: { period, date, page } })
    .then((r) => r.data);

export const getRiderHistoryApi = (params: {
  outcome?: RiderHistoryFilter;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
}) =>
  http
    .get<RiderHistoryResponse>('/rider/history', {
      params: {
        outcome: params.outcome,
        from: params.from || undefined,
        to: params.to || undefined,
        search: params.search || undefined,
        page: params.page,
      },
    })
    .then((r) => r.data);


// ─── Hub reports (Feature 1.10) ───────────────────────────────────────────────

export const getHubReportSummaryApi = (params: { from: string; to: string }) =>
  http.get<{ data: HubReportSummary }>('/hub/reports/summary', { params }).then((r) => r.data.data);

export const getHubReportRidersApi = (params: {
  from: string;
  to: string;
  sort?: HubReportRiderSort;
  direction?: HubReportSortDirection;
}) => http.get<{ data: HubReportRiders }>('/hub/reports/riders', { params }).then((r) => r.data.data);

/**
 * Downloads a report as a CSV file. The API needs the bearer token, so a plain link cannot do it: the file is fetched
 * as a blob and saved through a temporary link.
 */
export async function downloadHubReportApi(params: {
  report: HubReportKind;
  from: string;
  to: string;
  sort?: HubReportRiderSort;
  direction?: HubReportSortDirection;
}): Promise<void> {
  let res;
  try {
    res = await http.get<Blob>('/hub/reports/export', { params, responseType: 'blob' });
  } catch (err: unknown) {
    // With responseType 'blob' an error body is a Blob too, so read the API's message out of it.
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      let message = 'The export could not be created.';
      try {
        const body = JSON.parse(await err.response.data.text()) as { message?: string; errors?: Record<string, string[]> };
        message = Object.values(body.errors ?? {}).flat()[0] ?? body.message ?? message;
      } catch {
        // keep the generic message
      }
      throw new Error(message);
    }
    throw err;
  }

  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `hub-${params.report}-report.csv`;

  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ─── Rider delivery chat and vehicle (Feature 2.10) ───────────────────────────

export const getRiderChatThreadsApi = (params?: { per_page?: number; page?: number; unread_only?: boolean }) =>
  http.get<RiderThreadsResponse>('/rider/chat/threads', { params }).then((r) => r.data);

export const getRiderChatUnreadApi = () =>
  http.get<{ data: RiderChatUnreadItem[]; meta: { unread_total: number } }>('/rider/chat/unread').then((r) => r.data);

/** Opens (or finds) the rider's thread with one counterpart for a parcel. */
export const openRiderChatThreadApi = (trackingNumber: string, counterpart: RiderChatCounterpart) =>
  http
    .post<{ data: RiderThread }>(`/rider/chat/parcels/${encodeURIComponent(trackingNumber)}/threads`, { counterpart })
    .then((r) => r.data.data);

export const updateRiderVehicleApi = (payload: RiderVehicleUpdate) =>
  http
    .put<{ message: string; data: RiderProfileData }>('/rider/vehicle', payload)
    .then((r) => r.data);

export const getHubChatThreadsApi = (params?: { per_page?: number; page?: number; unread_only?: boolean }) =>
  http.get<RiderThreadsResponse>('/hub/chat/threads', { params }).then((r) => r.data);

type ThreadEndpoints = { messages: string; read?: string };

function threadAdapter(endpoints: ThreadEndpoints): ThreadAdapter {
  return {
    fetchMessages: (afterId) =>
      http
        .get<ThreadMessagesResult>(endpoints.messages, { params: afterId ? { after_id: afterId } : undefined })
        .then((r) => r.data),
    sendMessage: (body) => http.post<{ data: ChatMessage }>(endpoints.messages, { body }).then((r) => r.data.data),
    markRead: endpoints.read ? () => http.post(endpoints.read as string).then(() => undefined) : undefined,
  };
}

/** The rider's side of a thread. Fetching never marks read; markRead is called explicitly. */
export const riderThreadAdapter = (threadId: number): ThreadAdapter =>
  threadAdapter({ messages: `/rider/chat/threads/${threadId}/messages`, read: `/rider/chat/threads/${threadId}/read` });

export const hubThreadAdapter = (threadId: number): ThreadAdapter =>
  threadAdapter({ messages: `/hub/chat/threads/${threadId}/messages`, read: `/hub/chat/threads/${threadId}/read` });

/** The buyer's or seller's side: the existing conversation endpoints, which mark read as they fetch. */
export const conversationThreadAdapter = (threadId: number): ThreadAdapter =>
  threadAdapter({ messages: `/conversations/${threadId}/messages` });

// ─── Track package and live courier location ───────────────────────────────────

export const getParcelTrackingApi = (trackingNumber: string) =>
  http.get<{ data: ParcelTracking }>(`/parcels/${encodeURIComponent(trackingNumber)}/tracking`).then((r) => r.data.data);

export const getRiderLocationStatusApi = () =>
  http.get<{ data: RiderLocationStatus }>('/rider/location/status').then((r) => r.data.data);

export const postRiderLocationApi = (point: { latitude: number; longitude: number; heading?: number | null; accuracy?: number | null }) =>
  http.post<{ message: string }>('/rider/location', point).then((r) => r.data);

export const getHubAwaitingPickupApi = () =>
  http.get<{ data: HubAwaitingRider[]; meta: { parcel_count: number } }>('/hub/dispatch/awaiting-pickup').then((r) => r.data);

export const getHubEarningsApi = () => http.get<{ data: HubEarningsSummary }>('/hub/earnings').then((r) => r.data.data);

/** The most-ordered shops with their best sellers, for the storefront (cached on the server). */
export const getFeaturedShopsApi = (limit = 4) =>
  http.get<{ data: FeaturedShop[] }>('/shops', { params: { limit } }).then((r) => r.data.data);

// ─── Buyer reviews ───────────────────────────────────────────────────────────

export const getPendingReviewsApi = () =>
  http.get<{ data: PendingReview[] }>('/buyer/reviews/pending').then((r) => r.data.data);

export const getMyReviewsApi = () =>
  http.get<{ data: BuyerReview[] }>('/buyer/reviews').then((r) => r.data.data);

/** order_id, product_id, rating, comment and photos[] (up to five). */
export const createReviewApi = (form: FormData) =>
  http.post<{ data: BuyerReview }>('/buyer/reviews', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data);

export const updateReviewApi = (id: number, payload: { rating?: number; comment?: string | null }) =>
  http.patch<{ data: BuyerReview }>(`/buyer/reviews/${id}`, payload).then((r) => r.data.data);

// ─── Direct payments ─────────────────────────────────────────────────────────

/** How each shop in the cart gets paid, and its free delivery minimum. */
export const getShopPaymentInfoApi = (sellerIds: number[]) =>
  http.get<{ data: ShopPaymentInfo[] }>('/checkout/shops', { params: { seller_ids: sellerIds.join(',') } }).then((r) => r.data.data);

export const getSellerPaymentSettingsApi = () =>
  http.get<{ data: SellerPaymentSettings }>('/seller/payment-settings').then((r) => r.data.data);

/** gcash_number, gcash_account_name, gcash_qr (file), remove_qr, free_delivery_min */
export const updateSellerPaymentSettingsApi = (form: FormData) =>
  http.post<{ data: SellerPaymentSettings }>('/seller/payment-settings', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data);

export const getSellerSettlementsApi = () =>
  http.get<{ data: SettlementWeeks }>('/seller/settlements').then((r) => r.data.data);

export const paySellerSettlementApi = (payload: { company_id: number; week_start: string; reference: string }) =>
  http.post<{ data: SettlementRecord }>('/seller/settlements', payload).then((r) => r.data.data);

export const confirmSellerSettlementApi = (id: number) =>
  http.post<{ data: SettlementRecord }>(`/seller/settlements/${id}/confirm`).then((r) => r.data.data);

export const getSellerCommissionApi = () =>
  http.get<{ data: { months: SellerCommissionMonth[]; platform_gcash: GcashAccount | null } }>('/seller/commission').then((r) => r.data.data);

export const paySellerCommissionApi = (payload: { period: string; reference: string }) =>
  http.post<{ data: CommissionPaymentRecord }>('/seller/commission', payload).then((r) => r.data.data);

export const getCourierSettlementsApi = () =>
  http.get<{ data: SettlementWeeks }>('/logistics/settlements').then((r) => r.data.data);

export const payCourierSettlementApi = (payload: { seller_id: number; week_start: string; reference: string }) =>
  http.post<{ data: SettlementRecord }>('/logistics/settlements', payload).then((r) => r.data.data);

export const confirmCourierSettlementApi = (id: number) =>
  http.post<{ data: SettlementRecord }>(`/logistics/settlements/${id}/confirm`).then((r) => r.data.data);

export const getCourierPayoutsApi = () =>
  http.get<{ data: { riders: CourierPayoutRow[]; hubs: CourierPayoutRow[] } }>('/logistics/payouts').then((r) => r.data.data);

export const payCourierRiderApi = (riderId: number, reference: string) =>
  http.post<{ data: { paid_count: number } }>(`/logistics/payouts/riders/${riderId}`, { reference }).then((r) => r.data.data);

export const payCourierHubApi = (hubId: number, reference: string) =>
  http.post<{ data: { paid_count: number } }>(`/logistics/payouts/hubs/${hubId}`, { reference }).then((r) => r.data.data);

/** The GCash a rider ('rider'), hub ('hub') or courier company ('logistics') is paid on. */
export const getPayoutAccountApi = (who: 'rider' | 'hub' | 'logistics') =>
  http.get<{ data: PayoutAccount }>(`/${who}/gcash`).then((r) => r.data.data);

export const updatePayoutAccountApi = (who: 'rider' | 'hub' | 'logistics', payload: { gcash_number: string | null; gcash_name: string | null }) =>
  http.patch<{ data: PayoutAccount }>(`/${who}/gcash`, payload).then((r) => r.data.data);

export const getAdminCommissionApi = (period?: string) =>
  http.get<{ data: AdminCommissionReport }>('/admin/commission', { params: period ? { period } : undefined }).then((r) => r.data.data);

export const confirmAdminCommissionApi = (id: number) =>
  http.post<{ data: CommissionPaymentRecord }>(`/admin/commission/${id}/confirm`).then((r) => r.data.data);

export const getAdminPaymentSettingsApi = () =>
  http.get<{ data: { platform_gcash_number: string | null; platform_gcash_name: string | null } }>('/admin/settings/payments').then((r) => r.data.data);

export const updateAdminPaymentSettingsApi = (payload: { platform_gcash_number: string | null; platform_gcash_name: string | null }) =>
  http.put<{ data: { platform_gcash_number: string | null; platform_gcash_name: string | null } }>('/admin/settings/payments', payload).then((r) => r.data.data);
