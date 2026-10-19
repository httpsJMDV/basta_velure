# Logistics / Sorting Center — Hub Rider Vetting & Area Mapping API Contract

## Overview
This document specifies the backend API endpoints for Logistics / Sorting Center Hubs to inspect, review, approve, disapprove, and assign delivery coverage areas to courier applicants who selected their hub.

- **Who approves a rider**: only the hub the rider chose, through `POST /hub/riders/{rider}/approve` and `/disapprove` below. There is no admin route that approves or disapproves a rider, and an admin token on these hub routes gets `403` (the admin owns no hub). The admin only suspends or reactivates the account (`docs/api/admin-riders.md`).
- **Base Prefix**: `/api/v1/hub`
- **Authentication**: `auth:sanctum`
- **Authorization**: `approved_sorting_center` middleware (strictly scoped to the authenticated hub manager's hub account with `status = 'APPROVED'`).
- **Isolation Rule**: Any attempt to access, view, or modify a courier or assignment belonging to another hub returns `404 Not Found` (never 403).

---

## 1. Hub Coverage Options

### Route
`GET /api/v1/hub/coverage-options`

### Description
Returns the authenticated hub's operational jurisdiction and designated PSGC barangay coverage codes.

### Response (200 OK)
```json
{
  "data": {
    "hub_id": 1,
    "hub_name": "Calamba Sorting Center",
    "address_city": "Calamba",
    "address_province": "Laguna",
    "coverage_barangays": [
      "043405001",
      "043405002",
      "043405003"
    ]
  }
}
```

---

## 2. Hub-Scoped Courier List

### Route
`GET /api/v1/hub/riders`

### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `string` | No | Filter by application status: `PENDING` (default), `ACTIVE`, `DISAPPROVED`, or `all`. |
| `search` | `string` | No | Search query matching first name, last name, email, phone, or plate number (max 100 characters, else `422`). |
| `sort` | `string` | No | Sort order: `newest` (default, newest submitted first) or `oldest`. |
| `per_page` | `integer` | No | Number of records per page (default: `20`, max: `100`). |
| `page` | `integer` | No | Page number for pagination. |

### Response (200 OK)
```json
{
  "data": [
    {
      "id": 14,
      "user": {
        "id": 52,
        "first_name": "Danilo",
        "last_name": "Reyes",
        "email": "danilo.rider@example.com",
        "phone": "+639181234567"
      },
      "vehicle_type": "Motorcycle",
      "plate_number": "ND 1234",
      "status": "PENDING",
      "submitted_at": "2026-10-05T04:00:00+08:00",
      "active_areas_count": 0,
      "created_at": "2026-10-05T04:00:00+08:00"
    }
  ],
  "counts": {
    "pending": 5,
    "active": 12,
    "disapproved": 2,
    "all": 19
  },
  "meta": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 20,
    "total": 1,
    "from": 1,
    "to": 1
  }
}
```

---

## 3. Courier Application Detail

### Route
`GET /api/v1/hub/riders/{rider}`

### Description
Returns full application profile, residential address, vehicle info, review status, area assignments, and secure private document URLs.

### Response (200 OK)
```json
{
  "data": {
    "id": 14,
    "user": {
      "id": 52,
      "first_name": "Danilo",
      "middle_name": "Santos",
      "last_name": "Reyes",
      "email": "danilo.rider@example.com",
      "phone": "+639181234567",
      "date_of_birth": "1995-03-20",
      "sex": "male",
      "created_at": "2026-10-05T04:00:00+08:00"
    },
    "address": {
      "province": "Laguna",
      "city": "Calamba",
      "barangay": "Real",
      "street": "789 Rider St"
    },
    "vehicle_type": "Motorcycle",
    "plate_number": "ND 1234",
    "status": "PENDING",
    "rejection_reason": null,
    "reviewed_by": null,
    "reviewer_name": null,
    "reviewed_at": null,
    "submitted_at": "2026-10-05T04:00:00+08:00",
    "created_at": "2026-10-05T04:00:00+08:00",
    "documents": {
      "or_cr_url": "http://localhost:8000/api/v1/hub/riders/14/or-cr",
      "drivers_license_url": "http://localhost:8000/api/v1/hub/riders/14/license"
    },
    "area_assignments": []
  }
}
```

---

## 4. Secure Document Streaming Routes

### Routes
- `GET /api/v1/hub/riders/{rider}/or-cr`
- `GET /api/v1/hub/riders/{rider}/license`

### Description
Streams private OR/CR and Driver's License files stored on the private `ids` disk (`storage/app/private/ids`).
- **Content-Type**: `image/jpeg`, `image/png`, or `application/pdf`.
- **401 Unauthorized**: Returns clean JSON when request is unauthenticated.
- **403 Forbidden**: When user is not an approved hub manager.
- **404 Not Found**: If rider belongs to another hub or file does not exist.

---

## 5. Approve Courier Application

### Route
`POST /api/v1/hub/riders/{rider}/approve`

### Description
Approves a `PENDING` courier application, changing status to `ACTIVE`. Optionally creates an initial delivery area assignment in the same transaction.

### Request Body (JSON)
| Field | Type | Required | Description |
|---|---|---|---|
| `area_label` | `string` | No | Area name (e.g. `Area A - Calamba Poblacion`): 3 to 60 characters with at least two letters; letters, digits, spaces and `. , ' & ( ) / # -` only, starting with a letter or digit; runs of spaces are collapsed. `T`, `!!!` or `12345` is a `422`. Required if `coverage_barangays` is provided. |
| `coverage_barangays` | `array` | No | List of 9-to-10 digit PSGC barangay codes. Each must be within hub's coverage. Required if `area_label` is provided. |
| `coverage_barangays.*` | `string` | Yes (if array provided) | PSGC barangay code. |

### Response (200 OK)
```json
{
  "message": "Courier application approved successfully.",
  "data": {
    "id": 14,
    "status": "ACTIVE",
    "reviewed_by": 10,
    "reviewer_name": "Hub Manager",
    "reviewed_at": "2026-10-05T04:30:00+08:00",
    "area_assignments": [
      {
        "id": 1,
        "rider_id": 14,
        "sorting_center_id": 1,
        "area_label": "Area A - Calamba Poblacion",
        "coverage_barangays": ["043405001"],
        "is_active": true,
        "created_at": "2026-10-05T04:30:00+08:00"
      }
    ]
  }
}
```

---

## 6. Disapprove Courier Application

### Route
`POST /api/v1/hub/riders/{rider}/disapprove`

### Description
Disapproves a `PENDING` courier application with a required reason. Status becomes `DISAPPROVED`.

### Request Body (JSON)
| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | `string` | Yes | Explanation for disapproval, shown to the applicant: 10 to 500 characters with at least three letters (`no` or `1234567890` is a `422`). |

### Response (200 OK)
```json
{
  "message": "Courier application disapproved successfully.",
  "data": {
    "id": 14,
    "status": "DISAPPROVED",
    "rejection_reason": "Driver's license photo is blurry and illegible. Please submit a clearer copy.",
    "reviewed_by": 10,
    "reviewer_name": "Hub Manager",
    "reviewed_at": "2026-10-05T04:30:00+08:00"
  }
}
```

---

## 7. Delivery Area Assignment Management

### 7.1 List Rider Areas
- **Route**: `GET /api/v1/hub/riders/{rider}/areas`
- **Response**: List of assignments belonging to this rider.

### 7.2 Create Rider Area
- **Route**: `POST /api/v1/hub/riders/{rider}/areas`
- **Requirements**:
  - Rider must be `ACTIVE`.
  - `area_label`: string, 3 to 60 characters with at least two letters; letters, digits, spaces and `. , ' & ( ) / # -` only, starting with a letter or digit; runs of spaces are collapsed. `T`, `!!!` or `12345` is a `422`; unique among active assignments for this rider. The same rule applies when renaming an area.
  - `coverage_barangays`: array of PSGC codes (min 1, distinct, all within hub's coverage).
- **Response (201 Created)**:
```json
{
  "message": "Delivery area assigned successfully.",
  "data": {
    "id": 2,
    "rider_id": 14,
    "sorting_center_id": 1,
    "area_label": "Area B - San Cristobal",
    "coverage_barangays": ["043405002"],
    "is_active": true,
    "created_at": "2026-10-05T04:32:00+08:00",
    "updated_at": "2026-10-05T04:32:00+08:00"
  }
}
```

### 7.3 Update Rider Area
- **Route**: `PUT /api/v1/hub/riders/{rider}/areas/{area}`
- **Fields**: `area_label`, `coverage_barangays`, `is_active`.
- **Response (200 OK)**.

### 7.4 Deactivate Rider Area
- **Route**: `DELETE /api/v1/hub/riders/{rider}/areas/{area}`
- **Action**: Sets `is_active = false` (soft deactivation; preserves delivery history).
- **Response (200 OK)**:
```json
{
  "message": "Area assignment deactivated successfully.",
  "data": {
    "id": 2,
    "is_active": false
  }
}
```

---

## 8. Error Responses

### 8.1 State Conflict (422 Unprocessable Content)
When attempting to approve/disapprove a rider whose status is not `PENDING`:
```json
{
  "message": "Only pending rider applications can be approved."
}
```

### 8.2 Validation Error (422 Unprocessable Content)
When assigning a barangay outside the hub's jurisdiction:
```json
{
  "message": "The selected barangay 999999999 is outside this logistics hub's coverage area.",
  "errors": {
    "coverage_barangays": [
      "Barangay 999999999 does not belong to this hub's jurisdiction."
    ]
  }
}
```

### 8.3 Cross-Hub Isolation (404 Not Found)
When a hub manager attempts to access another hub's courier:
```json
{
  "message": "Rider not found."
}
```
