# Sorting Center (Logistics Hub) Application API Contract

## Overview

A logistics hub is run from a **buyer account**, like a seller shop. The signed-in buyer applies with
`POST /api/v1/auth/apply-hub`; there is no separate hub account, email or password. The account's name, contact
details and government ID are reused, so the request only carries the hub itself.

- Route: `POST /api/v1/auth/apply-hub` (`auth:sanctum`, `throttle:auth` + `throttle:upload`), `multipart/form-data`.
- The guest endpoints `POST /auth/register-sorting-center` and `POST /auth/logistics/register` are **removed** (404).
- The account keeps `users.role = "buyer"`. The `sorting_centers` row (status `PENDING`) is what makes it a hub.
- The admin review shows the government ID already on the account (`/admin/sorting-center-applications/{id}/id-image`).
- Signing in is never blocked by a `PENDING` or `REJECTED` application: the owner keeps shopping and sees the status on
  `/register/hub`. Hub routes (`approved_sorting_center`) stay closed until an admin approves. Only a `SUSPENDED` hub is
  refused at sign-in.

## Account rules (422 under the `account` key)

| Situation | Message |
|---|---|
| The account is not a buyer (admin, older role "rider") | Only a buyer account can apply to run a logistics hub. |
| No government ID on the account | Add a government ID to your account before applying. The hub application uses the ID on your account. |
| A hub that is `PENDING` | You already have a hub application waiting for review. |
| A hub that is `APPROVED` | Your account already runs a logistics hub. |
| A hub that is `SUSPENDED` | Your logistics hub is suspended. Please contact platform administration. |
| A courier profile that is not `DISAPPROVED` | A courier account cannot also run a logistics hub. |

A `REJECTED` application can be resubmitted: the same `sorting_centers` row is reopened (`PENDING`, new details, new
permit, `rejection_reason`, `reviewed_by` and `reviewed_at` cleared) and the old permit file is deleted.

## Request Fields

| Field | Rules |
|---|---|
| `hub_name` (alias `business_name`) | required, string, max 150 |
| `address_province` (alias `province`) | required, string, max 100 |
| `address_city` (aliases `city_municipality`, `city`) | required, string, max 100 |
| `address_barangay` (alias `barangay`) | required, string, max 100 |
| `address_street` (aliases `street_address`, `street`) | required, string, max 255 |
| `psgc_code`, `psgc_province_code`, `psgc_city_code`, `psgc_barangay_code` | optional, 9 or 10 digits |
| `dti_permit` | required file, jpg/jpeg/png/pdf, max 5 MB, stored on the private `ids` disk under `dti_permits/` |
| `coverage_barangays[]` | required array, at least 1, distinct PSGC barangay codes (9 or 10 digits) |

## Responses

### 201 Created

```json
{
  "message": "Hub application submitted. Please wait for administrator approval.",
  "data": {
    "user": { "id": 42, "role": "buyer", "email": "juan@example.com", "sorting_center": { "id": 7, "status": "PENDING", "...": "..." } },
    "sorting_center": {
      "id": 7,
      "hub_name": "Laguna Central Logistics Hub",
      "status": "PENDING",
      "address_province": "Laguna",
      "address_city": "Santa Cruz",
      "address_barangay": "Poblacion I",
      "address_street": "123 Logistics Highway",
      "coverage_barangays": ["043404001", "043404002"],
      "created_at": "2026-10-16T09:00:00+08:00"
    },
    "hub_status": "PENDING"
  }
}
```

`data.user` is the full `UserResource` of the signed-in account (with `seller_profile`, `sorting_center`, `rider`,
`addresses`), so the client can replace its stored user. No token is issued; the session is the existing one.

### 401 Unauthenticated

A guest request.

### 422 Unprocessable Content

Field errors as usual, plus the `account` key for the account rules above.
