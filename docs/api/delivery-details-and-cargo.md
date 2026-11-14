# Delivery details and reviewed rider cargo (November 15, 2026)

## Optional address confirmation

The chat confirmation is an acknowledgement, not a dispatch/payment gate. Orders continue with checkout details if the buyer never presses Confirm address. Web and Flutter explain this. Flutter now renders the confirmation attachment and supports its confirmation action.

`PATCH /api/v1/buyer/orders/{order}/delivery-address` requires the order's buyer and `shopper` authorization. Body: `shipping_name`, `shipping_phone` (Philippine mobile), `shipping_address` (street/unit), `address_revision` (current integer). The order must be PLACED, CONFIRMED or PREPARING with no parcel/waybill. The transaction locks the order; stale edits or edits after the cutoff return 409. Another buyer gets 404. Geographic fields are prohibited: changing barangay/city requires cancellation while eligible and a new checkout to check coverage, courier and price. Saved addresses, shipping charge, payment and original route remain unchanged.

Buyer order payloads add `can_edit_delivery_address`, `address_revision`, `address_confirmed_at`. Corrections increment revision, clear confirmation, add an audit/timeline entry, notify the seller and post a fresh confirmation card. Pending gateway orders wait until payment before sending shop messages. `POST /conversations/{conversation}/messages/{message}/confirm-address` accepts `address_revision`; stale cards return 409. Legacy revision-1 calls remain supported; old apps cannot confirm a later revised address without refreshing/updating.

## Cargo review and measurements

Hub and courier portals expose:

- `GET /api/v1/{hub|logistics}/cargo/riders?search=…`: scoped basic delivery-rider roster and review mode, newest 100 matches. Server search covers rider names and plates across the whole company/hub roster.
- `GET /api/v1/{hub|logistics}/cargo/riders/{rider}`: detailed reserved-weight/space summary.
- **Courier only:** `PATCH /api/v1/logistics/cargo/riders/{rider}` approves documented capacity. The corresponding hub PATCH is refused with 403. Riders/buyers cannot approve limits.
- `POST /api/v1/{hub|logistics}/cargo/measurements`: `{kind: parcel|return, code, weight_kg, length_cm, width_cm, height_cm}`. The tracking number or return-pickup code must belong to the company and, for hub staff, its handling/origin coverage. Records physical packed measurements and their actor/time. Does not affect shipping charges.
- `GET /api/v1/rider/cargo`: own read-only summary. Rider status/profile also include `capacity` for the home screen.

Review body: `registered_payload_kg` (total carrying allowance, gross loaded weight minus vehicle mass), `manufacturer_payload_kg`, `rider_gear_kg`, `carrier_rating_kg` (lesser applicable box/rack rating including empty equipment), `empty_carrier_kg`, usable `length_cm`, `width_cm`, `height_cm`, `carrier_type` (`manufacturer`, `custom`, `vehicle_bay`), `source_note` (20–1,000 characters), and `reviewed_documents_and_mounting` (accepted). No values are invented or prefilled for unreviewed vehicles. Courier staff must inspect the underlying documents, dimensions, mounting and applicable registration before approval.

Net cargo allowance = floor to grams of the lesser of:

1. min(registered allowance, manufacturer payload) − rider/gear − empty added equipment.
2. lesser carrier/rack rating − empty added equipment.

Nonpositive results are rejected. Custom motorcycle top-box dimensions above 60.96 cm on any side are rejected; staff must also verify external dimensions and inspection/registration. Vehicle type, plate or vehicle-update timestamp changes invalidate the review until the courier reviews again. Staff review is **not** LTO certification.

## Assignment enforcement

Unreviewed vehicles retain the three-active-parcel safeguard. It is an application restriction, not a legal/safe-weight rating. Existing jobs are retained; no seeded/demo/documentary ratings are applied in production.

Reviewed vehicles use packed kg and space checks rather than a three-job cap. Active pickup, delivery, return-to-sender, buyer-return collection and final return-to-shop jobs reserve capacity at assignment. A failed delivery still reserves a reviewed vehicle's cargo; rescheduling the same parcel does not count it twice. Return-to-sender reserves the original delivery rider until assignment to the return rider or recorded departure through the return network. Unknown measurements block adding jobs. Package orientation may change to fit the bay; each package's sides must fit and combined volume must not exceed the bay volume. These simple geometry checks do not prove stable packing or safe handling.

All automatic offers/acceptance, self-claim, manual/bulk pickup, hub delivery assignment, company outbound scanning, rescheduling and return assignments use the server cargo guard. Assignment locks the rider and reads current reservations. Administrative measurement corrections do not discard an existing assignment; an overweight/unmeasured current load blocks additions until resolved. Split loads or use a suitable larger vehicle. Never strap oversized packages around a motorcycle to evade checks.

Weight reservations concern physical packed mass, not volumetric/billable shipping weight. Counts are parcel jobs, not product units. Order/parcel size limits remain separate business rules.

Sources checked November 15: [RA 4136](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/26188), especially registered carrying capacity; [LTO motorcycle carrier memorandum](https://lto.gov.ph/wp-content/uploads/2023/10/Memo_MCTopBoxesSaddleBags.pdf). There is no universal kg value declared legal by this application. Ratings and physical checks are vehicle/carrier specific.
