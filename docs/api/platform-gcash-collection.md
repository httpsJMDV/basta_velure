# Loved-IT GCash collection and manual payouts

New GCash orders use platform custody. Existing direct-paid orders and COD keep their original settlement rules. No payment provider sends money automatically: users transfer in GCash, then authorized people record and reconcile the transfer.

## Configure collection

Admin → Payments & Payouts → Collection account uses `GET/PUT /admin/settings/payments` (`platform_gcash_number`, `platform_gcash_name`). Both must be valid before new GCash checkout is available. The production account is supplied by the administrator, never seeded. `GCASH_COLLECTION_MODE=platform` is the default; the test suite explicitly starts in legacy direct mode and central tests opt in.

`GET /checkout/shops` adds `collection_mode`. In platform mode, authenticated buyers receive Loved-IT's account rather than seller accounts. New clients submit one checkout-wide transfer as `gcash[0][reference]` and `gcash_proof[0]`. Existing per-shop submissions remain compatible; different references are separate transfers. Orders snapshot `collection_payee`, use `settlement=platform`, and enter `pending_verification`. Receipts stay private.

## Verify receipt

- `GET /admin/payments` adds `collection`: payee, full transfer amount, order IDs/count, reference, review eligibility and closed-order warning.
- `POST /admin/payments/orders/{order}/confirm-gcash`: `reference` (13 digits), `received_amount` (full transfer amount), `received_in_gcash=true`.
- `POST /admin/payments/orders/{order}/reject-gcash`: current `reference`, reason (10–500 characters).
- `POST /buyer/orders/{order}/gcash-receipt`: corrected `reference` and JPG/PNG `receipt` up to 5 MB. Updates all unpaid orders sharing that transfer. It does not request another payment.

One transfer groups by buyer, checkout group, reference and snapshotted collection account. Confirmation locks the group and claims the incoming reference globally. Retries are idempotent; stale reference, amount mismatch and duplicate use fail. Sellers cannot verify platform receipts. The state machine refuses fulfillment before verified payment, including direct API/admin requests. An approved payment on a cancelled/returned order opens a platform refund and leaves its status closed.

## Seller earnings and payouts

Stored merchandise commission rates are unchanged. Seller net earnings enter `pending_release` and become available at completion plus the configured hold (currently zero days in production). Platform-funded vouchers do not reduce seller earnings. A seller's own free-delivery offer deducts its courier fee from seller net once. Earlier direct orders never enter the new payout balance.

Seller payout requests reserve available balance and snapshot their own GCash account. New requests require a 13-digit outgoing `transfer_reference` when admin records `POST /admin/payouts/{payout}/mark-sent`. The actual GCash transfer must already have been sent. Complete only after sent; reject only while pending. A sent payout cannot be rejected to restore a balance. Transfer retries do not send mail twice or reserve funds twice. No automatic bank disbursement is claimed.

## Courier funding

`GET /admin/platform-funding` and `/logistics/platform-funding` list delivered platform-paid shipping fees awaiting funding and the latest 30 transfers per company. Existing direct/COD shop statements exclude these orders.

Admin sends money to the courier's configured GCash, then records `POST /admin/platform-funding/companies/{company}` with selected `order_ids[]`, their exact `amount`, `reference` and `receipt` (JPG/PNG/WebP, at most 8 MB). Each order can be funded once, enforced by a unique line and transaction locks. Transfer recipient is snapshotted. `GET /{admin|logistics}/platform-funding/{funding}/receipt` is private and scoped. Courier confirms actual receipt via `POST /logistics/platform-funding/{funding}/confirm` with `received_in_gcash=true`.

The courier pays its own staff using existing payout screens. New shipping allocation remains 30% pickup, 30% delivery, 10% branch, 15% transport pool, 15% courier company. Return transport reserves up to another 10% from the company's share. Funding the courier does not pay staff twice.

## Refunds

Refund payload adds `payer=platform|seller` and `payer_name`. New central GCash refunds are paid by Loved-IT; old direct/COD refunds remain seller-paid. Only admin can send platform refunds via `POST /admin/refunds/{refund}/sent` with 13-digit reference and receipt. The buyer supplies their refund account and confirms receipt or reports a problem. Sellers see central refunds read-only. Outgoing references are shared across refunds, seller payouts and courier funding to prevent reusing one transfer for multiple liabilities.

## Validation and operational limits

Database tests use transactions against `velure_test`; no production bank transfer is used for verification. GCash references and receipts support manual reconciliation, not proof that a payment-provider API moved money. Configure the real collection account before conducting a defense payment, verify GCash history, and retain the actual transfer receipts.
