// The seller's catalogue tools: products (publish, duplicate, bulk), store categories, promotions and reviews.
import { http } from './client';
import type { SellerProduct } from '../types';

/** A new product. The key makes a double-clicked Publish create one product (A37). */
export const createSellerProductKeyedApi = (form: FormData, idempotencyKey: string) =>
  http.post<{ data: SellerProduct; message?: string; repeated?: boolean }>('/seller/products', form, {
    headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': idempotencyKey },
  }).then((r) => r.data);

export const updateSellerProductFullApi = (id: number, form: FormData) =>
  http.post<{ data: SellerProduct; message?: string }>(`/seller/products/${id}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const duplicateSellerProductApi = (id: number) =>
  http.post<{ data: SellerProduct; message: string }>(`/seller/products/${id}/duplicate`).then((r) => r.data);

export const setSellerProductStatusApi = (id: number, status: 'active' | 'archived') =>
  http.patch<{ data: SellerProduct; message: string }>(`/seller/products/${id}/status`, { status }).then((r) => r.data);

/** Sets one variant's stock; variantId may be left out for a product with a single variant. */
export const setVariantStockApi = (id: number, stock: number, variantId?: number) =>
  http.patch<{ data: SellerProduct }>(`/seller/products/${id}/stock`, { stock, variant_id: variantId ?? null }).then((r) => r.data.data);

/** Sets one variant's regular price; sales are priced on top of it. */
export const setVariantPriceApi = (id: number, price: number, variantId?: number) =>
  http.patch<{ data: SellerProduct }>(`/seller/products/${id}/price`, { price, variant_id: variantId ?? null }).then((r) => r.data.data);

export interface BulkResult {
  message: string;
  done: { id: number; name: string }[];
  skipped: { id: number; name: string | null; reason: string }[];
}

export const bulkSellerProductsApi = (action: 'deactivate' | 'activate' | 'delete', ids: number[]) =>
  http.post<BulkResult>('/seller/products/bulk', { action, ids }).then((r) => r.data);

// ─── Store categories ──────────────────────────────────────────────────────

export interface StoreCategoryNode {
  id: number;
  name: string;
  parent_id: number | null;
  is_visible: boolean;
  sort_order: number;
  product_count: number;
  children?: StoreCategoryNode[];
}

export const getStoreCategoriesApi = () =>
  http.get<{ data: StoreCategoryNode[] }>('/seller/store-categories').then((r) => r.data.data);

export const createStoreCategoryApi = (name: string, parentId?: number | null) =>
  http.post<{ data: StoreCategoryNode[]; message: string }>('/seller/store-categories', { name, parent_id: parentId ?? null }).then((r) => r.data);

export const updateStoreCategoryApi = (id: number, payload: { name?: string; is_visible?: boolean }) =>
  http.patch<{ data: StoreCategoryNode[]; message: string }>(`/seller/store-categories/${id}`, payload).then((r) => r.data);

export const reorderStoreCategoriesApi = (ids: number[], parentId: number | null) =>
  http.post<{ data: StoreCategoryNode[]; message: string }>('/seller/store-categories/reorder', { ids, parent_id: parentId }).then((r) => r.data);

export const previewDeleteStoreCategoryApi = (id: number) =>
  http.get<{ data: { name: string; subcategories: string[]; products: number; message: string } }>(`/seller/store-categories/${id}/delete-preview`).then((r) => r.data.data);

export const deleteStoreCategoryApi = (id: number) =>
  http.delete<{ data: StoreCategoryNode[]; message: string }>(`/seller/store-categories/${id}`).then((r) => r.data);

// ─── Promotions ────────────────────────────────────────────────────────────

export type PromoStatus = 'upcoming' | 'ongoing' | 'live' | 'sold_out' | 'ended';

export interface StoreSaleRow {
  id: number;
  product_id: number;
  product_name: string | null;
  discount_type: 'percent' | 'fixed';
  discount_percent: number | null;
  sale_price: number | null;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
  status: PromoStatus;
  prices: { variant_id: number; label: string; regular: number; sale: number }[];
}

export interface FlashSaleRow {
  id: number;
  product_id: number;
  product_name: string | null;
  variant_id: number | null;
  variant_label: string | null;
  regular_price: number;
  flash_price: number;
  quantity: number;
  sold: number;
  remaining: number;
  slot_start: string;
  slot_end: string;
  ended_at: string | null;
  status: PromoStatus;
}

export interface PromotionRow {
  id: number;
  type: 'bundle' | 'bxgy';
  name: string;
  status: PromoStatus;
  min_quantity: number | null;
  discount_percent: number | null;
  products: { id: number; name: string }[];
  buy_product: { id: number; name: string } | null;
  buy_quantity: number | null;
  get_product: { id: number; name: string } | null;
  get_quantity: number | null;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
}

export interface PromotionsOverview {
  sales: StoreSaleRow[];
  flash_sales: FlashSaleRow[];
  bundles: PromotionRow[];
  bxgy: PromotionRow[];
  slots: { date: string; hour: number; label: string }[];
}

export const getPromotionsApi = () =>
  http.get<{ data: PromotionsOverview }>('/seller/promotions').then((r) => r.data.data);

export const createStoreSaleApi = (payload: Record<string, unknown>) =>
  http.post<{ data: StoreSaleRow; message: string }>('/seller/sales', payload).then((r) => r.data);

export const updateStoreSaleApi = (id: number, payload: Record<string, unknown>) =>
  http.patch<{ data: StoreSaleRow; message: string }>(`/seller/sales/${id}`, payload).then((r) => r.data);

export const endStoreSaleApi = (id: number) =>
  http.post<{ data: StoreSaleRow; message: string }>(`/seller/sales/${id}/end`).then((r) => r.data);

export const createFlashSaleApi = (payload: Record<string, unknown>) =>
  http.post<{ data: FlashSaleRow; message: string }>('/seller/flash-sales', payload).then((r) => r.data);

export const endFlashSaleApi = (id: number) =>
  http.post<{ data: FlashSaleRow; message: string }>(`/seller/flash-sales/${id}/end`).then((r) => r.data);

export const createPromotionApi = (payload: Record<string, unknown>) =>
  http.post<{ data: PromotionRow; message: string }>('/seller/promotions', payload).then((r) => r.data);

export const endPromotionApi = (id: number) =>
  http.post<{ data: PromotionRow; message: string }>(`/seller/promotions/${id}/end`).then((r) => r.data);

// ─── Reviews ───────────────────────────────────────────────────────────────

export interface SellerReviewRow {
  id: number;
  rating: number;
  comment: string | null;
  images: string[];
  variant_label: string | null;
  created_at: string | null;
  buyer_name: string;
  order_number: string | null;
  product: { id: number; name: string; image_url: string | null } | null;
  seller_reply: { body: string; replied_at: string | null; edited_at: string | null } | null;
}

export interface SellerReviewPage {
  data: SellerReviewRow[];
  meta: { current_page: number; last_page: number; total: number; rating_counts: Record<string, number>; average: number | null; unreplied: number };
}

export const getSellerReviewsApi = (params?: { rating?: number; product_id?: number; replied?: '0' | '1'; page?: number }) =>
  http.get<SellerReviewPage>('/seller/reviews', { params }).then((r) => r.data);

export const replySellerReviewApi = (id: number, body: string) =>
  http.post<{ data: SellerReviewRow; message: string }>(`/seller/reviews/${id}/reply`, { body }).then((r) => r.data);

export const editSellerReviewReplyApi = (id: number, body: string) =>
  http.patch<{ data: SellerReviewRow; message: string }>(`/seller/reviews/${id}/reply`, { body }).then((r) => r.data);
