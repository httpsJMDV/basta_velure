# Refunds, "Parcel not received", COD after refusals, and delivery safeguards

## Overview

The buyer of a **GCash** order paid the shop's GCash, and the cash of a **cash-on-delivery** order reaches the shop in the courier's weekly settlement. So when such an order is refunded, the **shop** sends the money back, by hand, to the buyer's GCash. Before this, a GCash refund stayed `pending` forever and a COD return was marked `refunded` although nobody paid the buyer.

A refund the shop sends is a `refunds` row (one per order, `App\Services\Commerce\ManualRefunds`):

| Status | Meaning | Who acts |
|---|---|---|
| `awaiting_account` | The buyer has to say which GCash gets it | Buyer |
| `awaiting_shop` | The shop has to send it, within `orders.refund_send_days` (3) | Shop |
| `sent` | The shop recorded the 13-digit GCash reference and a receipt | Buyer confirms or reports, within `orders.refund_confirm_days` (3); silence counts as received |
| `not_received` | The buyer says nothing arrived | Loved-IT: received, or the shop sends it again |
| `received` | Done. The order's `refund_status` becomes `refunded` | |

- **When a row is made:** a paid GCash order that is cancelled (by anyone, including a failed delivery or a lost/damaged parcel), and an approved return of a GCash or COD order. Sandbox e-wallet and card refunds stay instant (`OrderCanceller::refund`) and have **no** row.
- **Amounts do not change:** the row holds the amount the order already refunded (its total). Commission, payouts and settlements are untouched. A return can only happen before `COMPLETED`, and escrow is scheduled at `COMPLETED`, so there is nothing to claw back.
- **Deadlines** (`refunds:process-deadlines`, every 15 minutes): a `sent` refund past `confirm_by` becomes `received` (`auto_confirmed = true`); an `awaiting_shop` refund past `send_by` is flagged once (`overdue_notified_at`): the shop is reminded by bell and email, the admins by bell.
- The receipt is on the private `ids` disk (`refund-receipts/`).

### Configuration (`.env`)
| Setting | Config key | Default |
|---|---|---|
| `ORDER_REFUND_SEND_DAYS` | `orders.refund_send_days` | `3` |
| `ORDER_REFUND_CONFIRM_DAYS` | `orders.refund_confirm_days` | `3` |
| `ORDER_COD_REFUSAL_LIMIT` | `orders.cod_refusal_limit` | `3` (`0` turns the rule off) |

## The refund object

Returned as `refund` on `GET /buyer/orders/{order}` (viewer `buyer`), on `GET /seller/orders/{order}` (viewer `seller`) and in the admin list. `null` when the order has no refund to send by hand.

```json
{
  "id": 3, "status": "sent", "cause": "return", "amount": 500.0,
  "gcash_number": "0917 123 4567", "gcash_name": "Ana Buyer",
  "send_by": "2026-11-09T10:00:00+08:00", "overdue": false,
  "reference": "1234567890123", "has_receipt": true,
  "sent_at": "...", "confirm_by": "...", "received_at": null, "auto_confirmed": false,
  "reported_at": null, "report_note": null, "resolution_note": null, "resolved_at": null,
  "times_sent_before": 0,
  "can_set_account": false, "can_confirm": true, "can_report": true, "can_send": false, "can_decide": false,
  "created_at": "..."
}
```
`cause` is `return` or `cancelled`. The `can_*` flags are for the viewer.

## Buyer

| Endpoint | Body | Rules |
|---|---|---|
| `PUT /buyer/orders/{order}/refund/account` | `gcash_number`, `gcash_name` | Until the shop sends it (`awaiting_account` or `awaiting_shop`), else `409`. The number is a Philippine mobile (`09…`, `+63 9…`); the name follows the GCash account-name rule. The first save starts the shop's 3 days. |
| `POST /buyer/orders/{order}/refund/confirm` | none | `sent` or `not_received`; `409` before it is sent and when already confirmed. |
| `POST /buyer/orders/{order}/refund/report` | `note` (10 to 500 characters, in words) | Only `sent`; `409` otherwise. Admins are told. |

Each answers `{ message, data: <the order, as GET /buyer/orders/{order}> }`. Another buyer's order is `404`; an order with no row is `404`.

## Shop

| Endpoint | Body | Rules |
|---|---|---|
| `GET /seller/refunds?status=open\|done` | | The shop's refunds, the ones to send first. `meta.to_send` counts `awaiting_shop`. |
| `POST /seller/orders/{order}/refund/sent` (multipart) | `reference` (13 digits, spaces allowed), `receipt` (JPG, PNG or WebP, 8 MB) | Only `awaiting_shop`; `409` while the buyer has not given an account, and once sent. Another shop's order is `404`. |

## Admin (`role:admin`)

