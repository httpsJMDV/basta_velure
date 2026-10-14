# Hub Area Sorting API (`/api/v1/hub/sorting`) — Feature 1.7

## Overview
Parcels the hub has received (`AT_SORTING_CENTER`, Feature 1.6) are grouped by **destination barangay PSGC code** (`parcels.destination_barangay_code`). The dispatcher selects parcels bound for the same barangay and marks them `SORTED` in one action. The barangay code *is* the area key; there is no separate "area" concept. Assigning sorted parcels to riders is Feature 1.8.

All endpoints require Sanctum authentication and the `approved_sorting_center` middleware (hub `status = APPROVED`, checked in the database on every request). Only this hub's parcels (`sorting_center_id`) are ever visible.

Codes are strings and are always compared as strings, so leading zeros (for example `043405001`) match.

Common errors on every endpoint:
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: hub is `PENDING`, `REJECTED` or `SUSPENDED`.

No response contains the recipient's phone number or the COD amount.

---

## 1. List Groups (`GET /api/v1/hub/sorting/groups`)
This hub's `AT_SORTING_CENTER` parcels grouped by destination barangay code.

- **Query**:
  - `search` (optional): case-insensitive match on barangay name or city name.
  - `sort` (optional): `waiting` (default, longest-waiting group first) or `count` (most parcels first, ties by waiting time). Any other value is a `422`.

#### Response: `200 OK`
```json
{
  "data": [
    {
      "barangay_code": "043405001",
      "barangay_name": "Real",
      "city": "Calamba",
      "parcel_count": 12,
      "oldest_scanned_in_at": "2026-10-14T04:10:00+00:00",
      "in_coverage": true,
      "riders_covering": 2
    }
  ],
  "meta": { "total_groups": 1, "total_parcels": 12 }
}
```

| Field | Meaning |
|---|---|
| `barangay_name`, `city` | From the parcel's destination barangay and recipient snapshot. |
| `oldest_scanned_in_at` | Oldest `scanned_in_at` in the group (waiting time). |
| `in_coverage` | The code is in this hub's `coverage_barangays`. |
| `riders_covering` | Count of distinct `ACTIVE` riders of this hub with an **active** area assignment whose `coverage_barangays` contains the code. `PENDING` and `DISAPPROVED` riders, other hubs' riders and inactive assignments are not counted. |

---

## 2. List Parcels in a Group (`GET /api/v1/hub/sorting/groups/{barangay_code}/parcels`)
Parcels of one group, oldest scan first.

- **Query**: `per_page` (default `20`, max `100`), `page`.
- A code with no waiting parcels for this hub returns an empty list (`200`), never `403`/`404`, so another hub's data is not revealed.

#### Response: `200 OK`
```json
{
  "data": [
    { "tracking_number": "LIT-261014-39B685", "order_number": "VEL-6ACF2D339AE46", "scanned_in_at": "2026-10-14T04:10:00+00:00" }
  ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 20, "total": 1, "from": 1, "to": 1 }
}
```

---

## 3. Mark as Sorted (`POST /api/v1/hub/sorting/sort`)
Marks a batch of parcels bound for one barangay as `SORTED`. **All or nothing.**

- **Body**: `{ "tracking_numbers": ["LIT-261014-39B685", "..."] }`, 1 to 200 items, no duplicates (compared after trim and uppercase).
- **Validation (under row locks)**: every item must be this hub's parcel, currently `AT_SORTING_CENTER`, share the batch's destination barangay code (the code of the first waiting parcel in the list) and have an order that can move to `SORTED`. If any item fails, nothing is changed.
- **On success**, in one transaction with row locks, for each parcel:
  - Transitions the order `AT_SORTING_CENTER → SORTED` through `OrderStateMachine` with actor `hub` (writes an `order_status_histories` row; the parcel status follows through the existing sync).
  - Sets `parcels.sorted_at = now()`.
- Two simultaneous sorts of the same parcel: only one succeeds; the other gets the "not waiting to be sorted" item error.

#### Response: `200 OK`
```json
{
  "message": "Parcels sorted.",
  "sorted_count": 2,
  "barangay": { "code": "043405001", "name": "Real" }
}
```

#### Error Response: `422`
Errors are keyed by array index. Another hub's parcel and an unknown tracking number get the same message.
```json
{
  "message": "One or more parcels cannot be sorted. Nothing was changed.",
  "errors": {
    "tracking_numbers.1": ["This parcel is bound for a different barangay than the rest of the batch."],
    "tracking_numbers.2": ["This parcel is not waiting to be sorted."],
    "tracking_numbers.3": ["Parcel not found for this hub."],
    "tracking_numbers.4": ["This parcel cannot be sorted right now."]
  }
}
```
Shape and size problems (empty, over 200, duplicates) return the standard Laravel `422` validation errors.

---

## Notes
- **Un-sorting is not supported.** The state machine has no `SORTED → AT_SORTING_CENTER` transition, so a sorted parcel cannot be moved back.
- `GET /api/v1/hub/dashboard/metrics` is unchanged: sorting lowers `in_sorting` by the number of parcels sorted.
