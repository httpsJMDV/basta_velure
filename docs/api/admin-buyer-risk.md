# Admin buyer risk review

The web console is `/admin/buyer-risk`, under **Trust & Safety → Buyer Risk Review**. All endpoints below require an active Sanctum-authenticated admin. Other roles receive 403; missing or mismatched buyer/order resources receive 404. This feature does not change the customer service bot or its human handoff.

## Evidence and score

The queue includes buyers with at least one non-deleted order placed in the last 30 days. It computes patterns from recorded transactions, rather than detecting application crashes, exploits, or intent. A score is a review priority, not a fraud probability.

| Signal | Threshold | Points |
| --- | --- | --- |
| Buyer cancellations | At least 3 orders, and at least half of their orders in the window, cancelled by the buyer | 35 |
| Refused parcels | At least 2 distinct parcels with an explicit `REFUSED:` failed-delivery log in the window | 40 |
| Failed payments | At least 3 orders currently marked payment failed | 15 |
| Checkout burst | At least 5 separate checkouts in the last hour | 10 |

Multi-shop orders sharing a checkout group count once for the burst. Orders without a group count individually. Seller, system, and admin cancellations do not count as buyer cancellations. Refusals honor the buyer's COD restoration time and exclude deleted orders, parcels and logs. An unavailable recipient or inaccessible address does not count as refusal.

High priority is 40–100; medium is 15–39; low is 0–14. An isolated burst is a low-priority signal. Signals never automatically block accounts, cancel transactions, or change COD access.

## Endpoints

`GET /api/v1/admin/buyer-risk?level=flagged&search=&page=1`

- `level`: `flagged` (default, score ≥15), `high`, `medium`, `low`, or `all`.
- `search`: optional buyer first name, last name, or email, maximum 100 characters.
- `page`: positive integer. Pages contain 12 buyers ordered by score descending, then buyer ID ascending.
- Response: `{data: RiskBuyer[], meta: {current_page, last_page, total, summary: {buyers, flagged, high}, window_days: 30, checked_at}}`. Summary counts cover all buyers in the window, independently of list filters.
- `RiskBuyer`: `{id, name, email, status, score, level, order_count, buyer_cancellations, failed_payments, refused_parcels, hourly_checkouts, signals: [{code, label, detail}]}`.

`GET /api/v1/admin/buyer-risk/{buyer}`

Returns `{data: RiskBuyer & {orders}}`. `orders` contains at most the latest 50 orders, regardless of the scoring window: `{id, order_number, status, total, payment_status, payment_method, created_at, can_cancel}`. A buyer without orders in the window has score zero and no signals. Dates are ISO 8601; the UI displays Manila time.

`POST /api/v1/admin/buyer-risk/{buyer}/analyze`

Uses the existing `AiModel` provider (`AI_PROVIDER=groq` in the current local configuration) to summarize anonymous aggregate facts and suggest checks. No names, contact details, messages, addresses, individual order identifiers, or action tools are sent. Response: `{data: {summary, checks: string[], generated_at, provider}}`. Successful responses are cached for five minutes per buyer, provider/model, and facts. The route is limited to 5 requests per minute. Missing credentials, refusal, truncation, invalid JSON, and provider outages return a generic 503; the evidence and cancellation workflows remain available. The AI cannot modify orders or accounts.

`POST /api/v1/admin/buyer-risk/{buyer}/orders/{order}/cancel`

Body: `{reason: string, confirmed: true}`. A trimmed reason of 10–500 characters and explicit confirmation are required (422 otherwise). The order must belong to that buyer. Under an order row lock, the endpoint rechecks that the status is PLACED, CONFIRMED, PREPARING, or READY_FOR_PICKUP and no parcel has been picked up. Stale, repeated, and ineligible requests return 409.

Cancellation uses `OrderCanceller` and `OrderStateMachine`: stock and eligible vouchers return, refunds follow the existing sandbox/manual payment rules, the order status history records the admin and reason, and `AdminActivityLog` records `buyer_risk.cancel_order`. All writes share one transaction. No new migration or service credential is required. The route is limited to 10 requests per minute.

## Validation

`php artisan test --compact --filter=AdminBuyerRiskTest` covers role restrictions on all endpoints, thresholds and attribution, distinct refusals/COD restoration, shared checkouts, AI data minimization/cache/outage handling, cancellation confirmation/ownership/reason, refunds/stock restoration, duplicate cancellation, and shipped/completed order protection.
