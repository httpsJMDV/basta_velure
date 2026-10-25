# Rider Chat and Account API — Feature 2.10

## Overview
Two things for the courier app:

1. **Delivery chat.** A rider can message the people involved in a parcel they are working on, without leaving the delivery screen: the **seller** during pickup, the **buyer** during delivery, and the **hub** throughout.
2. **Vehicle edit.** A rider can change their vehicle type and plate number from the Account tab.

Out of scope: group chats, attachments, push notifications, a change-password flow (the app has only forgot/reset by email, so there is nothing to link to), and a vehicle re-verification flow.

Rider endpoints sit under `/api/v1/rider/...` (Sanctum plus `approved_rider`, checked in the database on every request). Hub endpoints sit under `/api/v1/hub/chat/...` (`approved_sorting_center`). **The seller and the buyer use the existing `/api/v1/conversations/...` endpoints**, so a rider thread shows up in their normal inbox.

Common errors on every endpoint here:
- `401`: unauthenticated. Always a JSON `{"message": "Unauthenticated."}`, even without an `Accept` header (see "Unauthenticated requests" below).
- `403`: a rider who is `PENDING` or `DISAPPROVED`, a non-rider on a rider endpoint, or a non-approved hub on a hub endpoint.
- `404`: the thread or parcel is not yours (see isolation). A thread's existence is never revealed to a non-participant.

---

## Rules

### Threads
- A thread belongs to **one parcel** and has **two participants**: the rider and one counterpart (`seller`, `buyer` or `hub`).
- It is stored in the existing `conversations` table with type `rider_seller`, `rider_buyer` or `rider_hub`. **One thread per parcel, rider and counterpart** (unique index `parcel_id, rider_id, type`).
- Seller counterpart = the parcel's seller. Buyer counterpart = the order's buyer. Hub counterpart = the parcel's hub (must be the rider's own hub and `APPROVED`).

### Who can talk when
The rider's role on a parcel decides the phase. The phase is checked against the parcel **on every request**; nothing about openness is stored.

| Phase | Parcel status | The rider is… | Counterparts |
|---|---|---|---|
| Pickup | `READY_FOR_PICKUP` (accepted by this rider), `PICKED_UP` | `parcels.pickup_rider_id` | `seller`, `hub` |
| Delivery | `ASSIGNED_TO_RIDER`, `OUT_FOR_DELIVERY` | `parcels.assigned_rider_id` | `buyer`, `hub` |

Any other status, or a different rider, means the parcel is **not active for that rider**.

### Open and closed
- A thread is **open** while the parcel is active for its rider **and** the counterpart is allowed in that phase. Otherwise it is **closed**.
- A closed thread is **read-only for both sides**: it can still be listed and read, and sending is refused with `409` and a clear message. This protects the buyer's privacy once the delivery is done.
- Closing happens on its own when the parcel moves on: `DELIVERED`, `DELIVERY_FAILED`, `RETURNED`, `AT_SORTING_CENTER`, a released pickup, or reassignment to another rider. A seller thread also closes when the parcel enters the delivery phase, and a buyer thread cannot exist before it.
- **It can reopen.** If the same rider gets the parcel again (for example a failed delivery rescheduled to them), the same thread is open again. A different rider never inherits it.
- A rider who is no longer `ACTIVE` has all their threads closed.

### Messages
- Plain text, **1 to 1000 characters** after trimming (`logistics.chat.max_body_length`, env `RIDER_CHAT_MAX_BODY_LENGTH`). Longer or blank bodies return `422` with a `body` error.
- Stored **exactly as typed**. The server does not interpret HTML and the clients must render the body as text, never as HTML. Attachments and images are not supported on rider threads; attachment fields are always `null`.
- **Rate limit:** 20 sends per minute per user across all rider threads (`logistics.chat.sends_per_minute`, env `RIDER_CHAT_SENDS_PER_MINUTE`). Over the limit returns `429` with a `Retry-After` header. Reading is never limited.
- **Privacy.** Payloads carry **names only**: never phone numbers, emails or addresses. The rider sees the same names the delivery console already shows them (shop name, recipient name, hub name). Buyers and sellers see the rider's **first name** only; the hub sees the rider's full name (it already vets them).

### Unread and read
- Each participant has an unread counter (`rider_unread`, `buyer_unread`, `seller_unread`, `hub_unread`).
- The **rider and hub endpoints never mark read as a side effect of fetching**, so a background poll cannot clear an unread badge. They call `POST .../read` explicitly.
- The **existing buyer/seller endpoint** keeps its behaviour: fetching a thread's messages marks the other side's messages read.

### Polling
Clients poll `GET .../messages?after_id=<last id>` about every 3 seconds, only while the conversation is on screen. `after_id` is exact (it does not miss messages created in the same second). The existing `since=<created_at>` parameter is also accepted. The buyer and seller pages additionally receive `MessageSent` and `ConversationUpdated` on their existing websocket channels; the rider and hub do not use websockets.

---

## Thread object
Returned by the open, show and list endpoints (and by `GET /conversations` for buyers and sellers, with `recipient` from their point of view).

