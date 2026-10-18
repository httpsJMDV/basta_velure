import { http } from './client';

// ─── Cart (server) ──────────────────────────────────────────────────────────

export type LineStatus = 'available' | 'sold_out' | 'unavailable' | 'on_vacation' | 'insufficient_stock' | 'limit_exceeded';

export interface CartLine {
  id: number;
  variant_id: number;
  product_id: number;
  name: string;
  variant_label: string | null;
  image_url: string | null;
  quantity: number;
  selected: boolean;
  status: LineStatus;
  message: string | null;
  stock: number;
  max_quantity: number;
  purchase_limit: number | null;
  unit_price: number;
  regular_price: number;
  price_source: 'regular' | 'sale' | 'flash';
  subtotal: number;
  segments: { quantity: number; unit_price: number; price_source: string }[];
  price_seen: number | null;
  price_changed: 'up' | 'down' | null;
  promo_share: number;
  free_quantity: number;
}

export interface StoreRef {
  id: number;
  shop_name: string;
  shop_slug: string | null;
  accepts_gcash: boolean;
  on_vacation: boolean;
}

export interface AppliedPromotion { id: number; type: 'bundle' | 'bxgy'; name: string; discount: number }

export interface CartStore {
  seller: StoreRef;
  lines: CartLine[];
  promotions: AppliedPromotion[];
  selected_subtotal: number;
  promo_discount: number;
}

export interface CartView {
  stores: CartStore[];
  summary: {
    lines: number; units: number; selected_lines: number; selected_units: number;
    merchandise: number; promo_discount: number; total: number; has_unavailable: boolean;
  };
}

export const getCartApi = () => http.get<{ data: CartView }>('/cart').then((r) => r.data.data);
export const addCartItemApi = (variantId: number, quantity: number | string) =>
  http.post<{ data: CartView; message: string }>('/cart/items', { variant_id: variantId, quantity }).then((r) => r.data);
export const updateCartItemApi = (id: number, changes: { quantity?: number | string; selected?: boolean }) =>
  http.patch<{ data: CartView }>(`/cart/items/${id}`, changes).then((r) => r.data.data);
export const removeCartItemApi = (id: number) => http.delete<{ data: CartView }>(`/cart/items/${id}`).then((r) => r.data.data);
export const selectCartApi = (selected: boolean, sellerId?: number) =>
  http.post<{ data: CartView }>('/cart/select', { selected, seller_id: sellerId ?? null }).then((r) => r.data.data);
export const mergeCartApi = (items: { variant_id: number; quantity: number }[]) =>
  http.post<{ data: CartView; skipped: { variant_id: number; message: string }[] }>('/cart/merge', { items }).then((r) => r.data);

// ─── Checkout ───────────────────────────────────────────────────────────────

export interface QuoteLine {
  key: string;
  variant_id: number;
  product_id: number;
  name: string;
  variant_label: string | null;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  regular_price: number;
  price_source: 'regular' | 'sale' | 'flash';
  subtotal: number;
  stock: number;
  status: LineStatus;
  message: string | null;
  promo_share: number;
  free_quantity: number;
  store_voucher_share: number;
}

export interface QuoteVoucher {
  id?: number;
  code: string;
  name?: string;
  label?: string;
  applied: boolean;
  discount: number;
  message: string | null;
}

export interface QuoteStore {
  seller: StoreRef;
  lines: QuoteLine[];
  promotions: AppliedPromotion[];
  merchandise: number;
  promo_discount: number;
  store_voucher: QuoteVoucher | null;
  store_discount: number;
  net_merchandise: number;
  shipping: {
    fee: number; courier_fee: number; chargeable_kg: number; weight_grams: number; route: string | null;
    serviceable: boolean; message: string | null; free_delivery: boolean; company_id: number | null;
  };
  platform_discount: number;
  shipping_discount: number;
  total: number;
}

export interface WalletVoucher {
  id: number;
  code: string;
  name: string;
  scope: 'store' | 'platform' | 'shipping';
  label: string;
  discount_type: 'fixed' | 'percent';
  amount: number;
  max_discount: number | null;
  min_spend: number;
  applies_to: 'all' | 'products';
  product_ids: number[];
  starts_at: string;
  ends_at: string;
  status: 'upcoming' | 'ongoing' | 'ended';
  seller: { id: number; shop_name: string | null; shop_slug: string | null } | null;
  claimed: boolean;
  fully_used: boolean;
  used_up_by_you?: boolean;
  // In a quote: what it would do for this checkout.
  applicable?: boolean;
  discount?: number;
  message?: string | null;
}

export interface CheckoutProblem { type: string; message: string; variant_id?: number; product_id?: number; seller_id?: number }

