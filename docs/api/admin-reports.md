# Admin dashboard and Analytics & Reports

The admin **dashboard** (`/admin`) and the **Analytics & Reports** page (`/admin/reports`) read their figures from one backend class, `App\Services\AdminAnalyticsService`. For the same range they show the same numbers. Every figure is a SQL aggregate (no order is loaded into memory). All routes need an admin token (`role:admin`).

## Definitions (one set, used by both pages)

| Term | Meaning |
|---|---|
| Range | Inclusive **Asia/Manila** calendar days. Timestamps are stored in UTC, so a range is the half-open UTC interval `[start of from in Manila, start of the day after to in Manila)`. An order belongs to the day it was placed (`orders.created_at`). |
| Dashboard window | The last **30** Manila days, ending today. Fixed. |
| Counted orders | Every order placed in the range **except `CANCELLED` and `RETURNED`** (the `OrderStatus` enum values). Soft-deleted orders are never counted. |
| `gmv` | Sum of `orders.total` (shipping included) over counted orders. |
| `orders` | Number of counted orders. `orders_placed` is every order placed in the range, whatever its status; `cancelled_orders` and `returned_orders` are the two excluded kinds. |
| `commission`, `seller_earnings`, `units_sold` | Sums of the **stored** `order_items.commission_amount`, `seller_earnings` and `quantity` over the items of counted orders. Nothing is recomputed from a rate. |
| `avg_commission_rate` | `commission / gmv * 100`, or `null` when there was no GMV (never a made-up default). |
| `active_buyers` / `active_sellers` | Distinct buyers who placed, and distinct sellers (by `order_items.seller_id`) who sold on, a counted order in the range. A seller is a buyer account with an approved shop (`users.role` stays `buyer`). |
| Pipeline | Orders placed in the range counted by their **current** `OrderStatus` (every status present, zeros included), plus six display groups that cover every status exactly once. |
| Payment split | Counted orders by `payment_method` (`gcash`, `cod`): count and `orders.total` volume. |
| Disputes | `opened`: disputes created in the range. `open_now`: disputes with status `open` or `in_progress` right now (not tied to the range). |

## Choosing the range (all report endpoints)

Either `from` and `to` (`YYYY-MM-DD`, Manila days, `to` on or after `from`, at most 800 days), or a `range` preset: `7d`, `30d` (default), `90d`, `12m`, `all` (from the first order). Explicit dates win over a preset. Anything else is a `422` with field errors. The response echoes the range as `range: { from, to, days, timezone, preset }`.

Presets are Manila days ending today: `7d` is today and the 6 days before it.

## Endpoints

### `GET /api/v1/admin/reports/summary`
```json
{ "data": {
  "total_gmv": 2572.0, "total_commission": 211.08, "total_seller_earnings": 1900.0,
  "total_orders": 5, "total_units_sold": 12, "avg_commission_rate": 8.21,
  "range": { "from": "2026-09-17", "to": "2026-10-16", "days": 30, "timezone": "Asia/Manila", "preset": "30d" },
  "orders_placed": 7, "cancelled_orders": 1, "returned_orders": 1,
  "active_buyers": 2, "active_sellers": 2,
  "previous": { "range": { }, "gmv": 0, "orders": 0, "commission": 0, "active_buyers": 0, "active_sellers": 0 },
  "pipeline": { "total": 7, "by_status": { "PLACED": 1 }, "groups": [ { "key": "awaiting_confirmation", "label": "Pending Confirmation", "statuses": ["PLACED"], "count": 1 } ] },
  "disputes": { "opened": 3, "open_now": 3 }
} }
```
The first six keys are the original ones (`avg_commission_rate` is now `null` instead of `10` when there is no GMV). The rest are additive. `previous` is the same-length period just before the range, for trends.

