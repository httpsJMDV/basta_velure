# Courier portal: Settings and Messages

Amaru task 2. The courier company portal (`/logistics`) gets a **Settings** page and a **Messages** page.

## Who the courier talks to

**Its own hubs**, one thread per company and hub: who is short of riders, a parcel stuck at intake, a pay question.
Riders already talk to their hub (`rider_hub` threads), and Loved-IT support is reached through the normal support
chat, so hub coordination was the missing piece.

- Stored in `conversations` with type `courier_hub`, `logistics_company_id` and `sorting_center_id` (additive
  migration `2026_10_24_000002`). The courier's unread count is `courier_unread`; the hub's reuses `hub_unread`.
- Private to the company's team and the hub's manager: the type is in `Conversation::PRIVATE_TYPES`, so the admin's
  `/conversations` list never shows it, the general `/conversations/{id}` endpoints answer `404`, and the websocket
  channel refuses it. Both sides poll (like rider threads).
- Plain text, 1 to 1,000 characters (HTML stripped), 20 sends a minute per person.
- A thread with a hub that is suspended, or no longer with that courier, stays readable but answers new messages with
  `409`. A new thread needs an approved hub in the company's network.

### Courier endpoints (`logistics_member`)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/logistics/chat/hubs` | Every approved hub (and any hub with a thread), with `thread_id`, `unread`, `last_message`. `meta.unread` is the total. |
| GET | `/api/v1/logistics/chat/unread` | `{ unread }` for the menu badge. |
| POST | `/api/v1/logistics/chat/hubs/{hub}/thread` | Finds or starts the thread: `201` new, `200` existing. `404` for another courier's hub. |
| GET | `/api/v1/logistics/chat/threads/{id}/messages?after_id=` | Messages oldest first, and `meta { is_closed, can_send, closed_message }`. |
| POST | `/api/v1/logistics/chat/threads/{id}/messages` | `{ body }` → `201`. |
| POST | `/api/v1/logistics/chat/threads/{id}/read` | Marks the hub's messages read. |

### Hub endpoints (`approved_sorting_center`)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/hub/courier-chat` | The hub's thread with its courier (started on first use): `id`, `unread`, `company`, `last_message`, `meta`. |
| GET | `/api/v1/hub/courier-chat/messages?after_id=` | Messages and `meta`. |
| POST | `/api/v1/hub/courier-chat/messages` | `{ body }` → `201`. |
| POST | `/api/v1/hub/courier-chat/read` | Marks the courier's messages read. |

Messages carry `sender_role` (`courier` or `hub`) and `sender_name` (the hub's name, or the company's name with the
team member's first name).

## Settings

- **Account** and **Password**: the signed-in team member's photo, name, email and mobile (changed with a code) and
  password, on the existing account endpoints (shared with the hub's Settings, `components/account/PortalAccount.tsx`).
- **Company & payout**:
  - `PATCH /api/v1/logistics/company` `{ description?, contact_email, contact_phone }`: description up to 500
    characters (HTML stripped), a valid email, a Philippine mobile (stored as `+639…`). Other fields, such as `name`,
    are ignored: the name, code, SEC number, TIN and address were reviewed by the admin and are changed through support.
  - `POST /api/v1/logistics/company/logo` `{ logo }`: JPG or PNG up to 5 MB, on the public disk; the old file is deleted.
  - The payout GCash uses the existing `GET/PATCH /api/v1/logistics/gcash`.

## Web pages

- `/logistics/messages` (menu **Messages** with an unread badge), `/logistics/settings` (menu **Settings**).
- The hub's `/hub/messages` pins **Your courier company** above the rider threads; the hub's Messages badge counts both.
