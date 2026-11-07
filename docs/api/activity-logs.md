# Activity logs: hub, courier and rider

Read-only logs of what happened, newest first, on the website and in the app:

- Hub: `/hub/activity` (website menu Insights → Activity log; app More → Activity log)
- Courier company: `/logistics/activity` (Insights → Activity log; app More → Activity log)
- Rider and truck driver: `/rider/activity` (website menu Activity; app Account → Activity)

## Where the lines come from

`App\Services\Courier\ActivityFeed` reads two tables that already existed, so the log also covers everything from
before it was built:

- the order timeline (`order_status_histories`): status changes from Ready for pickup onwards, and the events that
  keep the status (pickup assigned, left for another hub, arrived from another hub, return rider assigned, return
  pickups);
- the audit log (`audit_logs`): dispatch decisions, rider approvals and suspensions, vehicle and license changes,
  parcel corrections, truck trips, truck pay, COD hand-overs, zones and rates.

Nothing is written for the log itself.

## Who sees what

| Log | Lines |
| --- | --- |
| Hub | Timeline of every parcel the hub received or that passed through it on a transfer; audit lines about those parcels, the hub's riders, its truck trips (from or to it) and the hub account's own actions |
| Courier | Timeline of every parcel of the company; audit lines of the company |
| Rider | Timeline lines the rider made; audit lines about the rider, their truck trips, and their own actions |

## Endpoint

`GET /{hub|logistics|rider}/activity?category=&search=&before=`

- `category`: `pickups`, `hub`, `transfers`, `deliveries`, `failed`, `returns`, `cancellations`, `team`, `money`,
  `settings` (422 otherwise)
- `search`: a tracking or order number (part of one is enough), up to 60 characters
- `before`: the `meta.next_before` of the previous page

Answer: `data[]: {id, kind (timeline|audit), category, title, detail, at, actor: {role, name}, tracking_number,
order_number}`, `meta: {next_before, categories[]: {key, label}}`. 40 lines per page.

Tests: the activity tests in `tests/Feature/TruckTripTest.php`.