export interface CheckoutQuote {
  stores: QuoteStore[];
  platform_voucher: QuoteVoucher | null;
  shipping_voucher: QuoteVoucher | null;
  totals: {
    items: number; merchandise: number; promo_discount: number; store_discount: number; platform_discount: number;
    shipping: number; shipping_discount: number; total: number;
  };
  problems: CheckoutProblem[];
  can_place: boolean;
  wallet: WalletVoucher[];
}

export interface CheckoutInput {
  source: 'cart' | 'buy_now';
  items?: { variant_id: number; quantity: number }[];
  address_id?: number;
  vouchers?: { store?: Record<number, string>; platform?: string | null; shipping?: string | null };
}

export const quoteCheckoutApi = (input: CheckoutInput) =>
  http.post<{ data: CheckoutQuote }>('/checkout/quote', input).then((r) => r.data.data);

export interface PaymentSessionView {
  token: string;
  method: 'e_wallet' | 'card';
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  reference: string | null;
  failure: string | null;
  expires_at: string;
  orders: { id: number; order_number: string; total: number; status: string; payment_status: string }[];
}

export interface PlaceOrderResult<O = unknown> {
  message: string;
  repeated: boolean;
  data: O;
  orders: O[];
  checkout_group_id: string;
  payment: PaymentSessionView | null;
}

/** JSON for COD, e-wallet and card; multipart when GCash receipts are attached. */
export const placeCheckoutOrderApi = <O = unknown>(body: Record<string, unknown> | FormData, idempotencyKey: string) =>
  http.post<PlaceOrderResult<O>>('/checkout/place-order', body, {
    headers: { 'Idempotency-Key': idempotencyKey, ...(body instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {}) },
  }).then((r) => r.data);

// ─── Sandbox payment ────────────────────────────────────────────────────────

export const getPaymentSessionApi = (token: string) =>
  http.get<{ data: PaymentSessionView }>(`/payments/sessions/${token}`).then((r) => r.data.data);
export const completePaymentApi = (token: string, outcome: 'success' | 'decline' | 'cancel') =>
  http.post<{ data: PaymentSessionView; message: string }>(`/payments/sessions/${token}/complete`, { outcome }).then((r) => r.data);
export const payAgainApi = (orderId: number) =>
  http.post<{ data: PaymentSessionView; message: string }>(`/buyer/orders/${orderId}/pay-again`).then((r) => r.data.data);

// ─── Vouchers (buyer) ───────────────────────────────────────────────────────

export const getWalletApi = () => http.get<{ data: WalletVoucher[] }>('/buyer/vouchers').then((r) => r.data.data);
export const claimVoucherApi = (by: { voucher_id?: number; code?: string }) =>
  http.post<{ data: WalletVoucher; message: string }>('/buyer/vouchers/claim', by).then((r) => r.data);
export const getShopVouchersApi = (sellerId: number) =>
  http.get<{ data: WalletVoucher[] }>(`/shops/${sellerId}/vouchers`).then((r) => r.data.data);
export const getProductVouchersApi = (productId: number) =>
  http.get<{ data: WalletVoucher[] }>(`/products/${productId}/vouchers`).then((r) => r.data.data);
export const getPlatformVouchersApi = () =>
  http.get<{ data: WalletVoucher[] }>('/vouchers/platform').then((r) => r.data.data);

// ─── Vouchers (owners: shop or Loved-IT) ────────────────────────────────────

export interface ManagedVoucher {
  id: number;
  code: string;
  name: string;
  scope: 'store' | 'platform' | 'shipping';
  label: string;
  discount_type: 'fixed' | 'percent';
  amount: number;
  max_discount: number | null;
  min_spend: number;
  total_limit: number | null;
  per_buyer_limit: number;
  claimable: boolean;
  applies_to: 'all' | 'products';
  product_ids: number[];
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
  status: 'upcoming' | 'ongoing' | 'ended';
  used_count: number;
  claimed_count: number;
  locked: boolean;
}

const voucherBase = (admin: boolean) => (admin ? '/admin/vouchers' : '/seller/vouchers');
export const getManagedVouchersApi = (admin = false) =>
  http.get<{ data: ManagedVoucher[] }>(voucherBase(admin)).then((r) => r.data.data);
export const createVoucherApi = (payload: Record<string, unknown>, admin = false) =>
  http.post<{ data: ManagedVoucher; message: string }>(voucherBase(admin), payload).then((r) => r.data);
export const updateVoucherApi = (id: number, payload: Record<string, unknown>, admin = false) =>
  http.patch<{ data: ManagedVoucher; message: string }>(`${voucherBase(admin)}/${id}`, payload).then((r) => r.data);
