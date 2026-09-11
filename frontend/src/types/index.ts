export interface AdminStats {
  pending_seller_applications: number;
  pending_buyer_applications?: number;
  pending_rider_applications: number;
  pending_products?: number;
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
  commission_today?: number;
  commission_this_week?: number;
  commission_this_month?: number;
  commission_lifetime?: number;
  gcash_orders_count?: number;
  cod_orders_count?: number;
  gcash_volume?: number;
  cod_volume?: number;
  pending_payment_verifications?: number;
  pending_payout_requests?: number;
}

export interface DashboardAttentionItem {
  type: string;
  id: number;
  label: string;
  sub: string;
  waiting_since: string;
  urgent: boolean;
  link: string;
  avatar_url?: string | null;
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
  shop_slug?: string | null;
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
  has_password: boolean;
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
export type PaymentStatus = 'pending' | 'pending_verification' | 'paid' | 'failed' | 'cod' | 'verification_failed' | 'refunded';

export interface OrderItem {
  id: number;
  seller_id?: number;
  shop_name?: string;
  product_name: string;
  variant_label: string | null;   // e.g. "Red / M"
  quantity: number;
  unit_price: number;
  subtotal: number;
  commission_rate?: number;
  commission_amount?: number;
  seller_earnings?: number;
  payout_status?: string;
  image_url: string | null;
}

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference?: string | null;
  payment_proof_url?: string | null;
  payment_verified_at?: string | null;
  rejection_reason?: string | null;
  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_name?: string | null;
  shipping_phone?: string | null;
  shipping_address?: string | null;
  shipping_province?: string | null;
  shipping_city?: string | null;
  shipping_barangay?: string | null;
  notes?: string | null;
  created_at: string;
  items: OrderItem[];
}

export interface SellerOrderItem {
  id: number;
  product_name: string;
  variant_label: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  commission_rate: number;
  commission_amount: number;
  seller_earnings: number;
  payout_status: string;
  image_url: string | null;
}

export interface SellerOrder {
  id: number;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  payment_proof_url: string | null;
  payment_verified_at: string | null;
  rejection_reason: string | null;
  order_total: number;
  shipping_fee: number;
  seller_subtotal: number;
  seller_commission: number;
  seller_earnings: number;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_province: string | null;
  shipping_city: string | null;
  shipping_barangay: string | null;
  notes: string | null;
  created_at: string;
  buyer: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  items: SellerOrderItem[];
}

export interface SellerEarningsSummary {
  available_balance: number;
  pending_balance: number;
  total_paid_out: number;
  lifetime_earnings: number;
  total_commission_paid: number;
}

export interface SellerOrderEarningsItem {
  id: number;
  order_id: number;
  order_number: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  product_name: string;
  variant_label: string | null;
  quantity: number;
  item_subtotal: number;
  commission_rate: number;
  commission_pct: number;
  commission_amount: number;
  seller_earnings: number;
  payout_status: string;
  order_date: string;
  delivered_date: string | null;
}

