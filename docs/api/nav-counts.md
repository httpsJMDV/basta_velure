# Sidebar counts (nav badges)

The number next to a sidebar item: how much is waiting on this account there. One light request per portal, read
when the page changes and once a minute while the tab is visible. Counts only, no rows. Each count follows the rule of
the page it points to, so the badge and the page agree. A count of 0 hides the badge.

Unread chat counts are not repeated here, except for the admin and the seller (who had no separate chat poll in the
sidebar): the hub, courier and rider portals keep their own chat unread endpoints.

All answers are `200 {"data": {...}}` with whole numbers. A guest gets 401; an account of another portal gets 403
(the portal's usual middleware).

## `GET /api/v1/admin/nav-counts` (admin)

| Key | Sidebar item | Rule |
| --- | --- | --- |
| `seller_applications` | Seller Applications | `seller_profiles.application_status = pending` |
| `buyer_applications` | Buyer Applications | `users.buyer_application_status = pending` |
| `courier_applications` | Courier Applications | courier companies `PENDING` |
| `hub_applications` | Hub Applications | hubs `PENDING` (approved by their courier; the admin oversees) |
| `products` | Products | products `pending_review` |
| `payments` | Payments & Payouts | GCash orders `pending_verification` + payout requests `pending` |
| `disputes` | Disputes / Returns | disputes `escalated`, `open`, `in_progress` + refunds reported not received or late (the refunds "attention" queue) |
| `messages` | Messages | sum of `conversations.admin_unread` |

## `GET /api/v1/seller/nav-counts` (approved seller)

| Key | Rule |
| --- | --- |
| `orders_new` | orders with a line of this shop in `PLACED` (the New tab) |
| `orders_to_prepare` | `CONFIRMED`, `PREPARING` (the part of To ship that is still the shop's job; `READY_FOR_PICKUP` waits for the rider) |
| `returns_to_answer` | return requests of this shop in `pending` (3 days to answer) |
| `refunds_to_send` | refunds of this shop in `awaiting_shop` |
| `products_rejected` | this shop's products `rejected` |
| `products_low_stock` | active products of this shop with a variant at or under its low-stock level |
| `messages` | the seller's unread chat count (same as `/conversations/unread-count`) |

Orders are counted once each, whatever their number of lines. The web shows Orders = new + to prepare + returns +
refunds, and Products = rejected + low stock.

## `GET /api/v1/hub/nav-counts` (approved hub)

| Key | Rule |
| --- | --- |
| `intake` | parcels expected at this hub (`Parcel::expectedAtHub`) |
| `sorting` | parcels waiting to sort here, plus parcels waiting to be sent to another hub |
| `dispatch` | `SORTED` parcels with a destination barangay (the dispatch batches) |
| `deliveries` | `DELIVERY_FAILED` parcels + return pickups `requested` in this hub |
| `riders` | delivery riders of this hub in `PENDING` |

## `GET /api/v1/logistics/nav-counts` (courier company member)

| Key | Rule |
| --- | --- |
| `hubs` | the company's hubs `PENDING` |
| `riders` | the company's riders (truck drivers included) `PENDING`, or with papers to check again |
| `trucks` | finished truck trips not paid yet (`TruckTrip::unpaid`) |
| `dispatch` | `READY_FOR_PICKUP` parcels with no rider and no offer (the Unassigned queue) |
| `parcels` | `DELIVERY_FAILED` parcels |
| `returns` | `RETURN_TO_SENDER` parcels with no rider + return pickups `requested` |
| `cod` | rider COD remittances `pending` (only the company confirms them) |

## `GET /api/v1/rider/nav-counts` (approved rider)

| Key | Rule |
| --- | --- |
| `pickups` | pickup stops (one per shop): open requests in the rider's active areas + ones the rider took + ones picked up and not yet at the hub (the Pickups tabs) |
| `deliveries` | parcels `ASSIGNED_TO_RIDER` or `OUT_FOR_DELIVERY` for this rider + this rider's return pickups `assigned` or `collected` |
| `trips` | a truck driver's trips `on_the_way` (0 for a delivery rider; a truck driver gets 0 pickups and deliveries) |
