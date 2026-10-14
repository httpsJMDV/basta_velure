# Order Lifecycle & State Machine Specification (Feature Bridge A)

## 1. Canonical Status Vocabulary (ERP-Flow)

The Loved-IT marketplace fulfills orders through a standardized state machine aligned with the Philippine Logistics & Sorting Center network (`docs/ERP-Flow.pdf`).

### Lifecycle Statuses

| Status | Stage / Trigger | Description | Terminal? |
|---|---|---|:---:|
| `PLACED` | Buyer Order Creation | Order placed by buyer. For GCash, proof of payment is awaiting verification; for COD, order is awaiting seller confirmation. | No |
| `CONFIRMED` | Seller Payment/COD Verification | Seller verifies GCash payment slip or acknowledges Cash on Delivery. Order is officially confirmed. | No |
| `PREPARING` | Seller Fulfillment | Seller begins packing items and preparing parcel contents. | No |
| `READY_FOR_PICKUP` | Seller Dispatch | Seller completes packing and flags parcel as staged and ready for courier pickup. | No |
| `PICKED_UP` | Courier First-Mile Pickup | Courier scans and accepts parcel at merchant premises. | No |
| `AT_SORTING_CENTER` | Sorting Center Inbound | Hub receives and scans parcel into the sorting facility. | No |
| `SORTED` | Hub Route Sorting | Hub dispatches parcel to target outbound bin / delivery zone. | No |
| `ASSIGNED_TO_RIDER` | Hub Dispatch | Hub assigns parcel to delivery courier for target barangays. | No |
| `OUT_FOR_DELIVERY` | Courier Last-Mile Delivery | Delivery courier departs hub with parcel out for recipient delivery. | No |
| `DELIVERED` | Courier Handover | Courier delivers parcel to recipient address (successful delivery). | No |
| `COMPLETED` | Buyer Receipt / Auto-Complete | Buyer confirms receipt of goods without issues, or auto-completed after inspection window. | **Yes** |
| `DELIVERY_FAILED` | Courier Delivery Exception | Courier failed delivery attempt (e.g. recipient unavailable, bad address). | No |
| `RETURNED` | Hub / Seller Return Handover | Parcel returned to merchant/hub following failed deliveries or accepted buyer return/refund. | **Yes** |

### Out-of-Lifecycle Statuses

| Status | Description | Terminal? |
|---|---|:---:|
| `CANCELLED` | Order cancelled before dispatch (by buyer, seller, or platform administration). | **Yes** |
| `DISPUTED` | Buyer opened a dispute or return/refund request (`return_requested`). | No |

---

## 2. State Machine Transition Map & Actor Roles

Authorized Actor Roles: `buyer`, `seller`, `rider`, `hub`, `admin`, `system`.

```
[PLACED]
  │ (seller, admin, system)
  ▼
[CONFIRMED] ──────────────────────────┐ (buyer, seller, admin)
  │ (seller, admin)                   │
  ▼                                   ▼
[PREPARING]                     [CANCELLED]
  │ (seller, admin)
  ▼
[READY_FOR_PICKUP]
  │ (rider, admin)
  ▼
[PICKED_UP]
  │ (hub, admin)
  ▼
[AT_SORTING_CENTER]
  │ (hub, admin)
  ▼
[SORTED]
  │ (hub, admin)
  ▼
[ASSIGNED_TO_RIDER] ◄──────────────┐
  │ (rider, admin)                 │
  ▼                                │ (hub, admin: reschedule)
[OUT_FOR_DELIVERY]                 │
  ├──► [DELIVERED] ──► [COMPLETED] │
  │       (rider)        (buyer)   │
  │                                │
  └──► [DELIVERY_FAILED] ──────────┘
          │ (hub, admin: return)
          ▼
       [RETURNED]
```

### Transition Table

