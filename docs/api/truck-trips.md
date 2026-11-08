# Truck trips between hubs (line-haul)

Parcels that one hub receives for another hub's barangays travel on the courier's truck. The **courier company** hires
the truck drivers, the **sending hub** picks the driver, and the **next hub's scans** finish the trip.

## Who does what

| Who | What |
| --- | --- |
| Truck driver applicant | Applies on the public Become a rider form (website `/register/rider` or the app) with Job: Truck driver, a home hub, and a Truck or Van. `POST /auth/register-rider` takes `duty: truck` |
| Courier company | Reviews truck driver applications (Riders page; the hub never sees or decides them, 403 if it tries), or adds drivers itself (Add rider, Job: Truck driver). Sets the pay per trip, pays drivers and marks it paid, closes a trip whose parcels went missing |
| Sending hub | Under Sorting, For other hubs: Load on a truck, picks a free driver |
| Truck driver | Rider app or `/rider/trips`: sees the trip and the parcels on board, taps "I'm at the hub" at the dock |
| Next hub | Scans the parcels in as usual (Parcel intake); the last scan completes the trip |

## Pay

A trip pays the courier's `logistics_companies.truck_trip_rate`, or `logistics.truck_trip_rate` (₱800,
`LOGISTICS_TRUCK_TRIP_RATE`) when the courier has not set one. The amount is copied onto the trip when it starts, so a
new rate only affects new trips. The driver is owed it once the trip is completed or closed.

The courier pays the driver from its own money, the way a logistics company pays its line-haul drivers. Nothing comes
out of the shipping fee split (riders 85%, hub 15%), and no order or payment amount changes.

## Rules

- `riders.duty` is `delivery` (as before) or `truck`. Truck drivers drive a Truck or a Van, never get delivery areas,
  pickup offers, deliveries or returns (`Rider::carriesParcels()` everywhere riders are picked).
- Once the courier has at least one active truck driver, `POST /hub/transfers/send` needs `driver_id`. Without truck
  drivers it works as before (no trip).
- One trip goes to one hub, and a driver takes one trip at a time.
- The order timeline says "Package left X on a truck. Next stop: Y." The order stays `AT_SORTING_CENTER`.
- Every trip start, close, rate change and payment is in the audit log.

## Endpoints

Hub (`approved_sorting_center`):

- `GET /hub/truck-drivers` → `data[]: {id, name, phone, vehicle_type, plate_number, home_hub, busy, on_trip_to}`
- `POST /hub/transfers/send {tracking_numbers[], driver_id?}` → `{message, sent_count, to[], trip|null}`; 422 on
  `driver_id` when it is missing (truck drivers exist), not a free active truck driver of the courier, or the parcels
  go to more than one hub
- `GET /hub/truck-trips?direction=out|in` → `data[]` (trip with `parcels[]`), `meta.on_the_way`
- `POST /hub/truck-trips/{trip}/receive {missing?: [tracking]}`: the hub the truck goes to receives every parcel on it at
  once (like scanning one sack), except the ones named missing, which stay expected; 404 for another hub, 409 once finished

Truck driver (`approved_rider`):

- `GET /rider/trips` → `data: {is_truck_driver, current|null, trips[], pay: {unpaid_total, unpaid_trips, paid_total, trips_this_week, rate}}`
- `POST /rider/trips/{trip}/arrived` → tells the next hub the truck is at its dock (once)

Courier (`logistics_member`):

- `GET /logistics/truck-drivers` → drivers with `current_trip`, `unpaid_trips`, `unpaid_amount`, `trips_this_week`;
  `summary: {drivers, active, on_the_way, unpaid_amount, rate}`
- `GET /logistics/truck-trips?status=on_the_way|completed|closed|unpaid&driver_id=`
- `POST /logistics/truck-drivers/{rider}/pay {reference?}` → pays every finished, unpaid trip; 422 when none
- `POST /logistics/truck-trips/{trip}/close {reason}` (5 to 500 characters)
- `PUT /logistics/truck-rate {rate}`

A trip: `{id, code (TRK-YYMMDD-XXXX), status (on_the_way|completed|closed), from_hub, to_hub, driver, plate_number,
parcel_count, received_count, departed_at, driver_arrived_at, completed_at, close_reason, pay_amount, paid_at,
paid_reference}`.

Notifications: the driver on a new trip, when it completes and when paid; the next hub when the driver reports at the
dock. Tests: `tests/Feature/TruckTripTest.php`.

## Ships and planes (Nov 8)

Between island groups a trip can be a ship or a plane: `mode` sea or air, `carrier_name`, `carrier_reference`,
`eta_at`, no driver and no trip pay. Only island gateways send them. The courier's truck planner
(`GET /logistics/truck-planner`) works out how many drivers the land trips need. See docs/api/courier-network.md.
