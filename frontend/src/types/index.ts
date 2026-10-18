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
  /** The dashboard window (the last 30 Manila days) and its figures, from the same service as the reports page. */
  window?: AnalyticsRange;
  metrics?: AnalyticsSummary;
  previous?: AnalyticsPrevious;
  pipeline?: OrderPipeline;
  payment_split?: PaymentMethodSplit;
  disputes?: AnalyticsDisputes;
}

/** An inclusive Asia/Manila day range, as the admin analytics endpoints echo it back. */
export interface AnalyticsRange {
  from: string;
  to: string;
  days: number;
  timezone: string;
  preset: string | null;
}

export interface AnalyticsSummary {
  gmv: number;
  /** Orders that count toward GMV (not cancelled or returned). */
  orders: number;
  /** Every order placed in the range, whatever its status. */
  orders_placed: number;
  cancelled_orders: number;
  returned_orders: number;
  commission: number;
  seller_earnings: number;
  units_sold: number;
  /** Commission as a share of GMV; null when there was no GMV. */
  avg_commission_rate: number | null;
  active_buyers: number;
  active_sellers: number;
}

export interface AnalyticsPrevious {
  range: AnalyticsRange;
  gmv: number;
  orders: number;
  commission: number;
  active_buyers: number;
  active_sellers: number;
}

export interface PipelineGroup {
  key: string;
  label: string;
  statuses: string[];
  count: number;
}

export interface OrderPipeline {
  total: number;
  by_status: Record<string, number>;
  groups: PipelineGroup[];
}

export interface AnalyticsDisputes {
  /** Disputes opened in the range. */
  opened: number;
  /** Disputes open right now, whatever the range. */
  open_now: number;
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
  /** Orders that count toward GMV (not cancelled or returned). */
  orders: number;
  orders_placed?: number;
  gmv: number;
  commission?: number;
}

export interface DashboardFeed {
  attention_items: DashboardAttentionItem[];
  recent_activity: ActivityLogEntry[];
  chart_data: DashboardChartPoint[];
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  target_type: string | null;
  target_id: number | null;
  description: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  admin: { id: number | null; first_name: string | null; last_name: string | null };
}

export type ActivityArea = 'applications' | 'accounts' | 'catalog' | 'money' | 'disputes' | 'other';

/** Figures for the whole activity log (not only the page shown). */
export interface ActivityLogSummary {
  total: number;
  today: number;
  week: number;
  areas: Record<ActivityArea, number>;
  admins: { id: number; name: string }[];
}

export type Role = 'admin' | 'buyer' | 'seller' | 'rider';
export type UserStatus = 'active' | 'suspended' | 'unverified' | 'pending_activation';
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
  address_needs_update?: boolean;
  seller_type?: 'individual' | 'sole_proprietorship' | 'corporation' | null;
  tin?: string | null;
  on_vacation?: boolean;
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
  email_verified_at?: string | null;
  /** The mobile number as 09XXXXXXXXX. */
  phone_local?: string | null;
  seller_profile?: SellerProfileSummary;
  sorting_center?: SortingCenterSummary;
  rider?: RiderSummary;
  /** The courier company this account runs (its portal is /logistics once approved). */
  logistics_company?: UserLogisticsCompany | null;
}

// ─── Courier companies ─────────────────────────────────────────────────────────

export type LogisticsCompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface UserLogisticsCompany {
  id: number;
  name: string;
  code: string;
  logo_url: string | null;
  status: LogisticsCompanyStatus;
  rejection_reason: string | null;
  role: 'owner' | 'staff';
}

/** A courier as a buyer, seller or hub sees it. */
export interface CourierSummary {
  id: number;
  name: string;
  code: string;
  logo_url: string | null;
}

/** An approved courier, as listed on the hub application. */
export interface CourierOption extends CourierSummary {
  hubs_count: number;
}

/** A courier company in full, for the admin and the company's own team. */
export interface LogisticsCompanyDetail extends CourierSummary {
  slug: string;
  status: LogisticsCompanyStatus;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_province: string | null;
  address_city: string | null;
  address_barangay: string | null;
  address_street: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  business_permit_url: string | null;
  address_region?: string | null;
  address_postal_code?: string | null;
  sec_registration_no?: string | null;
  tin?: string | null;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_position?: string | null;
  service_regions?: string[];
  service_region_names?: string[];
  documents?: { key: string; label: string; url: string }[];
  owner?: { id: number; name: string; email: string; phone: string | null; avatar_url: string | null } | null;
  hubs_count?: number;
  approved_hubs_count?: number;
}

export interface LogisticsDashboard {
  hubs: { approved: number; pending: number; suspended: number; rejected: number };
  riders: { active: number; pending: number; online?: number };
  parcels_now: { awaiting_pickup: number; at_hubs: number; out_for_delivery: number; failed: number };
  last_30_days: { delivered: number; returned: number };
  /** Shipments of the chosen period (L1): Manila dates, both days included. */
  period?: { from: string; to: string; shipments: number; picked_up: number; delivered: number; failed: number; returned: number; cod_collected: number };
}

export interface LogisticsHubRow {
  id: number;
  hub_name: string;
  status: SortingCenterStatus;
  city_province: string;
  coverage_count: number;
  active_riders: number;
  active_parcels: number;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_avatar_url: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
}

export interface LogisticsRiderRow {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  status: RiderStatus;
  /** Online now: switched Online, Active, and its app heard from recently. */
  online: boolean;
  last_seen_at: string | null;
  active_jobs: number;
  delivered_today: number;
  vehicle_type: string;
  plate_number: string;
  license_number: string | null;
  license_expiry: string | null;
  hub_id: number | null;
  hub_name: string | null;
  needs_reverification: boolean;
  vehicle_updated_at: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  activation_sent_at: string | null;
  activation_expires_at: string | null;
  activated_at: string | null;
  account_status: string | null;
  created_at: string | null;
  documents?: { key: string; label: string; url: string }[];
  audit?: AuditEntry[];
}

export interface LogisticsRidersSummary {
  total: number;
  online: number;
  active: number;
  pending_activation: number;
  pending_verification: number;
  suspended: number;
  max_active_jobs: number;
}

/** One line of the operations audit log (A35): written once, never edited. */
export interface AuditEntry {
  id: number;
  action: string;
  reason: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor: string;
  created_at: string | null;
}

export interface LogisticsParcelRow {
  id: number;
  tracking_number: string;
  status: string;
  order_number: string | null;
  payment_method: string | null;
  cod_amount: number | null;
  hub_id: number | null;
  hub_name: string | null;
  barangay: string | null;
  attempts: number;
  updated_at: string | null;
}

export interface LogisticsReport {
  range: { from: string; to: string; days: number };
  sla_hours: number;
  totals: { received: number; delivered: number; failed_attempts: number; returned: number; on_time_deliveries: number; on_time_rate: number | null; success_rate: number | null };
  hubs: Array<{ hub_id: number; hub_name: string; received: number; delivered: number; failed_attempts: number; returned: number; on_time_deliveries: number; on_time_rate: number | null; success_rate: number | null; avg_delivery_hours: number | null }>;
}