export const endVoucherApi = (id: number, admin = false) =>
  http.post<{ data: ManagedVoucher; message: string }>(`${voucherBase(admin)}/${id}/end`).then((r) => r.data);

// ─── Orders: cancel and returns ─────────────────────────────────────────────

export const BUYER_CANCEL_REASONS = ['Changed my mind', 'Found a better price', 'Ordered by mistake', 'Need to change the delivery address', 'Need to change the payment method', 'Other'] as const;
export const SELLER_CANCEL_REASONS = ['Out of stock', 'Buyer asked to cancel', 'Cannot ship to this address', 'Pricing error', 'Other'] as const;
export const RETURN_REASONS = ['Damaged item', 'Wrong item', 'Missing item or parts', 'Not as described', 'Defective or not working', 'Expired product'] as const;

export const cancelBuyerOrderApi = <O = unknown>(orderId: number, reason: string, details?: string) =>
  http.post<{ data: O; message: string }>(`/buyer/orders/${orderId}/cancel`, { reason, details: details || null }).then((r) => r.data);
export const cancelSellerOrderApi = <O = unknown>(orderId: number, reason: string, details?: string) =>
  http.post<{ data: O; message: string }>(`/seller/orders/${orderId}/cancel`, { reason, details: details || null }).then((r) => r.data);
export const requestReturnApi = <O = unknown>(orderId: number, form: FormData) =>
  http.post<{ data: O; message: string }>(`/buyer/orders/${orderId}/request-return`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const escalateReturnApi = <O = unknown>(orderId: number) =>
  http.post<{ data: O; message: string }>(`/buyer/orders/${orderId}/escalate-return`).then((r) => r.data);
/** A13: the parcel of a failed delivery is back at the shop; its stock returns on this confirmation. */
export const confirmReturnReceivedApi = <O = unknown>(orderId: number) =>
  http.post<{ data: O; message: string }>(`/seller/orders/${orderId}/confirm-return-received`).then((r) => r.data);
export const respondReturnApi = <O = unknown>(orderId: number, action: 'approve' | 'reject', reason?: string) =>
  http.post<{ data: O; message: string }>(`/seller/orders/${orderId}/respond-return`, { action, reason: reason || null }).then((r) => r.data);

export interface ReturnRequestView {
  id: number;
  reason: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'closed' | 'open' | 'in_progress' | 'resolved';
  photos: string[];
  respond_by: string | null;
  seller_reason: string | null;
  seller_responded_at: string | null;
  escalate_by: string | null;
  escalated_at: string | null;
  can_escalate: boolean;
  auto_approved: boolean;
  refund_amount: number | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string | null;
}

// ─── Courier delivery zones and rates ───────────────────────────────────────

export interface ZoneArea { id?: number; level: 'region' | 'province' | 'city'; psgc_code: string; name: string; excluded: boolean }
export interface ShippingZoneRow { id: number; name: string; areas: ZoneArea[] }
export interface ShippingRateRow { id: number; origin_zone_id: number; destination_zone_id: number; first_kg: number; additional_kg: number; updated_at: string | null }
export interface ShippingTable { zones: ShippingZoneRow[]; rates: ShippingRateRow[] }

export const getShippingTableApi = () => http.get<{ data: ShippingTable }>('/logistics/shipping').then((r) => r.data.data);
export const createZoneApi = (payload: { name: string; areas: ZoneArea[] }) =>
  http.post<{ data: ShippingTable; message: string }>('/logistics/shipping/zones', payload).then((r) => r.data);
export const updateZoneApi = (id: number, payload: { name: string; areas: ZoneArea[] }) =>
  http.patch<{ data: ShippingTable; message: string }>(`/logistics/shipping/zones/${id}`, payload).then((r) => r.data);
export const deleteZoneApi = (id: number) =>
  http.delete<{ data: ShippingTable; message: string }>(`/logistics/shipping/zones/${id}`).then((r) => r.data);
export const upsertRateApi = (payload: { origin_zone_id: number; destination_zone_id: number; first_kg: string | number; additional_kg: string | number; reason?: string }) =>
  http.put<{ data: ShippingTable; message: string }>('/logistics/shipping/rates', payload).then((r) => r.data);
export const deleteRateApi = (id: number) =>
  http.delete<{ data: ShippingTable; message: string }>(`/logistics/shipping/rates/${id}`).then((r) => r.data);
export const getShippingAuditApi = () =>
  http.get<{ data: { id: number; action: string; old: Record<string, unknown> | null; new: Record<string, unknown> | null; reason: string | null; by: string | null; at: string | null }[] }>('/logistics/shipping/audit').then((r) => r.data.data);
