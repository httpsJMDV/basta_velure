# Continue with Google (`POST /api/v1/auth/google`)

Signs in, or creates a buyer account for, the Google user behind a Google token. The website sends an **access
token** from its Google button; the mobile app sends an **ID token** from `google_sign_in`. Throttled by
`throttle:auth`.

Changed Oct 29, 2026 (amaru.md, security checklist): the server now checks **which OAuth client Google issued the
token to**. It used to read the profile of any access token, so a token another app had obtained from the same
Google user could sign in here.

## Request

| Field | Type | Notes |
|---|---|---|
| `credential` | string, required | A Google ID token (a JWT: three dot-separated parts) or a Google access token. |

## How the token is checked

1. `GET https://oauth2.googleapis.com/tokeninfo` with `id_token=` (a JWT) or `access_token=` (anything else). Google
   answers only for a token that is valid and not expired.
2. The token's `aud` or `azp` must be one of `services.google.client_ids` (env `GOOGLE_CLIENT_IDS`, comma separated).
   Put the website's web client ID there (`VITE_GOOGLE_CLIENT_ID`); the app asks Google to sign its ID tokens for that
   same client, so `aud` is the web client ID and `azp` is the Android client.
3. An ID token must also come from `accounts.google.com` with `email_verified` true; its claims are the profile
   (`email`, `given_name`, `family_name`, `picture`). An access token's profile comes from
   `GET https://www.googleapis.com/oauth2/v3/userinfo`, as before.

With `GOOGLE_CLIENT_IDS` empty, Google sign-in is off (`503`): the server never accepts a token it can't attribute.

## Responses

| Status | Body | When |
|---|---|---|
| `200` | `{ "data": <User>, "token": "..." }` | A finished account signs in. |
| `200` | `{ "data", "token", "profile_incomplete": true, "google_avatar_url" }` | A Google account that still has to finish its profile (birthday, sex, ID). |
| `201` | `{ "data", "token", "profile_incomplete": true, "google_avatar_url" }` | A new account was created for this Google user. It finishes its profile on `POST /auth/complete-profile`. |
| `401` | `{ "message": "Invalid Google token." }` | Google refused the token, it was issued to another app, or (ID token) the issuer or email is not verified. |
| `403` | `{ "code": "email_unverified" \| "pending_activation", ... }` or `{ "message" }` | The account is unverified, a rider not activated yet, suspended or deactivated (unchanged). |
| `502` | `{ "message": "Could not reach Google. Please try again." }` | Google could not be reached. |
| `503` | `{ "message": "Google sign-in is not available right now. ..." }` | `GOOGLE_CLIENT_IDS` is not set. |

## The Google picture (Nov 8, 2026)

The account's profile photo is the Google picture from the moment it signs in: for a new account, for one that still
has to finish its profile, and for a finished one with no photo yet. The server copies it (at 400 px, not Google's
96 px default) onto the public disk, so `data.avatar_url` already shows it on Complete profile and in the app's
account. A photo the account already has is never replaced. A download that fails leaves the account without a
photo; sign-in goes on.

Only `https` links on `googleusercontent.com` (Google's photo hosts) are ever fetched (`App\Support\GoogleAvatar`).
`google_avatar_url` is still in the response, and the website's Complete profile still sends it back, but the server
uses it only when the account has no photo and only from those hosts. It used to fetch any address the form sent,
which let a caller make the server read internal URLs.

## Complete profile (`POST /api/v1/auth/complete-profile`)

Multipart, signed in, for a Google account that has to finish its profile: `phone`, `date_of_birth`, `sex`,
`province`, `city_municipality`, `barangay`, `street_address`, `government_id_type`, `government_id_image`
(+ `government_id_image_back` for IDs with a back), optional `avatar` (replaces the current photo).

Since Nov 8, 2026 it also takes the places' PSGC codes, all optional: `region`, `region_code`, `province_code`,
`city_code`, `barangay_code` (9 or 10 digits). The address is saved to the address book as the default **Home**
address; with the codes it is ready for checkout (`address_needs_update: false`), without them it asks to be picked
again before checkout, as before. The app sends the codes; the website does not yet. The response is the user with
`default_address`.

## Setup

- Backend `.env`: `GOOGLE_CLIENT_IDS=<the website's VITE_GOOGLE_CLIENT_ID>`, then `php artisan config:clear`.
  **Every server that runs the API needs it**, including the live site, or Google sign-in stops working there.
- Mobile app: `GOOGLE_SERVER_CLIENT_ID` in `dart_defines/*.json` is the same web client ID. Google only answers an
  app it knows, so the Google Cloud project needs an **Android OAuth client** for package `shop.lovedit.loved_it`
  with each teammate's debug SHA-1 and the release key's SHA-1 (amaru.md, B1 and Part E).

Tests: `tests/Feature/GoogleSignInAudienceTest.php`, `tests/Feature/SignUpAddressAndGooglePhotoTest.php`.
