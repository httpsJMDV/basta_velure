# Rider Earnings and Delivery History API (`/api/v1/rider/...`) — Feature 2.9

## Overview
A rider earns a **flat fee for every parcel delivered**. This feature records that fee, reports it by day, week and month, and lists every delivery attempt the rider has made.

Out of scope: payouts or remittance to riders, per-distance or per-weight fees, tips, bonuses, and a fee clawback on returns.

All three endpoints are **read-only**, require Sanctum authentication and the `approved_rider` middleware (`riders.status = ACTIVE`, checked in the database on every request), and only ever return the authenticated rider's own data:
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: rider is `PENDING` or `DISAPPROVED`.

## Rules
- **Fee.** The rider earns **85%** of the delivery fee the buyer paid on that order (`shipping.rider_share_percent`, env `SHIPPING_RIDER_SHARE_PERCENT`; the hub gets the rest), so ₱42.50 of the default ₱50.00. This replaces the old flat `RIDER_DELIVERY_FEE`. An unusable setting is logged and the default is used; it never blocks a delivery. See `docs/api/delivery-fee-split.md`.
- **Snapshot.** The fee is copied onto the `rider_earnings` row when it is created. Changing the setting later never changes an existing row.
- **When it is created.** When the order enters `DELIVERED`, inside `OrderStateMachine`'s transaction, whoever triggered it (rider, hub, admin). Creation is idempotent: one row per parcel, enforced by a unique index on `rider_earnings.parcel_id`. Entering `DELIVERED` a second time (for example a dispute that is rejected) never adds a second row.
- **Who earns it.** The parcel's `assigned_rider_id`. A parcel with no assigned rider earns nobody anything.
- **Failed deliveries earn nothing.** A later return does **not** claw the fee back.
- **Time.** Days, weeks and months are **Asia/Manila**. Weeks run **Monday to Sunday**. A period starts at its first instant (inclusive) and ends at the first instant of the next period (exclusive). Timestamps in responses are ISO 8601 with offset.
- **Money.** Amounts are decimal **strings** with two places (`"150.00"`). Totals are summed in the database or in integer centavos, never as floats.

---

## 1. Summary (`GET /api/v1/rider/earnings/summary`)

| Query | Values | Default |
|---|---|---|
| `period` | `day`, `week`, `month` | `day` |
| `date` | `YYYY-MM-DD`, any date inside the wanted period (Manila) | today (Manila) |

An invalid `period` or `date` returns `422` with field errors.

#### Response: `200 OK`
```json
{
  "data": {
    "period": {
      "type": "week",
      "start_date": "2026-10-12",
      "end_date": "2026-10-18",
      "start_at": "2026-10-12T00:00:00+08:00",
      "end_at": "2026-10-18T23:59:59+08:00",
      "is_current": true,
      "timezone": "Asia/Manila"
    },
    "total_earned": "250.00",
    "deliveries_count": 5,
    "average_per_delivery": "50.00",
    "previous": {
      "type": "week", "start_date": "2026-10-05", "end_date": "2026-10-11",
      "start_at": "2026-10-05T00:00:00+08:00", "end_at": "2026-10-11T23:59:59+08:00",
      "is_current": false, "timezone": "Asia/Manila",
      "total_earned": "100.00", "deliveries_count": 2
    },
    "breakdown": [
      { "key": "2026-10-12", "label": "Mon 12", "total": "100.00", "count": 2 },
      { "key": "2026-10-13", "label": "Tue 13", "total": "0.00", "count": 0 }
    ],
    "lifetime_total": "350.00"
  }
}
```
- `average_per_delivery` is `"0.00"` when there are no deliveries (rounded half up to the centavo).
- `breakdown` is **zero-filled** and its points always add up to `total_earned`: 24 hourly points for `day` (`key` `"00"`..`"23"`, label `"8 AM"`), one per calendar day for `week` (label `"Mon 12"`) and `month` (label `"12"`).
- `previous` is the period right before the requested one, for the comparison line.
- `lifetime_total` is everything the rider has ever earned.

