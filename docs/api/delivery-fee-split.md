# Delivery fee and how it is shared (pickup rider 20%, delivery rider 65%, hub 15%)

## What the buyer pays

A flat **₱50 delivery fee for each seller's order** (checkout creates one order per seller, so two shops cost ₱100). It is set by `SHIPPING_FEE` in `.env` (`config/shipping.php`, default `50.00`). The fee is copied onto the order (`orders.shipping_fee`) when it is placed, so changing it later never changes an order that already exists. An unusable value is logged and `50.00` is used. The web cart and checkout show the same number from `frontend/src/utils/shipping.ts`; keep the two in step.

## Who gets it

The delivery fee **that order paid** is shared the way a courier pays its first-mile and last-mile riders:

| Share | Default | When | Recorded as |
|---|---|---|---|
| Pickup rider (seller to hub, `parcels.pickup_rider_id`) | **20%** | the hub receives the parcel (`AT_SORTING_CENTER`) | a `rider_earnings` row, `kind` `pickup` |
| Delivery rider (hub to buyer, `parcels.assigned_rider_id`) | **65%** | the parcel is delivered | a `rider_earnings` row, `kind` `delivery` |
| Logistics hub that handled it | **15%** (the rest) | the parcel is delivered | a `hub_earnings` row |

`SHIPPING_RIDER_SHARE_PERCENT` (default `85`, a whole number 0 to 100) sets the riders' share; `SHIPPING_PICKUP_SHARE_PERCENT` (default `20`, 0 to the riders' share) is the pickup rider's part of it, and the delivery rider gets the rest. An unusable value is logged and the default is used. Each share is rounded half up and the last one gets exactly what is left, so the shares add up to the fee to the centavo.

One rider doing both legs earns both rows (85%). A parcel with no pickup rider on record pays the delivery rider the whole riders' share. The pickup share is kept even if the delivery later fails.

| Order's delivery fee | Pickup rider | Delivery rider | Hub |
|---|---|---|---|
| ₱50.00 | ₱10.00 | ₱32.50 | ₱7.50 |
| ₱99.00 (an order placed before the fee changed) | ₱19.80 | ₱64.35 | ₱14.85 |

The rows are written by `RiderEarningsRecorder` from `OrderStateMachine`, whoever triggers the transition (the pickup row on `AT_SORTING_CENTER`, the delivery and hub rows on `DELIVERED`; the delivery step also writes a missing pickup row, for a parcel received before pickups earned). They are idempotent: one row per parcel for each kind (unique indexes), so a disputed order restored to delivered earns nothing twice. A failed delivery earns the delivery rider and the hub nothing, and a later return does not claw anything back. The amounts are snapshots: changing the fee or the percentage never rewrites past rows.

The hub is the parcel's `sorting_center_id` (set when the rider accepts the pickup). A parcel with no hub earns no hub row, and a parcel with no assigned rider earns no rider row.

This only records earnings. It does not touch what the buyer paid, the seller's earnings or the platform's commission, and there are no payouts to riders or hubs (a simulation).

## `GET /api/v1/hub/earnings`

Approved hubs only, read-only, only this hub's own rows. `403` for anyone else, `401` when signed out.

```json
{ "data": {
  "delivery_fee": "50.00",
  "split": { "rider_percent": 85, "pickup_percent": 20, "delivery_percent": 65, "hub_percent": 15 },
  "today":    { "total": "15.00", "deliveries_count": 2 },
  "week":     { "total": "22.50", "deliveries_count": 3 },
  "month":    { "total": "30.00", "deliveries_count": 4 },
  "lifetime": { "total": "37.50", "deliveries_count": 5 },
  "recent": [
    { "tracking_number": "LIT-261014-AB34X9", "order_number": "VEL-...", "rider_name": "Juan Dela Rosa", "delivery_fee": "50.00", "amount": "7.50", "earned_at": "2026-10-14T01:00:00+00:00" }
  ]
} }
```

Today, this week (Monday to Sunday) and this month are counted in Asia/Manila. `recent` is the latest 30 rows, newest first. The hub's page is **Earnings** in the hub sidebar (`/hub/earnings`). The rider's existing `GET /rider/earnings/*` endpoints now report the rider's share (`docs/api/rider-earnings.md`).

## Older data

`php artisan riders:backfill-earnings` creates the missing rows for parcels delivered before earnings existed, using the same split of each order's own fee (rider rows that already exist are never split again) (rider rows that already exist are never split again), and adds the hub's row where it is missing. Rider rows that already existed (written when the rider earned a flat amount) are left as they are.
