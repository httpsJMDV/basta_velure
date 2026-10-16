# Rider / Courier Application API Contract

## Overview

A courier delivers from a **buyer account**, like a seller shop or a logistics hub. The signed-in buyer applies with
`POST /api/v1/auth/apply-rider`; there is no separate rider account, email or password. The account's name, contact
details and birthday are reused, so the request only carries the hub, the vehicle and the driving documents.

- **Endpoints**:
  - `GET /api/v1/logistics/hubs`: public directory of approved sorting centers for hub selection.
  - `POST /api/v1/auth/apply-rider`: the signed-in buyer's courier application (`auth:sanctum`, `throttle:auth` +
    `throttle:upload`, `multipart/form-data`).
- The guest endpoint `POST /auth/register-rider` is **removed** (404).
- The account keeps `users.role = "buyer"`. The `riders` row (status `PENDING`) is what makes it a courier;
  `approved_rider` checks that row (older accounts with `role = "rider"` keep working), and the admin Riders list and
  the rider count include every user with a riders row.
- **Who approves a rider**: the **logistics hub the rider chose** (`sorting_center_id`), from the hub's Riders page
  (`docs/api/logistics-hub-riders.md`). The admin only manages the account afterwards (`docs/api/admin-riders.md`).
- Signing in is never blocked by a `PENDING` or `DISAPPROVED` application: the applicant keeps shopping and sees the
  status (and the hub's `rejection_reason`) on `/register/rider`. The rider routes stay closed until the hub approves.

---

## 1. Public Approved Hubs Directory

### Route

`GET /api/v1/logistics/hubs`

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `search` | `string` | No | Case-insensitive search query matching hub name, city, or province. |
| `limit` | `integer` | No | Maximum number of hubs to return (default: `100`, max: `100`). |

### Response (200 OK)

A sanitized list of hubs with `status = 'APPROVED'`. Owner info, permit paths and coverage lists are omitted.

```json
{
  "data": [
    { "id": 1, "hub_name": "Manila Central Sorting Hub", "address_city": "City of Manila", "address_province": "Metro Manila" }
  ]
}
```

---

## 2. Courier Application

### Account rules (422 under the `account` key)

| Situation | Message |
|---|---|
| The account is not a buyer | Only a buyer account can apply to become a courier. |
| No birthday on the account | Add your birthday to your account before applying. |
| Younger than 18 | Courier applicants must be at least 18 years old. |
| A rider profile that is `PENDING` | You already have a courier application waiting for the hub. |
| A rider profile that is `ACTIVE` | Your account is already an approved courier. |
| A hub that is not `REJECTED` | A logistics hub account cannot also be a courier. |

A `DISAPPROVED` application can be resubmitted: the same `riders` row is reopened (`PENDING`, the new hub, vehicle and
documents, `rejection_reason`, `reviewed_by` and `reviewed_at` cleared) and the old documents are deleted.

### Request Fields

| Field | Rules |
|---|---|
| `sorting_center_id` (alias `hub_id`) | required, an existing hub with status `APPROVED` |
| `vehicle_type` | required, `Motorcycle`, `Tricycle`, `Car` or `Van` (any case) |
| `plate_number` | required, max 20, letters, digits, spaces and dashes (stored uppercase) |
| `or_cr_image` | required file, jpg/jpeg/png/pdf, max 5 MB, private `ids` disk under `rider_or_cr/` |
| `drivers_license_image` | required file, jpg/jpeg/png/pdf, max 5 MB, private `ids` disk under `rider_licenses/` |

### 201 Created

```json
{
  "message": "Courier application submitted. Your application is pending hub approval.",
  "data": {
    "user": { "id": 42, "role": "buyer", "rider": { "id": 9, "status": "PENDING", "hub_name": "Laguna Hub", "rejection_reason": null } },
    "rider": {
      "id": 9,
      "status": "PENDING",
      "vehicle_type": "Motorcycle",
      "plate_number": "ND 1234",
      "sorting_center_id": 1,
      "hub_name": "Laguna Hub",
      "submitted_at": "2026-10-16T09:00:00+08:00"
    }
  }
}
```

`data.user` is the full `UserResource` of the signed-in account, so the client can replace its stored user. No token
is issued; the session is the existing one.

### 401 / 422

401 for a guest. 422 for field errors, plus the `account` key for the account rules above.
