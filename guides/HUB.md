# Hub Guide

How a logistics hub (sorting center) works on Loved-IT, step by step. Everything here is in the **Hub portal** (`/hub`). A hub always works under one courier company.

---

## 1. Apply as a hub

Before you start, you need a **buyer account with a government ID added** (Account → Profile).

1. Go to `/register/hub` and sign in.
2. Fill in:
   - **Which courier** you'll work for (only approved couriers are listed)
   - **Hub name**: up to 150 characters
   - **Address**: province, city, barangay, street
   - **Barangays you cover**: at least 1. These are the areas your hub serves.
   - **DTI permit**: JPG, PNG or PDF, up to 5 MB
3. **The courier company you picked** approves or rejects it. The admin can also decide.
4. Once approved, sign in at `/hub/login` (or the normal sign-in page).

Rules:
- One hub per account.
- A courier company member can't also run a hub.
- If you're rejected, fix the details and apply again.

## 2. Parcel Intake (parcels coming in)

Pickup riders bring parcels from shops to your hub.

1. Open **Parcel Intake**. **Expected** shows parcels on the way to you.
2. Scan the waybill with the **camera**, a USB or Bluetooth barcode scanner, or type the tracking number (`LIT-YYMMDD-XXXXXX`; typing it without dashes is fine).
3. The parcel becomes **At Sorting Center**. The pickup rider is paid for the pickup.

You can't receive the same parcel twice, or another hub's parcel.

## 3. Sorting

1. Open **Sorting**. Parcels are grouped by the **buyer's barangay**.
2. Each group shows whether it's in your coverage and how many riders cover it.
3. Select a group and tap **Sort**. The parcels become **Sorted**.

Sorting can't be undone.

## 4. Dispatch (give parcels to delivery riders)

1. Open **Dispatch**. Pick a barangay batch.
2. Choose a rider. Only your riders who cover that barangay are listed, least busy first.
3. Tap **Assign**. The parcels become **Assigned to Rider**, and the rider is notified.
4. When the rider comes to collect, tap **Show QR codes**. The rider scans each QR from your screen, and the parcel becomes **Out for Delivery**.

Assigning can't be undone.

## 5. Deliveries

Open **Deliveries**:
- **Out for delivery**: parcels on the road right now. Tap **Track live** to see the rider on the map.
- **Failed**: parcels the rider couldn't deliver, with the reason. For each one:
  - **Reschedule** to a rider for another try. A parcel gets at most **3 attempts**.
  - **Return to seller**, with an optional note (it must be written in words).

If the buyer **refused** the parcel, or it was the **3rd failed attempt**, it goes back to the seller automatically.

## 6. Riders

Riders are added by your **courier company**, not by you. In **Riders** you can:
- see your riders and their status
- set the **delivery areas** (barangays) each rider covers. Area names are 3 to 60 characters with at least 2 letters.

A rider only gets parcels for barangays in their areas.

## 7. Messages

Riders can message the hub about a parcel, during pickup or delivery. Open **Messages** to read and reply.

## 8. Reports

Open **Reports**:
- Pick a date range (the last 30 days by default).
- See parcels received, delivered, failed and returned, the **on-time rate** (delivered within 48 hours of arriving), and the success rate.
- A table shows each rider.
- **Export CSV**, or **Print**.

## 9. Earnings

Open **Earnings**. Your hub earns **15% of the delivery fee** for every parcel delivered through it. **Your courier company pays you.** Set your GCash in **Settings**.

## 10. Settings

- Your photo, name, email, and mobile (changed with a code), and your password
- **Payout GCash**
- Hub details and your courier's contact. The hub name, address and coverage are **read-only** here, because your courier approves them.