```json
{
  "id": 41,
  "type": "rider_buyer",
  "status": "open",
  "counterpart": "buyer",
  "subject": "Buyer · LIT-261014-A1B2C3",
  "parcel": { "tracking_number": "LIT-261014-A1B2C3", "order_number": "VEL-65F...", "status": "OUT_FOR_DELIVERY" },
  "recipient": { "id": null, "name": "Ana Buyer", "role": "buyer", "avatar": null, "subtext": "Buyer" },
  "buyer_id": 12,
  "seller_id": null,
  "is_closed": false,
  "can_send": true,
  "closed_message": null,
  "last_message": { "id": 310, "body": "I am at the gate", "sender_id": 77, "created_at": "2026-10-14T05:31:00.000000Z" },
  "last_message_at": "2026-10-14T05:31:00.000000Z",
  "unread": 0,
  "created_at": "2026-10-14T05:20:00.000000Z"
}
```
`status` is the conversation's own flag and stays `open`; use `is_closed` / `can_send`. `closed_message` is a human sentence (for example "This conversation is closed because the parcel was delivered."). For the buyer and seller, `subject` is `Delivery rider · <tracking number>` and `recipient.role` is `rider`.

## Message object
```json
{
  "id": 310, "conversation_id": 41, "body": "I am at the gate",
  "sender_id": 77, "sender_role": "rider", "sender_name": "You",
  "attachment_type": null, "attachment_data": null,
  "read_at": null, "created_at": "2026-10-14T05:31:00.000000Z"
}
```
`sender_role` is `rider`, `seller`, `buyer` or `hub` (the role in the thread, not the account role: a hub owner may hold the buyer role). `sender_name` is `You` for the viewer's own messages.

---

## 1. Rider endpoints

### `POST /api/v1/rider/chat/parcels/{tracking}/threads`: open or find a thread
Body: `{ "counterpart": "seller" | "buyer" | "hub" }`. The tracking number is case-insensitive. Idempotent: `201` the first time, `200` with the same thread afterwards.

| Status | When |
|---|---|
| `201` / `200` | `{ "data": <thread> }` |
| `404` | the parcel is unknown, unclaimed, or another rider's |
| `409` | the parcel is yours but no longer active for you: "This parcel is no longer active for you, so a new conversation cannot be started." |
| `422` | `counterpart` missing or not one of the three, **not allowed in this phase** (buyer during pickup, seller during delivery), no seller or buyer on the parcel, or the hub is missing, not yours, or not `APPROVED` |

### `GET /api/v1/rider/chat/threads`: my threads
Open and closed, newest activity first. Query: `per_page` (1 to 100, default 30), `page`, `unread_only=1`.
```json
{
  "data": [ <thread>, ... ],
  "meta": { "current_page": 1, "last_page": 1, "per_page": 30, "total": 3, "unread_total": 2 }
}
```
`meta.unread_total` covers all threads, not just the page or the `unread_only` filter.

### `GET /api/v1/rider/chat/unread`: unread badges for the stop cards
Only threads with unread messages (cheap to poll every 10 seconds):
```json
{
  "data": [ { "thread_id": 41, "tracking_number": "LIT-261014-A1B2C3", "counterpart": "buyer", "unread": 2 } ],
  "meta": { "unread_total": 2 }
}
```

### `GET /api/v1/rider/chat/threads/{id}`: one thread
`{ "data": <thread> }`.

### `GET /api/v1/rider/chat/threads/{id}/messages`: messages
Oldest first. Query: `after_id` (messages with a larger id; the polling cursor), `since` (a date, `created_at` greater than it), `limit` (1 to 200, default 100). With neither cursor it returns the **latest** `limit` messages. Does **not** mark anything read.
```json
{
  "data": [ <message>, ... ],
  "meta": { "is_closed": false, "can_send": true, "closed_message": null }
}
```
`meta` reflects the parcel right now, so a poll also tells the client when the thread has just closed.

### `POST /api/v1/rider/chat/threads/{id}/messages`: send
Body: `{ "body": "..." }`. `201` with `{ "data": <message> }`. Errors: `409` thread closed ("...You can still read it, but new messages cannot be sent."), `422` body blank or over 1000 characters, `429` rate limit.

### `POST /api/v1/rider/chat/threads/{id}/read`: mark read
`{ "data": { "marked": 2 } }`. Clears the rider's unread counter for the thread. Allowed on closed threads. Harmless to repeat.

---

## 2. Hub endpoints (`approved_sorting_center`)
Riders start the threads; the hub lists, reads and replies. Only `rider_hub` threads for **this** hub are visible; another hub's thread is `404`. Same payloads and rules as the rider endpoints, with the roles swapped (`recipient` is the rider by full name, `unread` is `hub_unread`).

| Method and path | Purpose |
|---|---|
| `GET /api/v1/hub/chat/threads` | list (`per_page`, `page`, `unread_only`); `meta.unread_total` |
| `GET /api/v1/hub/chat/threads/{id}` | one thread |
| `GET /api/v1/hub/chat/threads/{id}/messages` | messages (`after_id`, `since`, `limit`); does not mark read |
| `POST /api/v1/hub/chat/threads/{id}/messages` | send `{ "body" }` |
| `POST /api/v1/hub/chat/threads/{id}/read` | mark read |

