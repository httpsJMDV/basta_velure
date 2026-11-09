# The nationwide courier network

Every courier (J&T Express, Flash Express, Ninja Van) has a hub in every city and municipality of the Philippines,
regional and island gateways that link them, and the pages that run it. Migration `2026_11_08_000001`, built by
`php artisan network:build`. Tests: `tests/Feature/CourierNetworkTest.php`.

## Building it

`php artisan network:build [--courier=ID ...] [--dry-run] [--force]` (refuses on a `_test` database):

1. For each approved courier, a hub in every city and municipality whose barangays its approved hubs do not cover yet,
   covering exactly the missing barangays (`database/data/network/places.json`: PSGC, 1,634 places, 42,046 barangays).
   Hubs that already exist keep their area. A place name used twice gets its province: "San Jose (Antique)".
2. Every hub gets its place: `sorting_centers.city_code`, `province_code`, `region_code`, `island_group`.
3. Gateways: one hub per region (`gateway_region_code`, in the regional centre city, `PhPlaces::REGION_GATEWAY_CITY`)
   and one per island group (`is_island_gateway`: Manila, Cebu City, Davao City).
4. A starter delivery rider at each gateway hub without one, covering the hub's whole area.

Accounts follow the showcase rules: username `hub-<code>-<place>` / `rider-<code>-<place>`, email on the showcase
domain (never emailed), the showcase password of their kind. A second run adds nothing.

`hub_coverage` indexes every hub's `coverage_barangays` (one row per barangay, rewritten on save), so "which hub covers
this barangay" is one indexed query.

## Routes between hubs

`HubRouter::legs()`. Same region: one truck ride. Different regions: through both regional gateways. Different island
groups: also through both island gateways, the crossing by sea. A courier without gateways goes straight, as before.

Laguna to Digos: Santa Cruz → Calamba (regional gateway) → Manila (island gateway) → by sea → Davao City → Digos.

Each `parcel_hub_stops` row has `mode` (truck, sea, air) and `direction` (forward, return). The order stays
`AT_SORTING_CENTER` the whole way.

## Ships and planes

At an island gateway, `GET /hub/transfers` groups crossings with `mode: sea`. `POST /hub/transfers/send` takes
`mode: sea|air`, `carrier_name`, `carrier_reference` (bill of lading or air waybill) and `eta` (YYYY-MM-DD). Only an
island gateway sends by sea or air, and only a crossing goes that way (422 on `mode` otherwise). It starts a trip with
`truck_trips.mode` sea or air, no driver and no trip pay (the carrier is paid outside Loved-IT), code `SEA-`/`AIR-`.
The next gateway receives it like a truck (`POST /hub/truck-trips/{trip}/receive`).

`GET /hub/transfers` rows: `hub {id, name, city, province, gateway}`, `mode`, `parcel_count`,
`counts {parcels, return_to_sender, buyer_returns}`, `final_hubs[]`, `final_hub_count`, `tracking_numbers[]`,
`return_codes[]`; `meta.is_gateway`, `meta.gateway`, `meta.carriers`, `meta.cargo_days`.

## Back to the shop

- **Failed delivery far from the shop**: `ReturnToSender::afterFailure` adds the way back (`direction: return`) to the
  hub that first received the parcel. Hubs send it on under For other hubs. The courier assigns the return rider, and a
  hub hands it back, only once it is there (409 before). `GET /logistics/returns` rows add `travelling_back`,
  `back_to_hub`, `now_at`.