| From Status | Target Status | Authorized Actors | Notes |
|---|---|---|---|
| `PLACED` | `CONFIRMED` | `seller`, `admin`, `system` | Payment verified or COD accepted |
| `PLACED` | `CANCELLED` | `buyer`, `seller`, `admin`, `system` | Cancellation prior to confirmation |
| `PLACED` | `DISPUTED` | `buyer`, `admin` | Order flagged for dispute |
| `CONFIRMED` | `PREPARING` | `seller`, `admin` | Seller begins packing |
| `CONFIRMED` | `CANCELLED` | `buyer`, `seller`, `admin` | Cancellation prior to packaging |
| `CONFIRMED` | `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `PREPARING` | `READY_FOR_PICKUP` | `seller`, `admin` | Seller finishes packaging |
| `PREPARING` | `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `READY_FOR_PICKUP`| `PICKED_UP` | `rider`, `admin` | Courier collects package |
| `READY_FOR_PICKUP`| `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `PICKED_UP` | `AT_SORTING_CENTER`| `hub`, `admin` | Hub scans parcel into sorting floor |
| `PICKED_UP` | `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `AT_SORTING_CENTER`| `SORTED` | `hub`, `admin` | Sorted into destination route |
| `AT_SORTING_CENTER`| `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `SORTED` | `ASSIGNED_TO_RIDER`| `hub`, `admin` | Assigned to courier route |
| `SORTED` | `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `ASSIGNED_TO_RIDER`| `OUT_FOR_DELIVERY` | `rider`, `admin` | Courier starts delivery run |
| `ASSIGNED_TO_RIDER`| `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `OUT_FOR_DELIVERY`| `DELIVERED` | `rider`, `admin` | Successful delivery to buyer |
| `OUT_FOR_DELIVERY`| `DELIVERY_FAILED` | `rider`, `admin` | Delivery attempt failed |
| `OUT_FOR_DELIVERY`| `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `DELIVERED` | `COMPLETED` | `buyer`, `admin`, `system` | Buyer confirms receipt or auto-complete |
| `DELIVERED` | `DISPUTED` | `buyer`, `admin` | Buyer files return/refund |
| `DELIVERY_FAILED` | `ASSIGNED_TO_RIDER`| `hub`, `admin` | Hub re-assigns for 2nd/3rd delivery attempt |
| `DELIVERY_FAILED` | `RETURNED` | `hub`, `admin` | Return to sender after max failed attempts |
| `DELIVERY_FAILED` | `DISPUTED` | `buyer`, `admin` | Dispute initiated |
| `DISPUTED` | `RETURNED` | `seller`, `admin` | Seller accepts return request |
| `DISPUTED` | `DELIVERED` | `admin` | Admin rejects return claim; restores delivery |
| `DISPUTED` | `COMPLETED` | `admin` | Admin rejects claim and finalizes order |
| `DISPUTED` | `CANCELLED` | `admin` | Admin cancels order with full refund |
| `COMPLETED` | *None* | *None* | Terminal state |
| `RETURNED` | *None* | *None* | Terminal state (Returned to seller) |
| `CANCELLED` | *None* | *None* | Terminal state |

---

## 3. Old-to-New Database Status Mapping

| Old Status | Canonical Target | Rationale |
|---|---|---|
| `pending` | `PLACED` | Initial order placement awaiting confirmation/payment. |
| `confirmed` | `CONFIRMED` | Direct 1:1 match. Order and payment confirmed. |
| `packed` | `PREPARING` | Seller is preparing/packing the parcel. |
| `shipped` | `READY_FOR_PICKUP` | Seller dispatch action maps to ready for logistics courier pickup. |
| `out_for_delivery` | `OUT_FOR_DELIVERY` | Direct 1:1 match. Courier has parcel out for delivery. |
| `delivered` | `DELIVERED` | Direct 1:1 match. Delivered to recipient address. |
| `cancelled` | `CANCELLED` | Non-lifecycle terminal state. Preserved as-is. |
| `returned` | `RETURNED` | ERP-Flow terminal return status. Preserved as-is. |
| `return_requested` | `DISPUTED` | Non-lifecycle dispute state. Preserved as-is. |

---

## 4. Escrow Trigger Decision & Scheduled Jobs Audit

### Decision
- **Current Behavior Preserved**: In this Bridge A feature, payout release (`OrderItem.payout_status = 'available'` and `delivered_at = now()`) triggers at the **`DELIVERED`** transition.
- **Reasoning**: A buyer-side "Confirm Receipt" action has not been built yet. Shifting the release trigger to `COMPLETED` immediately would permanently strand seller payouts since orders would never reach `COMPLETED` in ordinary user flows.
- **Future Milestone**: `TODO(2.8)` is added across `OrderStateMachine` and controller hooks. Feature 2.8 will introduce the buyer confirmation UI and auto-completion countdown, safely migrating the escrow release trigger to `COMPLETED`.

