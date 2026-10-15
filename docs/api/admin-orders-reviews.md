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

Reviews are honest feedback from buyers, so the admin can **read** them and nothing else: there is no approve, hide, flag or delete (the old `PATCH /admin/reviews/{review}/moderate` and `GET /admin/reviews/stats` are gone, and nothing about moderation appears in a payload). What the admin watches is each **shop's** reviews, which are the reviews of its products, so the page lists shops first and opens one shop on request.

### `GET /api/v1/admin/reviews/shops`

Every **approved** shop, including shops with no reviews yet (a pending or rejected application is not a shop). Optional: `search` (shop name, owner name or owner email), `sort` (`reviews` default, `rating`, `recent`, `name`), `direction` (`asc`, `desc`; default `desc`), `page`, `per_page` (1 to 100, default 20). Ties fall back to the shop name, and shops with no rating or no review date always sort last.

Each row: `id` (the seller's user id), `shop_name`, `shop_slug`, `logo_url` (or `null`), `owner_name`, `review_count`, `average_rating` (two places; **null, never 0**, with no reviews), `last_review_at` (or `null`). `meta` has `current_page`, `last_page`, `total`, `per_page`, `from`, `to`.

### `GET /api/v1/admin/reviews/shops/{seller}`

One shop's row plus `rating_distribution` (`{"1": n, ... "5": n}`, adding up to `review_count`). `404` when the user is not an approved shop. The web page uses `shop_slug` for its **Go to shop profile** button (`/shop/{shop_slug}`).

### `GET /api/v1/admin/reviews`

Optional: `shop_id` (the seller's user id), `rating` (1 to 5), `search` (comment, buyer name or email, product name), `page`, `per_page` (1 to 100, default 20). Newest first. Without `shop_id` it is every review. Soft-deleted reviews are never listed.

Each row: `id`, `product_id`, `rating`, `comment`, `verified_purchase`, `created_at`, `buyer`, `product: { id, name } | null`, `shop: { id, name } | null`, `order: { id, order_number } | null` (a review may have no order).

### `GET /api/v1/admin/reviews/summary`

```json
{ "data": {
  "total": 6,
  "average_rating": 3.33,
  "rating_distribution": { "1": 1, "2": 1, "3": 1, "4": 1, "5": 2 },
  "shops": 3,
  "shops_reviewed": 2
} }
```

Every review that exists counts (soft-deleted ones excepted), so the distribution adds up to `total`. `average_rating` is null, never 0, with no reviews. `shops` is the number of approved shops and `shops_reviewed` how many of them have at least one review.

### Public reviews

`GET /products/{product}/reviews` lists every review of the product. It used to filter on `moderation_status = 'approved'`, a value the column does not have, so it listed nothing; with no moderation the filter is gone. (The `moderation_status`, `flagged` and `flag_reason` columns still exist but nothing reads or writes them.)

### Demo reviews

Buyers cannot submit reviews yet, so there is no endpoint that creates one. `php artisan demo:seed` writes six demo reviews straight into the `Review` model (ratings 5, 4, 5, 3, 2, 1) on the demo buyers' COMPLETED orders, all published. They hang off demo users and demo products, so `demo:reset` removes them. Nothing else creates reviews.
