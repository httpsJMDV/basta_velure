# Admin: Riders page (account management)

A rider is **approved by the logistics hub they chose**, never by the admin (`docs/api/logistics-hub-riders.md`). The admin has no endpoint that approves or disapproves a rider application, and no "Rider Applications" page. The admin **Riders** page (`/admin/riders`) is account management only: list, view, suspend, reactivate. The admin still approves **hubs** (`/admin/sorting-center-applications`).

All routes need an admin token (`role:admin`); anyone else gets `403`.

## List riders

`GET /api/v1/admin/users?role=rider`

Query: `status` (`active` or `suspended`, the account status), `search` (name, email or phone), `page`, `per_page` (max 100).

Each row is the usual user payload plus a `rider` block (only on this role filter; other filters are unchanged):

```json
{
  "id": 41, "first_name": "Juan", "last_name": "Dela Rosa", "email": "...", "phone": "...",
  "role": "rider", "status": "active",
  "rider": {
    "id": 7,
    "status": "ACTIVE",
    "vehicle_type": "Motorcycle",
    "plate_number": "DEM-1001",
    "sorting_center_id": 3,
    "hub_name": "Demo Sorting Hub - Santa Cruz",
    "submitted_at": "2026-10-05T08:00:00+00:00",
    "created_at": "2026-10-05T08:00:00+00:00"
  }
}
```

`status` is the **account** status. `rider.status` is the **hub application** status: `PENDING`, `ACTIVE` (approved by the hub) or `DISAPPROVED`. No other rider status exists.

## Suspend and reactivate

`PATCH /api/v1/admin/users/{user}/suspend` and `PATCH /api/v1/admin/users/{user}/reactivate`

Both use the existing account mechanism (`users.status`) and return the updated user, including the `rider` block above. Suspending revokes all of the user's tokens and blocks sign-in (`403`, "Your account has been suspended ..."). The admin account cannot be suspended. Each action writes an activity-log entry. The rider's `rider.status` is not touched.

Known gap: dispatch eligibility (`RiderAreaCoverage`) looks only at `rider.status = ACTIVE`, so a suspended rider is still listed to the hub as an eligible rider until the hub reassigns. See "Parked issues" in `CLAUDE.md`.