export type RiderStatus = 'PENDING' | 'ACTIVE' | 'DISAPPROVED' | 'PENDING_ACTIVATION' | 'SUSPENDED';
export type RiderVehicleType = 'Motorcycle' | 'Tricycle' | 'Car' | 'Van';

export interface RiderSummary {
  id: number;
  status: RiderStatus;
  vehicle_type: RiderVehicleType;
  plate_number: string;
  sorting_center_id: number;
  hub_name?: string | null;
  /** The hub's reason when it disapproved the application. */
  rejection_reason?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  company_name?: string | null;
  is_online?: boolean;
  needs_reverification?: boolean;
  suspension_reason?: string | null;
}

export interface PublicApprovedHub {
  id: number;
  hub_name: string;
  address_city: string;
  address_province: string;
  /** The courier company the hub belongs to. */
  courier?: { id: number; name: string; code: string } | null;
}

export interface RiderRegistrationResponse {
  message: string;
  data: {
    /** The signed-in account, refreshed with its new rider profile. */
    user: User;
    rider: RiderSummary;
  };
}

export interface HubRiderSummaryItem {
  id: number;
  user: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  vehicle_type: RiderVehicleType;
  plate_number: string;
  status: RiderStatus;
  submitted_at: string | null;
  active_areas_count: number;
  created_at: string | null;
}

export interface HubRiderDetailAddress {
  province: string;
  city: string;
  barangay: string;
  street: string | null;
}

