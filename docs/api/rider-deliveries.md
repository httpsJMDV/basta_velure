# Rider Delivery Console API (`/api/v1/rider/deliveries`) — Feature 2.6

## Overview
After the hub assigns parcels to a rider (Feature 1.8), the rider sees them here, collects them at the hub, and starts the delivery run. Starting moves each order `ASSIGNED_TO_RIDER → OUT_FOR_DELIVERY`.

Marking a parcel delivered or failed is Feature 2.7. Buyer confirmation is 2.8. Earnings are 2.9. None of those are in this API.

All endpoints require Sanctum authentication and the `approved_rider` middleware (`riders.status = ACTIVE`, checked in the database on every request). A rider only ever sees parcels whose `assigned_rider_id` is their own.

Common errors on every endpoint:
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: rider is `PENDING` or `DISAPPROVED`.

**Privacy**: unlike hub endpoints, these responses include the recipient's phone number and the COD amount, because the assigned rider needs both to complete the delivery. Nobody else can read them through this API.

---

## 1. List Deliveries (`GET /api/v1/rider/deliveries`)

- **Query**: `view` = `assigned` (default, parcels waiting to be collected at the hub) or `out_for_delivery`. Any other value is a `422`.
- Only this rider's parcels in the matching status are returned.

### Ordering ("route order")
Parcels are grouped by destination barangay. Groups are ordered by their **oldest `assigned_at`** first, and parcels inside a group by `assigned_at` (then id), oldest first. The `out_for_delivery` view uses the same order, so the app can number stops by walking the groups in order.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "barangay_code": "043405001",
      "barangay_name": "Real",
      "city": "Makati City",
      "parcels": [
        {
          "tracking_number": "LIT-261014-39B685",
          "order_number": "VEL-6ACF2D339AE46",
          "recipient": {
            "name": "Ana Buyer",
            "phone": "09998887777",
            "address": {
              "street": "12 Sampaguita St",
              "barangay": "Real",
              "city": "Makati City",
              "province": "Metro Manila",
              "full_address": "12 Sampaguita St, Real, Makati City, Metro Manila"
            }
          },
          "cod_amount": 1250,
          "item_count": 5,
          "item_summary": "Floral Summer Dress x1, Cotton Tee x2, +2 more",
          "assigned_at": "2026-10-14T05:10:00+00:00",
          "out_for_delivery_at": null
        }
      ]
    }
  ],
  "hub": {
    "hub_name": "Central Hub",
    "street": "123 Hub St",
    "barangay": "Real",
    "city": "Calamba",
    "province": "Laguna",
    "full_address": "123 Hub St, Real, Calamba, Laguna"
  },
  "meta": { "view": "assigned", "assigned_count": 1, "out_for_delivery_count": 0 }
}
```

| Field | Meaning |
|---|---|
| `cod_amount` | Amount to collect from the recipient, or `null` for prepaid (GCash) orders. |
| `item_count` | Total quantity of items in the order. |
| `item_summary` | The first two item names with quantities, then `+N more`. |
| `hub` | The rider's own hub (where to collect the parcels). It is the same for every parcel, so it is returned once. `null` if the rider has no hub. |
| `meta.assigned_count`, `meta.out_for_delivery_count` | Counts of this rider's **parcels** in each status, regardless of `view`. |

---

## 2. Start Delivery (`POST /api/v1/rider/deliveries/start`)

The rider confirms they collected these parcels at the hub and starts the run. **All or nothing.**

- **Body**: `{ "tracking_numbers": ["LIT-261014-39B685", "..."] }`. 1 to 50 items, no duplicates (compared after trim and uppercase).
- **Validation (under row locks)**: every parcel must be assigned to this rider and currently `ASSIGNED_TO_RIDER`, and its order must be able to move to `OUT_FOR_DELIVERY`. If any item fails, nothing is changed.
- **On success**, in one transaction with row locks, for each parcel:
  - transitions the order `ASSIGNED_TO_RIDER → OUT_FOR_DELIVERY` through `OrderStateMachine` with actor `rider` (writes an `order_status_histories` row; the parcel status follows through the existing sync);
  - sets `parcels.out_for_delivery_at = now()`.
- `assigned_rider_id` and `assigned_at` are not changed.
- Two simultaneous starts of the same parcel: only one succeeds; the other gets the "already out for delivery" item error.

#### Response: `200 OK`
```json
{
  "message": "Delivery started.",
  "started_count": 2,
  "tracking_numbers": ["LIT-261014-39B685", "LIT-261014-2B4L8R"]
}
```

#### Error Response: `422`
Errors are keyed by array index. Another rider's parcel and an unknown tracking number get the same message.
```json
{
  "message": "One or more parcels cannot be started. Nothing was changed.",
  "errors": {
    "tracking_numbers.1": ["Parcel not found among your assigned deliveries."],
    "tracking_numbers.2": ["This parcel is already out for delivery."],
    "tracking_numbers.3": ["This parcel is not waiting to be collected."],
    "tracking_numbers.4": ["This parcel cannot be sent out for delivery right now."]
  }
}
```
Shape and size problems (empty list, over 50, duplicates) return the standard Laravel `422` validation errors.

---

## Notes
- **Decision: only the rider confirms the collection.** There is no hub-side handover step, mirroring Feature 2.5 (pickup): the tracking-number scan on the rider's phone is the confirmation.
- There is no separate "verify" endpoint. The app matches scanned codes against the list it already loaded and shows "not assigned to you" for anything else.
- Camera scanning in the web app uses the browser `BarcodeDetector` API and needs HTTPS or `localhost`; manual entry always works.
- Delivered and failed outcomes are Feature 2.7.