export interface PayoutRequest {
  id: number;
  reference_code: string;
  amount: number;
  gcash_number: string;
  gcash_name: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  rejection_reason?: string | null;
  admin_notes?: string | null;
  processed_at?: string | null;
  created_at: string;
  seller?: {
    id: number;
    name: string;
    shop_name: string;
    email: string;
  };
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

// ─── Messaging & Chat ────────────────────────────────────────────────────────

export type ConversationType = 'buyer_seller' | 'buyer_admin' | 'seller_admin';
export type ConversationStatus = 'open' | 'resolved';

export interface ProductContext {
  id: number;
  name: string;
  price: number;
  image?: string | null;
  category?: string | null;
}

export interface OrderContext {
  id: number;
  order_number: string;
  total: number;
  status: OrderStatus | string;
  items_count?: number;
}

export interface ConversationRecipient {
  id?: number | null;
  name: string;
  role: 'buyer' | 'seller' | 'admin';
  avatar?: string | null;
  email?: string | null;
  subtext?: string;
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_avatar?: string | null;
  shop_name?: string | null;
  seller_name?: string | null;
  seller_email?: string | null;
  seller_avatar?: string | null;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  status: ConversationStatus;
  subject?: string | null;
  buyer_id?: number | null;
  seller_id?: number | null;
  recipient?: ConversationRecipient | null;
  buyer?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  seller?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string | null;
    shop_name?: string | null;
    shop_logo?: string | null;
    owner_name?: string | null;
  } | null;
  product?: ProductContext | null;
  order?: OrderContext | null;
  last_message?: {
    id: number;
    body: string;
    sender_id: number;
    created_at: string;
  } | null;
  last_message_at: string | null;
  unread: number;
  created_at: string;
  // Backward compatibility fields
  shop_name?: string;
  seller_name?: string | null;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  body: string;
  sender_id: number;
  sender_role?: Role | string;
  sender_name?: string;
  sender_shop_name?: string | null;
  sender_owner_name?: string | null;
  sender_avatar?: string | null;
  attachment_type?: 'product_card' | 'order_card' | 'image' | string | null;
  attachment_data?: any;
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
  label?: string;
  price: number;
  original_price: number | null;
  stock_quantity: number;
  sku?: string | null;
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
  return_policy?: string | null;
  shipping_policy?: string | null;
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
  variants: ProductVariantSummary[];
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
  min_rating?: number;          // 1 | 2 | 3 | 4 | 5
  free_shipping?: boolean;
  cod?: boolean;
  on_sale?: boolean;
  has_voucher?: boolean;
  new_arrivals?: boolean;
  shipped_from?: string[];
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

export interface RelatedShop {
  id: number;
  seller_id: number;
  shop_name: string;
  shop_slug: string;
  shop_category: string;
  shop_bio?: string | null;
  logo_url: string | null;
  avg_rating: number;
  total_products: number;
  follower_count: number;
  rating_pct: number;
  response_rate: string;
  preview_products: {
    id: number;
    name: string;
    base_price: number;
    thumbnail_url: string | null;
  }[];
}

export interface CatalogFacets {
  sellers: { id: number; shop_name: string; count: number }[];
  locations?: { key: string; name: string; count: number }[];
  provinces: { name: string; count: number }[];
}

export interface CatalogResponse {
  data: Product[];
  related_shops?: RelatedShop[];
  meta: CatalogMeta;
  facets: CatalogFacets;
}

// ─── Seller Balance & Payouts ────────────────────────────────────────────────

export interface SellerBalance {
  pending: number;      // revenue from unconfirmed delivered orders
  available: number;    // ready to withdraw
  total_paid_out: number;
}

// ─── Seller Dashboard Stats ───────────────────────────────────────────────────

export interface SellerDashboardStats {
  today_sales: number;
  yesterday_sales: number;
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
  id?: number;
  product_id?: number;
  name: string;
  thumbnail_url?: string | null;
  category?: string;
  units_sold: number;
  revenue?: number;
  gross_sales?: number;
  net_earnings?: number;
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

// ─── Seller Products ─────────────────────────────────────────────────────────

export type SellerProductStatus = 'draft' | 'active' | 'pending_review' | 'rejected' | 'out_of_stock' | 'archived';

export interface SellerProductVariant {
  id: number;
  label: string;          // e.g. "Red / M"
  sku: string | null;
  stock_quantity: number;
  price: number;
}

export interface SellerProduct {
  id: number;
  name: string;
  description: string | null;
  category_id: string;
  thumbnail_url: string | null;
  images: ProductImage[];
  base_price: number;
  status: SellerProductStatus;
  units_sold: number;
  rejection_reason: string | null;
  archive_reason: string | null;
  archived_by: 'admin' | 'seller' | null;
  created_at: string;
  variants: SellerProductVariant[];
  total_stock: number;
  weight_kg: number | null;
  dimension_l_cm: number | null;
  dimension_w_cm: number | null;
  dimension_h_cm: number | null;
  sku: string | null;
  net_weight_volume: string | null;
  expiry_best_before: string | null;
  ingredients: string | null;
  storage_instructions: string | null;
  allergen_info: string | null;
  fda_lto_on_file: boolean;
  fda_cpr_on_file: boolean;
}

export interface SellerProductCounts {
  all: number;
  active: number;
  pending_review: number;
  rejected: number;
  out_of_stock: number;
  archived: number;
}

// ─── Add Product Form ────────────────────────────────────────────────────────

export interface ProductFormVariantRow {
  /** Combination label, e.g. "Red / M" */
  combination: string;
  /** Map of variantTypeIndex → optionValue */
  options: Record<number, string>;
  price: string;
  stock: string;
  /** Resolved preview URL for this row (from optionImages or main image fallback) */
  imagePreview?: string;
}

export interface ProductFormVariantType {
  name: string;     // e.g. "Color"
  options: string[]; // e.g. ["Red", "Blue"]
  /** Map of option value → picked product image id */
  optionImages?: Record<string, string>;
}

export interface ProductFormImage {
  id: string;       // local uuid for key/reorder
  file: File;
  preview: string;  // object URL
}

export interface AddProductFormState {
  // Basic Info
  name: string;
  description: string;
  images: ProductFormImage[];
  /** Server images already saved (edit mode only) */
  existingImages: ProductImage[];
  deletedImageIds: number[];
  // Category
  parentCategoryId: string;
  leafCategoryId: string;
  // Variants
  hasVariants: boolean;
  variantTypes: ProductFormVariantType[];
  variantRows: ProductFormVariantRow[];
  // Simple price/stock (no variants)
  price: string;
  stock: string;
  // Shipping
  weightValue: string;
  weightUnit: 'kg' | 'g';
  dimensionL: string;
  dimensionW: string;
  dimensionH: string;
  sku: string;
  // FDA
  fdaLtoFile: File | null;
  fdaLtoOnFile: boolean;
  fdaCprFile: File | null;
  ingredients: string;
  netWeight: string;
  storageInstructions: string;
  expiryDate: string;
  allergenInfo: string;
}

// ─── Wishlist & Store Follows ────────────────────────────────────────────────

export interface WishlistProduct {
  id: number;
  name: string;
  thumbnail_url: string | null;
  base_price: number;
  original_price: number | null;
  status: string;
  total_stock: number;
  seller: { id: number; shop_name: string };
}

export interface WishlistItem {
  wishlist_item_id: number;
  added_at: string;
  product: WishlistProduct;
}

export interface FollowedStore {
  follow_id: number;
  followed_at: string;
  seller: {
    id: number;
    shop_name: string;
    logo_url: string | null;
    avg_rating: number | null;
    product_count: number;
    has_sale: boolean;
  };
}

export type AddressLabel = 'home' | 'office';

export interface Address {
  id: number;
  full_name?: string;
  recipient_name?: string;
  phone?: string;
  phone_number?: string;
  address?: string;
  street_address?: string;
  floor_unit?: string | null;
  province?: string;
  province_name?: string;
  province_code?: string;
  district?: string;
  city_name?: string;
  city_code?: string;
  ward?: string;
  barangay_name?: string;
  barangay_code?: string;
  label?: AddressLabel;
  is_default: boolean;
}

export interface PublicShopProfile {
  id: number;
  seller_id: number;
  seller_name: string;
  shop_name: string;
  shop_slug: string;
  shop_category: string | null;
  shop_description: string | null;
  shop_bio: string | null;
  address_province: string | null;
  address_city: string | null;
  address_barangay: string | null;
  shop_contact_number: string | null;
  return_policy: string | null;
  shipping_policy: string | null;
  business_hours: string | null;
  response_time: string | null;
  logo_url: string | null;
  banner_url: string | null;
  application_status: string;
  joined_date: string | null;
  avg_rating: number | null;
  total_reviews: number;
  total_products: number;
  follower_count: number;
  is_following: boolean;
  rating_breakdown?: Record<number, number>;
  categories?: { category_id: string; category_name: string; count: number }[];
}

export interface PublicShopReview {
  id: number;
  rating: number;
  comment: string | null;
  verified_purchase: boolean;
  created_at: string;
  buyer: {
    id: number;
    name: string;
    avatar_url: string | null;
  };
  product: {
    id: number;
    name: string;
    thumbnail_url: string | null;
  };
}

// ─── Reporting & Analytics ───────────────────────────────────────────────────

export interface AdminReportSummary {
  total_gmv: number;
  total_commission: number;
  total_seller_earnings: number;
  total_orders: number;
  total_units_sold: number;
  avg_commission_rate: number;
}

export interface AdminRevenueChartPoint {
  date: string;
  iso_date?: string;
  gmv: number;
  commission: number;
  orders_count: number;
}

export interface CategoryBreakdownItem {
  category: string;
  gross_sales: number;
  units_sold: number;
  orders_count: number;
  commission_rate: number;
  commission_earned: number;
}

export interface TopSellerItem {
  seller_id: number;
  seller_name: string;
  shop_name: string;
  email: string;
  gross_sales: number;
  orders_count: number;
  units_sold: number;
  commission_generated: number;
  net_payout_credited: number;
  avg_order_value: number;
}

export interface PaymentMethodSplit {
  gcash: { count: number; volume: number };
  cod: { count: number; volume: number };
  total_orders: number;
  total_volume: number;
}

export interface SellerReportSummary {
  gross_sales: number;
  net_earnings: number;
  commission_paid: number;
  total_orders: number;
  delivered_orders: number;
  units_sold: number;
}

export interface SellerRevenueChartPoint {
  date: string;
  iso_date?: string;
  gross_sales: number;
  net_earnings: number;
  commission: number;
}

export interface CategoryCommissionOverride {
  category_key: string;
  category_name: string;
  rate_percent: number;
}

export interface CommissionSettings {
  base_rate_percent: number;
  overrides: CategoryCommissionOverride[];
}

export interface AdminPaymentListItem {
  id: number;
  order_number: string;
  payment_method: 'gcash' | 'cod';
  payment_status: PaymentStatus;
  payment_reference: string | null;
  payment_proof_url: string | null;
  amount: number;
  order_status: OrderStatus;
  created_at: string;
  payment_verified_at: string | null;
  rejection_reason: string | null;
  buyer: {
    id: number;
    name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  seller: {
    id: number;
    name: string;
    shop_name: string;
  } | null;
  items_count: number;
  items: {
    id: number;
    product_name: string;
    quantity: number;
    price: number;
    subtotal: number;
  }[];
}

export interface AdminCategoryLeaf {
  id: number;
  slug: string;
  name: string;
  parent_id: number;
  sort_order: number;
  is_active: boolean;
  requires_fda: boolean;
  commission_rate: number | null;
  products_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AdminCategoryParent {
  id: number;
  slug: string;
  name: string;
  parent_id: null;
  sort_order: number;
  is_active: boolean;
  requires_fda: boolean;
  commission_rate: null;
  children: AdminCategoryLeaf[];
  created_at?: string;
  updated_at?: string;
}

export interface AdminCategoryMetrics {
  total_parents: number;
  total_leaves: number;
  total_products: number;
  fda_regulated_leaves: number;
}

export interface CategoryPayload {
  name: string;
  slug?: string;
  parent_id?: number | null;
  sort_order?: number;
  is_active?: boolean;
  requires_fda?: boolean;
  commission_rate?: number | null;
}

