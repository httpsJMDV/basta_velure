# Pickup control (web and Flutter)

Authenticated approved courier staff use `/api/v1/logistics/pickup-control`; approved hub owners use `/api/v1/hub/pickup-control`.

- `GET /pickup-control`: `data.scope`, `name`, `settings`. Each of `auto_seller_pickups` and `auto_return_pickups` contains `value`, `effective`, `company_default`.
- `PATCH /pickup-control`: both fields required. Courier values are boolean; hub values may be null to inherit the company default. Changes are audited as `dispatch.settings_changed`.
- `GET /pickup-control/jobs`: up to 200 ready seller pickups, including rider, state, address and pickup slot.
- `GET /pickup-control/riders?parcel_id=…`: eligible riders with name, active job count and distance tier.
- `POST /pickup-control/assign`: `{parcel_id, rider_id}`. Reuses the dispatch service's assignment, capacity, notifications, offer cancellation and audit checks. Parcel rows are locked. Hub requests additionally require the parcel's origin hub and the rider's hub to match the signed-in hub. Foreign company parcels are never accessible.

Company defaults preserve existing behavior: automatic seller pickup offers **on**, automatic buyer return assignment **off**. Hub preferences initially inherit. Origin hubs are approved hubs of the assigned courier covering the pickup barangay in `hub_coverage`, ordered by ID when coverage overlaps. Courier staff handle pickups with no matching origin hub.

Turning automatic seller pickups off cancels only unaccepted offers. Existing assignments and pickup windows remain. All automatic entry points (new pickup, scheduled release, decline, offer expiry and courier retry) respect the preference. Rider self-claim also respects it. Staff may assign or reassign before physical collection in either mode. Turning it on applies to new/scheduled pickups; courier Dispatch's existing Run auto-assign retries the waiting queue.

Approved returns are **booked** by the existing return flow. Booking does not itself mean a rider has been assigned. Optional automatic return assignment runs every minute and when staff open a return list. It assigns only active, online delivery riders at the responsible approved hub, with fewer than three active jobs. Buyer-return pickup/carry jobs and final hub-to-shop jobs now count in workload alongside normal parcels and return-to-sender jobs. No eligible rider means the return stays waiting. No reassignments are performed automatically.

The delivering hub owns collection from the buyer. Returns travelling through hubs get their final rider at the shop's destination hub only after arrival. Existing manual return endpoints remain available to hub/courier staff. Normal delivery dispatch, truck trips, money and rider pay are unchanged.

Work accounts (rider, hub, courier, pending applications included) cannot shop. Both clients hide buyer destinations, redirect shopping routes, and the API's existing `shopper` middleware rejects shopping mutations. Sellers retain access to other shops and the existing self-purchase ban.
