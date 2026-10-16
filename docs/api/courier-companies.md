# Courier Companies API Contract

## Overview

Loved-IT works with several courier companies, the way Shopee works with SPX, J&T or Flash. A courier company runs
its own network of hubs (sorting centers / municipal stations); the hubs' riders deliver the parcels of the orders
placed with that courier.

```
Loved-IT admin
 └─ Courier company        logistics_companies   (partner; approved by the admin)
     └─ Hubs               sorting_centers       (approved by their courier's team)
         └─ Riders         riders                (approved by their hub)
```

- **Partners only.** Loved-IT runs no courier of its own; every courier is a partner company that applied and was
  approved. Existing hubs, orders and parcels belong to the demo partner "Demo Courier Co." (`code` DCC, `is_default`),
  which no admin owns (`php artisan demo:seed` gives it the demo courier admin `courier1` / `courier123`). A hub, order
  or parcel with no company is treated as the default courier's (`LogisticsCompany::effectiveId()` / `constrain()`);
  `is_default` means only that, and the default courier is reviewed and suspended like any other.
- **Same coverage rules and fee for every courier.** The flat delivery fee (`SHIPPING_FEE`) and the 85/15 rider/hub split
  do not change per courier.
- **Routing.** The buyer picks a courier at checkout (`orders.logistics_company_id`, the default courier when omitted; the web app always sends one).
  The parcel created at READY_FOR_PICKUP copies it, and `Parcel::availableForRider()` and the seller-based pickup
  queries (`forRiderCourier`) only offer a parcel to riders of a hub of the same courier.
- **Accounts.** A buyer applies from their own account (role stays `buyer`); `logistics_company_members` links the
  account to its company (one company per account, role `owner`). `UserResource.logistics_company` carries it; an
  approved courier's team lands on `/logistics` after sign-in.
- Hub tiers and transfers between hubs are not built (a parcel still belongs to one hub).

## Public

### `GET /api/v1/logistics/couriers`

Approved couriers, the biggest network first: `id, name, code, logo_url, hubs_count` (approved hubs).
`GET /api/v1/logistics/hubs` also returns each hub's `courier {id, name, code}` and accepts `courier_id`.

## Applying

### `POST /api/v1/auth/apply-courier` (`auth:sanctum`, multipart)

| Field | Rules |
|---|---|
| `name` | required, max 120, unique among companies that are not rejected |
| `code` | required, 2 to 6 letters or digits (uppercased), unique |
| `description` | optional, max 500 |
| `contact_email` | required email |
| `contact_phone` | required, max 30 |
| `address_province`, `address_city`, `address_barangay`, `address_street` | required |
| `business_permit` | required file, jpg/jpeg/png/pdf, max 5 MB, private `ids` disk |
| `logo` | optional image, jpg/png/webp, max 2 MB, public disk |

Account rules (422 under `account`): a buyer account only; no company already pending, approved or suspended.
A rejected company is reopened on the same row (old permit, and old logo when replaced, deleted). 201 returns
`data.user` (full `UserResource`) and `data.company`. Emails: "application received" to the owner.

## Platform admin (`role:admin`)

| Route | Notes |
|---|---|
| `GET /admin/courier-applications?status=PENDING\|APPROVED\|REJECTED\|SUSPENDED\|all&search=&sort=oldest&page=` | `data[]`, `meta`, `counts {pending, approved, rejected, suspended}` |
| `GET /admin/courier-applications/{id}` | full company with owner and hub counts |
| `POST .../{id}/approve` | PENDING only; emails the owner |
| `POST .../{id}/reject` `{reason}` | PENDING only; reason required; emails the owner |
| `POST .../{id}/suspend` `{reason}` | APPROVED only; locks the portal |
| `POST .../{id}/reactivate` | SUSPENDED only |
| `GET .../{id}/permit` | the business permit from private storage |

Every decision is written to the admin activity log.

## Hub applications

`POST /api/v1/auth/apply-hub` now requires `logistics_company_id` (an approved courier). The chosen courier's team gets
a "new hub application" email. Hub decisions go through `HubApplicationReviewer`, used by the courier portal (normal
path) and by the admin's existing `/admin/sorting-center-applications/{id}/approve|reject` (oversight).

## Courier portal (`auth:sanctum` + `logistics_member`)

`logistics_member` admits the team of an **approved** company (403 with the reason otherwise) and scopes every query
to it; another company's hub is a 404.

| Route | Returns |
|---|---|
| `GET /logistics/me` | the company in full |
| `GET /logistics/dashboard` | `hubs {approved, pending, suspended, rejected}`, `riders {active, pending}`, `parcels_now {awaiting_pickup, at_hubs, out_for_delivery, failed}`, `last_30_days {delivered, returned}` |
| `GET /logistics/network/hubs?status=&search=` | every hub of the network with coverage, active riders and active parcels |
| `GET /logistics/network/hubs/{hub}` | the hub application (`SortingCenterApplicationResource`) with document links in this portal |
| `GET /logistics/network/hubs/{hub}/documents/{permit\|id\|id-back}` | private files |
| `POST /logistics/network/hubs/{hub}/approve` | PENDING only; emails the owner |
| `POST /logistics/network/hubs/{hub}/reject` `{reason}` | PENDING only |
| `POST /logistics/network/hubs/{hub}/suspend` `{reason}` | APPROVED only |
| `POST /logistics/network/hubs/{hub}/reactivate` | SUSPENDED only |
| `GET /logistics/riders?status=&search=&hub_id=` | riders of every hub (read-only) |
| `GET /logistics/parcels?search=&status=&hub_id=&problems=1&page=` | any parcel of the network; `problems=1` = failed and returned |
| `GET /logistics/reports?from=&to=` | each approved hub's `HubReportService` totals plus network totals |

## Orders and labels

Buyer and seller order payloads carry `courier {id, name, code, logo_url}`, and the waybill payload carries `courier`
(printed in the label header).
