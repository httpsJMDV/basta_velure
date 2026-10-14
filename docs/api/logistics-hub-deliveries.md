# Hub Delivery Monitoring and Failure Triage API (`/api/v1/hub/deliveries`) — Feature 1.9

## Overview
The hub sees which of its parcels are **out for delivery** (live) and which deliveries **failed**, with the rider's reason. On a failed parcel the hub has two actions: **reschedule** it for another attempt, or **return it to the seller**.

Out of scope: refunds, escrow changes, and any physical return logistics. `RETURNED` only means the hub sent the parcel back to the seller.

All endpoints require Sanctum authentication and the `approved_sorting_center` middleware (hub `status = APPROVED`, checked in the database on every request). Only this hub's parcels (`sorting_center_id`) and riders are ever visible.

Common errors on every endpoint:
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: hub is `PENDING`, `REJECTED` or `SUSPENDED`.

No response contains the recipient's phone number or the COD amount.

---

## Decisions
1. **Attempt limit.** A parcel may be out for delivery at most **3 times**. The limit is `config('logistics.max_delivery_attempts')` (`config/logistics.php`, `LOGISTICS_MAX_DELIVERY_ATTEMPTS` in `.env`, default `3`). `parcels.delivery_attempts` is incremented by the rider's failed outcome (Feature 2.7). Once `delivery_attempts` reaches the limit, the hub **can no longer reschedule** the parcel, only return it.
2. **Reschedule moves the parcel back to `ASSIGNED_TO_RIDER`**, so the rider collects it at the hub again (scan and start, as in Feature 2.6). **This assumes riders bring failed parcels back to the hub.** Nothing in the system verifies that physical hand-back.
3. **Return to seller sets `RETURNED` and emails the seller. It does not touch refunds, escrow, or any money field**, because refunds are not built. `RETURNED` is terminal in the state machine.
4. The rider's free-text failure note is shown to the hub only. It is never put in the order history (which buyers can read) and never in the seller's email. The hub's own return note is stored on the parcel and is not emailed either.

---

## 1. Out for Delivery (`GET /api/v1/hub/deliveries/out`)
This hub's parcels in `OUT_FOR_DELIVERY`, ordered by rider and then by when they went out.

- **Query**:
  - `search` (optional): case-insensitive match on tracking number, order number, recipient name, destination barangay, city, or rider name.
  - `rider_id` (optional): only this rider's parcels.
- Returns up to 500 parcels; `meta.truncated` is `true` if there are more.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "tracking_number": "LIT-261014-39B685",
      "order_number": "VEL-6ACF2D339AE46",
      "rider": { "id": 7, "name": "Juan Dela Cruz", "plate_number": "AB-1234" },
      "destination": { "barangay_code": "043405001", "barangay_name": "Real", "city": "Makati City" },
      "recipient_name": "Ana Buyer",
      "out_for_delivery_at": "2026-10-14T07:10:00+00:00",
      "elapsed_minutes": 90
    }
  ],
  "meta": {
    "total": 1,
    "truncated": false,
    "riders": [
      { "rider_id": 7, "name": "Juan Dela Cruz", "plate_number": "AB-1234", "count": 1 }
    ]
  }
}
```
`meta.riders` counts this hub's out-for-delivery parcels **per rider, ignoring `search` and `rider_id`**, so the rider filter keeps stable options. `meta.total` is the count after filtering.

---

## 2. Failed Deliveries (`GET /api/v1/hub/deliveries/failed`)
This hub's parcels in `DELIVERY_FAILED`, newest failure first.

- **Query**:
  - `reason` (optional): one of the failure reason codes (`RECIPIENT_UNAVAILABLE`, `WRONG_ADDRESS`, `REFUSED`, `CANNOT_CONTACT`, `ADDRESS_INACCESSIBLE`, `OTHER`). An unknown code is a `422`.
  - `search` (optional): same as above.
  - `per_page` (default `20`, max `100`), `page`.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "tracking_number": "LIT-261014-39B685",
      "order_number": "VEL-6ACF2D339AE46",
      "rider": { "id": 7, "name": "Juan Dela Cruz", "plate_number": "AB-1234" },
      "destination": { "barangay_code": "043405001", "barangay_name": "Real", "city": "Makati City" },
      "recipient_name": "Ana Buyer",
      "failure_reason": { "code": "RECIPIENT_UNAVAILABLE", "label": "Recipient unavailable" },
      "failure_note": "Gate locked, nobody answered.",
      "failed_at": "2026-10-14T08:40:00+00:00",
      "delivery_attempts": 2,
      "max_attempts": 3,
      "can_reschedule": true
    }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1, "from": 1, "to": 1, "max_attempts": 3 }
}
```
`can_reschedule` is `delivery_attempts < max_attempts`. `meta.reasons` lists the reason codes and labels (the same enum riders use, as `{code, label, requires_note}`), so the hub UI can build its reason filter without a second source.