| Endpoint | Body | Rules |
|---|---|---|
| `GET /admin/refunds?status=attention\|open\|done\|<status>&page=` | | `attention` (default): reported as not received, or the shop is late. `meta.attention` counts them. |
| `POST /admin/refunds/{refund}/resolve` | `decision`: `received` or `send_again`; `note` (10 to 1000 characters) | `send_again` only for `not_received`: the earlier transfer moves to `attempts` and the shop gets 3 more days. `received` closes it (not allowed while `awaiting_account`). Logged as `resolve_refund`. |

## Receipt

`GET /refunds/{refund}/receipt`: the buyer, the shop and admins; anyone else gets the same `404` as a missing receipt. `Cache-Control: private, no-store`.

---

## "Parcel not received"

`POST /buyer/orders/{order}/request-return` accepts the reason **`Parcel not received`**. For it, photos are optional (0 to 5); every other reason still needs 1 to 5.

- The request skips the shop: the dispute starts as `escalated` (`escalated_at` set, no `respond_by`), so the 3-day auto-approval never applies and the shop cannot reject it (`409`). Admins are told (`dispute.not_received`); the shop is emailed that Loved-IT decides.
- `GET /admin/disputes/{dispute}` now includes `delivery` (`tracking_number`, `delivered_at`, `received_by`, `rider_name`, `proof_photo_count`, `cod_collected`) and `refund`. The proof photos come from `GET /parcels/{tracking}/delivery-proof?photo=1|2`.
- The decision is the usual one: `refund` (the order becomes Returned and is refunded as above) or `reject` (the order completes). Both sides are notified and emailed (`ReturnService::closeForShop` for the shop's side).

## Cash on delivery after refused parcels

After `orders.cod_refusal_limit` parcels **refused at the door** (`DeliveryFailureReason::REFUSED`; "not at home" never counts), cash on delivery is off for the buyer (`App\Services\Commerce\CodRefusals`, counted from `delivery_logs`).

- `POST /checkout/quote` → `limits.cod_blocked: true`, `limits.cod_blocked_reason`, and `limits.cod_available: false`. `POST /checkout/place-order` with `payment_method: cod` → `422` on `payment_method`.
- The refusal that reaches the limit tells the buyer once (bell `account.cod_off` and an email).
- Admins see `cod: { refusals, limit, blocked }` on each account in `GET /admin/users`, and turn it back on with `POST /admin/users/{user}/restore-cod` (`409` when it is already on). This sets `users.cod_refusals_reset_at`; refusals before it stop counting. Logged as `restore_cod`.

## The rider contacts the buyer before "not at home"

- `POST /rider/deliveries/{tracking}/contact` `{ method: call | sms }`: the rider is calling or texting the buyer from an out-for-delivery stop. Stamps `parcels.buyer_contacted_at` and tells the buyer by the bell (`order.rider_calling`, at most once every 5 minutes). Another rider's parcel `404`; not out for delivery `409`. Repeating it is harmless.
- `POST /rider/deliveries/{tracking}/failed` with `RECIPIENT_UNAVAILABLE` or `CANNOT_CONTACT` answers **`422` `{ code: "contact_required" }`** unless the rider called or texted (above) **or** sent the buyer a chat message since this trip started (`out_for_delivery_at`). A call from an earlier trip does not count.
- Each out-for-delivery stop in `GET /rider/deliveries` has `buyer_contacted` and `contact_first_reasons`.

## Handovers and emails

- **Hub scans in a pickup rider's parcel** (hub intake or the courier's Inbound): the pickup rider gets `rider.handover_confirmed`.
- **Hub-to-hub:** when a hub sends a parcel on, the next hub's owner gets `hub.transfer_incoming`; when that hub scans it in, the sending hub's owner gets `hub.transfer_received` and the courier's team `shipment.transfer_received`.
- **Shop confirms a returned parcel arrived:** the return rider gets `rider.return_confirmed`.
- **New emails to the shop** (its order-update or return settings apply): a rider is coming for the pickup (rider name and vehicle), the parcel was picked up, a parcel is coming back to you, a parcel was returned to you, a return was escalated, approved automatically, or decided by Loved-IT. Refund emails (to send, sent, reported, late, account needed) always go out.

## Rider and shop chat

- The **shop** can now start the chat: `POST /parcels/{tracking}/rider-chat` by the parcel's shop opens (or reopens) the `rider_seller` thread with the pickup rider (once a rider has the job, until the hub scans it in) or with the rider bringing a failed delivery back. With no such rider: `409`. Seller orders include `rider_chat: { tracking_number, rider_first_name, leg: pickup | return }` when there is someone to message.
- A **return** phase: the rider on `rts_rider_id` can message the seller while the parcel is `RETURN_TO_SENDER` (`counterpart: seller`; buyer and hub are refused). The thread closes when the parcel is back.

## Auto-complete and the return window

`orders:auto-complete` waits `max(orders.auto_complete_days, the return window in Platform Settings)` days after delivery (`0` still completes at once, for demos), because completing an order ends the buyer's right to ask for a return. `auto_complete_at` on the buyer's order follows the same rule.
