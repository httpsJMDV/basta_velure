# Address Standardization Specification (Bridge C)

## Overview & Architecture

Couriers and sorting hubs match parcels to operational coverage areas using official Philippine Standard Geographic Code (PSGC) codes rather than free-text names, because barangay names frequently repeat across different municipalities and provinces in the Philippines.

PSGC codes are stored alongside existing human-readable display strings across sellers, buyers, orders, and parcels:
- **Codes are authoritative for operational routing and assignment**: Rider pickup matching (Task 2.4) and hub sorting (Task 1.7) compare parcel barangay codes against coverage areas by **CODE ONLY**, never by text names.
- **Names are retained as snapshots for human display**: Waybills, shipping labels, customer-facing interfaces, and receipts display the text snapshot.

> [!IMPORTANT]
> **Format Validation Only**
> PSGC codes are validated for format (`/^\d{9,10}$/`) on ingestion. The backend **cannot** and does **not** verify whether a given code matches its accompanying text name (no giant server-side database is maintained). All operational matching and routing logic relies solely on the PSGC code itself.

---

## Data Schema & Storage

Every PSGC code column is defined as `VARCHAR(20)` and stored/compared strictly as a **string** to ensure leading zeros (e.g. `0403428001`) are never lost or converted to integers.

| Table | Added Columns | Type | Purpose |
|---|---|---|---|
| `seller_profiles` | `address_province_code`<br>`address_city_code`<br>`address_barangay_code` (indexed) | `VARCHAR(20)` nullable | Seller pickup location PSGC codes |
| `addresses` | `province_code`<br>`city_code`<br>`barangay_code` (indexed) | `VARCHAR(20)` nullable | Buyer saved delivery address PSGC codes |
| `orders` | `shipping_province_code`<br>`shipping_city_code`<br>`shipping_barangay_code` (indexed) | `VARCHAR(20)` nullable | Delivery address snapshot captured at checkout |
| `parcels` | `pickup_barangay_code` (indexed)<br>`destination_barangay_code` (indexed) | `VARCHAR(20)` nullable | Parcel routing codes for rider and hub logistics |

---

## Validation & Business Rules

1. **Required on Input**:
   - New seller registrations (`POST /api/v1/auth/seller/register`) require all 3 codes: `address_province_code`, `address_city_code`, `address_barangay_code`.
   - Seller shop address updates (`POST /api/v1/seller/shop-profile`) require all 3 codes if updating address information.
   - Buyer saved addresses (`POST /api/v1/addresses` and `PUT /api/v1/addresses/{id}`) require all 3 codes: `province_code`, `city_code`, `barangay_code`.
   - Checkout order placement (`POST /api/v1/checkout/place-order`) requires `shipping_province_code`, `shipping_city_code`, and `shipping_barangay_code`.

2. **Legacy Data & `address_needs_update`**:
   - Existing database records without PSGC codes remain nullable (`null`).
   - `SellerProfile` and `Address` expose a computed boolean attribute `address_needs_update`:
     ```php
     address_needs_update = empty(barangay_code);
     ```
   - When `address_needs_update` is `true`, frontends display an action banner or prompt requesting the user to re-select their address using the PSGC cascading selector.

3. **Logistics Transition Guards (`OrderStateMachine`)**:
   - When transitioning an order to `READY_FOR_PICKUP`:
     - If `$sellerProfile->address_barangay_code` is missing: aborts `422` with message:
       `"Cannot mark order ready for pickup: Re-select your shop address so a barangay can be matched to a delivery area."`
     - If `$order->shipping_barangay_code` is missing: aborts `422` with message:
       `"Cannot mark order ready for pickup: Delivery address is missing a barangay code. Customer must re-select their address."`
   - On successful parcel creation, both `pickup_barangay_code` and `destination_barangay_code` are persisted onto the `Parcel` record.
