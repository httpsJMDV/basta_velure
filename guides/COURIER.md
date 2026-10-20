# Courier Company Guide

How a courier company (like J&T or SPX) works on Loved-IT, step by step. Everything here is in the **Courier portal** (`/logistics`).

---

## 1. Apply as a courier

1. Go to `/register/courier`. A new visitor makes the account in the same form (then enters the 6-digit email code). A signed-in buyer fills in only the company.
2. Fill in:
   - **Company name**: 2 to 120 characters, not already used
   - **Short code** (optional): 2 to 6 capital letters or numbers. It's made from the initials if you leave it empty.
   - **SEC number**: 2 letters + 9 digits
   - **TIN**: `000-000-000-000`
   - **Contact person**: name, position, mobile
   - **Regions you deliver to**: 1 to 17
   - **Office address**
   - **Documents**: business permit, SEC certificate, BIR Form 2303, representative's ID. A logo is optional.
3. Wait for the **admin** to approve. If you're rejected, fix the details and apply again.
4. Once approved, sign in. The account menu shows **Courier portal**.

## 2. Set your delivery zones and rates

Go to **Zones & rates**. Do this first, because it sets what buyers pay.

1. **Make zones**: group areas (regions, provinces or cities) into zones, like "Metro Manila" or "Laguna". You can exclude a smaller area from a bigger one.
2. **Set rates for each route** (from zone → to zone): a price for the **first kg** and for **each extra kg**.
3. Every change is logged, and it applies only to new checkouts. Orders already placed keep their price.

If an address isn't in any of your zones, you don't deliver there.

## 3. Approve hubs

Hubs apply under your company. Go to **Hubs**:
1. Open an application. Check the hub name, address, the barangays it covers, the DTI permit and the owner's ID.
2. **Approve** or **reject** it.
3. Later you can **suspend** or **reactivate** a hub.

## 4. Add riders

Riders can't sign up themselves. Go to **Riders** → **Add rider**:
1. Fill in:
   - Name, birthday (18+), email and mobile (not used by another account)
   - **License number** in LTO format `A00-00-000000`, and its expiry (today or later)
   - **Vehicle**: motorcycle, tricycle, car or van, and the **plate number** (2 to 10 letters and numbers)
   - Photos of the **license** and the **OR/CR**
   - Which hub they start from
2. The rider gets an email link to set their password. It works **once, for 24 hours**. Tap **Resend** if it expired.
3. Once they set the password, they're **Active**.

From the Riders page you can also:
- see who is **Online**, their jobs, and today's deliveries
- **verify** a rider again after they change their vehicle (they upload a new OR/CR)
- **suspend** a rider with a reason (their jobs are released), and **reactivate** them

Everything is written to the audit log.

## 5. How orders reach you

- The app picks the courier for each order automatically: usually the one whose hub covers the **shop's barangay**.
- When the shop marks an order **Ready for Pickup**, the job is **offered to your nearest free rider for 60 seconds**.
  - "Free" means Online with fewer than 3 jobs.
  - If they decline or don't answer, it goes to the next rider. After 3 tries, it lands in your **Unassigned** list.

## 6. Dispatch

Go to **Dispatch**:
- **Auto-assign**: offer every waiting job again.
- **Assign** one parcel to a rider by hand, or **bulk assign** several. A rider gets only as many as they can hold, and the rest are skipped.
- **Reassign** a parcel to another rider, until it's picked up.

The page tells you why a rider can't take a job (offline, at the 3-job limit, suspended).

## 7. Hub scanning

Go to **Hub scanning**. Pick a hub, then a station:
1. **Inbound**: scan parcels arriving from pickup riders.
2. **Sort**: scan to put each parcel in its delivery zone.
3. **Outbound**: scan to hand parcels to delivery riders.

Scans work only in this order, only once, and only on your own parcels. Use the camera, a barcode scanner, or type the tracking number.

## 8. When something goes wrong

In **Parcels**, find a parcel by tracking number, order number, order ID or buyer name. Then:
- **Override**: move it to its next step, with a reason. For example, mark it Delivered when the rider's phone was offline but the delivery was confirmed by phone.
- **Lost**: give a reason. **Damaged**: give a reason and a photo. Either one cancels the order, refunds a paid order, and opens a claim for the shop.

**Return to sender** list: parcels that must go back to the shop (the buyer refused it, or it failed 3 times).
1. Give the return trip to a rider.
2. The order becomes Cancelled (failed delivery) for the buyer, and a paid order is refunded.
3. The shop confirms when it arrives back.

## 9. Cash on delivery (COD)

Go to **COD & exports**:
1. Riders hand you the cash they collected and record it in their app. It shows as **Pending**.
2. **Only you can confirm it.** Confirming lowers the rider's balance.
3. If the amount is short, it's flagged as a **shortfall**, and the rest stays on the rider's balance.
4. You can see each rider's COD per day, and **export** to CSV or Excel.

## 10. Money

Go to **Settlements & pay**:

| What | How |
|---|---|
| **Weekly shop statement** | For each shop: COD cash collected minus your delivery fees. If you owe the shop, send it by GCash and record it (attach the receipt). If the shop owes you, confirm it when it arrives, or report "not received". |
| **Rider pay** | **₱30 per pickup**, **₱50 per successful delivery**. A failed attempt pays nothing. Pay them here. |
| **Hub pay** | Each hub earns **15% of the delivery fee** for each delivered parcel. Pay them here. |
| **Your GCash** | Set the GCash shops pay you on. |

If a payment isn't confirmed within **3 days**, Loved-IT's admin sees it and decides.

## 11. Reports

- **Dashboard**: your network at a glance, with a date range.
- **Reports**: network numbers, with exports.
- You can open **Track package** on any of your parcels.
