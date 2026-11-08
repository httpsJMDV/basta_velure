# Return pickups (reverse logistics)

After a return is approved, a rider collects the item from the buyer and brings it back to the shop.

## Flow

1. **Booked**: when a return is approved (by the shop, by the 3-day rule, or by Loved-IT) a pickup is booked for the
   hub that delivered the order. The shop can untick "Send a rider to bring the item back to me" to let the buyer keep
   it (cheap or broken items). "Parcel not received" never books one.
2. **Rider assigned**: the hub (Deliveries page, app More → Return pickups) or the courier (Return to sender page)
   gives it to an active delivery rider. It can go to another rider until it is collected. Truck drivers cannot take it.
3. **Collected**: the rider takes a camera photo of the item at the buyer's door. A missed visit is recorded with a
   reason; the third missed visit cancels the pickup and the shop and buyer are told to arrange it in chat.
4. **Handed to the shop** by the rider, then **Shop has it back** when the shop taps "I received the item".

Money does not change: the refund is still decided when the return is approved (docs/api/refunds.md). Like a return to
sender trip, a return pickup earns the rider nothing. Every step is on the order timeline and in the activity logs.

## Endpoints

- `POST /seller/orders/{order}/respond-return {action: approve, return_item?: bool}`: `return_item` defaults to true
- `GET /hub/return-pickups`, `POST /hub/return-pickups/{id}/assign {rider_id}`: the hub's own riders
- `GET /logistics/return-pickups`, `POST /logistics/return-pickups/{id}/assign {rider_id}`: the courier's riders
- `GET /rider/return-pickups`; `POST /rider/return-pickups/{id}/collected {photo}` (JPG or PNG);
  `POST /rider/return-pickups/{id}/failed {reason}` (5 to 200 characters); `POST /rider/return-pickups/{id}/delivered`
- `POST /seller/orders/{order}/return-pickup/received`
- `GET /return-pickups/{id}/photo`: buyer, shop, the rider, the hub, the courier and admins; 404 for anyone else

Lists answer `data[]` (open first, then the last 20 finished) and `meta: {waiting, moving, riders[]}` for the hub and
the courier, `meta.open` for the rider. The buyer's and shop's order payloads carry `return_pickup`
(`{id, code, status, status_label, attempts, max_attempts, last_failure, rider_name, collected_at, ..., photo_url}`);
the rider, hub and courier also get `buyer`, `shop` (name, phone, address) and `rider`.

Statuses: `requested`, `assigned`, `collected`, `delivered`, `received`, `cancelled`. Table `return_pickups`, migration
`2026_11_06_000003`. Tests: `tests/Feature/ReturnPickupTest.php`.

## Far from the shop (Nov 8)

When the shop is near another hub (the parcel came through the hubs), the rider drops the item at their hub
(`POST /rider/return-pickups/{id}/dropped`, status `at_hub`) and it travels back through the hubs with the parcels. At
the hub near the shop, the hub or courier gives the last leg to a rider with the same assign endpoint (status
`out_to_shop`), who marks it delivered. See docs/api/courier-network.md.
