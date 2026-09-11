# Loved-IT — Complete Master System Architecture & Functional Documentation

> **Document Version:** 1.0.0 (Production Master)  
> **Last Updated:** September 2026  
> **Platform Status:** Active / Feature-Complete  
> **Primary Purpose:** Comprehensive technical and functional blueprint of the entire Loved-IT e-commerce ecosystem for developers, system architects, and AI prompting context.

---

## Table of Contents

1. [Executive Summary & Platform Identity](#1-executive-summary--platform-identity)
2. [Technology Stack & System Topology](#2-technology-stack--system-topology)
3. [User Roles, RBAC & State Gating](#3-user-roles-rbac--state-gating)
4. [Database Schema & Eloquent Data Models](#4-database-schema--eloquent-data-models)
5. [Product Catalog & Two-Level Taxonomy System](#5-product-catalog--two-level-taxonomy-system)
6. [Merchant & Buyer Identity Verification (KYC Engine)](#6-merchant--buyer-identity-verification-kyc-engine)
7. [Order Lifecycle, Payment Audit & Multi-Vendor Fulfillment](#7-order-lifecycle-payment-audit--multi-vendor-fulfillment)
8. [Financial Ledger, Commission Take-Rate & Escrow Payout Engine](#8-financial-ledger-commission-take-rate--escrow-payout-engine)
9. [Dispute Arbitration & Return Mediation System](#9-dispute-arbitration--return-mediation-system)
10. [Real-Time WebSocket Engine (Laravel Reverb & Echo)](#10-real-time-websocket-engine-laravel-reverb--echo)
11. [Administrative Command Center (Admin Console)](#11-administrative-command-center-admin-console)
12. [Merchant Portal (Seller Studio)](#12-merchant-portal-seller-studio)
13. [Customer Storefront & Account Suite (Buyer Experience)](#13-customer-storefront--account-suite-buyer-experience)
14. [Security, Performance & Architectural Guardrails](#14-security-performance--architectural-guardrails)
15. [Complete REST API Route Reference](#15-complete-rest-api-route-reference)
16. [AI Prompting & Context Injection Cheat Sheet](#16-ai-prompting--context-injection-cheat-sheet)

---

## 1. Executive Summary & Platform Identity

**Loved-IT** (formerly Velure) is an executive-grade, multi-vendor e-commerce marketplace engineered specifically for the Philippine retail and digital economy. Unlike generic open marketplaces, Loved-IT operates under a **High-Trust, Curated Governance Model** designed to eliminate counterfeit goods, verify merchant authenticity, enforce regulatory compliance (e.g., Philippine FDA for health, cosmetics, and food products), and protect transaction liquidity through an automated escrow and audit engine.

### Core Pillars:
- **Strict Merchant Accreditation (KYC/KYB):** Every merchant undergoes formal administrative verification requiring government-issued IDs, a selfie holding the ID, DTI / SEC corporate registration, local Mayor's / Business Permits, and FDA License to Operate (LTO) where applicable.
- **Buyer Verification Gate:** Buyers undergo government ID and selfie checks to qualify for high-tier purchasing, return dispute arbitration, and platform trust scoring.
- **Two-Level Taxonomy with Regulatory Compliance:** Products are classified under a strict Parent → Leaf category hierarchy where leaf nodes govern FDA compliance requirements and custom commission take-rate overrides.
- **Multi-Vendor Order & Escrow Management:** Buyers can check out items from multiple independent stores in a single transaction. Funds are segregated per store and held in a 7-day post-delivery escrow period before release to the merchant's available balance.
- **Dual Payment Channels (GCash Slip Audit + Cash on Delivery):** Fully handles manual and semi-automated GCash receipt verification with image zoom lightbox auditing, alongside traditional COD fulfillment.
- **Native Real-Time WebSockets:** Powered by Laravel Reverb, enabling instant messaging, live chat cards (attaching orders and products), real-time order status notifications, and live dashboard pulse sync across Admin, Seller, and Buyer portals without polling.

---

## 2. Technology Stack & System Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSERS                               │
│  React 19 SPA (Vite, Tailwind CSS, Lucide Icons, Recharts, Laravel Echo)│
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │ HTTPS REST APIs                │ WSS (Port 8080)
                    │ (Bearer Token / Sanctum)       │ (WebSockets)
┌───────────────────▼────────────────────────────────┴───────────────────┐
│                          BACKEND SERVER                                │
│   Laravel 12/13 API Engine       Laravel Reverb WebSocket Server       │
│   (PHP 8.2+, Sanctum Auth,       (Native PHP Event-Driven Daemon,      │
│    Intervention Image v4)         Pusher Protocol Compatible)          │
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │                                │
┌───────────────────▼────────────────────────────────▼───────────────────┐
│                    PERSISTENCE & STORAGE LAYER                         │
│   MySQL 8.0 Database             Local Storage Symlink / S3 Bucket     │
│   (InnoDB, Foreign Keys, JSON)   (public/storage for media, IDs, slips)│
└────────────────────────────────────────────────────────────────────────┘
```

### Backend Components:
- **Framework:** Laravel 12 / 13 on PHP 8.2+
- **Authentication & API Guard:** Laravel Sanctum (Bearer Tokens & Cookie-based SPA sessions)
- **Real-Time WebSockets:** Laravel Reverb (`laravel/reverb` running on port `8080`)
- **Image Processing:** Intervention Image Laravel (`intervention/image-laravel` v4.1)
- **Database Engine:** MySQL 8.0+ (utf8mb4 encoding, strict foreign keys)

### Frontend Components:
- **Framework:** React 19 SPA bundled with Vite 8+
- **Language:** TypeScript 5.8+
- **Styling:** Tailwind CSS with modern custom design tokens (Velure Brand Red: `#A32D2D`, dark executive gradients, high-density data tables)
- **Icons & Visuals:** Lucide React icons
- **Data Visualization:** Recharts (Area charts, bar charts, custom zero-outline surfaces)
- **Routing:** React Router DOM v7
- **Real-Time Client:** Laravel Echo + `pusher-js`

---

## 3. User Roles, RBAC & State Gating

Velure implements a fine-grained Role-Based Access Control (RBAC) model managed through database enums, middleware, and frontend route protectors.

| Role | Database Value | Capabilities & Route Access |
|---|---|---|
| **Buyer** | `'buyer'` | Browses public catalog, manages cart & wishlist, places orders, tracks parcel delivery, uploads Gov ID for identity completion, chats with stores and support, files return/dispute claims, writes product reviews. |
| **Seller** | `'seller'` | Manages store profile (banner, logo, bio, policies), manages product listings (variants, stock, prices, FDA docs), audits GCash payment receipts, prints dispatch manifests, tracks store earnings and 7-day escrow, requests GCash payouts, inspects sales analytics. |
| **Admin** | `'admin'` | Superuser console. Reviews and approves/rejects buyer applications, seller accreditations, and product submissions; mediates disputes and issues refunds; audits incoming payments and disburses seller payouts; configures commission engine and policy SLAs; manages category taxonomy; reviews immutable forensic audit logs. |
| **Rider** | `'rider'` | Schema-reserved role for parcel assignment, pickup, transit updates, and proof-of-delivery uploads. |

### Access Control Middleware:
1. `auth:sanctum`: Enforces valid API token or authenticated session.
2. `role:admin`: Restricts access exclusively to administrative accounts (`Role::Admin`).
3. `approved_seller`: Validates that the authenticated user possesses an approved `seller_profile` record (`application_status === 'approved'`) before accessing `/api/v1/seller/*` endpoints.
4. `throttle:auth` & `throttle:upload`: Rate-limiting gates preventing brute-force authentication (5 req/min) and file flood attacks (10 uploads/min).

---

## 4. Database Schema & Eloquent Data Models

The Velure database consists of 20 core tables with strict relational integrity, indexed foreign keys, and cascading rules where appropriate.

```
                    ┌───────────────┐
                    │     users     │◄─────────────────┐
                    └───▲───────┬───┘                  │
                        │       │ 1:1                  │
                        │   ┌───▼─────────────┐        │
                        │   │ seller_profiles │        │
                        │   └───┬─────────────┘        │
                        │       │ 1:N                  │
                        │   ┌───▼─────────────┐        │
                        │   │    products     │        │
                        │   └───┬─────────────┘        │
                        │       │ 1:N                  │
      ┌─────────────┐   │   ┌───▼─────────────┐        │
      │ categories  ├───┼───► product_variants│        │
      └─────────────┘   │   └───┬─────────────┘        │
                        │       │ 1:N                  │
                        │   ┌───▼─────────────┐   1:1  │   ┌──────────────┐
                        └───►      orders     ├───┬────┴───►   payments   │
                            └───┬─────────────┘   │        └──────────────┘
                                │ 1:N             │ 1:1    ┌──────────────┐
                            ┌───▼─────────────┐   └────────►   disputes   │
                            │   order_items   │            └──────────────┘
                            └───┬─────────────┘
                                │ 1:1
                            ┌───▼─────────────┐
                            │     reviews     │
                            └─────────────────┘
```

### Core Model Specifications:

#### 1. `User` (`users`)
- **Attributes:** `id`, `first_name`, `last_name`, `email`, `phone`, `password`, `role` (enum: `admin`, `buyer`, `seller`, `rider`), `status` (enum: `active`, `suspended`), `avatar_url`, `date_of_birth`, `sex` (`male`, `female`, `other`), `government_id_type`, `government_id_number`, `government_id_image_url`, `government_id_image_back_url`, `is_verified` (boolean), `verified_at`, `created_at`, `updated_at`.
- **Relationships:** `hasOne(SellerProfile)`, `hasMany(Address)`, `hasMany(Order, 'buyer_id')`, `hasMany(Review, 'buyer_id')`, `hasOne(Wishlist)`, `hasMany(StoreFollow)`.

#### 2. `SellerProfile` (`seller_profiles`)
- **Attributes:** `id`, `user_id`, `shop_name`, `shop_slug` (unique), `shop_phone`, `shop_email`, `shop_category`, `shop_bio`, `logo_url`, `banner_url`, `shop_address_line1`, `shop_barangay`, `shop_city`, `shop_province`, `shop_postal_code`, `business_name`, `business_type`, `tax_identification_number`, `business_permit_number`, `business_permit_image_url`, `dti_sec_registration_number`, `dti_sec_image_url`, `fda_lto_number`, `fda_lto_image_url`, `selfie_with_id_url`, `application_status` (`none`, `pending`, `approved`, `rejected`), `rejection_reason`, `balance` (decimal), `available_balance` (decimal), `pending_balance` (decimal), `shipping_policy`, `refund_policy`.
- **Relationships:** `belongsTo(User)`, `hasMany(Product, 'seller_id')`, `hasMany(Order, 'seller_id')`, `hasMany(PayoutRequest, 'seller_id')`.

#### 3. `Category` (`categories`)
- **Attributes:** `id`, `parent_id` (nullable self-referencing FK), `slug` (unique string), `name`, `sort_order` (integer), `is_active` (boolean), `requires_fda` (boolean), `commission_rate` (nullable decimal 0-100 override), `created_at`, `updated_at`.
- **Relationships:** `belongsTo(Category, 'parent_id', 'id')` (parent), `hasMany(Category, 'parent_id', 'id')` (children), `hasMany(Product, 'category_id')`.

#### 4. `Product` (`products`)
- **Attributes:** `id`, `seller_id`, `category_id`, `name`, `slug`, `brand`, `short_description`, `description` (HTML text), `base_price`, `stock`, `is_active`, `status` (`draft`, `pending_review`, `active`, `rejected`, `archived`), `rejection_reason`, `archive_reason`, `archived_by`, `requires_fda` (boolean), `fda_cpr_number`, `fda_cpr_image_url`, `fda_lto_image_url`, `views_count`, `units_sold`, `created_at`, `updated_at`.
- **Relationships:** `belongsTo(SellerProfile, 'seller_id')`, `belongsTo(Category)`, `hasMany(ProductVariant)`, `hasMany(ProductImage)`, `hasMany(Review)`.

#### 5. `ProductVariant` (`product_variants`)
- **Attributes:** `id`, `product_id`, `sku`, `title`, `option1_name`, `option1_value`, `option2_name`, `option2_value`, `price_override` (nullable decimal), `stock` (integer).
- **Relationships:** `belongsTo(Product)`.

#### 6. `Order` (`orders`)
- **Attributes:** `id`, `order_number` (unique string e.g. `VEL-20260908-XXXX`), `buyer_id`, `seller_id`, `shipping_name`, `shipping_phone`, `shipping_address`, `shipping_barangay`, `shipping_city`, `shipping_province`, `shipping_postal_code`, `status` (`pending_payment`, `pending_verification`, `confirmed`, `to_ship`, `in_transit`, `delivered`, `cancelled`, `returned`), `subtotal`, `shipping_fee`, `total_amount`, `cancelled_at`, `cancellation_reason`, `delivered_at`, `escrow_cleared_at`, `notes`, `created_at`, `updated_at`.
- **Relationships:** `belongsTo(User, 'buyer_id')`, `belongsTo(SellerProfile, 'seller_id')`, `hasMany(OrderItem)`, `hasOne(Payment)`, `hasOne(Dispute)`.

#### 7. `OrderItem` (`order_items`)
- **Attributes:** `id`, `order_id`, `product_id`, `variant_id` (nullable), `product_name`, `variant_title`, `quantity`, `unit_price`, `subtotal`, `commission_rate` (percentage applied), `commission_amount` (platform take-rate cut), `seller_earnings` (net merchant credited amount), `created_at`.
- **Relationships:** `belongsTo(Order)`, `belongsTo(Product)`, `belongsTo(ProductVariant, 'variant_id')`, `hasOne(Review)`.

#### 8. `Payment` (`payments`)
- **Attributes:** `id`, `order_id`, `payment_method` (`gcash`, `cod`), `status` (`pending_verification`, `paid`, `verification_failed`, `refunded`), `amount`, `reference_number` (GCash transaction reference), `receipt_image_url` (GCash screenshot slip), `admin_notes`, `verified_by_user_id`, `verified_at`, `created_at`, `updated_at`.
- **Relationships:** `belongsTo(Order)`.

#### 9. `PayoutRequest` (`payout_requests`)
- **Attributes:** `id`, `seller_id`, `reference_code` (e.g. `PO-XXXX`), `amount` (decimal), `gcash_number`, `gcash_name`, `status` (`pending`, `processing`, `disbursed`, `rejected`), `admin_notes`, `disbursed_by_user_id`, `disbursed_at`, `created_at`, `updated_at`.
- **Relationships:** `belongsTo(SellerProfile, 'seller_id')`, `belongsTo(User, 'disbursed_by_user_id')`.

#### 10. `PlatformSetting` (`platform_settings`)
- **Attributes:** `id`, `key` (unique string), `value` (JSON text), `created_at`, `updated_at`.
- **Key Stores:**
  - `commission_rate`: Global baseline take-rate percentage (default `10`).
  - `category_overrides`: Key-value map of category slugs and their custom take-rates.
  - `return_policy_sla_days`: Max allowed days for return filing post-delivery (default `7`).
  - `minimum_payout_amount`: Min threshold for seller payout request (default `100.00`).

#### 11. `Dispute` (`disputes`)
- **Attributes:** `id`, `order_id`, `buyer_id`, `seller_id`, `reason`, `description`, `evidence_images` (JSON array of URLs), `status` (`open`, `in_progress`, `resolved_refund`, `resolved_rejected`), `resolution_note`, `resolved_by_admin_id`, `resolved_at`, `created_at`, `updated_at`.
- **Relationships:** `belongsTo(Order)`, `belongsTo(User, 'buyer_id')`, `belongsTo(SellerProfile, 'seller_id')`, `belongsTo(User, 'resolved_by_admin_id')`.

#### 12. `Review` (`reviews`)
- **Attributes:** `id`, `product_id`, `order_item_id`, `buyer_id`, `rating` (integer 1-5), `comment`, `review_images` (JSON array), `is_moderated` (boolean), `moderation_reason`, `created_at`.
- **Relationships:** `belongsTo(Product)`, `belongsTo(OrderItem)`, `belongsTo(User, 'buyer_id')`.

#### 13. `Conversation` (`conversations`) & `Message` (`messages`)
- **Conversation Attributes:** `id`, `type` (`buyer_seller`, `seller_admin`), `buyer_id`, `seller_id`, `admin_id`, `last_message_at`, `unread_buyer_count`, `unread_seller_count`, `unread_admin_count`, `status` (`active`, `closed`).
- **Message Attributes:** `id`, `conversation_id`, `sender_id`, `sender_type` (`buyer`, `seller`, `admin`), `body`, `attachments` (JSON), `attached_product_id`, `attached_order_id`, `read_at`, `created_at`.
- **Relationships:** `belongsTo(Conversation)`, `belongsTo(User, 'sender_id')`.

#### 14. `AdminActivityLog` (`admin_activity_logs`)
- **Attributes:** `id`, `admin_id`, `action` (e.g. `approve_seller`, `reject_buyer`, `takedown_product`, `commission_update`), `target_type`, `target_id`, `description`, `meta` (JSON payload of forensic snapshot), `ip_address`, `created_at`.
- **Relationships:** `belongsTo(User, 'admin_id')`.

---

## 5. Product Catalog & Two-Level Taxonomy System

Velure maintains a strict two-level category taxonomy that strictly prevents fragmented product classifications and enforces legal compliance across health and beauty merchandise.

```
Parent Category (Root Grouping)
   ├── Leaf Category A (requires_fda: false, commission: default)
   ├── Leaf Category B (requires_fda: true,  commission: 12%)  <── Products Assigned Here
   └── Leaf Category C (requires_fda: false, commission: 8%)   <── Products Assigned Here
```

### Taxonomy Rules:
1. **Pure Grouping Parents:** Parent categories cannot have products directly attached (`parent_id === null`).
2. **Product Assignment Exclusively on Leaves:** Only leaf sub-categories (`parent_id !== null`) are referenced by `products.category_id`.
3. **FDA Compliance Gating (`requires_fda = true`):**
   - When a leaf sub-category requires FDA clearance (e.g., Cosmetics, Skin Treatments, Dietary Supplements), sellers cannot submit a product for review without providing a valid FDA Certificate of Product Registration (CPR) number and uploading copies of both CPR and the merchant's FDA License to Operate (LTO).
   - In the storefront, products in these categories display an authenticated green **"FDA Regulated & Verified"** badge.
4. **Commission Overrides (`commission_rate`):**
   - Individual leaf categories can specify custom take-rate percentages (e.g., 5% for High-End Electronics, 15% for Luxury Cosmetics), which automatically supersede the global platform default.
5. **Deletion Blocking Guardrails:**
   - A parent category cannot be deleted while child sub-categories exist.
   - A leaf sub-category cannot be deleted while active product listings reference it.

---

## 6. Merchant & Buyer Identity Verification (KYC Engine)

To protect consumers and payment processors, Velure implements a strict verification workflow.

### Buyer Identity Verification:
- Unverified buyers can create accounts and browse, but must complete their profile before placing high-value orders or filing return claims.
- Requires Date of Birth, Sex, Government ID Type, ID number, and high-resolution photo uploads of the Front and Back of the document.
- Admin verifies the submitted document via the `AdminBuyerApplicationsPage` modal with image zoom inspection before granting verified buyer status.

### Merchant Accreditation (KYB Engine):
1. **Application Submission (`/register/seller`):**
   - Merchant provides business name, store slug, store contact numbers, and registered address.
   - Merchant uploads:
     - Government ID (Front and Back)
     - Selfie photo holding the Government ID
     - Mayor's / Municipal Business Permit
     - DTI Registration (Sole Proprietorship) or SEC Certificate (Corporation)
     - FDA License to Operate (LTO) if selling regulated products
2. **Administrative Inspection (`AdminSellerApplicationsPage`):**
   - Administrator examines documents through an interactive drawer modal with split inspection panes and image zoom.
   - 1-Click **"Approve Application"** triggers an automatic account upgrade to `role = 'seller'` with `application_status = 'approved'`.
   - **"Reject Application"** requires a documented rejection note, which notifies the applicant and invites re-submission.

---

## 7. Order Lifecycle, Payment Audit & Multi-Vendor Fulfillment

### Multi-Vendor Checkout Architecture:
Buyers can add items from multiple distinct seller shops into a unified cart. Upon clicking "Place Order":
1. The backend groups cart items by `seller_id`.
2. A distinct `Order` record is generated for each merchant store, sharing the same customer shipping details.
3. If GCash is selected, a single consolidated payment reference or individual payment slips are generated per order.

```
[Buyer Cart]
   ├── 2 items from Store A
   └── 1 item from Store B
         │
    [Checkout] ────► Order #1 (Store A) ────► Payment Record #1 (Pending Audit)
               ────► Order #2 (Store B) ────► Payment Record #2 (Pending Audit)
```

### Order Status State Machine:

```
                  ┌──────────────────────┐
                  │ pending_verification │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
   (Payment Approved)                (Payment Rejected)
            ▼                                 ▼
     ┌───────────┐                      ┌───────────┐
     │ confirmed │                      │ cancelled │
     └─────┬─────┘                      └───────────┘
           │
     (Packed / Label Printed)
           ▼
     ┌───────────┐
     │  to_ship  │
     └─────┬─────┘
           │
     (Handed to Carrier)
           ▼
     ┌───────────┐
     │in_transit │
     └─────┬─────┘
           │
     (Delivered to Customer)
           ▼
     ┌───────────┐
     │ delivered │ ──► [Starts 7-Day Escrow Clearance Window]
     └─────┬─────┘
           │
   (Buyer Files Claim Within 7 Days)
           ▼
     ┌───────────┐
     │ returned  │
     └───────────┘
```

### GCash Slip Verification Lightbox:
- Buyers submit orders with GCash reference numbers and proof-of-payment screenshots.
- Orders remain in `pending_verification` until the seller or platform admin verifies the transaction.
- The `SellerOrdersPage` and `AdminPaymentsPage` provide a modal with receipt zoom inspection, allowing immediate approval or rejection (with an explanatory rejection reason that cancels the order and notifies the buyer).

---

## 8. Financial Ledger, Commission Take-Rate & Escrow Payout Engine

### Commission Take-Rate Computation:
For every item sold, the platform automatically calculates its take-rate commission upon order creation:

$$\text{Item Commission} = \text{Subtotal} \times \left(\frac{\text{Effective Commission Rate}}{100}\right)$$

$$\text{Merchant Net Earnings} = \text{Subtotal} - \text{Item Commission}$$

Where $\text{Effective Commission Rate}$ resolves in hierarchical priority:
1. Leaf Category Override (`categories.commission_rate`) if defined.
2. Platform Category Override in `platform_settings.category_overrides`.
3. Global Baseline Platform Take-Rate in `platform_settings.commission_rate` (default `10%`).

### Escrow Protection Engine:
- **Pending Clearance:** When an order transitions to `delivered`, the merchant's net earnings are added to `pending_balance`.
- **7-Day Holding SLA:** Funds remain locked in `pending_balance` for 7 calendar days to ensure funds are available if the customer files a return claim.
- **Cleared Balance:** After 7 days without active dispute, a scheduled task releases the funds into `available_balance`, making them withdrawable.

### GCash Payout Disbursement Pipeline:
1. **Withdrawal Request:** Seller submits a payout request via `SellerEarningsPage` for any amount between ₱100.00 and their `available_balance`.
2. **Immediate Lock:** The requested amount is deducted immediately from `available_balance` into a pending `PayoutRequest` ledger record (`status = 'pending'`).
3. **Administrative Audit:** Platform admin reviews the payout queue in `AdminPaymentsPage`.
4. **Disbursement Execution:**
   - **Complete:** Admin dispatches funds via GCash, logs the external disbursement reference, and marks status as `disbursed`.
   - **Reject:** If recipient information is invalid, admin rejects the payout with notes; the full amount is refunded back to the seller's `available_balance`.

---

## 9. Dispute Arbitration & Return Mediation System

1. **Buyer Claim Filing (`SettingsReturns`):**
   - Allowed strictly on orders marked `delivered` within the return policy SLA window (default 7 days).
   - Buyer specifies the reason (e.g., Damaged item, Counterfeit concern, Wrong product), provides a written statement, and uploads photo evidence.
   - Order transitions to `disputed`.
2. **Seller Counter-Response (`SellerOrdersPage`):**
   - Seller is notified via real-time WebSocket and can respond with evidence or agree to refund.
3. **Administrative Arbitration (`AdminDisputesPage`):**
   - Administrator examines buyer claims, seller responses, tracking numbers, and photos.
   - **Resolve with Refund:** Platform approves return; funds in escrow are released back to the buyer, and the merchant balance is debited.
   - **Reject Claim:** Platform rules in favor of the merchant; funds in escrow are released into the merchant's `available_balance`.

---

## 10. Real-Time WebSocket Engine (Laravel Reverb & Echo)

Velure eliminates polling loops through an integrated event-driven WebSocket infrastructure.

```
[Client Event / API Action] ──► [Laravel Event Broadcast] ──► [Laravel Reverb Daemon (:8080)]
                                                                     │
                                 ┌───────────────────────────────────┴───────────────────────────────────┐
                                 ▼                                                                       ▼
                     [Echo Private Channel]                                                  [Echo Private Channel]
                 private-conversation.{id}                                                   private-user.{id}
                 (Chat messages, read receipts,                                              (Order updates, unread badges,
                  product & order cards)                                                      dashboard pulse metrics)
```

### WebSocket Channel Manifest:
- `private-conversation.{id}`: Carries real-time chat messages between buyers, sellers, and admins. Supports embedded interactive cards for products and orders.
- `private-user.{id}`: Delivers user-targeted system alerts, payment verification alerts, dispatch notifications, and updates unread badge counters dynamically.
- `private-admin-dashboard`: Emits platform velocity events (gross sales updates, pending application queue counters) to keep the admin command center synchronized in real time.

---

## 11. Administrative Command Center (Admin Console)

All administrative pages feature an executive gradient hero band (`linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)`), high-density data tables, and modal drawers rendered via React portals directly to `document.body`.

### Key Administrative Views:
- **`AdminDashboardPage` (`/admin`):** Executive command center displaying real-time Gross Marketplace Value (GMV), net platform commission, total orders, priority moderation hub (seller apps, buyer IDs, product reviews, disputes), 14-day interactive area chart (with zero-outline surface styling), payment channel breakdown (GCash vs COD), and live activity stream.
- **`AdminProductsPage` (`/admin/products`):** Full product catalog review pipeline. Filter by status (`pending_review`, `active`, `rejected`, `archived`), inspect high-res photos, examine FDA CPR & LTO permits, approve listings with one click, or reject with a documented reason.
- **`AdminCategoriesPage` (`/admin/categories`):** Two-level taxonomy editor. Tree structure displaying parent groups and leaf sub-categories, FDA compliance toggles, custom commission override inputs, create/edit modals, and deletion guardrail alerts.
- **`AdminPaymentsPage` (`/admin/payments`):** Dual-tab financial console. Tab 1 audits customer GCash slips with zoom lightbox inspection; Tab 2 manages merchant GCash payout disbursement requests.
- **`AdminDisputesPage` (`/admin/disputes`):** Arbitration center for customer return claims. Displays order snapshots, buyer claims, photo evidence, and 1-click refund authorization or claim dismissal.
- **`AdminReportsPage` (`/admin/reports`):** Comprehensive revenue reports. Interval toggles (`7d`, `30d`, `90d`, `12m`), GMV vs Net Commission area charts, payment channel split bars, and top-performing merchant leaderboards.
- **`AdminPlatformSettingsPage` (`/admin/settings`):** Global policy engine. Dynamic baseline commission input, category-specific override table, return SLA window configuration, and minimum payout limits.
- **`AdminActivityLogPage` (`/admin/activity-log`):** Immutable forensic audit trail. Filter by operation, select rows-per-page (`15`, `30`, `50`, `100`), dual top and bottom pagination controls, and an interactive **"Inspect JSON"** modal to view full request metadata payloads.

---

## 12. Merchant Portal (Seller Studio)

The Seller Studio features a clean, high-contrast white/pearl-gray command bar (`bg-white border border-gray-200 text-gray-900 shadow-xs`) with a green `Live Synced` status pulse.

### Key Merchant Views:
- **`SellerDashboard` (`/seller`):** Merchant command center. Four KPI cards (Today's Sales, Orders to Pack, Active Listings, Low Stock Alerts), 14-day gross sales trend chart, quick Merchant Operations hub (Verify GCash, Ready to Ship Queue, New Listing, Payout Request), Needs Attention Queue, and Top-Performing Products ranking.
- **`SellerProductsPage` & `SellerAddProductPage` (`/seller/products`):** Multi-step listing management. Rich HTML product descriptions, multi-image upload with thumbnail reordering, variant builder (SKUs, options, stock quantities, price overrides), category assignment, and FDA permit uploads.
- **`SellerOrdersPage` (`/seller/orders`):** Fulfillment console. Tabs for `All`, `Pending GCash`, `To Ship`, `In Transit`, `Delivered`, and `Cancelled`. Features copyable order numbers, customer avatars, GCash receipt zoom lightbox, and order dispatch status buttons.
- **`SellerEarningsPage` (`/seller/earnings`):** Financial wallet. Displays `Available for Payout`, `Pending 7-Day Escrow`, `Total Disbursed`, and `Lifetime Net Earnings`. Segmented tabs toggle between Payout Request History and Order Take-Rate Fee Breakdowns. Includes the instant GCash payout request modal.
- **`SellerReportsPage` (`/seller/reports`):** Sales analytics. Area chart comparing gross sales volume against net credited earnings, payment method split progress bars, and top-selling merchandise rankings.
- **`SellerShopProfilePage` (`/seller/shop-profile`):** Public storefront customizer. Upload store logo, wide banner, store bio, phone, email, physical pickup address, and custom shipping & refund policies.

---

## 13. Customer Storefront & Account Suite (Buyer Experience)

### Public Marketplace:
- **`HomePage` (`/`):** Hero banners, curated collection highlights, featured store showcases, trending items, and category shortcuts.
- **`CatalogPage` (`/search`, `/category/:parentId`):** Multi-faceted search engine. Real-time keyword filtering, parent and leaf category navigation, price range sliders, minimum rating filters, and in-stock toggles.
- **`ProductDetailPage` (`/products/:id`):** Full e-commerce product view. High-res image gallery with thumbnail switcher, dynamic variant option selector (auto-updates price and inventory availability), FDA verification seal, merchant trust badge, rich description HTML renderer, verified customer reviews with photos, and related products carousel.
- **`ShopProfilePage` (`/shop/:slug`, `/store/:id`):** Dedicated merchant store page displaying the seller's custom banner, logo, bio, total followers, store rating, store policies, and complete catalog. Includes store follow/unfollow toggle.

### Customer Account Suite (`/settings`):
- **`SettingsAccount`:** Personal details, profile photo upload, and government ID KYC verification submission.
- **`SettingsAddresses`:** Address book manager with Barangay, City, Province, Postal Code, and default delivery address selection.
- **`SettingsOrders`:** Real-time parcel tracking, status pills, item breakdowns, and re-order shortcuts.
- **`SettingsReturns`:** Return request filing with photo evidence upload and resolution progress tracking.
- **`SettingsReviews`:** Post-delivery 5-star ratings, comments, and photo uploads.
- **`SettingsWishlist`:** Saved products and followed stores.
- **`BuyerFloatingChat`:** Docked, persistent chat drawer mounted globally across all buyer pages, enabling direct real-time communication with stores.

---

## 14. Security, Performance & Architectural Guardrails

1. **Strict Input Sanitization & HTML Purifying:** All product rich-text descriptions are sanitized to prevent Cross-Site Scripting (XSS).
2. **Database Transaction Wrapping:** Checkouts, payment approvals, return refund distributions, and payout balance deductions run inside ACID database transactions (`DB::transaction()`) to prevent race conditions.
3. **Symlinked & Protected Storage:** Public product images and store banners are streamed via optimized public storage symlinks (`php artisan storage:link`). Sensitive documents (Government IDs, selfies, FDA permits) are served through authenticated, role-gated controller endpoints to prevent unauthorized access.
4. **Client-Side Portal Rendering:** All administrative and merchant confirmation modals are rendered via React `createPortal(..., document.body)` with `fixed inset-0 z-[100]` to escape container overflow clipping and CSS transforms.
5. **Chart Focus Ring Suppression:** All Recharts surfaces suppress outline focus rings via CSS utilities (`[&_.recharts-surface]:outline-none focus:outline-none`) for clean UI aesthetics.

---

## 15. Complete REST API Route Reference

### Public Endpoints (No Authentication Required):
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/products` | Paginated catalog search with category, price, and keyword filters |
| `GET` | `/api/v1/products/{product}` | Detailed product information with variants, images, and seller summary |
| `GET` | `/api/v1/products/{product}/reviews` | Paginated product reviews and ratings |
| `GET` | `/api/v1/products/{product}/related` | Related products in the same category |
| `GET` | `/api/v1/shops/{shop}` | Public seller shop profile, banner, logo, and metrics |
| `GET` | `/api/v1/shops/{shop}/reviews` | Aggregated customer reviews for a specific store |
| `GET` | `/api/v1/platform/policies` | Public return, dispute, and regulatory platform policies |
| `POST` | `/api/v1/auth/register` | Buyer registration |
| `POST` | `/api/v1/auth/login` | User authentication and Sanctum token issuance |
| `POST` | `/api/v1/auth/forgot-password` | Password reset link dispatch |
| `POST` | `/api/v1/auth/reset-password` | Password reset confirmation |
| `POST` | `/api/v1/auth/google` | Google OAuth single sign-on authentication |

### Authenticated Core Endpoints (`auth:sanctum`):
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/logout` | Revokes active Sanctum token |
| `GET` | `/api/v1/auth/me` | Returns current user profile, role, and seller profile status |
| `PATCH`| `/api/v1/auth/profile` | Updates personal profile information |
| `POST` | `/api/v1/auth/avatar` | Uploads user profile avatar |
| `POST` | `/api/v1/auth/complete-profile` | Submits buyer government ID verification documents |
| `POST` | `/api/v1/auth/apply-seller` | Submits seller accreditation documents and business permit |
| `GET` | `/api/v1/addresses` | Lists user shipping addresses |
| `POST` | `/api/v1/addresses` | Creates a new shipping address |
| `PATCH`| `/api/v1/addresses/{address}/default` | Sets default shipping address |
| `POST` | `/api/v1/checkout/place-order` | Places multi-vendor orders and uploads GCash slip |
| `GET` | `/api/v1/buyer/orders` | Lists customer orders with fulfillment status |
| `GET` | `/api/v1/buyer/orders/{order}` | Detailed order view with itemized take-rate breakdown |
| `POST` | `/api/v1/buyer/orders/{order}/request-return`| Files a return or dispute claim |
| `GET` | `/api/v1/conversations` | Lists conversations with unread counts |
| `POST` | `/api/v1/conversations/start` | Initiates a chat conversation |
| `POST` | `/api/v1/conversations/{id}/messages` | Sends a message with optional product/order attachment |

### Merchant Endpoints (`auth:sanctum` + `approved_seller`):
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/seller/dashboard/stats` | Performance KPIs (Today's sales, orders to pack, active listings) |
| `GET` | `/api/v1/seller/dashboard/chart` | Daily sales area chart points (7d or 14d) |
| `GET` | `/api/v1/seller/dashboard/attention` | Needs attention queue items (low stock, unverified orders) |
| `GET` | `/api/v1/seller/dashboard/top-products`| Top-selling merchandise by gross volume |
| `GET` | `/api/v1/seller/products` | Seller's complete catalog inventory |
| `POST` | `/api/v1/seller/products` | Creates a new product with variants and images |
| `POST` | `/api/v1/seller/products/{product}` | Updates product information, variants, or images |
| `PATCH`| `/api/v1/seller/products/{product}/stock` | Quick-updates variant inventory stock level |
| `PATCH`| `/api/v1/seller/products/{product}/price` | Quick-updates base and variant prices |
| `GET` | `/api/v1/seller/orders` | Lists store orders filtered by fulfillment status |
| `POST` | `/api/v1/seller/orders/{order}/confirm-payment` | Confirms and approves customer GCash payment |
| `POST` | `/api/v1/seller/orders/{order}/reject-payment` | Rejects invalid GCash payment with notes |
| `PATCH`| `/api/v1/seller/orders/{order}/status` | Advances order to `to_ship`, `in_transit`, or `delivered` |
| `GET` | `/api/v1/seller/earnings` | Balance summary (available, pending 7-day escrow, total paid) |
| `GET` | `/api/v1/seller/earnings/orders` | Itemized take-rate and commission fee breakdown per order |
| `GET` | `/api/v1/seller/payouts` | History of GCash payout withdrawal requests |
| `POST` | `/api/v1/seller/payouts/request` | Submits new GCash payout withdrawal request |
| `GET` | `/api/v1/seller/reports/summary` | Financial reporting summary over selected timeframe |
| `GET` | `/api/v1/seller/reports/revenue-chart` | Dual-area gross volume vs net earnings chart data |
| `GET` | `/api/v1/seller/shop-profile` | Seller store profile, banner, logo, and policies |
| `POST` | `/api/v1/seller/shop-profile` | Updates store profile, logo, banner, and policies |

### Administrative Endpoints (`auth:sanctum` + `role:admin`):
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/stats` | Executive platform metrics (GMV, net fees, order volume) |
| `GET` | `/api/v1/admin/dashboard-feed` | Live activity feed of actions across the platform |
| `GET` | `/api/v1/admin/buyer-applications` | Buyer government ID verification applications |
| `POST` | `/api/v1/admin/buyer-applications/{user}/approve` | Approves buyer verification status |
| `POST` | `/api/v1/admin/buyer-applications/{user}/reject` | Rejects buyer verification application |
| `GET` | `/api/v1/admin/seller-applications` | Merchant accreditation applications |
| `POST` | `/api/v1/admin/seller-applications/{seller}/approve` | Approves store and grants merchant status |
| `POST` | `/api/v1/admin/seller-applications/{seller}/reject` | Rejects merchant application with reason |
| `GET` | `/api/v1/admin/categories` | Complete taxonomy hierarchy (parents and leaf children) |
| `POST` | `/api/v1/admin/categories` | Creates new parent category or leaf sub-category |
| `PUT` | `/api/v1/admin/categories/{category}` | Updates category name, slug, FDA flag, or commission rate |
| `DELETE`| `/api/v1/admin/categories/{category}` | Safely deletes category with dependency checks |
| `GET` | `/api/v1/admin/products` | Catalog listings submitted for administrative review |
| `POST` | `/api/v1/admin/products/{product}/approve` | Approves product for live marketplace listing |
| `POST` | `/api/v1/admin/products/{product}/reject` | Rejects product with compliance feedback |
| `POST` | `/api/v1/admin/products/{product}/archive` | Administratively archives/delists product listing |
| `GET` | `/api/v1/admin/payments` | Platform payment ledger (GCash slip audit list) |
| `PATCH`| `/api/v1/admin/payments/{payment}/mark-paid` | Administratively verifies GCash payment |
| `GET` | `/api/v1/admin/payouts` | Seller GCash payout requests queue |
| `POST` | `/api/v1/admin/payouts/{payout}/complete` | Marks payout request as disbursed with reference code |
| `POST` | `/api/v1/admin/payouts/{payout}/reject` | Rejects payout request and refunds seller balance |
| `GET` | `/api/v1/admin/disputes` | Customer return dispute mediation cases |
| `PATCH`| `/api/v1/admin/disputes/{dispute}/resolve` | Resolves dispute (Authorizes refund or dismisses claim) |
| `GET` | `/api/v1/admin/settings/commission` | Commission take-rate configuration and category overrides |
| `POST` | `/api/v1/admin/settings/commission` | Updates baseline commission and category overrides |
| `GET` | `/api/v1/admin/settings/return-policy` | Returns and dispute SLA configuration |
| `POST` | `/api/v1/admin/settings/return-policy` | Updates return SLA window days |
| `GET` | `/api/v1/admin/activity-log` | Forensic system audit log with dynamic pagination |

---

## 16. AI Prompting & Context Injection Cheat Sheet

When providing context to an AI assistant for future Loved-IT development, copy and paste the snippet below into your prompt:

```markdown
=== LOVED-IT SYSTEM CONTEXT ===
Loved-IT (formerly Velure) is a high-trust multi-vendor e-commerce platform built with Laravel 12/13, MySQL 8, Laravel Reverb (WebSockets on :8080), React 19, TypeScript, and Tailwind CSS.

KEY ARCHITECTURAL RULES:
1. TAXONOMY: Strict 2-level hierarchy (Parent -> Leaf). Only Leaf categories hold products. Leaf categories control `requires_fda` (boolean) and optional `commission_rate` (percentage override).
2. MULTI-VENDOR CART & CHECKOUT: Cart checkout splits orders by seller_id. Each seller fulfills their own Order record.
3. FINANCIALS & ESCROW:
   - Platform take-rate commission is computed per order item upon checkout.
   - Merchant net earnings are held in `pending_balance` (7-day post-delivery escrow window).
   - Once cleared, funds transfer to `available_balance`.
   - Sellers request GCash payouts from `available_balance`; Admins approve/disburse via AdminPaymentsPage.
4. ORDER LIFECYCLE:
   `pending_verification` (GCash slip uploaded) -> `confirmed` / `to_ship` (Seller/Admin verifies receipt) -> `in_transit` -> `delivered` (triggers 7-day escrow clearance) -> `returned` / `cancelled`.
5. REAL-TIME: Laravel Reverb WebSocket daemon runs natively on port 8080. Laravel Echo listens to `private-conversation.{id}` and `private-user.{id}`. No polling loops.
6. UI DESIGN RULES:
   - Admin Pages: Executive dark gradient hero band `linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)`, 4 compact metric KPI cards, high-density tables.
   - Seller Pages: Modern white/pearl-gray executive command header `bg-white border border-gray-200 text-gray-900 shadow-xs`, green Live Synced status pulse.
   - Modals: Always mount via React `createPortal(..., document.body)` with `fixed inset-0 z-[100]` to avoid CSS transform/overflow clipping.
   - Charts: Always remove focus outlines using `[&_.recharts-surface]:outline-none focus:outline-none`.
=============================
```

---
*End of Master System Documentation.*

