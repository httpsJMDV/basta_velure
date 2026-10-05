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