### `GET /api/v1/admin/reports/revenue-chart` (`interval=daily|monthly`)
`data` is a list, one point per Manila day (or per Manila month; a range over 366 days is always monthly): `{ date, iso_date, gmv, commission, orders_count, orders_placed }`. `date` is a label (`Oct 16` or `Oct 2026`), `iso_date` is `YYYY-MM-DD` (the first of the month for monthly points), `orders_count` is counted orders. A top-level `meta: { range, interval }` is added. Days with no orders are present with zeros.

### `GET /api/v1/admin/reports/category-breakdown`
`data`: `{ category, gross_sales, units_sold, orders_count, commission_rate, commission_earned }`, biggest first. `category` is the category's name (looked up from the id or slug stored on the item); `commission_rate` is the stored commission over the stored sales, as a percent.

### `GET /api/v1/admin/reports/top-sellers`
`data` (up to 15): `{ seller_id, seller_name, shop_name, email, gross_sales, orders_count, units_sold, commission_generated, net_payout_credited, avg_order_value }`. `gross_sales` is the sum of the seller's item subtotals on counted orders (shipping is not a seller's sale). Sellers come from the order items, not from `users.role`.

### `GET /api/v1/admin/reports/payment-method-split`
`data`: `{ gcash: { count, volume }, cod: { count, volume }, total_orders, total_volume }`.

### `GET /api/v1/admin/stats` (the dashboard)
Every original key is still present: the pending queues (`pending_seller_applications`, `pending_buyer_applications`, `pending_rider_applications`, `pending_products`, `open_disputes`, `pending_payment_verifications`, `pending_payout_requests`), the account totals (`total_buyers`, `total_sellers`, `total_riders`), the Manila-period figures (`orders_today`, `orders_yesterday`, `gmv_today`, `gmv_yesterday`, `commission_today`, `commission_this_week`, `commission_this_month`, `commission_lifetime`, `new_buyers_this_week`, `new_buyers_last_week`, `pending_sellers_this_week`, `pending_sellers_last_week`) and the payment keys (`gcash_orders_count`, `cod_orders_count`, `gcash_volume`, `cod_volume`). What changed is their definition, now the shared one: orders and commission leave out `CANCELLED` and `RETURNED`; days, weeks (Monday to Sunday) and months are Manila; `total_sellers` counts approved shops and `total_buyers` counts buyer accounts (sellers included); the payment keys cover the 30-day window instead of all time; `pending_products` counts `pending_review` (what sellers actually submit); `pending_rider_applications` is the number of riders waiting on their hub (an information figure, not an admin queue).

New keys, all for the last 30 days: `window`, `metrics` (the summary figures above, without the `total_` prefix: `gmv`, `orders`, `orders_placed`, `cancelled_orders`, `returned_orders`, `commission`, `seller_earnings`, `units_sold`, `avg_commission_rate`, `active_buyers`, `active_sellers`), `previous`, `pipeline`, `payment_split`, `disputes`. These are the same values `GET /admin/reports/summary?from=<window.from>&to=<window.to>` returns.

### `GET /api/v1/admin/dashboard-feed`
`chart_data` is now the last 30 Manila days (it was 14): `{ date, new_sellers, orders, orders_placed, gmv, commission }`. `new_sellers` is seller applications submitted that day (it used to count `role = 'seller'`, which no account has). The attention items for products link to `/admin/products`.

## Linking

Every dashboard card and chart links to the matching section of `/admin/reports`, carrying the range as query parameters (`?from=2026-09-17&to=2026-10-16#commission`). The reports page reads `from`, `to` and `range` from the URL and scrolls to the section id: `sales`, `commission`, `orders`, `activity`, `trend`, `pipeline`, `payments`, `categories`, `sellers`.

## Not built

The ERP lists two admin reports, a **Sales Summary Report** and a **Commission Report**, with a from/to date picker. The page now has the date picker and every figure such a report needs on screen, but there is no dedicated Sales Summary or Commission Report and **no export** (CSV or PDF), as `docs/LOVED-IT_PROJECT_PLAN.md` already notes. No new report type was added.
