# Rider Delivery Outcomes API (`/api/v1/rider/deliveries/...`) — Feature 2.7

## Overview
From the Out for delivery list (Feature 2.6), the rider marks one stop **Delivered** (with photo proof, and a cash confirmation for COD) or **Failed** (with a required reason).

Out of scope: the hub's failure triage and the reschedule and return-to-seller actions (**Feature 1.9**, hub actions), buyer confirmation (2.8), and earnings and history (2.9).

The rider endpoints require Sanctum authentication and the `approved_rider` middleware (`riders.status = ACTIVE`, checked in the database on every request):
- `401 Unauthorized`: unauthenticated.
- `403 Forbidden`: rider is `PENDING` or `DISAPPROVED`.

Both outcome endpoints are **one stop at a time** and follow the same rules:
- A parcel that is **not assigned to this rider, or does not exist**, returns the same `404` (`"Parcel not found among your assigned deliveries."`).
- A parcel that is **not currently `OUT_FOR_DELIVERY`** returns the project's conflict response, `409`, so a double submit cannot apply twice:
  - `"This parcel has already been delivered."`
  - `"This parcel has already been marked as failed."`
  - `"This parcel is not out for delivery."`
- A parcel whose order cannot move (for example a `DISPUTED` order) returns `422` `"This parcel cannot be updated right now."`, with nothing written and no file kept.
- The tracking number in the URL is trimmed and uppercased.

All steps run in one database transaction with row locks.

---

## 1. Failure Reasons (`GET /api/v1/rider/deliveries/failure-reasons`)
The single source of failure reasons. Only `OTHER` requires a note.

#### Response: `200 OK`
```json
{
  "data": [
    { "code": "RECIPIENT_UNAVAILABLE", "label": "Recipient unavailable", "requires_note": false },
    { "code": "WRONG_ADDRESS", "label": "Wrong or incomplete address", "requires_note": false },
    { "code": "REFUSED", "label": "Recipient refused the parcel", "requires_note": false },
    { "code": "CANNOT_CONTACT", "label": "Could not contact the recipient", "requires_note": false },
    { "code": "ADDRESS_INACCESSIBLE", "label": "Address not accessible", "requires_note": false },
    { "code": "OTHER", "label": "Other reason", "requires_note": true }
  ]
}
```

---

## 2. Mark Delivered (`POST /api/v1/rider/deliveries/{tracking}/delivered`)
`multipart/form-data`.

| Field | Rules |
|---|---|
| `proof_photo` | **Required.** The parcel handed over (with the recipient or at the door). An image file: `jpg`, `jpeg`, `png` or `webp`, judged by its real content type, max **8 MB** (8192 KB). |
| `proof_photo_2` | **Required.** The delivery address (house, gate or building). Same rules, and it must be a **different file** from `proof_photo` (same bytes twice is a `422` on `proof_photo_2`). |
| `received_by` | Optional string, max 100 characters. Who received the parcel. |
| `cod_collected` | Boolean (`1`/`0`/`true`/`false`). **Required and must be true when the parcel has a `cod_amount`.** Ignored for prepaid parcels. |

The COD amount is **read from the parcel**, never from the client; any amount a client sends is ignored.