- **Buyer return far from the shop**: the pickup gets `destination_hub_id` (the shop's hub). The collecting rider taps
  `POST /rider/return-pickups/{id}/dropped` instead of taking it to the shop (422 on delivered). Status `at_hub`; it
  travels in `return_pickup_stops` with the parcels (`return_codes` on send, RTN codes scan in at
  `POST /hub/parcels/{code}/receive`, `meta.returns` on `GET /hub/intake/expected`). At the shop's hub the hub or courier
  assigns the last leg with the same assign endpoint (status `out_to_shop`, `shop_rider_id`); that rider marks it
  delivered. Pickup payloads add `through_hubs`, `collect_hub`, `shop_hub`, `current_hub`, `in_transit`, `next_hub`,
  `ready_for_shop_rider`, `shop_rider`; the rider list adds `my_step` (collect, drop_at_hub, deliver_to_shop).

## Checkout

- Courier choice (`CourierAssigner`): the shop's end, then the buyer's end, then the courier with the fewest open
  parcels, then the default courier. Read through `hub_coverage`.
- Once a courier has an island gateway, checkout needs one courier with hubs at both ends:
  "No courier delivers from {shop} to your barangay yet." Before that, the delivery zones alone decide (L8).
- Delivery estimate (`PhPlaces::estimate`, `config/logistics.php` `eta_days`): same city 1–2 days, same province 1–3,
  same region 2–4, same island group 3–5, another island group 5–8 by sea. On the quote (`shipping.eta`) and saved on
  the order (`orders.eta_min_days`, `eta_max_days`; `eta` on buyer and seller order payloads).

## Truck planner

`GET /logistics/truck-planner`, `PUT /logistics/truck-planner {capacity, shift_hours}` (10–5,000 parcels, 1–16 hours;
defaults `LOGISTICS_TRUCK_CAPACITY` 300, `LOGISTICS_TRUCK_SHIFT_HOURS` 8, `LOGISTICS_TRUCK_TRIP_HOURS` 3). Per land route
of the last 7 days: parcels a day (or what waits now, if more) ÷ capacity = trips a day; × twice the one-way hours =
driver hours; all routes ÷ the shift = drivers, plus a spare (20%, at least 1). Ships and planes are counted apart.
Answers `settings`, `drivers`, `demand`, `needed {trips_per_day, driver_hours_per_day, drivers, spare, recommended}`,
`verdict` (idle, short, tight, ok, more_than_needed), `message`, `routes[]` (30 busiest).

## Coverage

`GET /logistics/coverage?region=`: `islands[] {key, name, gateway, regions[] {code, name, short, hubs,
hubs_with_riders, riders, barangays, barangays_covered, gateway}}`, `totals`, and with a region its `provinces[]`
(Metro Manila: its cities). `GET /logistics/coverage/hubs?region=&province=&search=&show=all|no_riders|gateways&page=`:
25 a page with riders, barangays and parcels at each hub.

## Pages

Website: courier Coverage (`/logistics/coverage`), the planner on Truck drivers, ships and planes and returns in the
hub's For other hubs, returned items on hub intake, the route with gateways on Track package, the estimate at checkout
and on the buyer's order. Long hub lists search (dropdowns, rider sign-up by city, Messages, Hubs 48 at a time). App:
ship or plane sheet on hub Sorting, drop-at-hub and last-leg return steps, gateways and sea legs on the rider's route,
the plan card on courier Trucks.

## Branches (network:consolidate, Nov 9)

A hub in every town was more than couriers really run (Flash Express reported 28 sorting hubs and 736 delivery
branches in 2024). `php artisan network:consolidate [--courier=ID ...] [--radius=KM] [--dry-run] [--force]` (refuses on
`_test`; `NetworkBuilder::consolidate`) cuts each courier to **branches**:

1. Every town has a location (`places.json` `lat`/`lng`, from Wikidata P988/P625 and OpenStreetMap Nominatim).
2. Per province (Metro Manila and towns without a province: per region), every hub that must stay is a branch:
   gateways, hubs not made by `network:build`, and hubs with riders, parcels, stops, transfers, trips, return pickups,
   earnings or chats. Then the town that reaches the most towns still without a branch within `--radius`
   (`logistics.branch_radius_km`, default 15 km between town centres, about 20 km of road) becomes one, until every
   town is covered. Each town goes to its nearest branch.
3. The other network hubs hand their barangays to their branch (`coverage_barangays`, so `hub_coverage` follows) and
   are deleted with their accounts.
4. Each branch gets 2 delivery riders (a motorcycle, and a tricycle in a town that is not a city) covering the whole
   branch, and 1 truck driver (2 at a gateway), username `rider-<code>-<place>` / `truck-<code>-<place>`, the
   showcase rider password. Network riders' areas grow to the whole branch.

Result with the default reach: 594 branches per courier (from 1,624), every barangay still covered; 1,166 riders and
611 truck drivers hired per courier. A second run changes nothing. Majayjay, for example, has no branch: the Cavinti
branch (about 12 km away) covers it, a truck brings parcels there and a rider makes the short ride.

## Very remote towns

`PhPlaces::isRemoteTown` (`places.json` `remote`): not a city or capital, and no other town of its province within 40
km. 14 towns: Calayan, Dinapigue, Alfonso Castaneda, Balabac, Cagayancillo, El Nido, Linapacan, Taytay, Kalayaan,
Caluya, Sarangani, Tongkil, Mapun, Turtle Islands. They get no branch; the nearest one covers them.

- Checkout: `shipping.remote` on each store of the quote. `POST /checkout/place-order` takes
  `remote_delivery: barangay_hall|branch` (default `barangay_hall`), saved as `orders.delivery_point` (migration
  `2026_11_09_000002`; null for every other order). Buyer and seller orders add `delivery_point`,
  `delivery_point_label`; the buyer's adds `delivery_point_note` (`RemoteDelivery`).
- Barangay hall: the rider's stop adds `delivery_point` and `delivery_note` ("take this parcel to the ... barangay hall;
  the buyer meets you there, or a barangay official signs for it"). Delivery works as usual (photo, exact COD).
- Branch: the sorted parcel skips the riders (`/hub/dispatch/batches` leaves it out, assign answers 422) and waits at
  `GET /hub/counter`. `POST /hub/counter/{tracking}/handed-over` (multipart `proof_photo`, `received_by`, `cod_amount`
  for COD, exact) marks it DELIVERED by the hub (`SORTED → DELIVERED` for `hub` in the state machine). No rider is
  paid; the hub's share is recorded as usual.

## Vehicles on the route

Journey nodes add `rider_vehicle` (the pickup rider's on the first hub, the delivery rider's on the buyer stop) and, on
the buyer stop, `delivery_point` with the title "Barangay hall of ..." or "Pick up at the branch" (label "Ready for you
at the branch", then "Picked up"). Track package and the rider app say "By truck · long haul" between hubs and "By
tricycle · short ride" (the rider's own vehicle) at both ends. Rider stops add `vehicle`.

Website: Delivery guide at `/help/delivery` (footer: Customer service, and the Delivery note), the remote choice at
checkout, the counter panel on hub Dispatch. App: the barangay hall note on rider stops and in checkout and orders.
