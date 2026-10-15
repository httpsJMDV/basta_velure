# Sign-in (`POST /api/v1/auth/login`)

One endpoint signs in every role (buyer, seller, admin, hub owner, rider). Throttled by `throttle:auth`: 5 attempts per minute per IP address, whichever way the person identifies themselves.

## Request

| Field | Type | Notes |
|---|---|---|
| `identifier` | string, max 255 | An **email address or a username**, matched case-insensitively and trimmed. An identifier containing `@` is looked up as an email, anything else as a username. |
| `email` | string, max 255 | The original key, still accepted and treated exactly like `identifier` (so it may carry a username too). Required only when `identifier` is absent. |
| `password` | string | Required. |

The format of the identifier is **not** validated: an unknown, malformed or over-long value is answered exactly like a wrong password, so the endpoint cannot be used to find out which emails or usernames exist.

## Responses

| Status | Body | When |
|---|---|---|
| `200` | `{ "data": <User>, "token": "..." }` | Credentials match and the account is allowed in. `data` is the same user payload as `GET /auth/me`. |
| `401` | `{ "message": "Invalid credentials." }` | Wrong password, unknown identifier, or malformed identifier. Always this exact body. |
| `403` | `{ "message": "..." }` | Credentials match but the account may not sign in (below). No token is issued. |
| `422` | field errors | Neither `identifier` nor `email` was sent, `password` is missing, or a value is not a string. |
| `429` | | Too many attempts. |

### The `403` gates (unchanged)

| Account | Message starts with |
|---|---|
| Suspended user | `Your account has been suspended ...` |
| Hub `PENDING` | `Your sorting center application is currently pending administrative approval ...` |
| Hub `REJECTED` | `Your sorting center application was not approved ...` |
| Hub `SUSPENDED` | `Your sorting center hub account has been suspended ...` |
| Rider `PENDING` | `Your rider application is currently pending hub approval ...` |
| Rider `DISAPPROVED` | `Your rider application was not approved ...` |

The gates run after the password check and apply the same whether the person typed their email or their username.

## Usernames

`users.username` is nullable and unique, stored in lowercase (the unique index is case-insensitive too). **Only the demo seeder (`php artisan demo:seed`) ever sets it.** It is not mass-assignable, no registration or profile request accepts it, and it appears in no API payload (`$hidden` on the model, and not in `UserResource`). Real accounts sign in with their email.

## Where each role lands (web app)

The server returns the same payload for everyone; the web app chooses the landing page from it. See `docs/demo-walkthrough.md`, "Where everything is".