---

## 2. Earned deliveries (`GET /api/v1/rider/earnings/deliveries`)
The earnings rows of one period, newest first. Same `period` and `date` as the summary, plus `per_page` (1 to 100, default 20) and `page`.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "id": 41,
      "tracking_number": "LIT-261014-A1B2C3",
      "order_number": "VEL-65F1A2B3C4D5E",
      "destination": { "barangay_name": "Poblacion", "city": "Makati City" },
      "delivered_at": "2026-10-14T10:02:11+00:00",
      "fee": "50.00"
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1, "from": 1, "to": 1, "period": { "type": "day", "start_date": "2026-10-14", "...": "..." } }
}
```
`delivered_at` is the time the fee was earned. The recipient's name, street and phone are **never** included.

---

## 3. History (`GET /api/v1/rider/history`)
Every delivery attempt the rider has made, newest first.

| Query | Values |
|---|---|
| `outcome` | `all` (default), `delivered`, `failed`, `returned` |
| `from`, `to` | `YYYY-MM-DD`, inclusive Manila days; `to` must be on or after `from` |
| `search` | part of a tracking number or order number |
| `per_page`, `page` | 1 to 100 (default 20), page number |

#### Response: `200 OK`
```json
{
  "data": [
    {
      "outcome": "failed",
      "occurred_at": "2026-10-13T02:00:00+00:00",
      "tracking_number": "LIT-261012-D4E5F6",
      "order_number": "VEL-65F1A2B3C4D5F",
      "destination": { "barangay_name": "Poblacion", "city": "Makati City" },
      "failure_reason": { "code": "REFUSED", "label": "Recipient refused the parcel" },
      "fee": null,
      "cod_collected": null
    },
    {
      "outcome": "delivered",
      "occurred_at": "2026-10-14T02:00:00+00:00",
      "tracking_number": "LIT-261014-A1B2C3",
      "order_number": "VEL-65F1A2B3C4D5E",
      "destination": { "barangay_name": "Poblacion", "city": "Makati City" },
      "failure_reason": null,
      "fee": "50.00",
      "cod_collected": "1249.00"
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 2, "from": 1, "to": 2, "outcome": "all" }
}
```
- `failure_reason` is set only on `failed` entries. The label comes from the failure reason list (2.7); the rider's free-text note is **never** returned.
- `fee` is set only on `delivered` entries. `cod_collected` is set only on a delivered COD parcel whose cash was confirmed.
- **Each failed attempt is its own entry**, so a parcel that failed twice appears twice, each with its own reason.
- **How each outcome is derived**
  - `delivered`: from the rider's earnings rows. A parcel an admin marked delivered therefore still appears, with its fee, even though no rider delivery log exists for it. Its `occurred_at` is the parcel's `delivered_at` (stamped for every actor), or the earning's time for older parcels that have none.
  - `failed`: from the rider's `DELIVERY_FAILED` delivery logs.
  - `returned`: `RETURNED` is **not written to the delivery logs** (the hub's return action never creates one), so it is derived from the parcel: status `RETURNED`, `returned_at` set (only the hub's "return to seller" action sets it), and assigned to this rider. The entry is credited to the parcel's last assigned rider, at `returned_at`. A `RETURNED` parcel without `returned_at` (for example a seller accepting a buyer return) is not a delivery-history entry.
- The recipient's phone number is never included.

---

## Backfill
Deliveries made before this feature have no earnings row. `php artisan riders:backfill-earnings` creates the missing rows for parcels that are `DELIVERED`, have an assigned rider, and whose order is `DELIVERED` or `COMPLETED`. Each row is dated at the parcel's own `delivered_at` (falling back to `updated_at`) and uses the **current** fee. It is idempotent: running it again creates nothing, and existing rows are never changed.
