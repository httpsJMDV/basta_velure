# Sorting Center Admin Approval & Queue API Contract

## Overview
This document specifies the backend API contract for administrative vetting, review, approval, rejection, and document inspection of **Logistics / Sorting Center Hub** applications.

- **Base Path**: `/api/v1/admin/sorting-center-applications`
- **Authentication**: `auth:sanctum`
- **Authorization**: `role:admin` (Only users with `role === 'admin'` can access these endpoints)
- **Headers Required**:
  - `Authorization: Bearer <admin_token>`
  - `Accept: application/json`

---

## Endpoints

### 1. List Applications (Queue)
Retrieves a paginated list of hub applications with filtering and search capabilities.

- **Method**: `GET`
- **Route**: `/api/v1/admin/sorting-center-applications`
- **Query Parameters**:
  | Parameter | Type | Default | Description |
  |---|---|---|---|
  | `status` | `string` | `PENDING` | Filter by application status: `PENDING`, `APPROVED`, `REJECTED`, or `all` |
  | `search` | `string` | `null` | Searches hub name, province, city, or applicant first name, last name, email |
  | `sort` | `string` | `newest` | `newest` (descending by `created_at`) or `oldest` (ascending) |
  | `per_page` | `integer`| `30` | Number of items per page (max 100) |
  | `page` | `integer`| `1` | Page number |

#### Success Response (`200 OK`)
```json
{
  "data": [
    {
      "id": 1,
      "hub_name": "Laguna Central Sorting Hub",
      "address_city": "Santa Cruz",
      "address_province": "Laguna",
      "city_province": "Santa Cruz, Laguna",
      "applicant_name": "Juan Dela Cruz",
      "applicant_email": "juan.hub@example.com",
      "submitted_date": "2026-10-05T01:00:00+08:00",
      "created_at": "2026-10-05T01:00:00+08:00",
      "status": "PENDING"
    }
  ],
  "links": {
    "first": "http://localhost:8000/api/v1/admin/sorting-center-applications?page=1",
    "last": "http://localhost:8000/api/v1/admin/sorting-center-applications?page=1",
    "prev": null,
    "next": null
  },
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 1,
    "per_page": 30,
    "to": 1,
    "total": 1
  }
}
```

---

### 2. Show Application Detail
Retrieves the complete profile of a single sorting center application including coverage area, applicant identity, and authenticated document endpoints.

- **Method**: `GET`
- **Route**: `/api/v1/admin/sorting-center-applications/{id}`

#### Success Response (`200 OK`)
```json
{
  "data": {
    "id": 1,
    "hub_name": "Laguna Central Sorting Hub",
    "status": "PENDING",
    "address_province": "Laguna",
    "address_city": "Santa Cruz",
    "address_barangay": "Poblacion I",
    "address_street": "123 Hub Blvd",
    "coverage_barangays": [
      "043404001",
      "043404002",
      "043404003"
    ],
    "coverage_count": 3,
    "rejection_reason": null,
    "reviewed_by": null,
    "reviewed_at": null,
    "created_at": "2026-10-05T01:00:00+08:00",
    "updated_at": "2026-10-05T01:00:00+08:00",
    "dti_permit_url": "http://localhost:8000/api/v1/admin/sorting-center-applications/1/dti-permit",
    "applicant": {
      "id": 12,
      "first_name": "Juan",
      "middle_name": "Santos",
      "last_name": "Dela Cruz",
      "email": "juan.hub@example.com",
      "phone": "+639171234567",
      "sex": "male",
      "date_of_birth": "1992-05-15",
      "status": "active",
      "government_id_type": "national_id",
      "government_id_image_url": "http://localhost:8000/api/v1/admin/sorting-center-applications/1/id-image",
      "government_id_image_back_url": null
    }
  }
}
```

---

### 3. Approve Application
Approves a pending application, transitions hub status to `APPROVED`, activates the owner user account, logs administrative activity, and sends an approval email to the applicant.

- **Method**: `POST`
- **Route**: `/api/v1/admin/sorting-center-applications/{id}/approve`
- **Body**: None required

#### Success Response (`200 OK`)
```json
{
  "message": "Sorting center application approved successfully."
}
```

#### State Conflict Error (`422 Unprocessable Entity`)
Occurs if the hub is not in `PENDING` status (e.g. already approved or rejected):
```json
{
  "message": "Only pending sorting center applications can be approved."
}
```

---

### 4. Reject Application
Rejects a pending application, records the administrative rejection reason, keeps the owner user account blocked from hub login, logs administrative activity, and sends a rejection email containing the reason.

- **Method**: `POST`
- **Route**: `/api/v1/admin/sorting-center-applications/{id}/reject`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "reason": "The submitted DTI Business Registration certificate has expired and does not match the indicated hub jurisdiction."
  }
  ```

#### Validation Rules:
| Field | Type | Rules | Description |
|---|---|---|---|
| `reason` | `string` | `required`, `string`, `max:500` | Detailed explanation of why the application was rejected. |

#### Success Response (`200 OK`)
```json
{
  "message": "Sorting center application rejected successfully."
}
```

#### Validation Error (`422 Unprocessable Entity`)
```json
{
  "message": "A rejection reason is required.",
  "errors": {
    "reason": [
      "A rejection reason is required."
    ]
  }
}
```

#### State Conflict Error (`422 Unprocessable Entity`)
Occurs if the application is not `PENDING`:
```json
{
  "message": "Only pending sorting center applications can be rejected."
}
```

---

### 5. Document Inspection Endpoints (Private Storage)
Documents are stored on the private `ids` disk (`storage/app/private/ids/`) and cannot be accessed publicly. Authenticated admins retrieve raw files via these endpoints:

1. **DTI / Mayor's Permit**:
   - `GET /api/v1/admin/sorting-center-applications/{id}/dti-permit`
   - Returns binary file response (`application/pdf`, `image/jpeg`, or `image/png`).
2. **Applicant Front ID**:
   - `GET /api/v1/admin/sorting-center-applications/{id}/id-image`
3. **Applicant Back ID**:
   - `GET /api/v1/admin/sorting-center-applications/{id}/id-image-back`

---

## Authentication & Authorization Errors

- **`401 Unauthorized`**:
  ```json
  {
    "message": "Unauthenticated."
  }
  ```
- **`403 Forbidden`** (Logged in as buyer/seller instead of admin):
  ```json
  {
    "message": "Unauthorized."
  }
  ```
- **`404 Not Found`** (Invalid application ID or file missing on disk):
  ```json
  {
    "message": "Record not found."
  }
  ```

---

## Login Gating for Hub Accounts
When users attempt to log in at `POST /api/v1/auth/login`:
- If linked to a `PENDING` sorting center:
  ```json
  {
    "message": "Your sorting center application is currently pending administrative approval. You will receive an email notification once reviewed."
  }
  ```
  *(Status: `403 Forbidden`)*
- If linked to a `REJECTED` sorting center:
  ```json
  {
    "message": "Your sorting center application was not approved. Please check your email for details or contact support."
  }
  ```
  *(Status: `403 Forbidden`)*
- If linked to an `APPROVED` sorting center:
  Returns standard `200 OK` with auth token.
