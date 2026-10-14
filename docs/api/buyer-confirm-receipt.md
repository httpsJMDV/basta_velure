# Buyer Confirms Receipt and the Escrow Rule — Feature 2.8

## Overview
A buyer confirms the parcel arrived (`DELIVERED → COMPLETED`). The seller's escrow now releases **after a hold period that starts at `COMPLETED`**, instead of the moment the rider marks `DELIVERED`. If the buyer does nothing, the order completes by itself after a window, so a forgetful buyer cannot hold a seller's money forever.

> **This changes only WHEN funds become available.** Amounts, commission, payout requests and disbursement are not touched by any step on this page.

## The new flow

| Step | What happens | `payout_status` | Who/what |
|---|---|---|---|
| Rider marks `DELIVERED` | `delivered_at` is recorded on the items. **Nothing is released.** | `pending_release` | Rider (2.7) |
| Buyer confirms receipt, **or** 3 days pass | Order becomes `COMPLETED`; `orders.completed_at` is set; each item still in escrow gets `escrow_release_at = now + 7 days`. | `pending_release` | Buyer, or `orders:auto-complete` (actor `system`), or an admin |
| The 7-day hold ends | `payouts:release-due` flips due items to `available`. | `available` | Scheduler |
| Seller requests a payout | Unchanged: `PayoutRequest` rows against the available balance. | (unchanged) | Seller / admin |

Items that are already `available` or `disbursed` (for example orders delivered before 2.8) are **never moved backwards** and get no release date.

### Configuration (`.env`)
| Setting | Config key | Default | Meaning |
|---|---|---|---|
| `PAYOUT_ESCROW_HOLD_DAYS` | `payouts.escrow_hold_days` | `7` | Days from `COMPLETED` until funds are released. `0` releases at the next run (for demos). |
| `ORDER_AUTO_COMPLETE_DAYS` | `orders.auto_complete_days` | `3` | Days after delivery before an unconfirmed order completes itself. `0` completes at the next run (for demos). |

---

## 1. Confirm Receipt (`POST /api/v1/buyer/orders/{order}/confirm-receipt`)
No body. Requires Sanctum authentication and the `buyer` role.

- Only the order's own buyer can confirm. **Another buyer's order, and an unknown order, return `404`.**
- The order must be `DELIVERED` and not disputed.
- In one transaction with a row lock: the order moves `DELIVERED → COMPLETED` through `OrderStateMachine` with actor `buyer`, `orders.completed_at` is set, and `escrow_release_at = now + escrow_hold_days` is set on the order's items that are still `pending_release`. **`payout_status` stays `pending_release`.**

#### Response: `200 OK`
```json
{
  "message": "Thanks for confirming. The seller's payment will be released after the protection period.",
  "data": { "id": 101, "status": "COMPLETED", "completed_at": "2026-10-14T09:00:00+00:00", "...": "same shape as GET /buyer/orders/{order}" }
}
```

#### Errors
- `401`: unauthenticated.
- `403`: the user is not a buyer (seller, rider, admin).
- `404`: not found, or not this buyer's order.
- `409` (the conflict response):
  - the order is not `DELIVERED` yet ("You can confirm receipt once the order has been delivered.");
  - the order is `DISPUTED` ("A return request is open for this order, so receipt cannot be confirmed.");
  - the order is already `COMPLETED`, which also covers a double submit ("This order has already been confirmed as received."). The hold is not restarted.

---

## 2. Buyer order payload (additive)
`GET /api/v1/buyer/orders` and `/{order}` gain four keys. No existing key changed.

| Key | Meaning |
|---|---|
| `delivered_at` | When the rider delivered it, or `null`. |
| `auto_complete_at` | While `DELIVERED`: `delivered_at` plus `auto_complete_days`, when the order will complete itself. `null` otherwise. |
| `completed_at` | When the order reached `COMPLETED`, or `null`. |
| `delivery_proof_available` | `true` when a proof photo exists. The photo is fetched from `GET /api/v1/parcels/{tracking}/delivery-proof` (Feature 2.7), which the order's buyer may read. |

## 3. Seller earnings payload (additive)
`GET /api/v1/seller/earnings/orders` gains `escrow_release_at` per item: when the item's escrow releases. It is `null` until the order is `COMPLETED`, and `null` for items that are already `available`. Every existing key is unchanged.

`GET /api/v1/seller/earnings` is unchanged. Delivered-but-unconfirmed items count in `pending_balance`, not `available_balance`.

---

## Console commands
Both are idempotent, process in chunks, log how many items they changed, and are registered in the scheduler to run **hourly** (`routes/console.php`). They can be run by hand.

### `php artisan orders:auto-complete`
For orders in `DELIVERED` for at least `orders.auto_complete_days` (judged by the parcel's or the items' `delivered_at`), moves the order to `COMPLETED` with actor `system` and the note `Auto-completed after N days`, with the same escrow scheduling as a buyer confirmation. It **only** considers `DELIVERED` orders: `DISPUTED`, cancelled, returned, failed, in-flight and already completed orders are never touched.

### `php artisan payouts:release-due`
Sets `payout_status = available` on items that are `pending_release`, have `escrow_release_at <= now`, and belong to a `COMPLETED` order. It never touches `disbursed` or already `available` items, items of cancelled, returned, disputed or merely delivered orders, or any amount.

### Running the scheduler
The scheduler must be running for these to fire: `php artisan schedule:work` in development, a cron entry for `php artisan schedule:run` every minute in production. See `SETUP.md`.

---

## Returns are only possible while `DELIVERED`
A buyer can request a return/refund (`POST /api/v1/buyer/orders/{order}/request-return`) from the **Delivered** state, which is the only state the app offers it in. Once the order is `COMPLETED` it is impossible: the state machine has no `COMPLETED → DISPUTED` transition, so the request is refused with `422` and, since 2.8, **no dispute record is left behind** (the request now runs in one transaction). Confirming receipt therefore ends the buyer's return window, and the confirm dialog says so.

A disputed order cannot be confirmed (`409`). If an admin later resolves a dispute with `DISPUTED → COMPLETED`, the same escrow scheduling applies.

## Not part of this feature
Refunds for returned or cancelled orders, changes to commission, payout requests and disbursement, and the review feature (there is no review-creation endpoint yet; "My Reviews" is still a placeholder).
