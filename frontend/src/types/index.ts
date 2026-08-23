export interface AdminStats {
  pending_seller_applications: number;
  pending_rider_applications: number;
  total_buyers: number;
  total_sellers: number;
  total_riders: number;
  orders_today: number;
  orders_yesterday: number;
  open_disputes: number;
  new_buyers_this_week: number;
  new_buyers_last_week: number;
  pending_sellers_this_week: number;
  pending_sellers_last_week: number;
  gmv_today: number;
  gmv_yesterday: number;
}

export interface DashboardAttentionItem {
  type: string;
  id: number;
  label: string;
  sub: string;
  waiting_since: string;
  urgent: boolean;
  link: string;
}

export interface DashboardChartPoint {
  date: string;
  new_sellers: number;
  orders: number;
  gmv: number;
}

export interface DashboardFeed {
  attention_items: DashboardAttentionItem[];
  recent_activity: ActivityLogEntry[];
  chart_data: DashboardChartPoint[];
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  target_type: string;
  target_id: number;
  description: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  admin: { id: number; first_name: string; last_name: string };
}

export type Role = 'admin' | 'buyer' | 'seller' | 'rider';
export type UserStatus = 'active' | 'suspended';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type SellerStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type GovernmentIdType =
  | 'national_id' | 'drivers_license' | 'passport' | 'umid'
  | 'sss_id' | 'philhealth_id' | 'voters_id' | 'postal_id' | 'school_id';

export interface SellerProfileSummary {
  shop_name: string;
  shop_description: string | null;
  application_status: ApplicationStatus;
  rejection_reason: string | null;
  submitted_at: string;
}

export type Gender = 'male' | 'female' | 'prefer_not_to_say';
export type Sex = 'male' | 'female';
export type BuyerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: Gender | null;
  sex: Sex | null;
  buyer_application_status: BuyerApplicationStatus | null;
  buyer_rejection_reason: string | null;
  government_id_type: string | null;
  government_id_image_url: string | null;
  government_id_image_back_url: string | null;
  default_address: {
    province: string;
    city_municipality: string;
    barangay: string;
    street_address: string | null;
  } | null;
  role: Role;
  status: UserStatus;
  avatar_url: string | null;
  created_at: string | null;
  seller_profile?: SellerProfileSummary;
}

export interface BuyerApplicationSummary {
  pending_total: number;
  today: number;
  this_week: number;
}

export interface BuyerApplicationsResponse extends PaginatedResponse<User> {
  summary: BuyerApplicationSummary;
}

export interface SellerApplication {
  id: number;
  application_status: ApplicationStatus;
  shop_name: string;
  shop_description: string | null;
  date_of_birth: string;
  government_id_type: GovernmentIdType;
  government_id_image_url: string;
  government_id_image_back_url: string | null;
  selfie_with_id_url: string | null;
  business_permit_url: string | null;
  dti_sec_registration_url: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  user: User;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
}

export interface AuthResponse {
  data: User;
  token: string;
}

export type OrderStatus =
  | 'pending' | 'confirmed' | 'packed' | 'shipped'
  | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';

export type PaymentMethod = 'gcash' | 'cod';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface OrderItem {
  id: number;
  product_name: string;
  variant_label: string;   // e.g. "Red / M"
  quantity: number;
  unit_price: number;
  subtotal: number;
  image_url: string | null;
}

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  created_at: string;
  items: OrderItem[];
}

// ─── Admin Orders ────────────────────────────────────────────────────────────

export interface AdminOrder {
  id: number;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  created_at: string;
  buyer: { id: number; first_name: string; last_name: string; email: string } | null;
  items: OrderItem[];
  payment?: {
    method: PaymentMethod;
    reference_number: string | null;
    amount: number;
    status: PaymentStatus;
    paid_at: string | null;
  } | null;
}

export interface AdminOrderStats {
  by_status: Partial<Record<OrderStatus, number>>;
  orders_today: number;
  gmv_total: number;
}

