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

export type GovernmentIdType =
  | 'national_id' | 'drivers_license' | 'passport' | 'umid'
  | 'sss_id' | 'philhealth_id' | 'voters_id' | 'postal_id';

export interface SellerProfileSummary {
  shop_name: string;
  application_status: ApplicationStatus;
  rejection_reason: string | null;
  submitted_at: string;
}

export type Gender = 'male' | 'female' | 'prefer_not_to_say';

export interface User {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: Gender | null;
  role: Role;
  status: UserStatus;
  avatar_url: string | null;
  seller_profile?: SellerProfileSummary;
}

export interface SellerApplication {
  id: number;
  application_status: ApplicationStatus;
  shop_name: string;
  date_of_birth: string;
  government_id_type: GovernmentIdType;
  government_id_image_url: string;
  payout_gcash_number: string;
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
