# Rider Applications API Contract

## Overview

A rider joins Loved-IT in one of two ways. Both end with the same one-time activation email (`docs/api/rider-auth.md`).

1. **The courier company adds them** from its Riders page (`POST /logistics/riders`, `docs/api/courier-operations.md`).
   The rider starts `PENDING_ACTIVATION` and gets the activation email at once.
2. **They apply on the public "Become a rider" form** (`/register/rider`, `POST /auth/register-rider`, this document).
   The application is `PENDING` and has **no usable password**. The hub they chose, or that hub's courier company,
   approves it (the rider moves to `PENDING_ACTIVATION` and gets the activation email) or rejects it with a reason (the
   rider is emailed the reason and may apply again with the same email).

A rider account is separate from a shopping account: the email and mobile number must not belong to another account.

- **Endpoints**:
  - `GET /api/v1/logistics/hubs`: public list of approved hubs, with their courier (`courier_id` narrows it to one courier).
  - `POST /api/v1/auth/register-rider`: the application (guest, `throttle:register` + `throttle:upload`, `multipart/form-data`).
  - `POST /api/v1/auth/apply-rider`: kept for old clients; a signed-in buyer gets **403** and is told to apply on the
    public form with a different email.
- **Who decides**: the hub's Riders page (`POST /hub/riders/{rider}/approve|disapprove`, `docs/api/logistics-hub-riders.md`)
  and the courier's Riders page (`POST /logistics/riders/{rider}/approve|reject`). Whoever acts first decides; the
  other gets **409** (courier) or **422** (hub) afterwards. The courier cannot suspend an application (**409**).
- **Sharing**: the hub's Riders page shows a link and QR code to `/register/rider?hub={id}` (the hub is picked); the
  courier's Riders page shows `/register/rider?courier={id}` (the list shows only its hubs).

---

## 1. Apply

### Route

`POST /api/v1/auth/register-rider`

### Body (`multipart/form-data`)

| Field | Rule |
|---|---|
| `sorting_center_id` | An `APPROVED` hub whose courier company is `APPROVED` |
| `first_name`, `last_name` | Person name rules; `middle_name` optional |
| `date_of_birth` | `Y-m-d`, 18 or older |
| `email` | Valid, max 100, not used by another account (see "Applying again") |
| `phone` | Philippine mobile, not used by another account |
| `license_number` | LTO format `A00-00-000000`, not on another rider (rejected riders excepted) |
| `license_expiry` | Today or later (Asia/Manila) |
| `vehicle_type` | `Motorcycle`, `Tricycle`, `Car` or `Van` |
| `plate_number` | 2 to 10 letters and digits, not on another rider (compared without spaces or hyphens) |
| `drivers_license_image`, `or_cr_image` | JPG, PNG or PDF, up to 5 MB (private `ids` disk) |
| `accept_terms` | Accepted |

### What it does

- Creates the user (`role = rider`, `status = pending_activation`, random password nobody knows) and the rider
  (`status = PENDING`, `applied_at = now`, the hub's courier as `logistics_company_id`).
- Audit log `rider.applied` (actor role `applicant`).
- Emails the applicant "We received your Loved-IT rider application" and the hub owner "New courier application";
  the hub owner also gets an in-app notification linking to `/hub/riders?tab=PENDING`.

### Response `201`

```json
{
  "message": "Application sent to Agos Logistics Biñan Hub. We will email pedro@example.com when they decide.",
  "data": {
    "email": "pedro@example.com",
    "hub": "Agos Logistics Biñan Hub",
    "courier": "Agos Logistics",
    "reapplied": false,
    "applied_at": "2026-10-25T07:30:00+00:00"
  }
}
```

### Errors

- **422** with field errors. An email that is already waiting gets: "You already applied with this email. {hub} is
  reviewing it, and we will email you their decision." Any other existing account: "This email already has a
  Loved-IT account. Riders sign in with an email of their own, so use a different one."

### Applying again

When the email belongs to a rejected application that never activated (`applied_at` set, `DISAPPROVED`,
user `pending_activation`), the same user and rider rows are updated: new details, new documents (the old files are
deleted), `status = PENDING`, the reason and reviewer cleared. The response has `reapplied: true` and the audit log
`rider.reapplied`. The same mobile number, license and plate are allowed again.

---

## 2. Decisions

An application is a rider with `applied_at` set, `activated_at` null and `status = PENDING` (`Rider::isApplicant()`).
The hub and courier rider payloads carry `applicant` (bool) and `applied_at`; the courier summary adds
`applications` (and `pending_verification` no longer counts applications).

| Action | Result |
|---|---|
| Approve (hub or courier) | `PENDING_ACTIVATION`, `reviewed_by`/`reviewed_at` set, audit `rider.application_approved`, activation email "Your Loved-IT rider application is approved" (link works once, 24 hours; the courier can resend it). The hub may add an initial delivery area in the same call. |
| Reject (hub `disapprove`, courier `reject`) | `DISAPPROVED` with `rejection_reason`, audit `rider.application_rejected`, email "Update on your Loved-IT rider application" with the reason and an **Apply again** link (`/register/rider?hub={id}`). |

A rider added by the courier, or an older `PENDING` rider who already has a password, keeps the old behaviour:
approving makes them `ACTIVE` directly.

---

## 3. Signing in before activation

`POST /auth/login` answers **403** for an applicant:

| `code` | When | Message |
|---|---|---|
| `rider_application_pending` | Waiting for the hub | "Your rider application is still being reviewed by {hub}. We will email you a link to set your password once they approve it." |
| `rider_application_rejected` | Rejected | "Your rider application was not approved. The email we sent you has the reason, and you can apply again on the Become a rider page." (The reason is not shown here, since anyone can type an email.) |
| `pending_activation` | Approved, or added by the courier, but no password yet | Unchanged |
