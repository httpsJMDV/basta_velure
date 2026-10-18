# Delivery fee and what riders and hubs earn (pickup ₱30, delivery ₱50, hub 15%)

## What the buyer pays

The delivery fee of each shop's order comes from the courier company's **rate table**: the route from the shop's zone to the buyer's zone, the first kilogram plus each extra whole kilogram (see `docs/api/commerce.md`). When no courier has rates yet, the flat `SHIPPING_FEE` of `config/shipping.php` (default `50.00`) is used. The fee is copied onto the order (`orders.shipping_fee`) when it is placed, so a later rate change never touches a placed order.

## Who earns what (A3)

| Who | Earns | When | Recorded as |
|---|---|---|---|
| Pickup rider (shop to hub, `parcels.pickup_rider_id`) | **₱30.00** per pickup | the rider scans the parcel at the shop (`PICKED_UP`) | a `rider_earnings` row, `kind` `pickup` |
| Delivery rider (hub to buyer, `parcels.assigned_rider_id`) | **₱50.00** per successful delivery | the parcel is delivered | a `rider_earnings` row, `kind` `delivery` |
| A failed attempt | **₱0.00** | | no row |
| Logistics hub that handled it | **15%** of the order's delivery fee | the parcel is delivered | a `hub_earnings` row |

`RIDER_PAY_PICKUP` and `RIDER_PAY_DELIVERY` (`config/shipping.php`, `rider_pay`) change the two amounts; `SHIPPING_RIDER_SHARE_PERCENT` (default `85`) still decides the hub's part (100 minus it). An unusable value is logged and the default is used.

One rider doing both legs earns both rows (₱80.00). A parcel picked up before pickups were paid at pickup is paid when the hub receives it, or at delivery. A day of 2 pickups, 3 deliveries and 1 failed attempt pays exactly ₱210.00.

The rows are written by `RiderEarningsRecorder` from `OrderStateMachine`, whoever triggers the transition. They are idempotent: one row per parcel for each kind (unique indexes), so a disputed order restored to delivered earns nothing twice, and a later return does not claw anything back. The amounts are snapshots: changing the pay never rewrites past rows.

The hub is the parcel's `sorting_center_id`. A parcel with no hub earns no hub row, and a parcel with no assigned rider earns no rider row. This only records earnings: what the buyer paid, the seller's earnings and the platform commission are untouched. The courier company pays its riders and hubs (Logistics, Settlements & pay).

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

`php artisan riders:backfill-earnings` creates the missing rows for parcels delivered before earnings existed, using the same split of each order's own fee (rider rows that already exist are left as they are), and adds the hub's row where it is missing. Rider rows that already existed (written when the rider earned a flat amount) are left as they are.
