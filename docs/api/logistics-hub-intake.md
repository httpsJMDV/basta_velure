# Hub Parcel Intake API (`/api/v1/hub`) — Feature 1.6

## Overview
A hub worker scans or types the tracking number of a parcel a rider has dropped off. Receiving moves the order and parcel `PICKED_UP → AT_SORTING_CENTER` and stamps `parcels.scanned_in_at`.

All endpoints require Sanctum authentication and the `approved_sorting_center` middleware (hub `status = APPROVED`, checked in the database on every request).

**Hub scoping**: a parcel belongs to a hub through `parcels.sorting_center_id`, which is set when a rider of that hub accepts the pickup (Feature 2.4). Another hub's parcels, and parcels no rider has accepted yet, are indistinguishable from unknown tracking numbers: the response is a `404` with the same message.

**Tracking number input** is trimmed and uppercased before lookup.

**Privacy**: no response contains the recipient's phone number or the COD amount.

Common errors on every endpoint:
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: hub is `PENDING`, `REJECTED` or `SUSPENDED`.

---

## 1. Look Up Parcel (`GET /api/v1/hub/parcels/{tracking}`)
Read-only. Changes nothing.

#### Response: `200 OK`
```json
{
  "data": {
    "tracking_number": "LIT-261014-39B685",
    "order_number": "VEL-6ACF2D339AE46",
    "status": "PICKED_UP",
    "shop_name": "Maria's Shop",
    "destination_barangay": { "code": "137602015", "name": "Poblacion" },
    "pickup_rider": { "name": "Juan Rider", "plate_number": "AB-6224" },
    "picked_up_at": "2026-10-14T06:10:00+00:00",
    "scanned_in_at": null,
    "recipient": {
      "name": "Ana Buyer",
      "address": {
        "street": "12 Sampaguita St",
        "barangay": "Poblacion",
        "city": "Makati City",
        "province": "Metro Manila"
      }
    }
  }
}
```
`pickup_rider` is `null` if the rider record no longer exists.

#### Errors
- `404`: `{ "message": "Parcel not found for this hub." }` (unknown parcel, another hub's parcel, or not yet accepted by a rider).

---

## 2. Receive Parcel (`POST /api/v1/hub/parcels/{tracking}/receive`)
In one transaction, with a row lock on the parcel:
- Transitions the order `PICKED_UP → AT_SORTING_CENTER` through `OrderStateMachine` with actor `hub` (writes an `order_status_histories` row; the parcel status follows through the existing sync).
- Sets `parcels.scanned_in_at = now()`.

Two simultaneous scans of the same parcel: only one succeeds, the other receives the "already received" `409`.

#### Response: `200 OK`
```json
{
  "message": "Parcel received.",
  "data": { "...": "same record as the lookup, with status AT_SORTING_CENTER and scanned_in_at set" }
}
```

#### Errors
- `404`: unknown or another hub's parcel (same message as lookup).
- `409`: the parcel is still `READY_FOR_PICKUP`:
  ```json
  { "message": "This parcel has not been picked up by a rider yet." }
  ```
- `409`: the parcel was already received:
  ```json
  { "message": "This parcel has already been received.", "scanned_in_at": "2026-10-14T06:30:00+00:00" }
  ```
- `409`: the order is in a state that cannot be received (for example `DISPUTED`): `{ "message": "This parcel cannot be received right now." }`.

---

## 3. Expected Parcels (`GET /api/v1/hub/intake/expected`)
This hub's parcels in `PICKED_UP` (collected by a rider, not yet scanned in), oldest pick-up first.

- **Query**: `per_page` (default `20`, max `100`), `page`.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "tracking_number": "LIT-261014-39B685",
      "order_number": "VEL-6ACF2D339AE46",
      "status": "PICKED_UP",
      "shop_name": "Maria's Shop",
      "destination_barangay": { "code": "137602015", "name": "Poblacion" },
      "pickup_rider": { "name": "Juan Rider", "plate_number": "AB-6224" },
      "picked_up_at": "2026-10-14T06:10:00+00:00",
      "scanned_in_at": null
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1, "from": 1, "to": 1 }
}
```

---

## 4. Received Today (`GET /api/v1/hub/intake/received-today`)
This hub's parcels whose `scanned_in_at` falls in the current **Asia/Manila** calendar day (converted to UTC boundaries, the same `Parcel::scannedInToday()` scope the dashboard `inbound_today` metric uses), newest scan first. Rows include parcels that have since moved on to later statuses. `meta.total` is the day's count.

- **Query** and **response shape**: same as Expected Parcels.

---

## Metrics
`GET /api/v1/hub/dashboard/metrics` is unchanged. After a receive, `inbound_today` and `in_sorting` each increase by 1.
