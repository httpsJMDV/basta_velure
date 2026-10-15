# Track package and live courier location

Buyers, sellers, hubs, riders and admins can open **Track package** for a parcel: a timeline like the one on a shopping app, the places on the route, a map, and (while a courier carries the parcel) the courier's position on that map.

## Who sees what

| Viewer | May read tracking | Notes |
|---|---|---|
| Buyer | the order's buyer | |
| Seller | the parcel's seller | sees the rider arriving on the pickup leg |
| Hub | an **approved** hub that owns the parcel | |
| Rider | the rider the parcel is **assigned** to, or the rider who **picked it up** from the seller | |
| Admin | any parcel | |

Anyone else, and an unknown tracking number, gets the same `404` (it reveals nothing about which parcels exist). `401` when not signed in.

## `GET /api/v1/parcels/{tracking}/tracking`

`Cache-Control: private, no-store`.

```json
{ "data": {
  "tracking_number": "LIT-261016-AB34X9",
  "order_number": "VEL-...",
  "status": "OUT_FOR_DELIVERY",
  "viewer_role": "buyer",
  "origin":      { "name": "Marco Gadgets", "full_address": "12 Rizal St, Poblacion, Santa Cruz, Laguna", "barangay": "...", "city": "...", "province": "..." },
  "hub":         { "name": "Demo Sorting Hub", "full_address": "...", "barangay": "...", "city": "...", "province": "..." },
  "destination": { "name": "Ana Buyer", "full_address": "...", "barangay": "...", "city": "...", "province": "..." },
  "courier": {
    "state": "live",
    "leg": "delivery",
    "name": "Juan T.",
    "vehicle_type": "Motorcycle",
    "location": { "latitude": 14.2813, "longitude": 121.416, "heading": 90, "accuracy_m": 12, "updated_at": "2026-10-16T10:00:00+00:00" }
  },
  "events": [
    { "status": "OUT_FOR_DELIVERY", "title": "Out for delivery", "detail": "Your package is out for delivery.", "at": "...", "proof": false }
  ],
  "proof": { "count": 2, "delivered_at": null, "received_by": null }
} }
```

- `events` come from the order's status history, **newest first**. The `DELIVERED` event has `proof: true` when delivery photos exist; the photos are fetched from `GET /parcels/{tracking}/delivery-proof` and `?photo=2` (`docs/api/rider-delivery-outcomes.md`).
- `hub` is `null` when the parcel has no hub yet.
- `courier.name` is the first name and the last initial only. The courier's phone, email and ids are never in this payload.

### Courier `state`

| `state` | Meaning |
|---|---|
| `live` | A rider carries the parcel and sent a location in the last **2 minutes**. |
| `stale` | The newest location is **2 to 30 minutes** old. It is still returned (with `updated_at`) so the map can say "last seen". |
| `not_sharing` | A rider carries the parcel but there is no location, or it is older than 30 minutes. `location` is `null`. |
| `not_with_courier` | Nobody is carrying it: the parcel is waiting at the seller, at the hub, or already delivered or returned. `location` is `null`, `leg`, `name` and `vehicle_type` too. |

A rider **carries** a parcel in these cases only (`leg`):

- `pickup`: `READY_FOR_PICKUP` or `PICKED_UP` with a `pickup_rider_id` (the way to the seller and back to the hub);
- `delivery`: `OUT_FOR_DELIVERY` with an `assigned_rider_id`.

Outside those statuses the position is never returned, even if the rider's last point is recent.

## Rider location

Only the **latest** point is stored (`riders.last_latitude`, `last_longitude`, `last_heading`, `last_accuracy_m`, `last_located_at`). Every ping overwrites the one before, there is no trail, and nothing reads it except the tracking endpoint above.

### `GET /api/v1/rider/location/status`

```json
{ "data": { "sharing_required": true, "active_parcels": 2, "last_located_at": "2026-10-16T10:00:00+00:00" } }
```

`sharing_required` is true while the rider has a parcel to collect or carry: `READY_FOR_PICKUP` or `PICKED_UP` as the pickup rider, or `ASSIGNED_TO_RIDER` or `OUT_FOR_DELIVERY` as the delivery rider. The rider app asks for the phone's location and blocks the courier screens until it has it while this is true.

### `POST /api/v1/rider/location`

`{ "latitude": 14.28, "longitude": 121.41, "heading": 90, "accuracy": 12 }`. `latitude` (-90 to 90) and `longitude` (-180 to 180) are required; `heading` (0 to 360) and `accuracy` (metres) are optional. `422` for bad input, **`409` when the rider has nothing to carry** (a rider who is off duty is never tracked), `403` for anyone who is not an approved rider. Throttled to 60 a minute.

## Map and route (web app)

- Tiles: **OpenStreetMap** (free, no key). Route line and ETA: the public **OSRM** demo server (free, no key). Place lookup: **Nominatim** (free, no key), done in the browser with a local cache and at most one request a second, falling back from the full address to barangay, city and province. All three are fair-use services, so a deployment with real traffic should point `VITE_MAP_TILE_URL`, `VITE_OSRM_URL` and `VITE_GEOCODE_URL` at its own or a paid provider.
- The truck on the map slides between pings instead of jumping and turns to the rider's heading.
- Places that cannot be found on the map are listed under it in words, and the map still shows the courier.

## Limits

- The rider must keep the courier page open for the phone to report its position (a browser cannot track in the background). The app tells them so.
- A phone without GPS reports a rough position from wifi or the cell tower, and `accuracy_m` shows it.
