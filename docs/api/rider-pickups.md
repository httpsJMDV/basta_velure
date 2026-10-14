# Courier Pickup Dashboard API (`/api/v1/rider/pickups`)

## Overview
This specification details the pickup request discovery, claiming (accepting), declining, and releasing endpoints for couriers (riders). A pickup request represents an aggregation of a merchant's unclaimed `READY_FOR_PICKUP` parcels whose `pickup_barangay_code` matches one of the courier's active area assignments.

All endpoints require authentication via Laravel Sanctum and the `approved_rider` middleware (`status = ACTIVE`).

---

## 1. List Pickup Requests (`GET /api/v1/rider/pickups`)

Lists pickup requests grouped by merchant seller.

- **Headers**:
  - `Authorization: Bearer <sanctum_token>`
  - `Accept: application/json`
- **Query Parameters**:
  - `view`: `available` (default) or `mine`

### Privacy & Data Protection Rule
Under no circumstances are buyer/recipient names, delivery addresses, phone numbers, or COD amounts exposed in pickup list responses. Couriers only need merchant shop location, shop contact number, package counts, and area labels to collect parcels.

---

### View: `available` (Default)
Returns unclaimed, undeclined `READY_FOR_PICKUP` parcels inside the courier's active assigned barangays.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "seller_id": 4,
      "shop_name": "Maria's Vintage Boutique",
      "shop_phone": "09171234567",
      "pickup_address": {
        "street": "123 Mabini St, Unit 4B",
        "barangay": "Bagong Silang",
        "city": "Caloocan City",
        "province": "Metro Manila",
        "full_address": "123 Mabini St, Unit 4B, Bagong Silang, Caloocan City, Metro Manila"
      },
      "parcel_count": 3,
      "ready_since": "2026-10-06T01:15:00.000000Z",
      "matched_area_label": "North District Area A"
    }
  ],
  "meta": {
    "available_count": 1,
    "mine_count": 0,
    "picked_up_count": 0,
    "has_areas": true,
    "limit": 50
  }
}
```

*Note: If the courier has no active area assignments or their assigned areas have no barangay codes, `has_areas` is `false` and `data` is empty `[]`.*

---

### View: `mine`
Returns parcels currently accepted by the authenticated courier that are still in `READY_FOR_PICKUP` status awaiting physical collection.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "seller_id": 4,
      "shop_name": "Maria's Vintage Boutique",
      "shop_phone": "09171234567",
      "pickup_address": {
        "street": "123 Mabini St, Unit 4B",
        "barangay": "Bagong Silang",
        "city": "Caloocan City",
        "province": "Metro Manila",
        "full_address": "123 Mabini St, Unit 4B, Bagong Silang, Caloocan City, Metro Manila"
      },
      "parcel_count": 2,
      "parcel_ids": [101, 102],
      "tracking_numbers": ["LIT-261006-9A3K7P", "LIT-261006-2B4L8R"],
      "ready_since": "2026-10-06T01:15:00.000000Z",
      "pickup_accepted_at": "2026-10-06T02:00:00.000000Z",
      "matched_area_label": "North District Area A"
    }
  ],
  "meta": {
    "available_count": 0,
    "mine_count": 1,
    "picked_up_count": 0,
    "has_areas": true,
    "limit": 50
  }
}
```

---

## 2. Accept Pickup Request (`POST /api/v1/rider/pickups/sellers/{seller}/accept`)

Claims all currently available parcels for the specified seller in the courier's assigned active areas.

- **Headers**:
  - `Authorization: Bearer <sanctum_token>`
  - `Accept: application/json`
- **Path Parameters**:
  - `seller`: User ID of the merchant (`seller_id`).

### State Behavior
- Sets `parcels.pickup_rider_id = rider.id`
- Sets `parcels.sorting_center_id = rider.sorting_center_id`
- Sets `parcels.pickup_accepted_at = now()`
- **Does NOT change order or parcel status** (`READY_FOR_PICKUP` remains until pickup scan in Feature 2.5).

#### Response: `200 OK`
```json
{
  "message": "Pickup accepted successfully.",
  "claimed_count": 2,
  "tracking_numbers": ["LIT-261006-9A3K7P", "LIT-261006-2B4L8R"]
}
```

#### Error Responses
- `401 Unauthorized`: Unauthenticated.
- `403 Forbidden`: Account is pending hub approval or deactivated.
- `404 Not Found`: Seller pickup address is outside courier's assigned active areas.
- `409 Conflict`: Another courier accepted the pickup request first:
  ```json
  {
    "message": "This pickup request has already been accepted by another courier."
  }
  ```

---

## 3. Decline Pickup Request (`POST /api/v1/rider/pickups/sellers/{seller}/decline`)

Hides all currently visible parcels for this merchant for the authenticated courier only, by inserting records into `rider_pickup_declines`.

- **Headers**:
  - `Authorization: Bearer <sanctum_token>`
  - `Accept: application/json`
- **Path Parameters**:
  - `seller`: User ID of the merchant (`seller_id`).

### Behavior
- The decline is strictly isolated to the requesting courier. Other couriers covering the same area continue to see and accept the pickup request.
- If the merchant marks new orders ready for pickup later, those new parcels will appear normally on the courier's available list.

#### Response: `200 OK`
```json
{
  "message": "Pickup request declined for your account.",
  "declined_count": 2
}
```

#### Error Responses
- `401 Unauthorized`: Unauthenticated.
- `403 Forbidden`: Account is pending hub approval or deactivated.
- `404 Not Found`: No visible pickup request for this merchant in the courier's assigned areas.

---

## 4. Release Accepted Pickup (`POST /api/v1/rider/pickups/sellers/{seller}/release`)