---

## 3. Reschedule (`POST /api/v1/hub/deliveries/{tracking}/reschedule`)
Gives a failed parcel another delivery attempt.

- **Body**: `{ "rider_id": 7 }`. The same rider as before is allowed.
- **Rules**:
  - The parcel is this hub's and currently `DELIVERY_FAILED`.
  - `delivery_attempts` is under the limit.
  - The rider belongs to this hub and is **eligible for the parcel's destination barangay**: `ACTIVE`, with an active area assignment containing the code (compared as strings), the same shared rule as dispatch (Feature 1.8).
  - The order can move to `ASSIGNED_TO_RIDER` (a `DISPUTED` order cannot).
- **On success**, in one transaction with row locks:
  - the order moves `DELIVERY_FAILED → ASSIGNED_TO_RIDER` through `OrderStateMachine` with actor `hub` (history row written, parcel follows the sync);
  - `assigned_rider_id` and `assigned_at` are set;
  - `failed_at`, `failure_reason`, `failure_note` and `delivery_attempts` are **kept** as the record of the last failure.
- **Email**: after the transaction commits, inside `try/catch` with logging, the rider receives the same "parcel assigned to you" email as in Feature 1.8 (one parcel). A mail failure never undoes the reschedule.

#### Response: `200 OK`
```json
{
  "message": "Parcel rescheduled.",
  "tracking_number": "LIT-261014-39B685",
  "rider": { "id": 7, "name": "Juan Dela Cruz" },
  "delivery_attempts": 2,
  "max_attempts": 3
}
```

#### Errors
- `404`: the parcel is unknown or another hub's, **or** the rider is unknown or another hub's. All four cases return the same message (`"Parcel or rider not found for this hub."`).
- `409`: the parcel is not in `DELIVERY_FAILED`.
- `422`: attempt limit reached (the message says it can only be returned to the seller), the rider is not eligible for the barangay (`errors.rider_id`), the order cannot be updated (for example `DISPUTED`), or `rider_id` is missing.

---

## 4. Return to Seller (`POST /api/v1/hub/deliveries/{tracking}/return-to-seller`)
Sends a failed parcel back to the seller. It is always available on a `DELIVERY_FAILED` parcel, including after the attempt limit.

- **Body**: `{ "note": "optional, max 500 characters" }`.
- **On success**, in one transaction with row locks: the order moves `DELIVERY_FAILED → RETURNED` through `OrderStateMachine` with actor `hub`, and `returned_at` and `return_note` are set. **Refunds, escrow, and every money field are untouched.**
- **Email**: after the transaction commits, inside `try/catch` with logging, the seller is emailed. It is built from real data: the shop name, order number, tracking number, the failure reason label, the hub name, and a login link built from `config('app.frontend_url')` (falling back to `APP_URL`, never a hardcoded host). A mail failure never undoes the return.
- Both emails are queued like the other application emails: with `QUEUE_CONNECTION=database` a worker (`php artisan queue:work`) must be running; with `sync` they send immediately; with `MAIL_MAILER=log` they are written to `storage/logs/laravel.log`.

#### Response: `200 OK`
```json
{ "message": "Parcel returned to the seller.", "tracking_number": "LIT-261014-39B685" }
```

#### Errors
- `404`: unknown or another hub's parcel (same message as above).
- `409`: the parcel is not in `DELIVERY_FAILED`.
- `422`: `note` over 500 characters, or the order cannot be updated (for example `DISPUTED`).

---

## Metrics
`GET /api/v1/hub/dashboard/metrics` gains two keys, **additively**: `out_for_delivery` and `failed_deliveries`. No existing key changed. See `docs/api/logistics-hub-dashboard.md`.
