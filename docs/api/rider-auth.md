# Rider Authentication & Route Guard API (`/api/v1/rider`)

## Overview
This specification details the authentication flow, role-guard middleware (`approved_rider`), and profile endpoints for registered delivery riders/couriers in the Loved-IT platform.

---

## 1. Middleware: `approved_rider`

Applied to all endpoints in the `/api/v1/rider/*` route group following `auth:sanctum`.
On **every request**, the middleware queries the database directly (`Rider::where('user_id', $user->id)->first()`) rather than relying on cached session/token claims, guaranteeing immediate revocation if a rider's application or active status changes mid-session.

### Validation Rules
1. User must be authenticated via Laravel Sanctum (otherwise returns `401 Unauthorized`).
2. User must possess the `rider` role (`$user->role === 'rider'`).
3. User must have an associated `Rider` profile record.
4. The `Rider` profile status must be `ACTIVE`.

### Response Matrix

| Condition | HTTP Status | Response Payload | Description |
| :--- | :---: | :--- | :--- |
| **Unauthenticated** | `401` | `{"message": "Unauthenticated."}` | Missing, expired, or revoked Bearer token. |
| **Non-Rider Role** | `403` | `{"message": "Access denied. Rider account required."}` | User is authenticated (e.g. buyer, seller, admin, hub) but is not a courier. |
| **Rider Profile Missing** | `403` | `{"message": "Rider profile not found."}` | User role is `rider` but no database record exists in `riders`. |
| **Pending Approval** | `403` | `{"message": "Your rider application is currently pending hub approval."}` | Courier has registered but sorting center hub has not yet reviewed/approved the application. |
| **Disapproved** | `403` | `{"message": "Your rider application was not approved."}` | Sorting center hub has rejected/disapproved the courier application. |
| **Inactive / Suspended** | `403` | `{"message": "Rider account is not active."}` | Status is neither `ACTIVE`, `PENDING`, nor `DISAPPROVED`. |
| **Approved (`ACTIVE`)** | `200` | Proceeds to controller action | Courier is verified and authorized. |

---

## 2. Endpoints

### 2.1 Get Authenticated Rider Profile (`GET /api/v1/rider/me`)
Retrieves the logged-in courier's profile summary, affiliated hub info, and currently active delivery area assignments.

- **Headers**:
  - `Authorization: Bearer <sanctum_token>`
  - `Accept: application/json`

#### Response: `200 OK`
```json
{
  "data": {
    "id": 12,
    "user_id": 45,
    "first_name": "Juan",
    "last_name": "Dela Cruz",
    "full_name": "Juan Dela Cruz",
    "email": "juan.rider@example.ph",
    "phone": "09171234567",
    "status": "ACTIVE",
    "vehicle_type": "Motorcycle",
    "plate_number": "ND-12345",
    "hub": {
      "id": 3,
      "hub_name": "Metro Manila Central Hub",
      "address_city": "Quezon City",
      "address_province": "Metro Manila"
    },
    "active_areas": [
      {
        "id": 5,
        "area_label": "Area A - Central District",
        "barangays_count": 4,
        "coverage_barangays": ["137404001", "137404002", "137404003", "137404004"]
      }
    ],
    "active_areas_count": 1,
    "submitted_at": "2026-10-04T12:00:00.000000Z",
    "created_at": "2026-10-04T12:00:00.000000Z"
  }
}
```

*Note: Sensitive documents (OR/CR, driver's license paths) and other couriers' data are strictly omitted from this endpoint.*

---

### 2.2 Logout (`POST /api/v1/auth/logout`)
Revokes the current Sanctum personal access token. Reuses the standard authentication endpoint.

- **Headers**:
  - `Authorization: Bearer <sanctum_token>`
  - `Accept: application/json`

#### Response: `200 OK`
```json
{
  "message": "Logged out."
}
```
Subsequent requests using the revoked token will receive a `401 Unauthorized` response.
