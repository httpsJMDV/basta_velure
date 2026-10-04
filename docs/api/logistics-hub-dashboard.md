# Logistics / Sorting Center Hub Dashboard Metrics API Contract

## Overview
This document specifies the backend API contract for the **Hub Command Dashboard** (`/hub/dashboard`) live metrics endpoint, consumed by approved logistics and sorting center hubs.

- **Base Path**: `/api/v1/hub/dashboard/metrics`
- **Authentication**: `auth:sanctum`
- **Authorization**: `approved_sorting_center` (Only users owning an `APPROVED` sorting center hub can access this endpoint)
- **Headers Required**:
  - `Authorization: Bearer <hub_token>`
  - `Accept: application/json`

---

## Endpoints

### 1. Live Metrics
Retrieves real-time operational metrics for the authenticated hub.

- **Method**: `GET`
- **Route**: `/api/v1/hub/dashboard/metrics`
- **Query Parameters**: None

### Metric Definitions
1. **`inbound_today`** (`integer`):
   - Number of parcels where `scanned_in_at` falls within the current calendar day in the Philippine timezone (`Asia/Manila`, UTC+8: `00:00:00` to `23:59:59.999999`).
   - Converted to UTC when querying against the database timestamps.
   - Strictly scoped to the authenticated hub (`sorting_center_id`).

2. **`in_sorting`** (`integer`):
   - Number of parcels currently in `AT_SORTING_CENTER` status (parcels that have arrived at the sorting center and are awaiting sorting into destination routes).
   - Strictly scoped to the authenticated hub (`sorting_center_id`).

3. **`active_riders`** (`integer`):
   - Number of delivery couriers with `ACTIVE` status who have an active area assignment (`is_active = true`) under the authenticated hub.
   - Strictly scoped to the authenticated hub.

4. **`hub`** (`object`):
   - Metadata about the authenticated hub, including `id`, `hub_name`, `status`, structured address (`address_province`, `address_city`, `address_barangay`, `address_street`), and `coverage_barangays_count`.

---

## Responses

### Success Response (`200 OK`)
```json
{
  "data": {
    "inbound_today": 14,
    "in_sorting": 8,
    "active_riders": 0,
    "hub": {
      "id": 3,
      "hub_name": "Valenzuela Central Logistics Hub",
      "status": "APPROVED",
      "address_province": "Metro Manila",
      "address_city": "Valenzuela City",
      "address_barangay": "Karuhatan",
      "address_street": "123 Industrial Highway",
      "coverage_barangays_count": 18
    }
  }
}
```

---

### Error Responses

#### 1. Unauthenticated (`401 Unauthorized`)
Returned when the request lacks a valid Bearer token.
```json
{
  "message": "Unauthenticated."
}
```

#### 2. Forbidden — Account Not Approved (`403 Forbidden`)
Returned when the user has no sorting center, or their sorting center status is `PENDING`, `REJECTED`, or `SUSPENDED`.
```json
{
  "message": "Sorting center account not approved."
}
```

#### 3. Login Gating for Suspended Hubs (`403 Forbidden`)
When an account with a `SUSPENDED` hub attempts to authenticate via `/api/v1/auth/login`:
```json
{
  "message": "Your sorting center hub account has been suspended. Please contact platform administration."
}
```
