# Commerce: cart, vouchers, shipping rates, checkout, payment, cancellation, returns

Buyer workbook B5 to B12, Seller S8, S9, S12, S13, Logistics L8. All amounts are pesos with two decimals; every rule
below is enforced on the server, and the screens show the same messages.

## Money rules

- **Commission 5%** of what the shop sells after its own discounts (store voucher, promotions). Loved-IT's platform and
  shipping vouchers are paid by Loved-IT and never reduce the shop's earnings.
- **Earnings** are Pending until the order is **Completed** (the buyer confirms receipt, or 7 days after delivery
  automatically), then Available. COD and GCash are paid to the shop directly; e-wallet and card go through Loved-IT
  and are paid out from Earnings. One payout request can be pending at a time.
- **Shipping** comes from the courier's rate table (below), per shop, by route and chargeable weight.

The worked example (two shops, MCH50, PLAT100, FREESHIP) totals ₱1,083.00; Seller 1 earns ₱616.55 after a ₱32.45
commission and Seller 2 ₱379.05. `tests/Feature/CommerceCheckoutTest.php` checks it to the centavo.

## Cart (`/cart`)

Signed-in buyers have a server cart (`GET /cart`, `POST /cart/items`, `PATCH|DELETE /cart/items/{line}`,
`POST /cart/select`, `POST /cart/merge` for the guest cart after login). Lines are grouped by shop with a store and a
line checkbox; quantity is checked against stock, purchase limits and flash-sale caps, and a price change since the
item was added is shown on the line.

## Vouchers

- Buyer: `GET /shops/{seller}/vouchers`, `GET /products/{product}/vouchers`, `GET /vouchers/platform`,
  `GET /buyer/vouchers` (wallet), `POST /buyer/vouchers/claim {code}`.
- Shop: `GET|POST /seller/vouchers`, `PATCH /seller/vouchers/{id}`, `POST /seller/vouchers/{id}/end`.
- Loved-IT: the same under `/admin/vouchers` for platform and shipping vouchers.

Codes are 4 to 12 letters and digits, uppercase, unique, with no spaces. One store voucher per shop, one platform
and one shipping voucher per checkout. Once a voucher has been claimed only its end date can be extended (A27); ending
it removes it from wallets. A cancelled order's vouchers go back to the wallet when they have not expired.

## Shipping rates (L8)

The courier company keeps delivery zones (a list of regions, provinces or cities, with exclusions such as Luzon
except Batanes) and a rate for each route (`first_kg` and `additional_kg`, above ₱0 with at most 2 decimals):
`GET /logistics/shipping`, `POST|PATCH|DELETE /logistics/shipping/zones`, `PUT /logistics/shipping/rates`,
`DELETE /logistics/shipping/rates/{id}`, `GET /logistics/shipping/audit`. Every change is in the audit log. A buyer's
address matches the most specific area first (city, then province, then region). Chargeable weight is whole
kilograms rounded up, at least 1. A changed rate applies to new checkouts only. An address outside every zone cannot
be checked out ("not serviceable").

## Checkout

- `POST /checkout/quote` with the address, the items (or the selected cart lines) and the voucher codes returns each
  shop's lines, promotions, shipping route and fee, the vouchers that apply or why not, the totals, any `problems`,
  and `can_place`.
- `POST /checkout/place-order` with the same, `payment_method` (`cod`, `gcash`, `e_wallet`, `card`), notes (200
  characters per shop), `expected_total`, and an `Idempotency-Key` header. A changed price or a voucher that no longer
  applies is a `409` with a fresh quote; a repeated key returns the first result instead of a second order.

## Sandbox payment (A6)

E-wallet and card orders get a payment session (`payment.token`) and wait in **To Pay** for up to 60 minutes:
`GET /payments/sessions/{token}`, `POST /payments/sessions/{token}/complete {outcome: success|decline|cancel}`, and the
signed `POST /payments/sandbox/callback` for a browser that closed. Unpaid orders are cancelled after an hour
(`orders:cancel-unpaid`), their stock and vouchers released. `POST /buyer/orders/{id}/pay-again` opens a new session.
No real money moves.

## Orders, cancellation and returns

- `GET /buyer/orders?tab=to_pay|to_ship|to_receive|completed|cancelled|return_refund` with `counts`.
- Cancel: the buyer until the shop hands the parcel over (`POST /buyer/orders/{id}/cancel {reason, details?}`); the
  shop until the courier picks it up (`POST /seller/orders/{id}/cancel`). The stock goes back once, the vouchers come
  back, and a paid order is refunded the exact amount.
- Return within 7 days of delivery (`POST /buyer/orders/{id}/request-return`, a reason, a 10 to 500 character
  description and 1 to 5 JPG or PNG photos). The shop has 3 days to approve or reject with a reason
  (`POST /seller/orders/{id}/respond-return`); an unanswered request is approved automatically. A rejected request can
  be escalated once within 3 days (`POST /buyer/orders/{id}/escalate-return`); Loved-IT then decides refund or reject
  (`PATCH /admin/disputes/{id}/resolve {decision, resolution_note}`).
- A failed delivery that goes back to the shop is described in `docs/api/courier-operations.md`.

## Seller reports (S13)

`GET /seller/reports/summary|revenue-chart|payment-methods|top-products` take `range=today|7d|30d|90d|12m|all` or
`from`/`to` (Manila dates, both days included; an end before the start is a `422`). Gross sales are the shop's item
subtotals without shipping; `seller_discounts` are its own vouchers and promotions; cancelled and returned orders are
left out. The chart covers the same window as the summary.
