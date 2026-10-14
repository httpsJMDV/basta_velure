# Hub Reports API (`/api/v1/hub/reports/...`) — Feature 1.10

## Overview
How a hub performed over a date range: **throughput**, **on-time rate**, and **per-rider efficiency**, with CSV downloads for the daily and rider tables. Read-only. Out of scope: financial or rider-fee reporting, and chart libraries.

All three endpoints require Sanctum authentication and an **approved hub** (`approved_sorting_center`, checked in the database on every request). The hub is always the authenticated user's own: nothing in the request names a hub, so another hub's data cannot be asked for.
- `401`: unauthenticated.
- `403`: the account is not a hub, or the hub is `PENDING`, `REJECTED` or `SUSPENDED`.
- `422`: a bad range, sort or report name (field errors, see Validation).

Every figure is a SQL aggregate over this hub's own parcels (`parcels.sorting_center_id`, soft-deleted parcels ignored). No parcel is loaded into memory.

---

## Metric definitions
These are shown to the hub in the UI ("How these numbers are calculated").

### Time
- A range is `from` and `to`, both **inclusive Asia/Manila calendar days** (`YYYY-MM-DD`). Default: the 30 days ending today (Manila). At most **366 days**.
- Timestamps are stored in UTC. A range becomes the UTC interval *from the start of `from` in Manila* (inclusive) *to the start of the day after `to` in Manila* (exclusive). An event at 23:59:59 Manila belongs to that day, one at 00:00:00 belongs to the next.
- **Each event is counted by its own timestamp** falling in the range, not by where the parcel started. A parcel received in September and delivered in October is a September *received* and an October *delivered*.

### Throughput (`totals`)
| Key | Counts | Timestamp |
|---|---|---|
| `received` | parcels scanned in at the hub | `parcels.scanned_in_at` |
| `sorted` | parcels sorted by destination | `parcels.sorted_at` |
| `dispatched` | parcels assigned to a rider | `parcels.assigned_at` |
| `delivered` | parcels delivered | `parcels.delivered_at` |
| `failed_attempts` | failed delivery attempts (one per attempt) | `delivery_logs.logged_at` of a `DELIVERY_FAILED` row |
| `returned` | parcels returned to the seller by the hub | `parcels.returned_at` |

### On time
A delivered parcel is **on time** when `delivered_at − scanned_in_at` is **at most** `sla_hours` (`config('logistics.delivery_sla_hours')`, env `LOGISTICS_DELIVERY_SLA_HOURS`, default 48). Exactly the SLA counts as on time; one second over does not.
- `on_time_deliveries`: how many.
- `on_time_rate` = on-time deliveries ÷ all deliveries in the range, as a fraction between 0 and 1. **`null` when there are no deliveries.** A delivery with no `scanned_in_at` is not on time (it still counts in the divisor).
- `success_rate` = `delivered` ÷ (`delivered` + `failed_attempts`), `null` when both are zero.

### Averages (hours, 2 decimals, `null` when there is no data)
- `avg_hub_dwell_hours`: `scanned_in_at` to `out_for_delivery_at`, for parcels whose `out_for_delivery_at` is in the range.
- `avg_delivery_hours`: `out_for_delivery_at` to `delivered_at`, for parcels delivered in the range.

### Per rider (`riders`)
`delivered`, `failed_attempts`, `success_rate`, `avg_delivery_hours`, `on_time_deliveries` and `on_time_rate`, with the same definitions as above, counted per rider.

**How an event is attributed to a rider (one rule for everything).** The rider is the rider on that event's **`delivery_logs` row**:
- A **failed attempt** is a `DELIVERY_FAILED` row. Each attempt is its own row, so a parcel that fails twice counts twice, for whoever made each attempt.
- A **delivery** is the parcel's `DELIVERED` row (the latest one, so a parcel delivered twice, for example after an admin reversal, is still one delivery).
- It never follows `parcels.assigned_rider_id`, which moves on when the hub reschedules a parcel to another rider. So **if rider A fails a parcel and rider B delivers it later, A gets the failed attempt and B gets the delivery.**

**Which riders are listed:** every `ACTIVE` rider of the hub (idle ones as zeros and `null` rates), plus any other rider of the hub (for example one disapproved since) who had activity in the range. `PENDING` and never-active riders are not listed.

