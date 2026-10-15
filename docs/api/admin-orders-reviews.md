# Admin Orders and Reviews pages

The redesigned admin **Orders** (`/admin/orders`) and **Reviews** (`/admin/reviews`) pages use the same cards, count-up numbers, badges and spacing as the admin dashboard (`frontend/src/components/admin/dashboardKit.tsx`). The existing endpoints are unchanged except for **additive** keys, filters and two new summary endpoints. All routes need an admin token (`role:admin`); anyone else gets `403`.

## Orders

### `GET /api/v1/admin/orders`

Existing: `status`, `search`, `page`. Everything new is optional.

| Parameter | Meaning |
|---|---|
| `status` | One `OrderStatus` value, or one of the older lower-case names (`pending`, `packed`, `shipped`, ...). |
| `group` | `awaiting_action`, `in_transit`, `delivered_completed`, `problem`, `cancelled` (below). |
| `from`, `to` | Inclusive **Asia/Manila** days (`YYYY-MM-DD`) on the day the order was placed. Send both or neither; `to` on or after `from`. |
| `payment_method` | `gcash` or `cod`. |
| `payment_status` | `pending`, `paid`, `failed` (or `pending_verification`). |
| `search` | Order number, **tracking number**, buyer name or email, seller name or **shop name**. `%` and `_` in the text are literal. |
| `sort`, `direction` | `date` (default) or `total`; `desc` (default) or `asc`. Ties break by id. |
| `per_page` | 1 to 100, default 20. |

Bad input is a `422` with field errors. Soft-deleted orders are never listed.

Each row has the original keys (`id`, `order_number`, `tracking_number`, `status`, `payment_method`, `payment_status`, `subtotal`, `shipping_fee`, `total`, `created_at`, `buyer`, `items`, `status_history`) and one new key, `shop: { id, name } | null` (the shop selling on the order; checkout makes one order per seller). `meta` keeps `current_page`, `last_page`, `total` and adds `per_page`, `from`, `to`. `GET /admin/orders/{order}` (the detail drawer) also carries `shop`.

### `GET /api/v1/admin/orders/summary`

The KPI row and the chip counts. It takes the same filters as the list **except** `status`, `group`, `sort`, `direction` and paging, so a chip never changes its own count.

```json
{ "data": {
  "total": 15,
  "groups": { "awaiting_action": 4, "in_transit": 5, "delivered_completed": 2, "problem": 3, "cancelled": 1 },
  "by_status": { "PLACED": 1, "CONFIRMED": 1, "...": 0 },
  "gmv": 2572.0
} }
```

- `by_status` has every `OrderStatus` (zeros included), and the counts are raw counts of the matching, non-deleted orders.
- The **groups partition the statuses**, so `groups` always adds up to `total`:
  - `awaiting_action`: PLACED, CONFIRMED, PREPARING, READY_FOR_PICKUP
  - `in_transit`: PICKED_UP, AT_SORTING_CENTER, SORTED, ASSIGNED_TO_RIDER, OUT_FOR_DELIVERY
  - `delivered_completed`: DELIVERED, COMPLETED
  - `problem`: DELIVERY_FAILED, RETURNED, DISPUTED
  - `cancelled`: CANCELLED
- `gmv` is the sum of `orders.total` over the matching orders that count, that is every status except CANCELLED and RETURNED. It is the definition the dashboard and reports use (`docs/api/admin-reports.md`), so the same range gives the same GMV.

The page's labels for the groups live in `frontend/src/utils/orderStatus.ts` (`ADMIN_ORDER_GROUPS`), next to the status labels and icons.

## Reviews

### `GET /api/v1/admin/reviews`

Existing: `moderation_status` (`visible`, `hidden`, `pending_review`), `flagged=true`, `search`, `page`. New and optional: `rating` (1 to 5), `per_page` (1 to 100, default 20). `search` now also matches the **comment**, the **product name** and the **shop name**, as well as the buyer's name or email. `meta` adds `per_page`, `from`, `to`.

Each row keeps its original keys and gains `product: { id, name } | null`, `shop: { id, name } | null` and `order: { id, order_number } | null` (a review may have no order).

The page's chips map to: Pending = `moderation_status=pending_review`, Approved = `visible`, Hidden = `hidden`, Flagged = `flagged=true` (any status).

### `GET /api/v1/admin/reviews/summary`

```json
{ "data": {
  "total": 7,
  "average_rating": 3.57,
  "rating_distribution": { "1": 1, "2": 1, "3": 1, "4": 1, "5": 3 },
  "by_status": { "pending_review": 2, "visible": 4, "hidden": 1 },
  "flagged": 2
} }
```

Every figure covers all reviews that exist (soft-deleted ones excepted), whatever their moderation status, so `rating_distribution` and `by_status` each add up to `total`. `flagged` counts flagged reviews in any status. `average_rating` is rounded to two places and is **null, never 0**, when there are no reviews. (`GET /admin/reviews/stats` is unchanged.)

`PATCH /admin/reviews/{review}/moderate` is unchanged; its response now includes the extra keys above.

### Demo reviews

Buyers cannot submit reviews yet, so there is no endpoint that creates one. `php artisan demo:seed` writes six demo reviews straight into the `Review` model (ratings 5, 5, 4, 3, 2, 1; three approved, two pending, one hidden; the 2-star one flagged and still pending) on the demo buyers' COMPLETED orders. They hang off demo users and demo products, so `demo:reset` removes them. Nothing else creates reviews.

Known gap, not changed here: the public product reviews endpoint (`PublicProductController::reviews`) filters on `moderation_status = 'approved'`, a value the column does not have (`visible` is the approved state), so it lists nothing. It matters once buyers can submit reviews.
