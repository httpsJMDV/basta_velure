# Product reviews: the public list and "Helpful"

What buyers wrote about a product, and the "Helpful" votes on it. Writing and editing a review is
`BuyerReviewController` (`/buyer/reviews`, A12): only a `COMPLETED` order's product, once per product per order, within
30 days of completion, 1 to 5 stars, up to 500 characters and up to five JPG or PNG photos of 5 MB each, editable once.

Tables: `reviews`, `review_images` (photos, public disk under `review_images/`) and `review_helpful_votes` (migration
`2026_11_04_000001`, model `ReviewHelpfulVote`, unique `review_id, user_id`). Controllers `PublicProductController`,
`PublicShopController` and `ReviewHelpfulController`.

## `GET /api/v1/products/{product}/reviews?rating=&with_photos=&sort=&page=`

Public. 10 a page. Only reviews with `moderation_status = visible`.

| Parameter | Meaning |
|---|---|
| `rating` | `1` to `5`: only reviews with that many stars. |
| `with_photos` | `1`: only reviews with at least one photo. |
| `sort` | Left out: highest stars first, then newest (the website's default). `recent`: newest first. `helpful`: most "Helpful" votes first, then the reviews with more photos, then newest. |

A signed-in caller can send its bearer token: the list then says whether that account marked each review (`helped`)
and whether the review is its own (`is_mine`). Without a token both are `false`.

```json
{
  "data": [{
    "id": 31, "rating": 5, "comment": "Matibay at maganda.", "verified_purchase": true,
    "variant_label": "Natural / Large",
    "images": ["https://…/storage/review_images/a.jpg"],
    "created_at": "2026-11-02T09:12:00+08:00",
    "buyer": { "id": null, "name": "A*a C.", "avatar_url": null },
    "seller_reply": { "body": "Salamat po!", "replied_at": "…", "edited_at": null },
    "helpful_count": 4, "helped": false, "is_mine": false
  }],
  "meta": {
    "current_page": 1, "last_page": 3, "total": 24,
    "avg_rating": 4.6,
    "rating_counts": { "1": 0, "2": 1, "3": 2, "4": 5, "5": 16 },
    "photo_count": 9
  }
}
```

`total` counts the filtered list. `avg_rating`, `rating_counts` and `photo_count` always describe **every** visible
review of the product, whatever the filters, so a client can label its filter chips from any page.

`GET /api/v1/shops/{shop}/reviews` (signed in, see `shop-reviews.md`) carries the same `helpful_count`, `helped` and
`is_mine` on each review. The author's own list, `GET /api/v1/buyer/reviews`, carries `helpful_count`.

## `PUT /api/v1/reviews/{review}/helpful` and `DELETE /api/v1/reviews/{review}/helpful`

Signed in (`auth:sanctum`, `active_account`), any role, 60 a minute. `PUT` marks the review as helpful for the caller,
`DELETE` takes the mark back. Both are **idempotent**: a second `PUT` or `DELETE` (a double tap, a retry after a lost
answer) leaves one vote or none and answers the same way. The unique index makes two `PUT`s that race each other count
once.

```json
{ "data": { "review_id": 31, "helpful_count": 5, "helped": true } }
```

| Status | When |
|---|---|
| `200` | Done. `helpful_count` is the review's count after the change. |
| `401` | No token, or an expired one. |
| `404` | No such review, a deleted one, or one that is not `visible`. |
| `422` | `PUT` on the caller's own review: `"You cannot mark your own review as helpful."` |

## Who sees what

- Buyer names are masked (`A*a C.`); the buyer's id is never returned.
- A vote is never shown to anyone as a name: only the count, and to the voter their own `helped`.
- Votes go when the review or the account is deleted (`cascadeOnDelete`).
- Admins cannot hide reviews (see `admin-orders-reviews.md`), so every review is in the average.

## Sharing

There is no share endpoint. The app shares the product's web link (`{web}/products/{id}`) with the review's stars,
name and text through Android's share sheet.
