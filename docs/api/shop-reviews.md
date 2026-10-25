# Shop reviews

Reviews of a shop itself (shipping, packing, how the seller answers), apart from product reviews. Table
`shop_reviews` (additive migration `2026_10_24_000001`), model `ShopReview`, controller `ShopReviewController`.

## Rules (checked on the server)

| Rule | How it works |
|---|---|
| Who can review | A buyer with at least one `COMPLETED` order that has an item from the shop. A seller cannot review their own shop. |
| How many | One review per buyer per shop (unique `seller_id, buyer_id`). A second `POST` is `409`. |
| Editing | `PATCH` edits it, at most **2 edits per Manila day** (`edit_day`, `edits_on_day`). A third edit that day is `429`. |
| Fields | `rating` 1 to 5 (required). `comment` up to 500 characters, HTML stripped, must contain words (optional). `tags` (optional): any of "Fast shipping", "Good packaging", "Responsive seller", "Item as described", each once; stored in that order. |
| Seller reply | One reply per review (`POST`, `409` if it exists), editable with `PATCH`. 2 to 500 characters, words only. |
| Hiding | Nobody hides or deletes a review: the admin view is read-only. |

`{shop}` is the shop's slug or its seller's user id.

## Public

### `GET /api/v1/shops/{shop}/shop-reviews?rating=&page=&per_page=`

Newest first, 10 a page by default (5 to 30). Buyer names are masked like product reviews.

```json
{
  "data": [{
    "id": 7, "rating": 4, "comment": "Mabilis mag-reply.", "tags": ["Fast shipping", "Good packaging"], "edited": false,
    "created_at": "...", "updated_at": "...",
    "buyer": { "name": "J**n D.", "avatar_url": null },
    "seller_reply": { "body": "Salamat po!", "replied_at": "...", "edited_at": null }
  }],
  "meta": { "current_page": 1, "last_page": 1, "total": 1 },
  "summary": { "average": 4.0, "count": 1, "rating_counts": { "5": 0, "4": 1, "3": 0, "2": 0, "1": 0 }, "latest": [] },
  "shop": { "name": "Bloom Skin & Scents", "slug": "bloom-skin-scents", "seller_id": 12 }
}
```

`GET /api/v1/shops/{shop}` now also returns `shop_reviews`: the same summary with the **3 latest** in `latest`.

## Signed-in buyer

- `GET /api/v1/shops/{shop}/my-shop-review` → `{ can_review, reason, review, edits_left_today, tags }`. `reason` explains why not (no completed order yet, or it is your own shop).
- `POST /api/v1/shops/{shop}/my-shop-review` `{ rating, comment?, tags? }` → `201`. `403` with the reason when the buyer cannot review. The seller gets an in-app notification (`shop_review.new`).
- `PATCH /api/v1/shops/{shop}/my-shop-review` `{ rating, comment?, tags? }` → `{ data, edits_left_today }`. `404` if there is no review yet, `429` after 2 edits that day.

Both writes are limited to 20 a minute.

## Seller

- `GET /api/v1/seller/shop-reviews?rating=&replied=0|1&page=` → reviews of the signed-in seller's shop, `meta.unreplied` and the `summary`.
- `POST /api/v1/seller/shop-reviews/{id}/reply` `{ body }` → `201`; `PATCH` the same path edits it. Another shop's review is `404`.

## Admin (read-only)

- `GET /api/v1/admin/reviews/shops/{seller}/shop-reviews?rating=&page=` → the shop's reviews with `buyer_full_name` and `buyer_email`, and the `summary`.

## Web pages

- Shop page (`/shop/:slug`, Reviews tab): the average, the bars and the 3 latest, **See all reviews**, and **Review this shop** / **Edit your review** for buyers who can.
- `/shop/:slug/reviews`: every shop review with a star filter, newest first.
- Seller centre, Reviews & Ratings: a **Shop reviews** tab with replies (`?tab=shop`).
- Admin Reviews, a shop's page: **Product reviews** / **Shop reviews** toggle.
