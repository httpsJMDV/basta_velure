# Rider / Courier Registration API Contract

## Overview
This document specifies the backend API contract for registering a new **Rider / Courier** and fetching the public directory of approved sorting center hubs in the Loved-IT marketplace platform.

- **Endpoints**:
  - `GET /api/v1/logistics/hubs` — Public directory of approved sorting centers for hub selection.
  - `POST /api/v1/auth/register-rider` — Courier applicant registration with document uploads.
- **Authentication**: Public / Guest endpoints (registration rate-limited under `throttle:upload` and `throttle:auth`).
- **Content-Type**:
  - `GET /api/v1/logistics/hubs`: `application/json`
  - `POST /api/v1/auth/register-rider`: `multipart/form-data`
- **Accept**: `application/json`

---

## 1. Public Approved Hubs Directory

### Route
`GET /api/v1/logistics/hubs`

### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `search` | `string` | No | Case-insensitive search query matching hub name, city, or province. |
| `limit` | `integer` | No | Maximum number of hubs to return (default: `100`, max: `100`). |

### Response (200 OK)
Returns a sanitized list of active hubs with `status = 'APPROVED'`. Sensitive fields (such as owner info, permit paths, coverage lists) are omitted.

```json
{
  "data": [
    {
      "id": 1,
      "hub_name": "Manila Central Sorting Hub",
      "address_city": "City of Manila",
      "address_province": "Metro Manila"
    },
    {
      "id": 2,
      "hub_name": "Quezon City Logistics Hub",
      "address_city": "Quezon City",
      "address_province": "Metro Manila"
    }
  ]
}
```

---

## 2. Rider Registration Endpoint

### Route
`POST /api/v1/auth/register-rider`

### Request Fields

All fields marked with an asterisk (\*) are required.

| Field | Type | Rules | Description |
|---|---|---|---|
| `first_name`\* | `string` | `required`, `max:50` | Legal first name of the rider applicant. |
| `middle_name` | `string` | `nullable`, `max:50` | Middle name or middle initial. |
| `last_name`\* | `string` | `required`, `max:50` | Legal last name. |
| `sex`\* | `string` | `required`, `in:male,female` | Biological sex of the applicant. |
| `email`\* | `string` | `required`, `email`, `max:100`, `unique:users,email` | Email address (unique across all user accounts). |
| `phone`\* | `string` | `required`, `unique:users,phone`, Philippine format | Contact mobile number (e.g. `09171234567` or `+639171234567`). Also accepts `contact_number` or `contact_no`. |
| `date_of_birth`\* | `string (date)` | `required`, `date`, `before:today`, age >= 18 | Date of birth (`YYYY-MM-DD`). Applicant must be at least 18 years old. Also accepts `birthday`. |
| `password`\* | `string` | `required`, `min:8`, `confirmed` | Account password (minimum 8 characters). |
| `password_confirmation`\* | `string` | `required` | Must match `password`. |
| `address_province`\* | `string` | `required`, `max:100` | Province name (PSGC province label). Also accepts `province`. |
| `address_city`\* | `string` | `required`, `max:100` | City / Municipality name (PSGC city label). Also accepts `city_municipality` or `city`. |
| `address_barangay`\* | `string` | `required`, `max:100` | Barangay name (PSGC barangay label). Also accepts `barangay`. |
| `address_street`\* | `string` | `required`, `max:255` | Street address, building number, or house number. Also accepts `street_address` or `street`. |
| `sorting_center_id`\* | `integer` | `required`, `exists:sorting_centers,id` | ID of the target hub. Must be an `APPROVED` sorting center. Also accepts `hub_id`. |
| `vehicle_type`\* | `string` | `required`, `in:Motorcycle,Tricycle,Car,Van` | Motorized delivery vehicle type. Case-insensitive in request. |
| `plate_number`\* | `string` | `required`, `max:20`, `regex:/^[A-Z0-9\s\-]+$/i` | Vehicle license plate number. Automatically trimmed and converted to uppercase. |
| `or_cr_image`\* | `file` | `required`, `file`, `mimes:jpg,jpeg,png,pdf`, `max:5120` | Front/clear image or PDF of Official Receipt / Certificate of Registration (OR/CR) (max 5MB). |
| `drivers_license_image`\* | `file` | `required`, `file`, `mimes:jpg,jpeg,png,pdf`, `max:5120` | Front/clear image or PDF of Driver's License or Government ID (max 5MB). |

### Document Storage & Security
- Both `or_cr_image` and `drivers_license_image` are stored in the private `ids` disk (`storage/app/private/ids/` in directories `rider_or_cr` and `rider_licenses`).
- If an exception occurs during account creation, uploaded files are rolled back immediately.
- Documents are never publicly accessible via direct web URLs.

---

## 3. Responses & Error Codes

### 1. Success Response (201 Created)
Returns applicant user info and rider summary. **Note**: No Sanctum auth token is issued upon registration.

```json
{
  "message": "Courier registration submitted successfully. Your application is pending hub approval.",
  "data": {
    "user": {
      "id": 42,
      "first_name": "Juan",
      "last_name": "Dela Cruz",
      "email": "juan.rider@example.com",
      "role": "rider"
    },
    "rider": {
      "id": 15,
      "status": "PENDING",
      "vehicle_type": "Motorcycle",
      "plate_number": "ABC 1234",
      "sorting_center_id": 1,
      "hub_name": "Manila Central Sorting Hub",
      "submitted_at": "2026-10-05T04:00:00+08:00"
    }
  }
}
```

### 2. Validation Error (422 Unprocessable Content)
Standard Laravel 422 JSON validation shape:

```json
{
  "message": "Courier applicant must be at least 18 years old to register.",
  "errors": {
    "date_of_birth": [
      "Courier applicant must be at least 18 years old to register."
    ],
    "sorting_center_id": [
      "The selected logistics hub is not approved or does not exist."
    ],
    "or_cr_image": [
      "Official Receipt / Certificate of Registration (OR/CR) document is required."
    ]
  }
}
```

### 3. Login Gating (403 Forbidden)
When a registered rider attempts to log in via `POST /api/v1/auth/login`:

- **Pending Approval (`status = 'PENDING'`)**:
```json
{
  "message": "Your rider application is currently pending hub approval. You will receive an email notification once reviewed."
}
```

- **Disapproved Application (`status = 'DISAPPROVED'`)**:
```json
{
  "message": "Your rider application was not approved. Please check your email for details or contact support."
}
```