export interface RiderAreaAssignmentItem {
  id: number;
  rider_id: number;
  sorting_center_id: number;
  area_label: string;
  coverage_barangays: string[];
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface HubRiderDetailItem {
  id: number;
  user: {
    id: number;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string;
    phone: string;
    date_of_birth: string | null;
    sex: string | null;
    created_at: string | null;
  };
  address: HubRiderDetailAddress | null;
  vehicle_type: RiderVehicleType;
  plate_number: string;
  status: RiderStatus;
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_at: string | null;
  documents: {
    or_cr_url: string | null;
    drivers_license_url: string | null;
  };
  area_assignments: RiderAreaAssignmentItem[];
}

export interface HubCoverageOptions {
  hub_id: number;
  hub_name: string;
  address_city: string;
  address_province: string;
  coverage_barangays: string[];
}

export interface HubRidersListResponse {
  data: HubRiderSummaryItem[];
  counts: {
    pending: number;
    active: number;
    disapproved: number;
    all: number;
  };
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
}

export interface RiderActiveAreaItem {
  id: number;
  area_label: string;
  barangays_count: number;
  coverage_barangays: string[];
}

export interface RiderProfileData {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  status: RiderStatus;
  vehicle_type: RiderVehicleType;
  plate_number: string;
  vehicle_updated_at: string | null;
  license_number: string | null;
  license_expiry: string | null;
  company: { id: number; name: string; code: string; logo_url: string | null } | null;
  is_online: boolean;
  needs_reverification: boolean;
  suspension_reason: string | null;
  rejection_reason: string | null;
  active_jobs: number;
  max_active_jobs: number;
  documents: { key: string; label: string; url: string }[];
  hub: {
    id: number;
    hub_name: string;
    address_city: string;
    address_province: string;
  } | null;
  active_areas: RiderActiveAreaItem[];
  active_areas_count: number;
  submitted_at: string | null;
  created_at: string | null;
}

export type SortingCenterStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface SortingCenterSummary {
  id: number;
  hub_name: string;
  status: SortingCenterStatus;
  address_province: string;
  address_city: string;
  address_barangay: string;
  address_street: string;
  coverage_barangays: string[];
  rejection_reason?: string | null;
  created_at?: string | null;
}

export interface SortingCenterRegistrationResponse {
  message: string;
  data: {
    user: User;
    sorting_center: SortingCenterSummary;
    hub_status: SortingCenterStatus;
  };
}

export interface HubDashboardMetrics {
  inbound_today: number;
  in_sorting: number;
  active_riders: number;
  /** Parcels on the road right now (Feature 1.9). */
  out_for_delivery: number;
  /** Failed deliveries waiting for the hub to reschedule or return them (Feature 1.9). */
  failed_deliveries: number;
  hub: {
    id: number;
    hub_name: string;
    status: SortingCenterStatus;
    address_province: string;
    address_city: string;
    address_barangay: string;
    address_street: string;
    coverage_barangays_count: number;
  };
}

// ─── Hub Parcel Intake (Feature 1.6) ───────────────────────────────────────────

export interface HubParcelRecord {
  tracking_number: string;
  order_number: string | null;
  status: string;
  shop_name: string;
  destination_barangay: { code: string | null; name: string | null };
  pickup_rider: { name: string; plate_number: string | null } | null;
  picked_up_at: string | null;
  scanned_in_at: string | null;
  /** Present on lookup and receive responses only. */
  recipient?: {
    name: string;
    address: { street: string; barangay: string; city: string; province: string };
  };
}

export interface HubParcelLookupResponse {
  data: HubParcelRecord;
}

export interface HubParcelReceiveResponse {
  message: string;
  data: HubParcelRecord;
}

export interface HubParcelListResponse {
  data: HubParcelRecord[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
}

// ─── Hub Area Sorting (Feature 1.7) ────────────────────────────────────────────

export type HubSortingSort = 'waiting' | 'count';

export interface HubSortingGroup {
  barangay_code: string;
  barangay_name: string;
  city: string;
  parcel_count: number;
  oldest_scanned_in_at: string | null;
  in_coverage: boolean;
  riders_covering: number;
}

export interface HubSortingGroupsResponse {
  data: HubSortingGroup[];
  meta: { total_groups: number; total_parcels: number };
}

export interface HubSortingParcel {
  tracking_number: string;
  order_number: string | null;
  scanned_in_at: string | null;
}

export interface HubSortingParcelsResponse {
  data: HubSortingParcel[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
}

export interface HubSortResponse {
  message: string;
  sorted_count: number;
  barangay: { code: string; name: string };
}

// ─── Rider Delivery Console (Feature 2.6) ──────────────────────────────────────

export type RiderDeliveryView = 'assigned' | 'out_for_delivery';

export interface RiderDeliveryParcel {
  tracking_number: string;
  order_number: string | null;
  recipient: {
    name: string;
    phone: string;
    address: {
      street: string;
      barangay: string;
      city: string;
      province: string;
      full_address: string;
    };
  };
  /** Amount to collect from the recipient; null for prepaid orders. */
  cod_amount: number | null;
  /** This trip is attempt N of max_attempts (R7). */
  attempt?: number;
  max_attempts?: number;
  previous_failure?: string | null;
  /** The buyer has a 6-digit delivery code to give (A32); locked for 15 minutes after 5 wrong tries. */
  otp_required?: boolean;
  otp_locked_until?: string | null;
  weight_kg?: number | null;
  item_count: number;
  item_summary: string;
  assigned_at: string | null;
  out_for_delivery_at: string | null;
}

export interface RiderDeliveryGroup {
  barangay_code: string;
  barangay_name: string;
  city: string;
  parcels: RiderDeliveryParcel[];
}

export interface RiderDeliveriesResponse {
  data: RiderDeliveryGroup[];
  hub: RiderHubDropoff | null;
  meta: {
    view: RiderDeliveryView;
    assigned_count: number;
    out_for_delivery_count: number;
  };
}

export interface RiderStartDeliveryResponse {
  message: string;
  started_count: number;
  tracking_numbers: string[];
}

// ─── Rider Delivery Outcomes (Feature 2.7) ─────────────────────────────────────

export interface RiderFailureReason {
  code: string;
  label: string;
  requires_note: boolean;
}

export interface RiderFailureReasonsResponse {
  data: RiderFailureReason[];
}

export interface RiderDeliveredResponse {
  message: string;
  tracking_number: string;
  delivered_at: string;
  cod_collected: boolean;
  cod_amount?: number | null;
  /** The fixed delivery pay earned (A3). */
  pay?: string;
}

export interface RiderFailedResponse {
  message: string;
  tracking_number: string;
  reason: { code: string; label: string };
  delivery_attempts: number;
  max_attempts?: number;
  /** Refused, or the last attempt: the parcel goes back to the seller (A13). */
  return_to_sender?: boolean;
  pay?: string;
}

// ─── Hub Delivery Monitoring and Failure Triage (Feature 1.9) ──────────────────

export interface HubDeliveryRider {
  id: number;
  name: string;
  plate_number: string | null;
}

export interface HubDeliveryDestination {
  barangay_code: string | null;
  barangay_name: string;
  city: string;
}

export interface HubDeliveryOutRow {
  tracking_number: string;
  order_number: string | null;
  rider: HubDeliveryRider | null;
  destination: HubDeliveryDestination;
  recipient_name: string;
  out_for_delivery_at: string | null;
  elapsed_minutes: number | null;
}

export interface HubDeliveriesOutResponse {
  data: HubDeliveryOutRow[];
  meta: {
    total: number;
    truncated: boolean;
    riders: { rider_id: number | null; name: string; plate_number: string | null; count: number }[];
  };
}

export interface HubDeliveryFailedRow {
  tracking_number: string;
  order_number: string | null;
  rider: HubDeliveryRider | null;
  destination: HubDeliveryDestination;
  recipient_name: string;
  failure_reason: { code: string; label: string } | null;
  failure_note: string | null;
  failed_at: string | null;
  delivery_attempts: number;
  max_attempts: number;
  can_reschedule: boolean;
}

export interface HubDeliveriesFailedResponse {
  data: HubDeliveryFailedRow[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    max_attempts: number;
    reasons: { code: string; label: string; requires_note: boolean }[];
  };
}

export interface HubRescheduleResponse {
  message: string;
  tracking_number: string;
  rider: { id: number; name: string };
  delivery_attempts: number;
  max_attempts: number;
}

export interface HubReturnToSellerResponse {
  message: string;
  tracking_number: string;
}

// ─── Hub Dispatch (Feature 1.8) ────────────────────────────────────────────────

export interface HubDispatchBatch {
  barangay_code: string;
  barangay_name: string;
  city: string;
  parcel_count: number;
  oldest_sorted_at: string | null;
  eligible_riders: number;
}

export interface HubDispatchBatchesResponse {
  data: HubDispatchBatch[];
  meta: { total_batches: number; total_parcels: number };
}

export interface HubDispatchParcel {
  tracking_number: string;
  order_number: string | null;
  sorted_at: string | null;
}

export interface HubDispatchParcelsResponse {
  data: HubDispatchParcel[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
}

export interface HubDispatchRider {
  id: number;
  name: string;
  vehicle_type: string;
  plate_number: string | null;
  area_labels: string[];
  current_load: number;
}

export interface HubDispatchRidersResponse {
  data: HubDispatchRider[];
}

export interface HubDispatchAssignResponse {
  message: string;
  assigned_count: number;
  barangay: { code: string; name: string };
  rider: { id: number; name: string };
}

export interface HubDashboardMetricsResponse {
  data: HubDashboardMetrics;
}

export interface SortingCenterApplicationSummaryItem {
  id: number;
  hub_name: string;
  address_city: string;
  address_province: string;
  city_province: string;
  applicant_name: string | null;
  applicant_email: string | null;
  /** The applicant's profile photo, or null when they never uploaded one. */
  applicant_avatar_url: string | null;
  /** The courier company the hub joins; its team reviews the application. */
  courier?: CourierSummary | null;
  submitted_date: string | null;
  created_at: string | null;
  status: SortingCenterStatus;
}

export interface SortingCenterApplicant {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  sex: string | null;
  date_of_birth: string | null;
  status: string;
  government_id_type: string | null;
  government_id_image_url: string | null;
  government_id_image_back_url: string | null;
}

export interface SortingCenterApplicationDetail {
  id: number;
  hub_name: string;
  status: SortingCenterStatus;
  address_province: string;
  address_city: string;
  address_barangay: string;
  address_street: string;
  coverage_barangays: string[];
  coverage_count: number;
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  dti_permit_url: string | null;
  applicant: SortingCenterApplicant | null;
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
  shop_category?: string | null;
  seller_type?: 'individual' | 'sole_proprietorship' | 'corporation' | null;
  tin?: string | null;
  shop_contact_number?: string | null;
  address?: { region: string | null; province: string | null; city: string | null; barangay: string | null; street: string | null; postal_code: string | null; full: string };
  bir_2303_url?: string | null;
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
  | 'PLACED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'AT_SORTING_CENTER'
  | 'SORTED'
  | 'ASSIGNED_TO_RIDER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface OrderStatusHistory {
  id: number;
  from_status: OrderStatus | string | null;
  to_status: OrderStatus | string;
  actor_type: string;
  actor_id?: number | null;
  note?: string | null;
  created_at: string;
}

export type PaymentMethod = 'gcash' | 'cod' | 'e_wallet' | 'card';
export type PaymentStatus = 'pending' | 'pending_verification' | 'paid' | 'failed' | 'cod' | 'verification_failed' | 'refunded';

export interface OrderItem {
  /** The product the line was (null for lines from before this was recorded). */
  product_id?: number | null;
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
  regular_unit_price?: number | null;
  price_source?: 'regular' | 'sale' | 'flash' | null;
  is_gift?: boolean;
  promo_share?: number;
}

export type BuyerOrderTab = 'to_pay' | 'to_ship' | 'to_receive' | 'completed' | 'cancelled' | 'return_refund';

export interface Order {
  id: number;
  checkout_group_id?: string | null;
  order_number: string;
  tracking_number?: string | null;
  /** The courier assigned to the order (matched to the shop and the buyer address, not picked by the buyer). */
  courier?: CourierSummary | null;
  /** "direct": paid to the shop's GCash or the rider; "platform": an order from before direct payments. */
  settlement?: 'direct' | 'platform';
  /** The shop paid the delivery fee for the buyer. */
  free_delivery?: boolean;
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
  shipping_province_code?: string | null;
  shipping_city_code?: string | null;
  shipping_barangay_code?: string | null;
  notes?: string | null;
  created_at: string;
  /** Feature 2.8: when delivered, when it will confirm itself, when it was completed. */
  delivered_at?: string | null;
  auto_complete_at?: string | null;
  completed_at?: string | null;
  /** True when the rider uploaded a delivery proof photo the buyer can view. */
  delivery_proof_available?: boolean;
  /** How many proof photos exist (older deliveries have one, new ones have two). */
  delivery_proof_count?: number;
  /** The return request (A31), with its evidence and the shop's answer. */
  dispute?: import('./../api/commerce').ReturnRequestView | null;
  items: OrderItem[];
  status_history?: OrderStatusHistory[];
  /** The buyer tab the order is in (A10). */
  tab?: BuyerOrderTab;
  payment_due_at?: string | null;
  paid_at?: string | null;
  /** Set while an e-wallet or card payment can still be made. */
  payment_token?: string | null;
  promo_discount?: number;
  store_voucher_discount?: number;
  platform_voucher_discount?: number;
  shipping_voucher_discount?: number;
  vouchers?: { scope: 'store' | 'platform' | 'shipping'; code: string | null; discount: number }[];
  chargeable_weight_kg?: number | null;
  shipping_route?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  refund_status?: 'pending' | 'refunded' | null;
  refund_amount?: number | null;
  refunded_at?: string | null;
  can_cancel?: boolean;
  can_return?: boolean;
  /** A32: the 6-digit code to give the rider, while the parcel is out for delivery. */
  delivery_otp?: string | null;
  delivery_attempt?: { failed: number; max: number } | null;
  returning_to_seller?: boolean;
  return_unavailable_reason?: string | null;
  return_window_ends_at?: string | null;
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
  regular_unit_price?: number | null;
  price_source?: string | null;
  is_gift?: boolean;
  promo_share?: number;
  store_voucher_share?: number;
}

export interface SellerOrder {
  id: number;
  /** The courier assigned to the order; only its riders collect the parcel. */
  courier?: CourierSummary | null;
  checkout_group_id?: string | null;
  checkout_group_total?: number | null;
  checkout_orders_count?: number | null;
  order_number: string;
  tracking_number?: string | null;
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
  shipping_province_code?: string | null;
  shipping_city_code?: string | null;
  shipping_barangay_code?: string | null;
  notes: string | null;
  created_at: string;
  buyer: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  items: SellerOrderItem[];
  status_history?: OrderStatusHistory[];
  /** An e-wallet or card order waiting for the buyer to pay (it cannot be accepted yet). */
  awaiting_payment?: boolean;
  payment_due_at?: string | null;
  paid_at?: string | null;
  tab?: string | null;
  shipping_route?: string | null;
  chargeable_weight_kg?: number | null;
  promo_discount?: number;
  store_voucher_discount?: number;
  store_voucher_code?: string | null;
  platform_voucher_discount?: number;
  shipping_voucher_discount?: number;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  can_cancel?: boolean;
  /** A failed delivery coming back to the shop, or back and waiting for the shop to confirm it (A13). */
  return_to_sender?: { state: 'on_the_way' | 'awaiting_confirmation' | 'confirmed'; since: string | null; confirmed_at: string | null } | null;
  dispute?: import('./../api/commerce').ReturnRequestView | null;
}

export interface WaybillData {
  order: {
    id: number;
    order_number: string;
    created_at: string;
    payment_method: PaymentMethod;
    total: number;
  };
  parcel: {
    id: number;
    tracking_number: string;
    status: string;
    ready_at: string | null;
    pickup_barangay: string | null;
    pickup_barangay_code?: string | null;
    destination_barangay: string | null;
    destination_barangay_code?: string | null;
    cod_amount: number | null;
    /** Actual parcel weight, and the whole kilograms it is charged as (A20). */
    weight_kg?: number | null;
    chargeable_weight_kg?: number | null;
  };
  sender: {
    shop_name?: string;
    contact_phone?: string;
    street?: string;
    barangay?: string;
    city?: string;
    province?: string;
    full_address?: string;
  };
  recipient: {
    name?: string;
    phone?: string;
    street?: string;
    barangay?: string;
    city?: string;
    province?: string;
    full_address?: string;
  };
  items: Array<{
    id: number;
    product_name: string;
    variant_label: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  cod: {
    is_cod: boolean;
    amount: number;
  };
  barcode: {
    format: string;
    value: string;
  };
  /** The courier that carries the parcel, printed on the label. */
  courier?: CourierSummary | null;
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
  /** Feature 2.8: when this item's escrow releases; null until the order is COMPLETED. */
  escrow_release_at?: string | null;
  /** The shop's own voucher and promotion share on this line; they come off before the commission. */
  seller_discounts?: number;
  gross_after_discounts?: number;
  /** Pending until the order is Completed, then Available (A3). */
  earning_status?: 'pending' | 'available';
  settlement?: string | null;
  payment_method?: PaymentMethod | null;
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
  tracking_number?: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  created_at: string;
  buyer: { id: number; first_name: string; last_name: string; email: string } | null;
  /** The shop selling on the order (checkout makes one order per seller). */
  shop?: { id: number; name: string } | null;
  /** The partner courier assigned at checkout. */
  courier?: CourierSummary | null;
  /** Where it goes (the detail endpoint only). */
  shipping?: { name: string | null; phone: string | null; address: string; notes: string | null };
  items: OrderItem[];
  status_history?: OrderStatusHistory[];
  payment?: {
    method: PaymentMethod;
    reference_number: string | null;
    amount: number;
    status: PaymentStatus;
    paid_at: string | null;
  } | null;
}

/** The status groups of the admin Orders page. They partition every order status. */
export type AdminOrderGroupKey = 'awaiting_action' | 'in_transit' | 'delivered_completed' | 'problem' | 'cancelled';

/** GET /admin/orders/summary: the KPI row and chip counts for the current filters (except the status filter). */
export interface AdminOrderSummary {
  total: number;
  groups: Record<AdminOrderGroupKey, number>;
  by_status: Record<OrderStatus, number>;
  /** Sum of the orders that count (not cancelled or returned), the dashboard's definition of GMV. */
  gmv: number;
}

export interface AdminOrderListParams {
  status?: OrderStatus;
  group?: AdminOrderGroupKey;
  search?: string;
  /** Inclusive Asia/Manila days (YYYY-MM-DD); send both or neither. */
  from?: string;
  to?: string;
  payment_method?: 'gcash' | 'cod';
  payment_status?: string;
  sort?: 'date' | 'total';
  direction?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
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

/**
 * Return requests (A31) move pending → approved, or pending → rejected → escalated → approved/closed. The older
 * open / in_progress / resolved / closed values are kept for claims raised before the return flow.
 */
export type DisputeStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'pending' | 'approved' | 'rejected' | 'escalated';

export interface AdminDispute {
  id: number;
  reason: string;
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  /** The buyer's own words on a return request, and their evidence photos. */
  description?: string | null;
  photos?: string[];
  seller?: { id: number; shop_name: string | null } | null;
  seller_reason?: string | null;
  seller_responded_at?: string | null;
  /** The shop's deadline to answer, and the buyer's to escalate a rejection. */
  respond_by?: string | null;
  escalate_by?: string | null;
  escalated_at?: string | null;
  auto_approved?: boolean;
  refund_amount?: number | null;
  /** Still waiting for Loved-IT's decision. */
  can_decide?: boolean;
  buyer: { id: number; first_name: string; last_name: string; email: string } | null;
  order: {
    id: number;
    order_number: string;
    total: number;
    status: OrderStatus;
    payment_method?: PaymentMethod;
    refund_status?: string | null;
    items?: OrderItem[];
  } | null;
  resolver?: { first_name: string; last_name: string } | null;
}

export interface AdminDisputeStats {
  open: number;
  in_progress: number;
  resolved: number;
  /** Returns the buyer escalated after the shop rejected them. */
  escalated?: number;
  /** Returns the shop still has to answer. */
  awaiting_seller?: number;
  /** Rejected by the shop; the buyer can still escalate. */
  rejected?: number;
  /** Escalated returns and open claims, waiting for Loved-IT. */
  needs_decision?: number;
  /** Of those, waiting more than 3 days. */
  overdue?: number;
  total?: number;
}

// ─── Admin Reviews ────────────────────────────────────────────────────────────

export type ModerationStatus = 'visible' | 'hidden' | 'pending_review';

export interface AdminReview {
  id: number;
  product_id: number;
  rating: number;
  comment: string | null;
  verified_purchase: boolean;
  /** Photos the buyer attached. */
  images?: string[];
  created_at: string;
  buyer: { id: number; first_name: string; last_name: string; email: string; avatar_url?: string | null } | null;
  product?: { id: number; name: string; thumbnail_url?: string | null } | null;
  shop?: { id: number; name: string } | null;
  order?: { id: number; order_number: string } | null;
}

/** Feedback about the Loved-IT site (the storefront's Feedback button), as the admin reads it. */
export interface AdminFeedback {
  id: number;
  message: string;
  page_url: string | null;
  status: 'new' | 'read';
  read_at: string | null;
  created_at: string;
  user: { id: number; name: string; email: string; avatar_url: string | null } | null;
}

/** GET /admin/reviews/summary: the whole platform's review figures. */
export interface AdminReviewSummary {
  total: number;
  /** Null, never 0, when there are no reviews. */
  average_rating: number | null;
  rating_distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** Approved shops, and how many of them have at least one review. */
  shops: number;
  shops_reviewed: number;
}

/** One shop in the admin Reviews list. `id` is the seller's user id. */
export interface AdminReviewShop {
  id: number;
  shop_name: string;
  shop_slug: string;
  logo_url: string | null;
  owner_name: string;
  owner_avatar_url?: string | null;
  review_count: number;
  average_rating: number | null;
  last_review_at: string | null;
  /** Only on GET /admin/reviews/shops/{seller}. */
  rating_distribution?: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export type AdminReviewShopSort = 'reviews' | 'rating' | 'recent' | 'name';

export interface AdminReviewListParams {
  shop_id?: number;
  rating?: number;
  search?: string;
  page?: number;
  per_page?: number;
}

// ─── Messaging & Chat ────────────────────────────────────────────────────────

export type RiderThreadType = 'rider_seller' | 'rider_buyer' | 'rider_hub';
export type ConversationType = 'buyer_seller' | 'buyer_admin' | 'seller_admin' | RiderThreadType;
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
  role: 'buyer' | 'seller' | 'admin' | 'rider' | 'hub';
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
  // Rider delivery threads only (feature 2.10)
  counterpart?: RiderChatCounterpart;
  parcel?: RiderThreadParcel | null;
  is_closed?: boolean;
  can_send?: boolean;
  closed_message?: string | null;
}

/** A product a chat can share (GET /conversations/{id}/attachable-products). */
export interface AttachableProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
  image: string | null;
  category: string | null;
}

/** An order a chat can share (GET /conversations/{id}/attachable-orders). */
export interface AttachableOrder {
  id: number;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
  items_count: number;
  items_summary: string;
  image: string | null;
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
  /** A flash sale running now (its price is already in base_price). */
  flash_sale?: { id: number; price: number; remaining: number; quantity: number; ends_at: string; variant_id: number | null } | null;
  /** The shop is on vacation: browsing only, no orders. */
  on_vacation?: boolean;
  purchase_limit?: number | null;
  total_stock?: number;
  price_range?: { min: number; max: number; regular_min: number; regular_max: number };
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
  shop_slug?: string;
  /** Active products in the shop. */
  product_count?: number;
  /** Average review rating across the shop's products (null when unrated). */
  avg_rating?: number | null;
  joined_at?: string | null;
  avatar_url: string | null;
  city: string | null;
  province: string | null;
  rating_pct: number | null;   // e.g. 97 = 97%
  units_sold: number;
  repurchase_rate: number | null; // e.g. 82 = 82%
  response_rate: number | null;
  return_policy?: string | null;
  shipping_policy?: string | null;
  on_vacation?: boolean;
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
  /** The running store sale's percentage, when it is a percentage discount. */
  discount_percent?: number | null;
  /** Where it sits in the catalog. */
  category?: { slug: string; name: string; parent: { slug: string; name: string } | null } | null;
  /** The seller's names for the variation types, e.g. ["Color", "Size"]. */
  variation_types?: string[];
  /** Every variant as its option labels, price and stock, so a sold-out combination can be disabled. */
  combinations?: ProductCombination[];
  price_range?: { min: number; max: number; regular_min: number; regular_max: number };
  store_sale?: { id: number; type: 'percent' | 'fixed'; percent: number | null; sale_price: number | null; ends_at: string } | null;
  flash_sale?: { id: number; price: number; remaining: number; quantity: number; ends_at: string; variant_id: number | null } | null;
  upcoming_flash_sale?: { id: number; price: number; quantity: number; starts_at: string; ends_at: string; reminder_set: boolean } | null;
  on_vacation?: boolean;
  purchase_limit?: number | null;
  /** Units the signed-in buyer already bought, for the per-buyer limit. */
  purchased_by_you?: number;
  total_stock?: number;
}

export interface ProductCombination {
  variant_id: number;
  label: string;
  parts: string[];
  stock_quantity: number;
  price: number;
  original_price: number | null;
  price_source: 'regular' | 'sale' | 'flash';
}

export interface ProductReview {
  id: number;
  rating: number;
  comment: string | null;
  verified_purchase: boolean;
  created_at: string;
  images?: string[];
  buyer: { id: number | null; name: string; avatar_url: string | null };
  variant_label?: string | null;
  seller_reply?: { body: string; replied_at: string | null; edited_at: string | null } | null;
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
  /** A shop's own store category (its subcategories included). */
  store_category_id?: number;
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
  sort?: 'best_match' | 'price_asc' | 'price_desc' | 'newest' | 'best_selling' | 'highest_rated' | 'random' | 'trending';
  /** With sort=random: keeps the shuffle stable across pages. */
  seed?: number;
  page?: number;
  per_page?: number;
}

/** A category on the storefront (GET /categories): its cover is a photo of its best-selling product, if it has any. */
export interface StorefrontCategory {
  id: number;
  slug: string;
  name: string;
  product_count: number;
  image_url: string | null;
  requires_fda?: boolean;
  children?: StorefrontCategory[];
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
  /** With a search: the query as the catalog spells it when a typo was forgiven. */
  search?: { corrected: string | null } | null;
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
  /** The regular price (what the seller's form edits). */
  price: number;
  regular_price?: number;
  /** What buyers pay right now, with a running store or flash sale. */
  current_price?: number;
  /** At or below the low-stock threshold (5). */
  low_stock?: boolean;
}

export interface SellerProduct {
  id: number;
  name: string;
  description: string | null;
  category_id: string;
  thumbnail_url: string | null;
  images: ProductImage[];
  base_price: number;
  /** The cheapest variant's price before the discount (null when not on sale). */
  original_price?: number | null;
  /** The shop's own discount, in percent (null when none). */
  discount_percent?: number | null;
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
  /** The lowest and highest price now (sale or flash price when one runs) and the regular range. */
  price_range?: { min: number; max: number; regular_min: number; regular_max: number };
  /** The names of the (at most two) variation types, e.g. ["Color", "Size"]. */
  variation_types?: string[];
  store_category_ids?: number[];
  purchase_limit?: number | null;
  published_at?: string | null;
  /** A29: follow the shop's low-stock level, use the product's own (0: only when sold out), or no alert. */
  low_stock_alert?: LowStockAlertMode;
  low_stock_threshold?: number | null;
  /** The level in force for this product (null: no alert), and the shop's level. */
  low_stock_level?: number | null;
  shop_low_stock_level?: number;
}

export type LowStockAlertMode = 'shop' | 'custom' | 'off';

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
  /** The saved variant's id (edit mode), so orders keep pointing at it. */
  id?: number;
  sku?: string;
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
  /** The shop's discount on every variant, in percent ('' = none). */
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
  /** The store's own categories this product is in (up to 3). */
  storeCategoryIds: number[];
  /** The most units one buyer can ever buy ('' = no limit). */
  purchaseLimit: string;
  /** The low-stock alert: the shop's level, this product's own, only when sold out (own level 0), or none. */
  lowStockMode: 'shop' | 'custom' | 'sold_out' | 'off';
  lowStockLevel: string;
}

// ─── Wishlist & Store Follows ────────────────────────────────────────────────

export interface WishlistProduct {
  id: number;
  name: string;
  thumbnail_url: string | null;
  base_price: number;
  original_price: number | null;
  status: string;
  /** available, sold_out, on_vacation (the shop is away) or unavailable (removed, deactivated or the shop closed). */
  availability?: 'available' | 'sold_out' | 'on_vacation' | 'unavailable';
  total_stock: number;
  variants?: { id: number; label: string; price: number; stock_quantity: number }[];
  seller: { id: number; shop_name: string; shop_slug?: string };
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
    shop_slug?: string;
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
  region?: string | null;
  region_code?: string | null;
  address_needs_update?: boolean;
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
  address_street?: string | null;
  address_province_code?: string | null;
  address_city_code?: string | null;
  address_barangay_code?: string | null;
  address_needs_update?: boolean;
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
  /** The seller's own store categories (visible ones), two levels deep. */
  store_categories?: { id: number; name: string; product_count: number; children?: { id: number; name: string; product_count: number }[] }[];
  on_vacation?: boolean;
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
  /** Commission as a share of GMV; null when there was no GMV. */
  avg_commission_rate: number | null;
  range?: AnalyticsRange;
  orders_placed?: number;
  cancelled_orders?: number;
  returned_orders?: number;
  active_buyers?: number;
  active_sellers?: number;
  previous?: AnalyticsPrevious;
  pipeline?: OrderPipeline;
  disputes?: AnalyticsDisputes;
}

/** What selects the range of an admin report: explicit Manila days, or a preset (7d, 30d, 90d, 12m, all). */
export interface ReportRangeParams {
  range?: string;
  from?: string;
  to?: string;
}

export interface AdminRevenueChartPoint {
  date: string;
  iso_date?: string;
  gmv: number;
  commission: number;
  /** Orders that count toward GMV (not cancelled or returned). */
  orders_count: number;
  orders_placed?: number;
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
  /** E-wallet and card orders paid through Loved-IT's gateway. */
  e_wallet_card?: { count: number; volume: number };
  total_orders: number;
  total_volume: number;
}

export interface SellerReportSummary {
  /** Item subtotals before the shop's own vouchers and promotions; shipping is not included (A9). */
  gross_sales: number;
  /** The shop's own vouchers and promotions, which come off before the commission. */
  seller_discounts?: number;
  /** The window the totals cover, as Manila dates (null for all time). */
  from?: string | null;
  to?: string | null;
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

/** A commission override on a real category; a parent's rate covers its sub-categories that have none. */
export interface CategoryCommissionOverride {
  category_id: number;
  category_name: string;
  parent_name: string | null;
  is_parent: boolean;
  sub_categories: number;
  rate_percent: number;
}

export interface CommissionCategoryOption {
  id: number;
  name: string;
  parent_name: string | null;
  is_parent: boolean;
  is_active: boolean;
  sub_categories: number;
}

export interface ReturnPolicySettings {
  return_window_days: number;
  seller_response_days: number;
  escalation_days: number;
  summary: string;
  mediation_terms: string;
  non_returnable_categories: Record<string, string>;
}

export interface CommissionSettings {
  base_rate_percent: number;
  overrides: CategoryCommissionOverride[];
  categories: CommissionCategoryOption[];
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
  /** Every product in it, archived ones included (they block deleting it). */
  products_count?: number;
  active_products_count?: number;
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
  /** A parent's rate covers its sub-categories that have none of their own. */
  commission_rate: number | null;
  products_count?: number;
  children: AdminCategoryLeaf[];
  created_at?: string;
  updated_at?: string;
}

export interface AdminCategoryMetrics {
  total_parents: number;
  total_leaves: number;
  total_products: number;
  fda_regulated_leaves: number;
  base_commission_rate?: number;
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

// ─── Courier / Rider Pickup Dashboard ──────────────────────────────────────────

export interface RiderPickupAddress {
  street: string;
  barangay: string;
  city: string;
  province: string;
  full_address: string;
}

export type RiderPickupView = 'available' | 'mine' | 'picked_up';

export interface RiderHubDropoff {
  hub_name: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  full_address: string;
}

export interface RiderPickupGroup {
  seller_id: number;
  shop_name: string;
  shop_phone: string;
  pickup_address: RiderPickupAddress;
  parcel_count: number;
  /** Only in the "mine" view. The "available" view never lists tracking numbers (docs/api/rider-pickups.md). */
  tracking_numbers?: string[];
  ready_since: string;
  matched_area_label?: string | null;
  pickup_accepted_at?: string | null;
}

/** A seller group in the `picked_up` view (collected, awaiting hub drop-off). */
export interface RiderPickedUpGroup {
  seller_id: number;
  shop_name: string;
  parcel_count: number;
  tracking_numbers: string[];
  picked_up_at: string | null;
  hub: RiderHubDropoff | null;
}

export interface RiderPickupsMeta {
  available_count: number;
  mine_count: number;
  picked_up_count: number;
  has_areas: boolean;
}

export interface RiderPickupsResponse {
  data: RiderPickupGroup[];
  meta: RiderPickupsMeta;
}

export interface RiderPickedUpResponse {
  data: RiderPickedUpGroup[];
  meta: RiderPickupsMeta;
}

export interface RiderVerifyParcelResponse {
  data: {
    tracking_number: string;
    seller_id: number;
    shop_name: string;
    order_number: string | null;
  };
}

export interface RiderConfirmHandoverResponse {
  message: string;
  picked_up_count: number;
  tracking_numbers: string[];
  hub: RiderHubDropoff | null;
}

export interface RiderAcceptPickupResponse {
  message: string;
  claimed_count: number;
  tracking_numbers: string[];
}

export interface RiderDeclinePickupResponse {
  message: string;
  declined_count: number;
}

export interface RiderReleasePickupResponse {
  message: string;
  released_count: number;
}

// ─── Rider Earnings and History (Feature 2.9) ──────────────────────────────────

export type RiderEarningsPeriodType = 'day' | 'week' | 'month';

export interface RiderEarningsPeriod {
  type: RiderEarningsPeriodType;
  /** Manila calendar dates, YYYY-MM-DD, both inclusive. */
  start_date: string;
  end_date: string;
  start_at: string;
  end_at: string;
  is_current: boolean;
  timezone: string;
}

export interface RiderEarningsBreakdownPoint {
  /** "00".."23" for a day, YYYY-MM-DD for a week or month. */
  key: string;
  label: string;
  /** Decimal string, e.g. "150.00". Never a float. */
  total: string;
  count: number;
}

export interface RiderEarningsSummary {
  period: RiderEarningsPeriod;
  total_earned: string;
  deliveries_count: number;
  average_per_delivery: string;
  previous: RiderEarningsPeriod & { total_earned: string; deliveries_count: number };
  breakdown: RiderEarningsBreakdownPoint[];
  lifetime_total: string;
  /** Earned but not yet paid by the courier company (it pays by GCash). */
  unpaid_total?: string;
}

export interface RiderEarningsSummaryResponse {
  data: RiderEarningsSummary;
}

export interface RiderPageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export interface RiderEarnedDelivery {
  id: number;
  /** pickup: collected from the seller and brought to the hub; delivery: brought to the buyer. */
  kind: 'pickup' | 'delivery';
  tracking_number: string;
  order_number: string | null;
  destination: { barangay_name: string; city: string };
  /** When the fee was earned (ISO 8601). */
  delivered_at: string;
  fee: string;
  /** When the courier company paid this share; null while unpaid. */
  paid_at?: string | null;
}

export interface RiderEarningsDeliveriesResponse {
  data: RiderEarnedDelivery[];
  meta: RiderPageMeta & { period: RiderEarningsPeriod };
}

export type RiderHistoryOutcome = 'delivered' | 'failed' | 'returned';
export type RiderHistoryFilter = RiderHistoryOutcome | 'all';

export interface RiderHistoryEntry {
  outcome: RiderHistoryOutcome;
  occurred_at: string;
  tracking_number: string;
  order_number: string | null;
  destination: { barangay_name: string; city: string };
  /** Only on failed attempts. The label comes from the reason list, never the rider's note. */
  failure_reason: { code: string; label: string } | null;
  /** Only on delivered entries. */
  fee: string | null;
  /** Only on a delivered COD parcel whose cash was confirmed. */
  cod_collected: string | null;
}

export interface RiderHistoryResponse {
  data: RiderHistoryEntry[];
  meta: RiderPageMeta & { outcome: RiderHistoryFilter };
}


// ─── Hub reports (Feature 1.10) ──────────────────────────────────────────────

export interface HubReportRange {
  from: string;
  to: string;
  days: number;
  timezone: string;
}

/** Rates are fractions between 0 and 1; every nullable field is null when there is nothing to divide or average. */
export interface HubReportTotals {
  received: number;
  sorted: number;
  dispatched: number;
  delivered: number;
  failed_attempts: number;
  returned: number;
  on_time_deliveries: number;
  on_time_rate: number | null;
  success_rate: number | null;
  avg_hub_dwell_hours: number | null;
  avg_delivery_hours: number | null;
}

export interface HubReportDailyRow {
  date: string;
  received: number;
  delivered: number;
  failed: number;
  returned: number;
}

export interface HubReportSummary {
  range: HubReportRange;
  sla_hours: number;
  totals: HubReportTotals;
  daily: HubReportDailyRow[];
  excluded: { delivered_without_time: number };
}

export type HubReportRiderSort =
  | 'name'
  | 'delivered'
  | 'failed_attempts'
  | 'success_rate'
  | 'avg_delivery_hours'
  | 'on_time_rate';

export type HubReportSortDirection = 'asc' | 'desc';

export interface HubReportRiderRow {
  rider_id: number;
  name: string;
  status: string;
  vehicle_type: string;
  plate_number: string | null;
  delivered: number;
  failed_attempts: number;
  success_rate: number | null;
  avg_delivery_hours: number | null;
  on_time_deliveries: number;
  on_time_rate: number | null;
}

export interface HubReportRiders {
  range: HubReportRange;
  sla_hours: number;
  sort: HubReportRiderSort;
  direction: HubReportSortDirection;
  riders: HubReportRiderRow[];
  /** Deliveries in the range that no rider reported (an administrator marked them delivered). */
  unattributed_deliveries: number;
}

export type HubReportKind = 'daily' | 'riders';

// ─── Rider delivery chat (Feature 2.10) ──────────────────────────────────────

export type RiderChatCounterpart = 'seller' | 'buyer' | 'hub';

export interface RiderThreadParcel {
  tracking_number: string;
  order_number: string | null;
  status: string;
}

/** A rider delivery thread as the rider, the hub, the buyer or the seller sees it (names only, never contact details). */
export interface RiderThread {
  id: number;
  type: RiderThreadType;
  status: ConversationStatus;
  counterpart: RiderChatCounterpart;
  subject: string;
  parcel: RiderThreadParcel | null;
  recipient: ConversationRecipient;
  buyer_id: number | null;
  seller_id: number | null;
  is_closed: boolean;
  can_send: boolean;
  closed_message: string | null;
  last_message: { id: number; body: string; sender_id: number; created_at: string } | null;
  last_message_at: string | null;
  unread: number;
  created_at: string;
}

export interface RiderThreadsResponse {
  data: RiderThread[];
  meta: { current_page: number; last_page: number; per_page: number; total: number; unread_total: number };
}

/** One entry of GET /rider/chat/unread, for the badges on stop cards. */
export interface RiderChatUnreadItem {
  thread_id: number;
  tracking_number: string | null;
  counterpart: RiderChatCounterpart;
  unread: number;
}

/** Open or closed, as reported alongside every message fetch. */
export interface ThreadMeta {
  is_closed: boolean;
  can_send: boolean;
  closed_message: string | null;
}

export interface ThreadMessagesResult {
  data: ChatMessage[];
  meta: ThreadMeta;
}

/** The three calls a thread view needs; each role (rider, hub, buyer or seller) has its own endpoints. */
export interface ThreadAdapter {
  fetchMessages: (afterId?: number) => Promise<ThreadMessagesResult>;
  sendMessage: (body: string) => Promise<ChatMessage>;
  /** Only for the rider and hub endpoints; the buyer/seller endpoint marks read as it fetches. */
  markRead?: () => Promise<void>;
}

export interface RiderVehicleUpdate {
  vehicle_type: RiderVehicleType;
  plate_number: string;
}

// ─── Track package and live courier location ─────────────────────────────────

export interface TrackingPlace {
  name: string;
  full_address: string;
  barangay: string;
  city: string;
  province: string;
}

export type CourierState = 'live' | 'stale' | 'not_sharing' | 'not_with_courier';

export interface TrackingCourier {
  state: CourierState;
  leg: 'pickup' | 'delivery' | null;
  name: string | null;
  vehicle_type: string | null;
  location: { latitude: number; longitude: number; heading: number | null; accuracy_m: number | null; updated_at: string } | null;
}

export interface TrackingEvent {
  status: string;
  title: string;
  detail: string;
  at: string | null;
  proof: boolean;
}

export interface ParcelTracking {
  tracking_number: string;
  order_number: string | null;
  status: string;
  viewer_role: 'buyer' | 'seller' | 'hub' | 'rider' | 'admin';
  origin: TrackingPlace;
  hub: TrackingPlace | null;
  destination: TrackingPlace;
  courier: TrackingCourier;
  events: TrackingEvent[];
  proof: { count: number; delivered_at: string | null; received_by: string | null };
}

export interface RiderLocationStatus {
  sharing_required: boolean;
  active_parcels: number;
  last_located_at: string | null;
}

// ─── Hub: parcels waiting for their rider (handover QR) ─────────────────────────

export interface HubAwaitingParcel {
  tracking_number: string;
  order_number: string | null;
  barangay: string;
  recipient_name: string;
  assigned_at: string | null;
}

export interface HubAwaitingRider {
  rider: { id: number; name: string };
  parcels: HubAwaitingParcel[];
}

// ─── Hub earnings (the hub's share of the delivery fee) ──────────────────────────

export interface HubEarningsTotals {
  total: string;
  deliveries_count: number;
}

export interface HubEarningsRow {
  tracking_number: string | null;
  order_number: string | null;
  rider_name: string | null;
  delivery_fee: string | null;
  amount: string;
  earned_at: string | null;
  paid_at?: string | null;
}

export interface HubEarningsSummary {
  delivery_fee: string;
  split: { rider_percent: number; pickup_percent: number; delivery_percent: number; hub_percent: number };
  today: HubEarningsTotals;
  week: HubEarningsTotals;
  month: HubEarningsTotals;
  lifetime: HubEarningsTotals;
  unpaid_total?: string;
  recent: HubEarningsRow[];
}

/** A shop on the storefront's "Shops to know" band (GET /shops). */
export interface FeaturedShop {
  seller_id: number;
  shop_name: string;
  shop_slug: string;
  logo_url: string | null;
  city: string | null;
  province: string | null;
  product_count: number;
  units_sold: number;
  avg_rating: number | null;
  review_count: number;
  products: { id: number; name: string; price: number; image_url: string | null }[];
}

/** A product the buyer received and can review (GET /buyer/reviews/pending). */
export interface PendingReview {
  order_id: number;
  order_number: string;
  delivered_at: string | null;
  variant_label: string | null;
  shop_name: string | null;
  product: { id: number; name: string; image_url: string | null };
}

/** One of the buyer's own reviews (GET /buyer/reviews). */
export interface BuyerReview {
  id: number;
  rating: number;
  comment: string | null;
  verified_purchase: boolean;
  images: string[];
  created_at: string;
  updated_at: string;
  /** Rating and text can be changed for 30 days after posting. */
  can_edit: boolean;
  order: { id: number; order_number: string } | null;
  product: { id: number; name: string; image_url: string | null } | null;
}

// ─── Direct payments ─────────────────────────────────────────────────────────

/** A GCash account someone is paid on (number shown as "0917 123 4567"). */
export interface GcashAccount {
  name: string | null;
  number: string;
  qr_url?: string | null;
}

/** How a shop in the cart gets paid (GET /checkout/shops). The GCash details only come to signed-in buyers. */
export interface ShopPaymentInfo {
  seller_id: number;
  shop_name: string;
  accepts_gcash: boolean;
  free_delivery_min: number | null;
  gcash: GcashAccount | null;
}

/** A shop's own payment settings (Seller Center). */
export interface SellerPaymentSettings {
  accepts_gcash: boolean;
  gcash_number: string | null;
  gcash_account_name: string | null;
  gcash_qr_url: string | null;
  free_delivery_min: number | null;
  delivery_fee: number;
}

export type SettlementDirection = 'courier_pays' | 'seller_pays' | 'none';

export interface SettlementRecord {
  id: number;
  reference: string;
  amount: number;
  paid_by: 'courier' | 'seller';
  paid_at: string | null;
  confirmed_at: string | null;
}

/** One courier and one shop in one week: COD cash collected minus the courier's delivery fees. */
export interface SettlementLine {
  orders_count: number;
  cod_collected: number;
  courier_fees: number;
  net: number;
  direction: SettlementDirection;
  settlement: SettlementRecord | null;
  company?: { id: number; name: string; code: string; logo_url: string | null; gcash: GcashAccount | null } | null;
  seller?: { id: number; shop_name: string; logo_url: string | null; gcash: GcashAccount | null };
}

export interface SettlementWeeks {
  weeks: { start: string; end: string; lines: SettlementLine[] }[];
  totals: { to_receive: number; to_pay: number };
}

export interface CommissionPaymentRecord {
  id: number;
  amount: number;
  reference: string;
  paid_at: string | null;
  confirmed_at: string | null;
}

export interface SellerCommissionMonth {
  period: string;
  label: string;
  in_progress: boolean;
  orders_count: number;
  amount: number;
  payment: CommissionPaymentRecord | null;
}

export interface CourierPayoutRow {
  id: number;
  name: string;
  avatar_url?: string | null;
  hub_name?: string | null;
  gcash: GcashAccount | null;
  unpaid: number;
  unpaid_count: number;
  last_paid_at: string | null;
}

export interface AdminCommissionReport {
  period: string;
  label: string;
  in_progress: boolean;
  rows: { seller_id: number; shop_name: string; logo_url: string | null; orders_count: number; amount: number; payment: CommissionPaymentRecord | null }[];
  totals: { due: number; paid: number; confirmed: number };
  platform_gcash: GcashAccount | null;
}

/** The GCash a rider, hub or courier company is paid on. */
export interface PayoutAccount {
  gcash_number: string | null;
  gcash_name: string | null;
}