### Search Findings on Scheduled Jobs & 7-Day Window
- We audited the backend codebase (`backend/app/Console`, `backend/routes/console.php`, `backend/app/Jobs`, and database queries).
- **Finding**: No background cron job, queued delayed job, or scheduled command currently implements the 7-day escrow delay window. Previously, `SellerOrderController::updateStatus` transitioned `payout_status` to `'available'` instantaneously upon setting status to `delivered`. Payout calculations and timing remain unchanged.

---

## 5. Buyer-Facing Status Grouping

For buyer order tracking (`SettingsPage.tsx`), individual statuses map to user-friendly tabs and progress indicators:

1. **To Pay**:
   - `PLACED` (when payment is pending)
2. **To Ship**:
   - `PLACED`, `CONFIRMED`, `PREPARING`, `READY_FOR_PICKUP`
3. **In Transit**:
   - `PICKED_UP`, `AT_SORTING_CENTER`, `SORTED`, `ASSIGNED_TO_RIDER`
4. **Out for Delivery**:
   - `OUT_FOR_DELIVERY`
5. **Delivered / To Review**:
   - `DELIVERED`, `COMPLETED`
6. **Failed or Returned / Disputed**:
   - `DELIVERY_FAILED`, `RETURNED`, `CANCELLED`, `DISPUTED`

---

## 6. Parcel Creation, Tracking Number & Waybill (Bridge B)

### Automated Parcel Creation
When an order transitions to `READY_FOR_PICKUP`:
1. `OrderStateMachine` checks if a `Parcel` record already exists for the order. If not, it generates a unique tracking number and inserts the parcel inside the transaction.
2. **Guards (Bridge C PSGC Standardized)**:
   - The seller must have an approved profile with a valid `address_barangay` and standard PSGC `address_barangay_code` (or returns 422: *"Cannot mark order ready for pickup: Re-select your shop address so a barangay can be matched to a delivery area."*).
   - The order must have complete recipient details (`shipping_name`, `shipping_phone`, `shipping_address`, `shipping_barangay`) and `shipping_barangay_code` (or returns 422: *"Cannot mark order ready for pickup: Delivery address is missing a barangay code. Customer must re-select their address."*).
   - If guards fail, the transition aborts with `422 Unprocessable Entity` and the order remains in `PREPARING`.
3. **Snapshots**:
   - Stores `pickup_barangay_code` and `destination_barangay_code` on the parcel for courier and hub routing.
   - `pickup_address_snapshot`: Stores shop name, seller phone, street, barangay, city, province.
   - `recipient_snapshot`: Stores buyer recipient name, phone, street, barangay, city, province.
4. **COD Handling**:
   - For COD orders, `cod_amount` is set to the order total.
   - For GCash orders, `cod_amount` is `null`.

### Tracking Number Standard
Tracking numbers follow the pattern `LIT-YYMMDD-XXXXXX`:
- `LIT-`: Loved-IT express shipping prefix.
- `YYMMDD`: Date of generation.
- `XXXXXX`: 6 characters chosen from unambiguous character set `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (omits 0, 1, I, O to prevent misreading by couriers and sorting center operators).
- Handled by `App\Services\TrackingNumberGenerator` with collision retry.

### Parcel Status Synchronization
As an order advances through logistics stages (`PICKED_UP`, `AT_SORTING_CENTER`, `SORTED`, `ASSIGNED_TO_RIDER`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RETURNED`), `OrderStateMachine` updates the parcel's `status` column to match.

### Printable Waybill
- Waybill endpoint: `GET /api/v1/seller/orders/{order}/waybill` (requires seller ownership or admin role).
- Waybill page: `/seller/orders/:id/waybill` formatted for standard A6 thermal shipping labels (`105mm x 148mm`) with Code 128 barcode rendered via `jsbarcode`.

---

## 7. Courier Pickup Assignment & Claim Lifecycle (Feature 2.4)

### Pickup Requests & Area Matching
When an order enters `READY_FOR_PICKUP`, its parcel becomes an available pickup request for couriers whose active delivery area assignments (`rider_area_assignments`) contain the parcel's `pickup_barangay_code`.