Releases previously claimed parcels for this merchant back to the available pool.

- **Headers**:
  - `Authorization: Bearer <sanctum_token>`
  - `Accept: application/json`
- **Path Parameters**:
  - `seller`: User ID of the merchant (`seller_id`).

### Behavior
- Clears `pickup_rider_id`, `sorting_center_id`, and `pickup_accepted_at` back to `null`.
- Only affects parcels that are still in `READY_FOR_PICKUP` status.
- Once released, the request reappears on the available list for any courier covering the merchant's area.

#### Response: `200 OK`
```json
{
  "message": "Pickup request released back to available pool.",
  "released_count": 2
}
```

#### Error Responses
- `401 Unauthorized`: Unauthenticated.
- `403 Forbidden`: Account is pending hub approval or deactivated.
- `409 Conflict`: Courier has no accepted pickups to release for this merchant:
  ```json
  {
    "message": "No accepted pickups found to release for this seller."
  }
  ```


---

## 5. Picked Up View (`GET /api/v1/rider/pickups?view=picked_up`) — Feature 2.5

Lists this rider's parcels that are in `PICKED_UP` status (collected from the seller, not yet scanned in by the hub), grouped by seller. Each group carries the rider's own hub so the app can show where to drop the parcels off.

`meta.picked_up_count` (number of seller groups) is now present on every view.

```json
{
  "data": [
    {
      "seller_id": 4,
      "shop_name": "Maria's Vintage Boutique",
      "parcel_count": 2,
      "tracking_numbers": ["LIT-261006-9A3K7P", "LIT-261006-2B4L8R"],
      "picked_up_at": "2026-10-06T03:10:00.000000Z",
      "hub": {
        "hub_name": "Central Sorting Hub",
        "street": "123 Hub St",
        "barangay": "Real",
        "city": "Calamba",
        "province": "Laguna",
        "full_address": "123 Hub St, Real, Calamba, Laguna"
      }
    }
  ],
  "meta": { "available_count": 0, "mine_count": 0, "picked_up_count": 1, "has_areas": true, "limit": 50 }
}
```

`hub` is `null` if the rider has no hub. No recipient details or COD amounts are returned.

---

## 6. Verify Parcel (`POST /api/v1/rider/pickups/verify`) — Feature 2.5

Read-only check used after each scan or manual entry. Changes nothing.

- **Body**: `{ "tracking_number": "LIT-261006-9A3K7P" }`. The value is trimmed and uppercased before lookup.
- **Rule**: succeeds only if the parcel's `pickup_rider_id` is the authenticated rider and the parcel is still `READY_FOR_PICKUP`.

#### Response: `200 OK`
```json
{
  "data": {
    "tracking_number": "LIT-261006-9A3K7P",
    "seller_id": 4,
    "shop_name": "Maria's Vintage Boutique",
    "order_number": "VEL-20261006-ABC123"
  }
}
```
No recipient name, address, phone or COD amount is ever included.

#### Error Responses
- `401`: Unauthenticated.
- `403`: Account is pending hub approval or deactivated.
- `404`: Unknown tracking number, or the parcel was not accepted by this rider (the two are indistinguishable on purpose).
- `409`: The parcel has already been picked up (`{ "message": "This parcel has already been picked up." }`).
- `422`: `tracking_number` missing or too long.

---

## 7. Confirm Handover (`POST /api/v1/rider/pickups/confirm`) — Feature 2.5

Confirms physical handover of one or more accepted parcels. **All or nothing**: every item is validated first, and if any is invalid nothing is changed.

- **Body**: `{ "tracking_numbers": ["LIT-261006-9A3K7P", "LIT-261006-2B4L8R"] }` — 1 to 50 items, no duplicates (compared after trim and uppercase).
- **Partial pickup is allowed**: the rider may confirm only some of the parcels they accepted. The rest stay accepted and `READY_FOR_PICKUP`.

### State Behavior
In one database transaction, with row locks, for each parcel:
- Transitions the order `READY_FOR_PICKUP → PICKED_UP` through `OrderStateMachine` with actor `rider` (writes an `order_status_histories` row; the parcel status follows through the existing sync).
- Sets `parcels.picked_up_at = now()`.
- Writes a `delivery_logs` row (`outcome = PICKED_UP`, rider, parcel, `logged_at`).
- Does **not** change `pickup_rider_id` or `sorting_center_id` (set at accept in 2.4).

#### Response: `200 OK`
```json
{
  "message": "Handover confirmed.",
  "picked_up_count": 2,
  "tracking_numbers": ["LIT-261006-9A3K7P", "LIT-261006-2B4L8R"],
  "hub": {
    "hub_name": "Central Sorting Hub",
    "street": "123 Hub St",
    "barangay": "Real",
    "city": "Calamba",
    "province": "Laguna",
    "full_address": "123 Hub St, Real, Calamba, Laguna"
  }
}
```

#### Error Responses
- `401`: Unauthenticated.
- `403`: Account is pending hub approval or deactivated.
- `422`: Validation failed or at least one parcel cannot be confirmed. Errors are keyed by array index and nothing is changed:
  ```json
  {
    "message": "One or more parcels cannot be confirmed. Nothing was changed.",
    "errors": {
      "tracking_numbers.1": ["Parcel not found among your accepted pickups."],
      "tracking_numbers.2": ["This parcel has already been picked up."]
    }
  }
  ```

---

## Notes

- **Decision**: only the rider confirms handover. There is no seller-side confirmation step.
- **Camera scanning** in the web app uses the browser `BarcodeDetector` API (`code_128`) and needs HTTPS or `localhost`. Where it is unsupported, the rider types the tracking number. The API is the same either way.
