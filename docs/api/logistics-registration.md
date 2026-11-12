# Sorting Center (Logistics Hub) Application API Contract

## Overview

**Since Nov 13, 2026 a hub has an account of its own**, like riders and courier companies. A hub, courier, rider or
truck driver account does deliveries only and **never shops** (`User::isWorkAccount`, `work_account` on the user
payload, 403 `work_account` from the buying endpoints, see `docs/api/commerce.md`). Only a seller switches between
selling and buying.

- **Visitor (the website's form):** `POST /api/v1/auth/register-hub` (guest, `throttle:register` + `throttle:upload`),
  `multipart/form-data`: the account fields of `POST /auth/register` (`first_name`, `last_name`, `email`, `phone`,
  `date_of_birth`, `password`, `password_confirmation`, `accept_terms`), the operator's ID (`government_id_type`,
  `government_id_image`, and `government_id_image_back` for an ID with a back, as on Complete profile) and the hub
  fields below. It answers `201 {message, verification_required: true, email}` and emails a 6-digit code; the account
  is `unverified` and **the courier does not see the application until the code is entered** (`/auth/verify-email`,
  which then sends the "hub application received" emails and answers with the token and the user).
- **Signed in:** `POST /api/v1/auth/apply-hub` (`auth:sanctum`) still works for an account that is not a seller and does
  no other deliveries, reusing its details and ID. The website only uses it to re-apply after a refusal.
- Route: `POST /api/v1/auth/apply-hub` (`auth:sanctum`, `throttle:auth` + `throttle:upload`), `multipart/form-data`.
- The guest endpoints `POST /auth/register-sorting-center` and `POST /auth/logistics/register` are **removed** (404).
- The account keeps `users.role = "buyer"`. The `sorting_centers` row (status `PENDING`) is what makes it a hub.
- The hub joins a courier company and **that company's team reviews it** in the courier portal (`docs/api/courier-companies.md`); the platform admin can still decide from `/admin/sorting-center-applications`. The review shows the government ID already on the account.
- Signing in is never blocked by a `PENDING` or `REJECTED` application: the owner keeps shopping and sees the status on
  `/register/hub`. Hub routes (`approved_sorting_center`) stay closed until an admin approves. Only a `SUSPENDED` hub is
  refused at sign-in.

## Account rules (422 under the `account` key)

| Situation | Message |
|---|---|
| The account is not a buyer (admin, older role "rider") | Only a buyer account can apply to run a logistics hub. |
| A seller account (shop `pending` or `approved`) | A seller account cannot also run a logistics hub. Register the hub with its own email. |
| A courier company account (not `REJECTED`) | A courier company account cannot also run a logistics hub. |
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
| `logistics_company_id` | required, an approved courier company (`GET /logistics/couriers`); its team reviews the application |
| `hub_name` (alias `business_name`) | required, 3 to 150 characters with at least two letters (spaces squeezed) |
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