// ─── Admin Payments ───────────────────────────────────────────────────────────

export interface AdminPayment {
  id: number;
  method: PaymentMethod;
  reference_number: string | null;
  amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
  order: {
    id: number;
    order_number: string;
    buyer: { id: number; first_name: string; last_name: string; email: string } | null;
  } | null;
}

export interface AdminPaymentStats {
  pending_payout_amount: number;
  failed_count: number;
  total_paid: number;
}

// ─── Admin Disputes ───────────────────────────────────────────────────────────

export type DisputeStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface AdminDispute {
  id: number;
  reason: string;
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  buyer: { id: number; first_name: string; last_name: string; email: string } | null;
  order: {
    id: number;
    order_number: string;
    total: number;
    status: OrderStatus;
    items?: OrderItem[];
  } | null;
  resolver?: { first_name: string; last_name: string } | null;
}

export interface AdminDisputeStats {
  open: number;
  in_progress: number;
  resolved: number;
}

// ─── Admin Reviews ────────────────────────────────────────────────────────────

export type ModerationStatus = 'visible' | 'hidden' | 'pending_review';

export interface AdminReview {
  id: number;
  product_id: number;
  rating: number;
  comment: string | null;
  verified_purchase: boolean;
  flagged: boolean;
  flag_reason: string | null;
  moderation_status: ModerationStatus;
  created_at: string;
  buyer: { id: number; first_name: string; last_name: string; email: string } | null;
}

export interface AdminReviewStats {
  flagged_pending: number;
  pending_review: number;
  hidden: number;
}

// ─── Messenger ───────────────────────────────────────────────────────────────

export interface Conversation {
  id: number;
  seller_id: number;
  shop_name: string;
  seller_name: string | null;
  last_message: { body: string; created_at: string } | null;
  last_message_at: string | null;
  unread: number;
}

export interface ChatMessage {
  id: number;
  body: string;
  sender_id: number;
  sender_role: Role;
  read_at: string | null;
  created_at: string;
}

// ─── Product Catalog ─────────────────────────────────────────────────────────

export type ProductStatus = 'draft' | 'active' | 'archived';

export interface ProductSeller {
  id: number;
  shop_name: string;
  city: string | null;
  province: string | null;
}

export interface ProductVariantSummary {
  id: number;
  price: number;
  original_price: number | null;
  stock_quantity: number;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  category_id: string;          // leaf category ID from CATEGORY_TREE
  status: ProductStatus;
  thumbnail_url: string | null;
  base_price: number;
  original_price: number | null; // null = not on sale
  units_sold: number;
  avg_rating: number | null;
  review_count: number;
  seller: ProductSeller;
  variants: ProductVariantSummary[];
}

// ─── Product Detail ─────────────────────────────────────────────────────────

