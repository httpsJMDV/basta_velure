# Courier ↔ shop settlements: receipts, "not received" and admin review

Each week (Monday to Sunday, Philippine time) a courier and a shop settle the cash on delivery the courier collected
for the shop against the delivery fees it earned (`App\Services\DirectSettlement`). Whoever owes the difference sends
it by GCash and records the 13-digit reference; the other side confirms it. Loved-IT never holds this money, so its
admins only step in when a payment goes wrong (`App\Services\SettlementPayments`).

## States of a week's payment (`courier_settlements`)

| `state` | Meaning | Who acts next |
|---|---|---|
| `sent` | The payer recorded the reference (and maybe a receipt). | The receiver confirms or reports it. After `SETTLEMENT_CONFIRM_DAYS` (default 3) without an answer it is **overdue** (`overdue: true`). |
| `disputed` | The receiver reported that the money did not arrive, with a reason. | An admin decides; the payer can still attach a receipt and the receiver can still confirm. |
| `pay_again` | An admin voided the payment. The week counts as owed again. | The payer sends it again; the voided payment moves to `attempts`. |
| `settled` | Confirmed by the receiver, or marked received by an admin. | Nobody. |

Every step notifies the other side in the bell (shops by their *Earnings and payouts* setting, couriers to every
company member). A report also notifies every active admin.

## Shop and courier

The two sides use the same calls under their own prefix: `/seller/settlements` for the shop, `/logistics/settlements`
for the courier company.

| Route | Who | What |
|---|---|---|
| `POST …/settlements` `{week_start, reference, receipt?}` plus `company_id` (shop) or `seller_id` (courier) | the payer | Records the payment. `receipt` is optional, JPG/PNG/WebP up to 8 MB, sent as multipart. A week that is already paid is a `422`, unless it is in `pay_again`. |
| `POST …/settlements/{id}/confirm` | the receiver | `sent` or `disputed` → `settled`. |
| `POST …/settlements/{id}/dispute` `{reason}` | the receiver | `sent` → `disputed`. `reason` is 10 to 500 characters, in words (at least three letters). A second report is a `422`. |
| `POST …/settlements/{id}/receipt` `{receipt}` | the payer | Adds or replaces the receipt while the payment is `sent` or `disputed`. |
| `GET /settlements/{id}/receipt` | both sides, admins | The receipt image (private disk, `no-store`). Admins can add `?attempt=N` for an earlier, voided payment. Anyone else gets `404`. |

The wrong side gets a `422`, and another company's or shop's settlement a `404`.

Each line's `settlement` (in `GET …/settlements`) is:

```json
{ "id": 7, "reference": "1234567890123", "amount": 500, "paid_by": "courier", "paid_at": "…", "confirmed_at": null,
  "state": "disputed", "overdue": false, "has_receipt": true,
  "dispute": { "reason": "Nothing with this reference is in our GCash.", "at": "…" },
  "resolution": null }
```

`resolution` is `{ outcome: "received" | "pay_again", note, at }` once an admin decided. The `to_pay` and `to_receive`
totals count `pay_again` weeks as owed.

## Admin (`/admin/settlements`)

| Route | What |
|---|---|
| `GET /admin/settlements?view=reported\|overdue\|voided\|history&page=` | Reported (open reports), overdue (sent, unanswered past the window), voided (waiting to be sent again), history (anything an admin decided, or a week paid more than once). 20 per page, with `counts` for the first three and `confirm_days`. Each row adds the week, both parties with their GCash, the amounts, `days_waiting`, `reminded_at` and the earlier `attempts`. |
| `POST /admin/settlements/{id}/resolve` `{outcome, note}` | `received` closes the week as settled; `pay_again` voids the payment. `note` (10 to 500 characters) is shown to both sides. Only for `sent` or `disputed` payments. Logged as `resolve_settlement`. |
| `POST /admin/settlements/{id}/remind` | Asks the receiver of a `sent` payment to confirm or report it, at most once a day. Logged as `remind_settlement`. |
