# Shop comments ("shop reviews" in the URLs)

What buyers say about a shop itself (shipping, packing, how the seller answers), apart from product reviews. Since
Oct 25, 2026 these are **comments without stars**; product reviews keep their stars. Table `shop_reviews` (migration
`2026_10_24_000001`; `2026_10_25_000003` made `rating` nullable), model `ShopReview`, controller `ShopReviewController`.
Stars given before the change stay in `rating` but are never shown or returned.

A shop's page needs a **signed-in account** (any role): `GET /shops/{shop}`, `/shops/{shop}/reviews` and
`/shops/{shop}/shop-reviews` answer `401` to guests, and the web routes `/shop/:slug`, `/shop/:slug/reviews` and
`/store/:id` send a guest to `/login?next=…`, then back. The home page's "Shops to know" (`GET /shops`) stays public.

## Rules (checked on the server)

| Rule | How it works |
|---|---|
| Who can comment | A buyer with at least one `COMPLETED` order that has an item from the shop. A seller cannot comment on their own shop. |
| How many | One comment per buyer per shop (unique `seller_id, buyer_id`). A second `POST` is `409`. |
| Editing | `PATCH` edits it, at most **2 edits per Manila day** (`edit_day`, `edits_on_day`). A third edit that day is `429`. |
| Fields | `comment` 2 to 500 characters, HTML stripped, must contain words (**required**). `tags` (optional): any of "Fast shipping", "Good packaging", "Responsive seller", "Item as described", each once; stored in that order. A `rating` sent by an old client is ignored. |
| Seller reply | One reply per comment (`POST`, `409` if it exists), editable with `PATCH`. 2 to 500 characters, words only. |
| Hiding | Nobody hides or deletes a comment: the admin view is read-only. |

`{shop}` is the shop's slug or its seller's user id.

## Signed-in visitors of the shop's page

### `GET /api/v1/shops/{shop}/shop-reviews?tag=&page=&per_page=`

Newest first, 10 a page by default (5 to 30); `tag` keeps the comments that picked that quick tag. Buyer names are
masked like product reviews.

```json
{
  "data": [{
    "id": 7, "comment": "Mabilis mag-reply.", "tags": ["Fast shipping", "Good packaging"], "edited": false,
    "created_at": "...", "updated_at": "...",
    "buyer": { "name": "J**n D.", "avatar_url": null },
    "seller_reply": { "body": "Salamat po!", "replied_at": "...", "edited_at": null }
  }],
  "meta": { "current_page": 1, "last_page": 1, "total": 1 },
  "summary": { "count": 1, "tag_counts": [{ "tag": "Fast shipping", "count": 1 }, { "tag": "Good packaging", "count": 1 }], "latest": [] },
  "shop": { "name": "Bloom Skin & Scents", "slug": "bloom-skin-scents", "seller_id": 12 }
}
```

`summary.tag_counts` lists the tags buyers picked, most picked first (tags nobody picked are left out).
`GET /api/v1/shops/{shop}` also returns `shop_reviews`: the same summary with the **3 latest** in `latest`.

## Signed-in buyer

- `GET /api/v1/shops/{shop}/my-shop-review` → `{ can_review, reason, review, edits_left_today, tags }`. `reason` explains why not (no completed order yet, or it is your own shop).
- `POST /api/v1/shops/{shop}/my-shop-review` `{ comment, tags? }` → `201`. `403` with the reason when the buyer cannot comment. The seller gets an in-app notification (`shop_review.new`, "New comment on your shop").
- `PATCH /api/v1/shops/{shop}/my-shop-review` `{ comment, tags? }` → `{ data, edits_left_today }`. `404` if there is no comment yet, `429` after 2 edits that day.

Both writes are limited to 20 a minute.

## Seller

- `GET /api/v1/seller/shop-reviews?replied=0|1&page=` → comments on the signed-in seller's shop, `meta.unreplied` and the `summary`.
- `POST /api/v1/seller/shop-reviews/{id}/reply` `{ body }` → `201`; `PATCH` the same path edits it. Another shop's comment is `404`.

## Admin (read-only)

- `GET /api/v1/admin/reviews/shops/{seller}/shop-reviews?page=` → the shop's comments with `buyer_full_name` and `buyer_email`, and the `summary`.

## Web pages

- Shop page (`/shop/:slug`): a **Shop comments** count in the header; the Reviews tab has **Comments about the shop** (count, top tags, 3 latest, **See all comments**, **Comment on this shop** / **Edit your comment**) beside **Product reviews** (with stars).
- `/shop/:slug/reviews`: every comment, newest first, filtered by tag.
- Seller centre, Reviews & Ratings: a **Shop comments** tab with replies (`?tab=shop`).
- Admin Reviews, a shop's page: **Product reviews** / **Shop comments** toggle.
