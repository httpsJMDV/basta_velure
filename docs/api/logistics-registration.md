# Sorting Center (Logistics Hub) Registration API Contract

## Overview
This document specifies the backend API contract for registering a new **Logistics / Sorting Center Hub** in the Loved-IT marketplace platform.

- **Primary Route**: `POST /api/v1/auth/register-sorting-center`
- **Alias Route**: `POST /api/v1/auth/logistics/register`
- **Authentication**: Public / Guest route (`throttle:upload`)
- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`

After submission, the applicant user account and sorting center hub are created atomically. The hub is assigned an initial status of `PENDING` awaiting administrative vetting and approval. **No authentication token is issued upon registration**, and hub administrative tools remain inaccessible until formal approval.

---

## Request Fields

All fields marked with an asterisk (\*) are required.

| Field | Type | Rules | Description |
|---|---|---|---|
| `first_name`\* | `string` | `required`, `max:50` | Applicant's legal first name. |
| `middle_name` | `string` | `nullable`, `max:50` | Applicant's middle name or middle initial. |
| `last_name`\* | `string` | `required`, `max:50` | Applicant's legal last name. |
| `sex`\* | `string` | `required`, `in:male,female` | Biological sex of the applicant. |
| `email`\* | `string` | `required`, `email`, `max:100`, `unique:users,email` | Business/personal email address. Must be unique. |
| `phone`\* | `string` | `required`, `unique:users,phone`, valid format | Contact phone number (e.g., `+639171234567` or `09171234567`). Also accepts `contact_number` or `contact_no`. |
| `date_of_birth`\* | `string (date)` | `required`, `date`, `before:today`, age >= 18 | Date of birth (`YYYY-MM-DD`). Applicant must be at least 18 years old. Also accepts `birthday`. |
| `password`\* | `string` | `required`, `min:8`, `confirmed` | Account password (minimum 8 characters). |
| `password_confirmation`\* | `string` | `required` | Must match `password`. |
| `government_id_type`\* | `string` | `required`, `in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id,school_id` | Type of valid identification submitted. |
| `government_id_image`\* | `file` | `required`, `file`, `mimes:jpg,jpeg,png,pdf`, `max:5120` | Front photo or scan of valid ID (max 5MB). |
| `government_id_image_back` | `file` | `nullable`, `file`, `mimes:jpg,jpeg,png,pdf`, `max:5120` | Back photo or scan of ID (max 5MB). |
| `hub_name`\* | `string` | `required`, `max:150` | Registered business name or sorting hub name. Also accepts `business_name`. |
| `address_province`\* | `string` | `required`, `max:100` | Province name or PSGC province label. Also accepts `province`. |
| `address_city`\* | `string` | `required`, `max:100` | Municipality or city name. Also accepts `city_municipality` or `city`. |
| `address_barangay`\* | `string` | `required`, `max:100` | Barangay name. Also accepts `barangay`. |
| `address_street`\* | `string` | `required`, `max:255` | Street address, building, or unit details. Also accepts `street_address` or `street`. |
| `dti_permit`\* | `file` | `required`, `file`, `mimes:jpg,jpeg,png,pdf`, `max:5120` | Official DTI Business Registration or Mayor's Permit document (max 5MB). Also accepts `business_permit`. |
| `coverage_barangays`\* | `array` or `string (JSON)` | `required`, `array`, `min:1` | List of 9-to-10 digit PSGC barangay codes covered by this hub. |
| `coverage_barangays.*`\* | `string` | `required`, `distinct`, `regex:/^\d{9,10}$/` | Each barangay item must be a valid 9 or 10-digit PSGC code without duplicates. |

---

## File Upload Requirements

- Files must be submitted via `multipart/form-data`.
- **Allowed Document Formats**: `.jpg`, `.jpeg`, `.png`, `.pdf`
- **Maximum File Size**: `5120 KB` (5 Megabytes per file)
- **Storage Policy**: Stored on the private `ids` disk (`storage/app/private/ids/`) with randomized names to prevent unauthorized public access.

---

## Responses

### 1. Success Response (201 Created)

```json
{
  "message": "Sorting center registration submitted successfully. Please wait for administrator approval.",
  "data": {
    "user": {
      "id": 14,
      "first_name": "Juan",
      "middle_name": "Procopio",
      "last_name": "Dela Cruz",
      "email": "juan.hub@example.com",
      "phone": "+639171234567",
      "date_of_birth": "1992-05-15",
      "sex": "male",
      "buyer_application_status": null,
      "buyer_rejection_reason": null,
      "role": "buyer",
      "status": "active",
      "avatar_url": null,
      "government_id_type": "national_id",
      "government_id_image_url": "http://localhost:8000/api/v1/admin/buyer-applications/14/id-image",
      "government_id_image_back_url": null,
      "default_address": {
        "province": "Laguna",
        "city_municipality": "Santa Cruz",
        "barangay": "Poblacion I",
        "street_address": "123 Rizal St"
      },
      "has_password": true,
      "created_at": "2026-10-05T00:00:00+08:00"
    },
    "sorting_center": {
      "id": 4,
      "hub_name": "Laguna Central Sorting Hub",
      "status": "PENDING",
      "address_province": "Laguna",
      "address_city": "Santa Cruz",
      "address_barangay": "Poblacion I",
      "address_street": "123 Rizal St",
      "coverage_barangays": [
        "043404001",
        "043404002",
        "043404003"
      ],
      "created_at": "2026-10-05T00:00:00.000000Z"
    },
    "hub_status": "PENDING"
  }
}
```

### 2. Validation Error Response (422 Unprocessable Entity)

```json
{
  "message": "First name is required. (and 5 more errors)",
  "errors": {
    "first_name": [
      "First name is required."
    ],
    "email": [
      "This email address is already registered."
    ],
    "address_province": [
      "Province is required."
    ],
    "dti_permit": [
      "The DTI permit must be a JPG, PNG, or PDF file.",
      "The DTI permit file must not exceed 5MB."
    ],
    "coverage_barangays": [
      "At least one coverage barangay is required."
    ],
    "coverage_barangays.0": [
      "Invalid PSGC code. Each coverage barangay must be a valid 9 or 10-digit PSGC code."
    ]
  }
}
```
