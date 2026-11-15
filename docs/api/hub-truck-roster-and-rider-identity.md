# Hub truck roster and rider identity alerts

## Drivers belong to their home hub

`GET /hub/truck-drivers` returns only truck-duty riders whose `sorting_center_id` is the authenticated sending hub, whose courier matches that hub, and whose staff and user accounts are active. A driver on a trip remains visible as busy. A courier manages home-hub assignments through its staff setup; hubs cannot borrow another hub's driver by changing an API ID.

`POST /hub/transfers/send` rejects off-hub, inactive and busy drivers. It locks the driver and rechecks eligibility inside the sending transaction before opening a trip, preventing two simultaneous dispatches from selecting the same available driver. A courier that has a truck fleet cannot bypass assignment by omitting `driver_id`, including when this specific hub has no eligible driver. The pre-fleet legacy API fallback remains for old courier fixtures with no fleet; current web and mobile interfaces require an assigned driver for land dispatch. Sea/air carrier handling is unchanged.

The web hub sorting/transfer panel shows its home-hub team, vehicle plates and availability, and uses `CustomSelect` with only available drivers. Hubs with one driver show a backup-coverage suggestion. Two drivers is a staffing suggestion, not an arbitrary cap: no user account is created, reassigned or hidden to force a count of two. Flutter's sorting transfer picker uses the same server-filtered roster. A failed lookup or empty roster blocks anonymous truck dispatch.

Truck drivers use the rider sign-in with duty `truck`. Their mobile home is **Trips**, with manifests, arrival reporting, past trips and pay; delivery riders use the pickup/delivery work screens. Existing truck-trip and staff payment calculations are unchanged.

## Pickup and delivery identity notifications

Confirmed pickup assignments and reassignments notify the seller and buyer with the rider's name, vehicle and plate. Offers that have not been accepted do not tell the buyer that a rider is assigned. Existing seller order-update notification preferences still apply.

Delivery assignment status alerts to both parties now include the selected rider's full name and vehicle. The order state machine passes the validated transition metadata into the notifier, so an assignment names the new rider even when the parcel's `assigned_rider_id` is updated immediately after the transition. Out-for-delivery alerts retain the rider name and add the same identity details.

Notification metadata adds `rider_id`, `rider_name`, `rider_first_name`, `vehicle_type`, `plate_number`, `vehicle_label` and `leg`. Links remain the buyer/seller order links. Existing web and Flutter notification inboxes display the same body; no client-specific event is required. Notifications use the existing after-commit delivery mechanism, so rolled-back assignments do not reach the inbox. A repeated rejected assignment does not add another alert.

Private identity documents and live rider coordinates are not added to notification payloads.
