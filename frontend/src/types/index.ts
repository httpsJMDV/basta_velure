export interface AdminStats {
  pending_seller_applications: number;
  pending_rider_applications: number;
  total_buyers: number;
  total_sellers: number;
  total_riders: number;
  orders_today: number;
  open_disputes: number;
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