### Known limits of the source data
- **Admin-delivered parcels are not counted.** When an admin marks an order delivered directly, the parcel becomes `DELIVERED` but never gets `delivered_at`, and no delivery log is written (only the rider-earnings row records it). With no timestamp they cannot belong to any range. `excluded.delivered_without_time` in the summary says how many such parcels the hub has (all time), so the gap is visible.
- **Only the latest `assigned_at` and `out_for_delivery_at` are kept.** A rescheduled parcel overwrites them, so `dispatched` counts the latest dispatch of a parcel, `avg_hub_dwell_hours` measures to its latest dispatch, and `avg_delivery_hours` measures the successful attempt. Failed attempts are the exception: every one is kept in `delivery_logs`.
- Failed attempts exist only when a rider reported them. A parcel an admin sets to `DELIVERY_FAILED` has no log and no attempt.

---

## 1. Summary: `GET /api/v1/hub/reports/summary?from=&to=`
```json
{
  "data": {
    "range": { "from": "2026-10-10", "to": "2026-10-12", "days": 3, "timezone": "Asia/Manila" },
    "sla_hours": 48,
    "totals": {
      "received": 5, "sorted": 4, "dispatched": 5, "delivered": 4, "failed_attempts": 2, "returned": 1,
      "on_time_deliveries": 3, "on_time_rate": 0.75, "success_rate": 0.6667,
      "avg_hub_dwell_hours": 28.6, "avg_delivery_hours": 3.75
    },
    "daily": [
      { "date": "2026-10-10", "received": 3, "delivered": 2, "failed": 0, "returned": 0 },
      { "date": "2026-10-11", "received": 1, "delivered": 0, "failed": 2, "returned": 0 },
      { "date": "2026-10-12", "received": 0, "delivered": 2, "failed": 0, "returned": 1 }
    ],
    "excluded": { "delivered_without_time": 0 }
  }
}
```
`daily` has **one row for every day in the range, zeros included**, so it always has `range.days` rows. Rates are fractions rounded to 4 places (`0.6667` = 66.67%).

## 2. Riders: `GET /api/v1/hub/reports/riders?from=&to=&sort=&direction=`
`sort`: `name`, `delivered` (default), `failed_attempts`, `success_rate`, `avg_delivery_hours`, `on_time_rate`. `direction`: `asc` or `desc` (default `desc`, `asc` for `name`). **Rows with a `null` value always sort last**, in either direction; ties are broken by name.
```json
{
  "data": {
    "range": { "from": "2026-10-10", "to": "2026-10-12", "days": 3, "timezone": "Asia/Manila" },
    "sla_hours": 48, "sort": "delivered", "direction": "desc",
    "riders": [
      {
        "rider_id": 7, "name": "Alice Alpha", "status": "ACTIVE", "vehicle_type": "Motorcycle", "plate_number": "AB-1234",
        "delivered": 2, "failed_attempts": 1, "success_rate": 0.6667,
        "avg_delivery_hours": 4, "on_time_deliveries": 2, "on_time_rate": 1
      }
    ]
  }
}
```

## 3. Export: `GET /api/v1/hub/reports/export?report=daily|riders&from=&to=&sort=&direction=`
A streamed download (`sort` and `direction` apply to `riders`).
- `Content-Type: text/csv; charset=UTF-8`, `Content-Disposition: attachment; filename="hub-<report>-report-<from>_to_<to>.csv"`, `Cache-Control: no-store`.
- UTF-8 **with a byte-order mark**, so Excel reads accents correctly.
- `daily` columns: `Date, Received, Delivered, Failed attempts, Returned` (one row per day).
- `riders` columns: `Rider, Delivered, Failed attempts, Success rate (%), Average delivery time (hours), On-time deliveries, On-time rate (%)`. Percentages are 0 to 100 with one decimal; a missing value is an **empty cell**, not 0.
- **Formula injection.** Rider names are typed by the riders. Any text cell that starts with `=`, `+`, `-` or `@` (or a tab or carriage return) is prefixed with an apostrophe so a spreadsheet reads it as text. Commas, quotes and line breaks are CSV-escaped.
- The file is built in the request with the same service as the JSON endpoints, so it always matches the screen.
- Because the API uses bearer tokens, a browser cannot download this by link: the web app fetches it as a blob and saves it.

## Validation
`422` with field errors for: a missing or malformed `from` or `to` (`YYYY-MM-DD`, and a real calendar date: `2026-02-30` is rejected), `from` after `to`, a range longer than **366 days** (error on `to`), an unknown `sort` or `direction`, and a missing or unknown `report` on the export. Missing `from`/`to` are not errors: they default to the last 30 days ending today in Manila.

## Data model
One additive migration with composite indexes for the range queries: `parcels (sorting_center_id, scanned_in_at | sorted_at | assigned_at | out_for_delivery_at | delivered_at | returned_at)` and `delivery_logs (outcome, logged_at)`. On a 50,000 row table the optimizer reads about 180 rows for a week-long range instead of scanning the hub's parcels.
