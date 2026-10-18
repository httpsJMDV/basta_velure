# Courier operations: dispatch, hub scanning, exceptions, Return to Sender, COD

The courier company's work (Logistics workbook L1, L4 to L9) and the rider's side of it (Rider workbook R3, R4, R7,
R9). Company routes are under `/api/v1/logistics/*` and need a signed-in member of an approved courier company
(`403` otherwise, including for riders). Rider routes are under `/api/v1/rider/*` for an Active rider; a suspended
rider can read their pages but every action is a `403` with the suspension reason.

Every parcel action locks the parcel row first, so two actions on one parcel at the same moment end with one winner
and a clear `409` for the other.

## Online and Offline (R3)

| Route | What it does |
|---|---|
| `GET /rider/status` | `{ online, status, active_jobs, max_active_jobs, online_since }` |
| `POST /rider/availability {online: bool}` | Going Online needs an Active rider with an unexpired license. Going Offline is always allowed: accepted jobs stay and can be finished; an open offer moves to the next rider. |

A rider counts as Online only while their app has been heard from in the last 30 minutes (every rider request is a
heartbeat), so a closed app or an expired session drops them to Offline. Logging out sets them Offline at once.

## Pickup offers and dispatch (A14, L4, R4)

When a shop marks an order Ready for Pickup, the parcel is offered to the **nearest eligible rider** of the order's
courier company for **60 seconds**. Eligible: Active, Online, fewer than **3** active jobs (pickups not yet at the hub,
deliveries not finished, returns). Nearest is by address: a rider whose delivery area covers the shop's barangay, then
the same city, province and region; a tie goes to the rider with fewer jobs, then the one Online longest. A decline or
an expired offer goes to the next rider; after **3** tries the job waits in the **Unassigned** queue and is not offered
again on its own. `php artisan dispatch:expire-offers` runs every minute, and both apps expire offers whenever they load
(the rider app checks every 5 seconds), so an expired offer moves on within seconds while anyone is online.