### Claiming Without Status Change
- Accepting a pickup (`POST /api/v1/rider/pickups/sellers/{seller}/accept`) claims the available parcels by setting:
  - `parcels.pickup_rider_id = rider.id`
  - `parcels.sorting_center_id = rider.sorting_center_id`
  - `parcels.pickup_accepted_at = now()`
- **No Status Change**: Accepting a pickup does **NOT** advance order or parcel status. Both remain in `READY_FOR_PICKUP`. The status only advances to `PICKED_UP` upon physical courier handover and barcode scan confirmation in Feature 2.5.
- **Hub Intake Association**: Setting `sorting_center_id` binds the parcel to the claiming courier's affiliated sorting center hub. Hub intake (Feature 1.6) will validate the parcel's hub against `sorting_center_id`.

### Courier Decline & Release
- **Decline** (`POST /api/v1/rider/pickups/sellers/{seller}/decline`): Inserts rows into `rider_pickup_declines` for currently visible parcels. This hides those parcels from that courier's dashboard only; other couriers covering the area still see them. Any subsequent parcels that become ready for the same seller will appear normally.
- **Release** (`POST /api/v1/rider/pickups/sellers/{seller}/release`): Clears `pickup_rider_id`, `sorting_center_id`, and `pickup_accepted_at` back to `null`, safely returning the parcels to the pool of available pickups for other couriers.



---

## 8. Courier Pickup Execution (Feature 2.5)

### Handover confirmation
- The rider who accepted a pickup (2.4) goes to the seller, scans or types each parcel's tracking number (`POST /api/v1/rider/pickups/verify`), then confirms handover (`POST /api/v1/rider/pickups/confirm`).
- Confirming moves the order `READY_FOR_PICKUP → PICKED_UP` through `OrderStateMachine` with actor `rider`; the parcel status follows through the existing sync. It also sets `parcels.picked_up_at` and writes a `delivery_logs` row with outcome `PICKED_UP`.
- Confirm is all-or-nothing per request. Partial pickup is allowed: the rider can confirm only some of the parcels they accepted.

### Decision: rider-only confirmation
Only the rider confirms handover. There is no seller-side confirmation step. The tracking number scan is the proof of handover, and a seller confirmation would add a blocking step the seller can forget.

### Out of scope
Hub intake (`PICKED_UP → AT_SORTING_CENTER`, Feature 1.6) and everything about delivery (2.6 onward).

---

## 9. Hub Parcel Intake (Feature 1.6)

- A hub worker scans or types the tracking number (`GET /api/v1/hub/parcels/{tracking}` to look up, `POST /api/v1/hub/parcels/{tracking}/receive` to receive). Receiving moves the order `PICKED_UP → AT_SORTING_CENTER` through `OrderStateMachine` with actor `hub`; the parcel status follows through the existing sync. It also sets `parcels.scanned_in_at`.
- A parcel belongs to a hub through `parcels.sorting_center_id`, set when that hub's rider accepts the pickup (2.4). Other hubs get `404`. A parcel still `READY_FOR_PICKUP` returns `409`, and a repeat scan returns `409` with the original `scanned_in_at`.
- `scanned_in_at` drives the dashboard `inbound_today` metric (Asia/Manila day); `in_sorting` counts parcels in `AT_SORTING_CENTER`. Both start counting real numbers with this feature.
- Lists: `GET /api/v1/hub/intake/expected` (PICKED_UP, awaiting scan) and `GET /api/v1/hub/intake/received-today`.
- Out of scope: sorting by area (1.7), dispatch (1.8) and delivery.
- Contract: `docs/api/logistics-hub-intake.md`.

---

## 10. Hub Area Sorting (Feature 1.7)

- Parcels in `AT_SORTING_CENTER` are grouped by **destination barangay PSGC code** (`parcels.destination_barangay_code`). The code is the area key; there is no separate area concept.
- The dispatcher selects parcels for one barangay and calls `POST /api/v1/hub/sorting/sort`. Each order moves `AT_SORTING_CENTER → SORTED` through `OrderStateMachine` with actor `hub`; the parcel status follows through the existing sync, and `parcels.sorted_at` is stamped. The request is all or nothing, and a mixed-barangay batch is rejected.
- Groups show whether the code is in the hub's `coverage_barangays` (`in_coverage`) and how many `ACTIVE` riders of the hub have an active area assignment containing it (`riders_covering`). Both are informational; a hub can still sort a parcel nobody covers yet.
- **Un-sorting is not supported**: the state machine has no `SORTED → AT_SORTING_CENTER` transition.
- Out of scope: assigning to riders (1.8).
- Contract: `docs/api/logistics-hub-sorting.md`.

