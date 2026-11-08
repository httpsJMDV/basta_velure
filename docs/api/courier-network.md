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
