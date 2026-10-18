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
`multipart/form-data`. The steps are checked in order (Rider R6, A32): the photo, the buyer's delivery code, then the cash.

| Field | Rules |
|---|---|
| `proof_photo` | **Required.** The parcel at the door or with the recipient. An image file: `jpg`, `jpeg`, `png` or `webp`, judged by its real content type, max **8 MB** (8192 KB). |
| `proof_photo_2` | Optional. The house, gate or building. Same rules; when sent it must be a **different file** from `proof_photo` (`422` on `proof_photo_2`). |
| `otp` | **Required when the parcel has a delivery code** (every parcel sent out through Out for Delivery has one). Exactly 6 digits; anything else is a `422` on `otp` and does not count as a try. |
| `cod_amount` | **Required for a COD parcel**: the cash the rider counted. It must equal the parcel's COD amount **to the centavo** (`499.99` and `500.01` are refused on a `500.00` order). Ignored for prepaid parcels. |
| `received_by` | Optional string, max 100 characters. |

### The delivery code (A32)
- A fresh 6-digit code is made each time the parcel goes Out for Delivery. Only the buyer sees it (`delivery_otp` on their order, while it is out for delivery); it is never in a rider, hub or courier payload.
- A wrong code is a `422` with the tries left (`Wrong delivery code. 4 tries left.`). The **5th** wrong code locks code entry for **15 minutes** (`423`, with `locked_until`); during the lock even the right code is refused with `423`. The tries are saved even though the request is refused.
- A parcel sent out before codes existed has none, and the step is skipped.

### What happens
- Everything that can refuse the request runs before the photos are stored, so a refused delivery keeps nothing.
- The photos go to the **private** `ids` disk under `delivery-proofs/`; their paths are never returned.
- The order moves `OUT_FOR_DELIVERY → DELIVERED` through `OrderStateMachine` with actor `rider`.
- On the parcel: `delivered_at`, the proof paths, `received_by` and, for COD, `cod_collected_at` and `cod_collected_amount`. The cash is now on the rider's COD balance (`docs/api/courier-operations.md`).
- A `delivery_logs` row is written (outcome `DELIVERED`). The rider earns the fixed **₱50.00** delivery pay (`docs/api/delivery-fee-split.md`).

#### Response: `200 OK`
```json
{
  "message": "Delivery recorded.",
  "tracking_number": "LIT-261014-39B685",
  "delivered_at": "2026-10-14T08:20:00+00:00",
  "cod_collected": true,
  "cod_amount": 500,
  "pay": "50.00"
}
```

#### Errors
- `404` / `409` / `422` as in the overview.
- `422`: photo missing, wrong type or over 8 MB; the two photos identical; `otp` not 6 digits or wrong (with the tries left); `cod_amount` missing or not exactly the order's amount.
- `423`: code entry locked after 5 wrong codes.

---

## 3. Mark Failed (`POST /api/v1/rider/deliveries/{tracking}/failed`)
JSON body.

| Field | Rules |
|---|---|
| `reason` | **Required.** One of the codes from the failure-reasons endpoint. |
| `note` | Optional string, max 500. **Required when `reason` is `OTHER`.** |

### What happens
- The order moves `OUT_FOR_DELIVERY → DELIVERY_FAILED` through `OrderStateMachine` with actor `rider`; the buyer, the shop and the courier company are notified.
- On the parcel: `failed_at`, `failure_reason` and `failure_note` are set, and `delivery_attempts` goes up by one. The attempt pays nothing.
- The history note is `Delivery failed: <reason label>`; the rider's free-text note stays on the parcel and in the log.
- **Return to Sender (A13):** a `REFUSED` reason, or the last allowed attempt (`LOGISTICS_MAX_DELIVERY_ATTEMPTS`, default 3), moves the parcel straight to `RETURN_TO_SENDER`. No further attempt can be scheduled; the courier company gives the trip back to the shop to a rider.
- Otherwise the courier company (or the hub) reschedules it: the next trip shows as `attempt 2 of 3` in the rider's list.

#### Response: `200 OK`
```json
{
  "message": "Delivery failure recorded: attempt 1 of 3.",
  "tracking_number": "LIT-261014-39B685",
  "reason": { "code": "RECIPIENT_UNAVAILABLE", "label": "Recipient unavailable" },
  "delivery_attempts": 1,
  "max_attempts": 3,
  "return_to_sender": false,
  "pay": "0.00"
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