## 3. Seller and buyer: the existing endpoints
Rider threads appear in the normal inbox and use the normal endpoints; the controller branches on `type` (`rider_*`) and uses the rules above.

| Endpoint | Rider-thread behaviour |
|---|---|
| `GET /api/v1/conversations` | a buyer also gets their `rider_buyer` threads, a seller (`scope=seller`) their `rider_seller` threads, in the thread shape above. Existing types are unchanged. |
| `GET /api/v1/conversations/unread-count` | includes rider-thread unread |
| `GET /api/v1/conversations/{id}` | the thread object |
| `GET /api/v1/conversations/{id}/messages` | messages with `meta`; marks the rider's messages read (existing behaviour); accepts `after_id` |
| `POST /api/v1/conversations/{id}/messages` | send `{ "body" }` (text only) |
| `PATCH .../status`, `GET .../attachable-*` | `404` for rider threads (a rider thread opens and closes with its parcel) |

**Not visible to anyone else.** An admin does not see rider threads: they are left out of the admin conversation list, the admin endpoints return `404` for them, and the websocket channel `conversation.{id}` admits only the two participants. A user who is neither participant gets `404`, and a participant using the wrong endpoint family (a rider on `/conversations`, a buyer on `/rider/chat`) is not served either.

---

## 4. Vehicle edit: `PUT /api/v1/rider/vehicle`
Body: `{ "vehicle_type": "Motorcycle" | "Tricycle" | "Car" | "Van", "plate_number": "ABC 1234" }`. Both are required.

Validation is **the same as registration** (one shared trait, `ValidatesRiderVehicle`):
- `vehicle_type`: one of the four fixed motorized types, matched case-insensitively and stored in canonical case (`"tricycle"` becomes `"Tricycle"`).
- `plate_number`: trimmed and **uppercased**, at most 20 characters, letters, digits, spaces and hyphens only.
- Messages are the registration messages, for example "Plate number contains invalid characters."

`200`:
```json
{ "message": "Vehicle details updated.", "data": <rider profile, as GET /rider/me> }
```
The profile now includes `vehicle_updated_at` (ISO 8601, `null` until the first edit). Errors: `422` field errors and nothing is saved, `403` for other roles or a non-approved rider, `401` for guests. There is no rider id in the path, so a rider can only ever edit their own record.

### Known gap: no re-verification
**An edit takes effect immediately.** There is no new OR/CR upload and no hub re-approval, so a rider could change their plate or vehicle type after the hub approved the documents for the original vehicle. The OR/CR on file no longer has to match. The hub's rider list and detail (`GET /hub/riders`, `GET /hub/riders/{id}`) read the live values, so they show the change as soon as it is made, but nothing flags it as an edit, and no activity log entry is written (the app's activity log, `AdminActivityLog`, is admin-only). A follow-up should add a "vehicle changed" flag for the hub and require a fresh OR/CR.

---

## Unauthenticated requests (Part 0 fix)
Every `/api/*` route answers a guest with `401` and `{"message":"Unauthenticated."}` as JSON, **with or without** the `Accept: application/json` header. Before this fix a request without the header returned `500` ("Route [login] not defined"), including the document and delivery-proof streaming routes. `bootstrap/app.php` now stops the framework from redirecting guests of `/api/*`. Covered by `tests/Feature/ApiUnauthenticatedTest.php`.

## Data model
Additive migrations only:
- `conversations`: `parcel_id` (FK `parcels`), `rider_id` (FK `users`, the rider's user), `sorting_center_id` (FK `sorting_centers`), `rider_unread`, `hub_unread`, a unique index `(parcel_id, rider_id, type)` and listing indexes. All nullable or defaulted, so existing conversations are untouched.
- `riders`: `vehicle_updated_at` (nullable timestamp).
- `messages` is unchanged.

## The buyer starts the chat: `POST /api/v1/parcels/{tracking}/rider-chat`

From Track package, the buyer can open the thread with the rider bringing their parcel (**Message rider**). Before this, only the rider could start it.

- Allowed only while the parcel is `OUT_FOR_DELIVERY` and its assigned rider is `ACTIVE`; otherwise `409` "You can message the rider while your parcel is out for delivery." Anyone but the order's buyer, and an unknown tracking number, gets `404`.
- Finds or creates the same `rider_buyer` thread the rider would open (unique on parcel, rider and type), so both sides always land in one thread. `201` when created, `200` when it already existed; the body is the conversation as `GET /conversations/{id}` returns it for the buyer.
- Rate limited to 20 per minute. After that the thread follows the normal rules above (open during `ASSIGNED_TO_RIDER` and `OUT_FOR_DELIVERY`, read-only afterwards).

## Out for delivery names the rider

When an order enters `OUT_FOR_DELIVERY`, the buyer's in-app notification reads "Juan is bringing your parcel" and the email title "Juan is bringing your parcel today.", with the rider's first name only (`Parcel::deliveryRiderFirstName`). Without an assigned rider the old wording is kept.