### What happens
- The order is checked first. A parcel that cannot be delivered is rejected **before** the photo is stored, so nothing is kept.
- Both photos are stored on the **private** `ids` disk under `delivery-proofs/`. They are never on a public path, and the paths are never returned by this endpoint.
- The order moves `OUT_FOR_DELIVERY → DELIVERED` through `OrderStateMachine` with actor `rider` (history row written; the parcel follows the sync).
- On the parcel: `delivered_at`, `delivery_proof_path`, `delivery_proof_path_2`, `received_by` and, for COD, `cod_collected_at` are set.
- A `delivery_logs` row is written (outcome `DELIVERED`).
- If anything fails after the photos were stored, both files are deleted.
- **Escrow is unchanged.** Whatever the state machine already does at `DELIVERED` (marking the order items' payout `available` and `delivered_at`) still happens exactly as before, and nothing else about money changes. **Escrow still releases at `DELIVERED` until Feature 2.8** moves it to `COMPLETED`. No earnings rows are created (2.9).

#### Response: `200 OK`
```json
{
  "message": "Delivery recorded.",
  "tracking_number": "LIT-261014-39B685",
  "delivered_at": "2026-10-14T08:20:00+00:00",
  "cod_collected": true
}
```

#### Errors
- `404` / `409` / `422` as in the overview.
- `422` validation: `proof_photo` or `proof_photo_2` missing, wrong type, or over 8 MB; the two photos identical; `received_by` over 100 characters; `cod_collected` missing or false on a COD parcel.

---

## 3. Mark Failed (`POST /api/v1/rider/deliveries/{tracking}/failed`)
JSON body.

| Field | Rules |
|---|---|
| `reason` | **Required.** One of the codes from the failure-reasons endpoint. |
| `note` | Optional string, max 500. **Required when `reason` is `OTHER`.** |

### What happens
- The order moves `OUT_FOR_DELIVERY → DELIVERY_FAILED` through `OrderStateMachine` with actor `rider`.
- On the parcel: `failed_at`, `failure_reason` and `failure_note` are set, and `delivery_attempts` is incremented.
- The history note is `Delivery failed: <reason label>`. The buyer can read history notes, so the rider's free-text note is **not** included there; it is kept on the parcel and in the log for the hub.
- A `delivery_logs` row is written (outcome `DELIVERY_FAILED`, notes `CODE: label - note`).
- The parcel stays assigned to the rider. Rescheduling or returning it is a **hub action (Feature 1.9)**.
- Escrow is not released by a failed delivery.

#### Response: `200 OK`
```json
{
  "message": "Delivery failure recorded.",
  "tracking_number": "LIT-261014-39B685",
  "reason": { "code": "RECIPIENT_UNAVAILABLE", "label": "Recipient unavailable" },
  "delivery_attempts": 1
}
```

#### Errors
- `404` / `409` / `422` as in the overview.
- `422` validation: `reason` missing or unknown; `note` missing for `OTHER` (blank counts as missing) or over 500 characters.

---

## 4. Delivery Proof Photo (`GET /api/v1/parcels/{tracking}/delivery-proof`)
Streams the first proof photo from the private disk; add `?photo=2` for the second one (the delivery address). Deliveries made before the second photo existed only have the first, and `?photo=2` is a `404` for them.

**Who may read it** (checked on every request):

| Reader | Rule |
|---|---|
| Assigned rider | The rider whose `assigned_rider_id` is on the parcel. |
| Hub | An approved hub whose id is the parcel's `sorting_center_id`. |
| Seller | The parcel's seller. |
| Buyer | The order's buyer. |
| Admin | Users with `role = admin`. |

- `401` when unauthenticated.
- `404` for everyone else, and for a parcel that is unknown, has no proof, or whose file is missing. The response is always the same `404`, so it reveals nothing about which parcels have proofs.
- Response headers: the image's content type, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.

---

## Notes
- **Storage**: `Storage::disk('ids')` is the private disk (`storage/app/private/ids`). Proofs live in its `delivery-proofs/` folder. Nothing is stored under `public`.
- **PHP**: the server needs the `fileinfo` extension to judge uploads by content (standard). The GD extension is not required.
- **PHP upload limits**: the API accepts photos up to 8 MB, but PHP rejects larger uploads first. PHP's default `upload_max_filesize` is 2M, which refuses most phone photos with a `422` on `proof_photo` ("failed to upload"). Servers must set `upload_max_filesize = 8M` and `post_max_size = 10M` (see `SETUP.md`).
- Camera capture on the rider's phone is a web-app concern (`<input type="file" capture>`); the API only sees a file.