| Route | What it does |
|---|---|
| `GET /rider/offers` | Open offers: pickup shop and address, drop-off **area** only, COD amount, weight, `pay` (`30.00`), `seconds_left`. |
| `POST /rider/offers/{id}/accept` | `409` when the offer expired ("went to the next rider"), the job is already another rider's, the rider is Offline, or already holds 3 jobs. |
| `POST /rider/offers/{id}/decline` | The job goes to the next rider. |
| `GET /logistics/dispatch?state=unassigned\|offering\|assigned\|all` | The board, with `counts`, each job's open offer and its offer history. |
| `GET /logistics/dispatch/riders?parcel_id=` | `data`: riders who can take the job, nearest first, with jobs and distance; `unavailable`: the rest with the reason (Offline, Suspended, at the limit). |
| `POST /logistics/dispatch/auto-assign {parcel_ids?}` | A fresh round of offers for jobs nobody holds. |
| `POST /logistics/dispatch/assign {parcel_ids, rider_id}` | One parcel: assign, or reassign before pickup (the old rider is told; both events are on the order's timeline). Several: as many as the rider can hold; the rest come back in `skipped` with the reason and stay unassigned. `422` for an Offline, suspended or full rider; `409` for a parcel already picked up or not ready. |

The open pickup pool riders browse (`/rider/pickups`) still works, without the parcels being offered to someone
else, and accepting from it respects the 3-job limit.

## Hub scanning (L5)

| Route | What it does |
|---|---|
| `GET /logistics/hub-ops` | The company's approved hubs and how many parcels are at each step. |
| `POST /logistics/hub-ops/inbound {tracking_number, hub_id?}` | Picked Up → At Hub, with the scan time. |
| `POST /logistics/hub-ops/sort {tracking_number}` | At Hub → Sorted, into the zone of the delivery address (from the company's zones). |
| `GET /logistics/hub-ops/zones` | Parcels to sort, and one list per zone. |
| `POST /logistics/hub-ops/outbound {tracking_number, rider_id}` | Sorted → with the delivery rider. When the rider marks it Out for Delivery the buyer gets the delivery code. |

Scans work in order and once: a repeat is a `409` ("Already received on …, nothing was changed"), Outbound before
Inbound is a `409`, and an unknown or another company's tracking number is a `404` ("not found"). Nothing is created or
changed by a refused scan.

## One parcel: search, override, Lost and Damaged (L6, A35)

`GET /logistics/parcels?search=` matches a tracking number, an order number, the buyer's full name, or (a number on
its own) the order ID exactly. Every value is a bound parameter.

| Route | What it does |
|---|---|
| `GET /logistics/parcels/{id}` | The parcel, its riders, every failed attempt, the timeline, the `override_targets`, and the audit trail. |
| `POST /logistics/parcels/{id}/override {status, reason}` | Moves the parcel to its next step only (Picked Up, At Hub, Sorted, Out for Delivery, Delivered), with a reason of 10 to 300 characters. Delivered by override records the COD as collected by the rider. Written to the audit log with the user, time, from → to and reason. |
| `POST /logistics/parcels/{id}/exception {type: lost\|damaged, reason, photo}` | Damaged needs a JPG or PNG photo (5 MB). The order is cancelled, the vouchers go back, a prepaid order is refunded in full, a claim for the items opens for the shop, and the buyer and the shop are told. Only while the courier holds the parcel. |
| `POST /logistics/parcels/{id}/reschedule {rider_id}` | Another attempt after a failure: attempt N of 3. `409` once the parcel is going back to the seller. |

There is no route to edit or delete an audit entry.

## Return to Sender (A13, L7, R7)

A refusal, or the 3rd failed attempt, sends the parcel back at once (`RETURN_TO_SENDER`). The buyer and the shop are
told.

| Route | What it does |
|---|---|
| `GET /logistics/returns` | The queue, each parcel with all its failure reasons. |
| `POST /logistics/returns/{id}/assign {rider_id}` | The trip back to the shop. |
| `GET /rider/returns` | The rider's return trips. |
| `POST /rider/returns/{tracking}/delivered {note?}` | Handed back. The parcel is Returned; the order is **Cancelled (failed delivery)** for the buyer; a prepaid order is refunded in full; the shop earns nothing. The hub's `return-to-seller` action does the same. |
| `POST /seller/orders/{id}/confirm-return-received` | The shop confirms the parcel arrived; only now does the stock go back, once (`409` on a second confirmation). The seller's order shows `return_to_sender.state`: `on_the_way`, `awaiting_confirmation` or `confirmed`. |

## Cash on delivery and exports (A24, L9, R9)

A rider's balance is the COD they collected minus the remittances their company **confirmed**.

| Route | What it does |
|---|---|
| `GET /rider/cod` | `balance` (`collected`, `confirmed`, `pending`, `outstanding`, `can_remit`), the orders behind it, and the remittances. |
| `POST /rider/cod/remittances {amount, reference?}` with `Idempotency-Key` | Pending until the company confirms; the balance does not change before then. At most the balance; one pending at a time (`409`). A double tap with the same key returns the same remittance. |
| `GET /logistics/cod?date=` | The day per rider: collected, remitted, difference (a shortfall is flagged), the orders; and every pending remittance with its shortfall. |
| `POST /logistics/cod/remittances/{id}/confirm` | Only the company can confirm (a rider gets `403`). Written to the audit log; the rider is told, with any amount still on their balance. |
| `GET /logistics/exports?type=deliveries\|cod&format=csv\|xlsx&from&to` | Manila dates, both days included. Deliveries: every delivery completed in the range; COD: every collection. A total row closes each file; a range with no records gives the header row only. An end before the start is a `422`. |

## Dashboard period (L1)

`GET /logistics/dashboard?from=&to=` adds `period` (Manila dates, both days included; default the last 30 days):
`shipments` (made Ready for Pickup), `picked_up`, `delivered`, `failed` attempts, `returned` and `cod_collected`. An
end before the start is a `422`.
