// Shop comments (Amaru task 6, "shop reviews" in the URLs): what buyers say about a shop itself, without stars, apart
// from its product reviews (which keep their stars).
import { http } from './client';

export interface ShopReviewRow {
  id: number;
  comment: string | null;
  tags: string[];
  edited: boolean;
  created_at: string;
  updated_at: string;
  buyer: { name: string; avatar_url: string | null };
  seller_reply: { body: string; replied_at: string | null; edited_at: string | null } | null;
  /** Admin views only. */
  buyer_full_name?: string;
  buyer_email?: string | null;
}

export interface ShopReviewSummary {
  count: number;
  /** How often each quick tag was picked, most picked first (tags nobody picked are left out). */
  tag_counts: { tag: string; count: number }[];
  latest: ShopReviewRow[];
}

export interface ShopReviewPage {
  data: ShopReviewRow[];
  meta: { current_page: number; last_page: number; total: number; unreplied?: number };
  summary: ShopReviewSummary;
  shop?: { name: string; slug: string; seller_id: number };
}

export interface MyShopReview {
  can_review: boolean;
  reason: string | null;
  review: ShopReviewRow | null;
  edits_left_today: number;
  tags: string[];
}

export interface ShopReviewInput {
  comment: string;
  tags?: string[];
}

export const getShopReviewListApi = (shop: string | number, params: { tag?: string; page?: number; per_page?: number } = {}) =>
  http.get<ShopReviewPage>(`/shops/${encodeURIComponent(String(shop))}/shop-reviews`, { params }).then((r) => r.data);

export const getMyShopReviewApi = (shop: string | number) =>
  http.get<{ data: MyShopReview }>(`/shops/${encodeURIComponent(String(shop))}/my-shop-review`).then((r) => r.data.data);

export const createShopReviewApi = (shop: string | number, body: ShopReviewInput) =>
  http.post<{ data: ShopReviewRow; message: string }>(`/shops/${encodeURIComponent(String(shop))}/my-shop-review`, body).then((r) => r.data);

export const updateShopReviewApi = (shop: string | number, body: ShopReviewInput) =>
  http.patch<{ data: ShopReviewRow; message: string; edits_left_today: number }>(`/shops/${encodeURIComponent(String(shop))}/my-shop-review`, body).then((r) => r.data);

export const getSellerShopReviewsApi = (params: { replied?: '0' | '1'; page?: number } = {}) =>
  http.get<ShopReviewPage>('/seller/shop-reviews', { params }).then((r) => r.data);

export const replyShopReviewApi = (id: number, body: string, edit = false) =>
  (edit ? http.patch : http.post)<{ data: ShopReviewRow; message: string }>(`/seller/shop-reviews/${id}/reply`, { body }).then((r) => r.data);

export const getAdminShopReviewsApi = (sellerId: number, params: { page?: number } = {}) =>
  http.get<ShopReviewPage>(`/admin/reviews/shops/${sellerId}/shop-reviews`, { params }).then((r) => r.data);
