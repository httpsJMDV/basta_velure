# Buyer sign-up (`POST /api/v1/auth/register`)

Creates an unverified buyer account and emails a 6-digit code (`POST /auth/verify-email` finishes it). No token is
issued here. Throttled by `throttle:register`. JSON body.

## Request

| Field | Notes |
|---|---|
| `first_name`, `middle_name` (optional), `last_name` | Letters, spaces, `.`, `-`, `'`; at most 50. |
| `email` | Lower-cased and trimmed; must not belong to another account. |
| `phone` | `09XXXXXXXXX` or `+639XXXXXXXXX`; must not belong to another account. |
| `date_of_birth` | `YYYY-MM-DD`, 18 or older. |
| `password`, `password_confirmation` | 8+ characters with upper and lower case, a number and a symbol. |
| `accept_terms` | Must be accepted. |
| `address` | Optional object, added Nov 8, 2026 (the app's Address step; the website does not send it). |

`address` holds the places picked from the PSGC lists, names and codes together:

| Key | Notes |
|---|---|
| `region`, `region_code` | Optional. |
| `province`, `province_code` | Required with `address`. For NCR: `Metro Manila` and `130000000`. |
| `city_municipality`, `city_code` | Required with `address`. |
| `barangay`, `barangay_code` | Required with `address`. |
| `street_address` | Required with `address`, at most 255. |

Codes are strings of 9 or 10 digits (leading zeros matter). A half-filled `address` is refused with `422` and the
field named as `address.<key>` (`"Choose the barangay."`).

## What it saves

The account (status `unverified`), and with `address` a **Home** address in the address book, the default, under the
account's name and mobile number. It has its codes, so it is ready for checkout once the email is verified.

## Responses

| Status | Body |
|---|---|
| `201` | `{ "message", "verification_required": true, "email", "data": { "email", "status" } }` |
| `422` | `{ "message", "errors": { "<field>": ["..."] } }` |

Tests: `tests/Feature/AccountRegistrationTest.php`, `tests/Feature/SignUpAddressAndGooglePhotoTest.php`.