export interface ProductImage {
  id: number;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductVariantOption {
  id: number;
  label: string;          // e.g. "Red", "XL", "Chocolate"
  stock_quantity: number;
  price: number;
  original_price: number | null;
  sku: string | null;
}

export interface ProductVariantGroup {
  name: string;           // e.g. "Color", "Size", "Flavor"
  options: ProductVariantOption[];
}

export interface ProductDetailSeller {
  id: number;
  shop_name: string;
  avatar_url: string | null;
  city: string | null;
  province: string | null;
  rating_pct: number | null;   // e.g. 97 = 97%
  units_sold: number;
  repurchase_rate: number | null; // e.g. 82 = 82%
  response_rate: number | null;
}

export interface ProductDetailSpecs {
  // Always present
  description: string;
  whats_in_box: string[] | null;
  weight_grams: number | null;
  dimensions_cm: string | null;  // e.g. "30 × 20 × 10"
  sku: string | null;
  // Food & Grocery
  ingredients: string | null;
  net_weight_volume: string | null;
  storage_instructions: string | null;
  expiry_best_before: string | null;
  allergen_info: string | null;
  fda_registration_number: string | null;
  // Health & Beauty
  key_ingredients: string | null;
  skin_type_suitability: string | null;
  // Electronics
  battery_info: string | null;
  ports_connectivity: string | null;
  compatibility: string | null;
  // Fashion
  material: string | null;
  care_instructions: string | null;
  size_chart_url: string | null;
}

export interface ProductDetail extends Omit<Product, 'variants' | 'thumbnail_url'> {
  images: ProductImage[];
  variant_groups: ProductVariantGroup[];
  specs: ProductDetailSpecs;
  seller: ProductDetailSeller;
  shipping_fee: number | null;
  estimated_delivery_days_min: number;
  estimated_delivery_days_max: number;
  return_policy: string | null;
  warranty: string | null;
  is_wishlisted: boolean;
}

export interface ProductReview {
  id: number;
  rating: number;
  comment: string | null;
  verified_purchase: boolean;
  created_at: string;
  images: string[];
  buyer: { first_name: string; last_name: string; avatar_url: string | null };
}

export interface ProductReviewsResponse {
  data: ProductReview[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    avg_rating: number | null;
    rating_counts: Record<string, number>; // "1".."5" → count
  };
}

export interface ProductFilters {
  q?: string;                   // free-text search
  parent_category_id?: string;  // parent node ID
  category_id?: string;         // leaf node ID
  seller_ids?: number[];
  min_price?: number;
  max_price?: number;
  min_rating?: number;          // 3 | 4
  free_shipping?: boolean;
  cod?: boolean;
  on_sale?: boolean;
  new_arrivals?: boolean;
  provinces?: string[];
  sort?: 'best_match' | 'price_asc' | 'price_desc' | 'newest' | 'best_selling' | 'highest_rated';
  page?: number;
  per_page?: number;
}

export interface CatalogMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export interface CatalogFacets {
  sellers: { id: number; shop_name: string; count: number }[];
  provinces: { name: string; count: number }[];
}

export interface CatalogResponse {
  data: Product[];
  meta: CatalogMeta;
  facets: CatalogFacets;
}

// ─── Seller Balance & Payouts ────────────────────────────────────────────────

export interface SellerBalance {
  pending: number;      // revenue from unconfirmed delivered orders
  available: number;    // ready to withdraw
  total_paid_out: number;
}

export type PayoutStatus = 'requested' | 'approved' | 'sent' | 'rejected';

export interface PayoutRequest {
  id: number;
  seller_id: number;
  amount: number;
  gcash_number: string;
  status: PayoutStatus;
  requested_at: string;
  sent_at: string | null;
  rejection_reason: string | null;
}

// ─── Seller Dashboard Stats ───────────────────────────────────────────────────

export interface SellerDashboardStats {
  today_sales: number;
  orders_to_pack: number;
  total_products: number;
  low_stock_count: number;
  balance: SellerBalance;
}

export interface SellerChartPoint {
  date: string;
  sales: number;
  orders: number;
}

export interface SellerTopProduct {
  id: number;
  name: string;
  thumbnail_url: string | null;
  units_sold: number;
  revenue: number;
}

export interface SellerAttentionItem {
  type: 'new_order' | 'low_stock' | 'rejected_product' | 'unread_message';
  id: number;
  label: string;
  sub: string;
  link: string;
}

// ─── Seller Conversations ─────────────────────────────────────────────────────

export interface SellerConversation {
  id: number;
  buyer_id: number;
  buyer_name: string;
  buyer_avatar_url: string | null;
  last_message: { body: string; created_at: string } | null;
  last_message_at: string | null;
  unread: number;
}

export type AddressLabel = 'home' | 'office';

export interface Address {
  id: number;
  full_name: string;
  phone: string;
  address: string;
  floor_unit: string | null;
  province: string;
  district: string;
  ward: string;
  label: AddressLabel;
  is_default: boolean;
}
