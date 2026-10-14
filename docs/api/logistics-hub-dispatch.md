# Hub Dispatch API (`/api/v1/hub/dispatch`) — Feature 1.8

## Overview
The hub assigns `SORTED` parcels (Feature 1.7) to a rider. A **batch** is this hub's `SORTED` parcels for one destination barangay (`parcels.destination_barangay_code`). The dispatcher picks one eligible rider for the batch.

A rider is **eligible** for a barangay only if all of these hold:
- the rider is `ACTIVE` (`PENDING` and `DISAPPROVED` riders never qualify),
- the rider belongs to this hub (`riders.sorting_center_id`),
- the rider has an **active** area assignment whose `coverage_barangays` contains the batch's barangay code.

Codes are PSGC strings and are always compared as strings, so leading zeros (for example `043405001`) match. Several riders may be eligible; the dispatcher chooses.

All endpoints require Sanctum authentication and the `approved_sorting_center` middleware (hub `status = APPROVED`, checked in the database on every request). Only this hub's parcels and riders are ever visible.

Common errors on every endpoint:
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: hub is `PENDING`, `REJECTED` or `SUSPENDED`.

No response contains the recipient's phone number or the COD amount.

---

## 1. List Batches (`GET /api/v1/hub/dispatch/batches`)
- **Query**:
  - `search` (optional): case-insensitive match on barangay or city name.
  - `sort` (optional): `waiting` (default, longest-waiting since `sorted_at` first) or `count` (most parcels first). Any other value is a `422`.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "barangay_code": "043405001",
      "barangay_name": "Real",
      "city": "Calamba",
      "parcel_count": 12,
      "oldest_sorted_at": "2026-10-14T05:10:00+00:00",
      "eligible_riders": 2
    }
  ],
  "meta": { "total_batches": 1, "total_parcels": 12 }
}
```
`eligible_riders` counts distinct riders that satisfy the eligibility rule above. Parcels with an empty `destination_barangay_code` are never listed.

---

## 2. List Parcels in a Batch (`GET /api/v1/hub/dispatch/batches/{barangay_code}/parcels`)
- **Query**: `per_page` (default `20`, max `100`), `page`. Oldest `sorted_at` first.
- A code with no `SORTED` parcels for this hub returns an empty list (`200`), so another hub's data is not revealed.

```json
{
  "data": [
    { "tracking_number": "LIT-261014-39B685", "order_number": "VEL-6ACF2D339AE46", "sorted_at": "2026-10-14T05:10:00+00:00" }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1, "from": 1, "to": 1 }
}
```

---

## 3. List Eligible Riders (`GET /api/v1/hub/dispatch/batches/{barangay_code}/riders`)
The riders who may be assigned this barangay's parcels, least loaded first (ties by name). An empty `data` array means no rider covers the barangay.

```json
{
  "data": [
    {
      "id": 7,
      "name": "Juan Dela Cruz",
      "vehicle_type": "Motorcycle",
      "plate_number": "AB-1234",
      "area_labels": ["North District Area A"],
      "current_load": 3
    }
  ]
}
```
- `area_labels`: the rider's active areas that contain this barangay.
- `current_load`: the rider's parcels currently in `ASSIGNED_TO_RIDER` or `OUT_FOR_DELIVERY`.
- No email or phone number is returned.

---

## 4. Assign (`POST /api/v1/hub/dispatch/assign`)
Assigns a batch of `SORTED` parcels for one barangay to one rider. **All or nothing.**

- **Body**: `{ "rider_id": 7, "tracking_numbers": ["LIT-261014-39B685", "..."] }`. `tracking_numbers` has 1 to 200 items, no duplicates (compared after trim and uppercase).
- **Validation (under row locks)**:
  - every parcel is this hub's and currently `SORTED`, has a non-empty destination barangay code, shares the batch's code (the code of the first waiting parcel in the list), and has an order that can move to `ASSIGNED_TO_RIDER`;
  - the rider belongs to this hub and is eligible for the batch's barangay.
  - If anything fails, nothing is changed.
- **On success**, in one transaction with row locks, for each parcel:
  - transitions the order `SORTED → ASSIGNED_TO_RIDER` through `OrderStateMachine` with actor `hub` (writes an `order_status_histories` row; the parcel status follows through the existing sync);
  - sets `parcels.assigned_rider_id` and `parcels.assigned_at`.
- Two simultaneous assigns of the same parcel: only one succeeds; the other gets the "not waiting for dispatch" item error.

#### Response: `200 OK`
```json
{
  "message": "Parcels assigned.",
  "assigned_count": 2,
  "barangay": { "code": "043405001", "name": "Real" },
  "rider": { "id": 7, "name": "Juan Dela Cruz" }
}
```

#### Error Response: `422`
Errors are keyed by field (`rider_id`) or array index (`tracking_numbers.N`). An unknown rider and another hub's rider get the same message, as do an unknown parcel and another hub's parcel.
```json
{
  "message": "The parcels cannot be assigned. Nothing was changed.",
  "errors": {
    "rider_id": ["This rider is not eligible for this barangay."],
    "tracking_numbers.1": ["This parcel is bound for a different barangay than the rest of the batch."],
    "tracking_numbers.2": ["This parcel is not waiting for dispatch."],
    "tracking_numbers.3": ["Parcel not found for this hub."],
    "tracking_numbers.4": ["This parcel cannot be dispatched right now."]
  }
}
```
`rider_id` can also be `"Rider not found for this hub."`. Shape and size problems (missing `rider_id`, empty list, over 200, duplicates) return the standard Laravel `422` validation errors.

---

## Rider notification (email)
After a successful assign, **one email per request** (not per parcel) is sent to the rider.

- Sent **after the transaction commits**, inside `try/catch`. A mail failure is logged (`Log::error`) and never undoes the assignment.
- Content is built from real data: the rider's first name, the hub name, the parcel count (singular or plural), the barangay name, and a **Log In** button.
- The login link is `config('app.frontend_url')` + `/login`. Set `FRONTEND_URL` in `.env`; if it is missing, `APP_URL` is used. There is no hardcoded host.
- It is queued like the other application emails (`Mail::queue`). With `QUEUE_CONNECTION=database`, a worker (`php artisan queue:work`) must be running; with `sync` it sends immediately. Real SMTP is not required to run the feature: with `MAIL_MAILER=log` the rendered email is written to `storage/logs/laravel.log`.
- **An in-app notification is not built.** The email is the only notification to the rider.

---

## Notes
- **Un-assigning is not supported.** The state machine has no `ASSIGNED_TO_RIDER → SORTED` transition, so a wrong assignment cannot be undone from this screen.
- The rider's delivery console (2.6) and delivery outcomes (2.7) are out of scope.
- `GET /api/v1/hub/dashboard/metrics` is unchanged.