---

## 11. Hub Dispatch (Feature 1.8)

- A batch is this hub's `SORTED` parcels for one destination barangay PSGC code. The dispatcher assigns a batch to one rider with `POST /api/v1/hub/dispatch/assign`. Each order moves `SORTED → ASSIGNED_TO_RIDER` through `OrderStateMachine` with actor `hub`; the parcel status follows through the existing sync. `parcels.assigned_rider_id` and `parcels.assigned_at` are set. The request is all or nothing.
- **Eligible rider**: `ACTIVE`, belongs to the hub, and has an active area assignment whose barangay codes contain the batch's code (compared as strings). Several riders may be eligible; the dispatcher chooses.
- After commit, the rider receives one email per assign request (hub name, parcel count, barangay, login link from `FRONTEND_URL`). A mail failure never undoes the assignment. No in-app notification exists yet.
- **Un-assigning is not supported**: the state machine has no `ASSIGNED_TO_RIDER → SORTED` transition.
- Out of scope: the rider's delivery console (2.6) and delivery outcomes (2.7).
- Contract: `docs/api/logistics-hub-dispatch.md`.

---

## 12. Rider Delivery Console (Feature 2.6)

- The rider sees the parcels the hub assigned to them (`GET /api/v1/rider/deliveries`), collects them at the hub, scans or types each tracking number, and starts the run with `POST /api/v1/rider/deliveries/start`.
- Starting moves each order `ASSIGNED_TO_RIDER → OUT_FOR_DELIVERY` through `OrderStateMachine` with actor `rider`; the parcel status follows through the existing sync, and `parcels.out_for_delivery_at` is stamped. The request is all or nothing, and `assigned_rider_id` / `assigned_at` are untouched.
- **Decision: only the rider confirms the collection.** There is no hub-side handover step, mirroring 2.5.
- The rider's list is scoped to `assigned_rider_id`, so it always matches what the hub dispatched (1.8). Unlike hub endpoints, it includes the recipient phone and COD amount, because only the assigned rider can read it.
- Out of scope: delivered and failed outcomes (2.7), buyer confirmation (2.8), earnings (2.9).
- Contract: `docs/api/rider-deliveries.md`.

---

## 13. Rider Delivery Outcomes (Feature 2.7)

- From the Out for delivery list, the rider marks one stop **Delivered** (`POST /api/v1/rider/deliveries/{tracking}/delivered`) or **Failed** (`POST .../failed`). Both go through `OrderStateMachine` with actor `rider`: `OUT_FOR_DELIVERY → DELIVERED` and `OUT_FOR_DELIVERY → DELIVERY_FAILED`. The parcel status follows the existing sync.
- **Delivered** requires a photo proof, stored on the private disk (never public), and for a COD parcel a cash confirmation. The amount is read from the parcel, never from the client. It records `delivered_at`, `delivery_proof_path`, `received_by` and `cod_collected_at`, and a `delivery_logs` row.
- **Failed** requires a reason from a single enum (`DeliveryFailureReason`); only `OTHER` also requires a note. It records `failed_at`, `failure_reason`, `failure_note`, increments `delivery_attempts`, and writes a `delivery_logs` row. The history note carries only the reason label, because buyers can read it.
- **Escrow is unchanged**: the existing release at `DELIVERED` (order items' payout `available`) still happens exactly as before. **It still releases at `DELIVERED` until Feature 2.8** moves it to `COMPLETED`. A failed delivery releases nothing.
- **Reschedule and return-to-seller are hub actions in Feature 1.9.** After a failure the parcel stays assigned to the rider; the hub decides what happens next (`DELIVERY_FAILED → ASSIGNED_TO_RIDER` for another attempt, or `→ RETURNED`).
- Out of scope: the hub's failure triage (1.9), buyer confirmation (2.8), earnings and history (2.9).
- `GET /api/v1/parcels/{tracking}/delivery-proof` streams the photo to the assigned rider, the parcel's hub, the order's seller, the order's buyer and admins only.
- Contract: `docs/api/rider-delivery-outcomes.md`.
