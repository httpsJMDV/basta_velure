# Pickup times the shop chooses

When the shop marks an order Ready for pickup it can say when the rider should come: as soon as possible (as before),
or a morning (9 AM to 12 NN) or afternoon (1 to 5 PM) window from today to 3 days ahead, Philippine time.

- A scheduled pickup waits with dispatch state `scheduled`. From an hour before its window,
  `pickups:release-scheduled` (every five minutes) offers it to riders like any pickup. The courier can still assign
  it by hand at any time, and auto-assign skips it until then.
- Riders see "Shop asks for Tomorrow, 9 AM – 12 NN" on the offer and the pickup card; the courier sees it on Dispatch
  (Scheduled tab); the order timeline says which time the shop asked for.
- The shop can change the time until the rider has the parcel. A rider who already took the job is told. Choosing
  "As soon as possible" starts the offers at once.

## Endpoints

- `PATCH /seller/orders/{order}/status {status: READY_FOR_PICKUP, pickup_date?: YYYY-MM-DD, pickup_window?: morning|afternoon}`
  Both or neither; 422 on `pickup_date` for a past, too far or half-given time.
- `PATCH /seller/orders/{order}/pickup-slot {pickup_date?, pickup_window?}`; 409 once the rider has the parcel.
- Payloads carry `pickup_slot: {date, window, label, starts_at}` or null: the shop's order, the rider's offers and
  pickup groups (the earliest of the shop's parcels), and the courier's dispatch rows (`state` can be `scheduled`,
  `counts.scheduled`).

Columns `parcels.pickup_date`, `parcels.pickup_window` (migration `2026_11_07_000001`). `App\Support\PickupSlot` holds
the rules. Tests: `tests/Feature/PickupSlotTest.php`.
