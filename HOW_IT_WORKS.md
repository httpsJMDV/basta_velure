# How Loved-IT Works

A plain-language guide to the features and rules of Loved-IT. No code here, just what each person can do and what the app checks.

Written from the code on branch `king/rider-seller-fixes`, October 20, 2026. The older files in `docs/` were written before the October 18 fixes, so where they disagree, this file follows the code.

---

## 1. Who uses Loved-IT

| Role | What they do | Who approves them |
|---|---|---|
| **Buyer** | Shops, pays, tracks orders, returns items, writes reviews | Nobody. They verify their email with a code. |
| **Seller** | A buyer who also runs a shop | Admin |
| **Courier company** | Delivers parcels (like J&T or SPX). Runs hubs and riders. | Admin |
| **Hub** | A sorting center that works under one courier company | That courier company (the admin can also decide, as a backup) |
| **Rider** | Picks up parcels from shops and delivers them to buyers | Applies online to a hub, which approves them (or their courier company does). The courier company can also add them directly. |
| **Admin** | Runs Loved-IT: approvals, disputes, settings, reports | Created by the team |

**Loved-IT does not run its own courier.** Every courier is a partner company. "Lakbay Express" is the default courier, used only for old orders and hubs that never had one.

### Can one person have more than one role?

| Question | Answer |
|---|---|
| Buyer becomes a seller? | Yes. It's the same account, and they can still shop. |
| Buyer runs a hub or a courier company? | Yes, from their buyer account. |
| Courier company member also runs a hub? | No. The app refuses it. |
| Buyer or seller becomes a rider? | Not with the same account. They apply on the Become a rider page (or the courier company adds them) with a different email, which makes a new account. |
| Rider buys or sells? | Not with the rider account. They need a separate normal account. |

---

## 2. Accounts

### Signing up

1. Fill in name, email, mobile number, date of birth and password, and accept the Terms and Privacy Policy.
2. Loved-IT emails a **6-digit code**. Enter it to activate the account.
3. Until the code is entered, the account cannot sign in.

You can also sign up with **Google**. Google sign-ups must add their ID and address before shopping.

### Signing in

- Use your **email or username**, plus your password.
- Unverified accounts are refused and asked for the code.
- Suspended accounts are refused with a message.
- Each role lands on its own home page: admin → `/admin`, seller → `/seller`, hub → `/hub/dashboard`, rider → `/rider/dashboard`, buyer → home.

### Changing account details

- **Password:** enter the current one first. The new one must be different. Other devices are signed out.
- **Email:** a code is sent to the **new** email. The old email keeps working until the code is entered.
- **Mobile number:** a code is sent to your email (Loved-IT sends no SMS).
- **ID verification:** add a government ID, birthday, sex and address. It's optional for email sign-ups and required for Google sign-ups. The admin reviews it.

---

## 3. Applying for a seller, courier, hub or rider role

### Seller

- A visitor fills in the account and the shop in one form, or a signed-in buyer fills in only the shop.
- **Documents depend on the seller type:**
  - Individual: a government ID
  - Sole proprietorship: ID + DTI certificate + BIR Form 2303
  - Corporation: ID + SEC certificate + BIR Form 2303
- The admin approves or rejects. If rejected, they can fix the details and apply again.
- An account can have only one application waiting at a time.

### Courier company

- A visitor (with an email code) or a signed-in buyer fills in the company: name, SEC number, TIN, contact person, regions served, address, and 4 documents (business permit, SEC certificate, BIR 2303, representative's ID). A logo is optional.
- The **admin** approves or rejects. The admin can also suspend and reactivate couriers later.
- Once approved, the company gets the **courier portal** (`/logistics`).

### Hub

- A signed-in buyer who already has a **government ID on their account** fills in: hub name, address, the barangays it covers, a DTI permit, and **which approved courier it will work for**.
- **That courier company** approves or rejects it. The admin can also decide.
- Once approved, the owner gets the **hub portal** (`/hub`).

### Rider

- **Apply online** at `/register/rider` (linked from the footer, the Partner page and the rider sign-in page). The rider picks a hub and fills in: name, birthday, email, mobile, driver's license number and expiry, vehicle type, plate number, and photos of the license and OR/CR. No sign-in is needed, and the email must not belong to another account.
- Each hub has its own link and QR code on its Riders page (`/register/rider?hub=…`, the hub is already picked), for Facebook posts and posters. The courier company has one for all its hubs (`?courier=…`).
- The application is **Pending**. The rider can't sign in yet; signing in says it's still being reviewed.
- **The hub approves or rejects it** on its Riders page. The courier company can also decide, on its own Riders page.
  - **Approved:** the rider gets an email link to set their password.
  - **Rejected:** the rider gets an email with the reason and can apply again with the same email.
- **Or the courier company adds the rider directly** with the same details. The email link is sent right away.
- The email link **works once, for 24 hours.** The company can send a new one. Setting the password makes the rider **Active**.

---

## 4. Shopping

### Cart

- The cart is saved on the server, so it's the same on every device and after logging out.
- It always shows live prices and stock. Sold-out, deleted or hidden items, and items from shops on vacation, are marked and can't be selected.
- Up to 100 lines. Quantities stay within stock and the product's per-buyer purchase limit.

### Prices and promotions

- **Store sale:** a price cut with a start and end date. A product can't have two sales at the same time.
- **Flash sale:** a 2-hour time slot with its own quantity. The flash price wins over a sale price. Buyers can set a reminder.
- **Bundle:** buy enough units of chosen products and get a percentage off.
- **Buy X get Y:** buy a set and get some units of another product free.
- Sellers pay for all of these.

### Vouchers

- **Store voucher:** from the shop, paid by the shop.
- **Platform voucher:** from Loved-IT, split across the shops in the order.
- **Shipping voucher:** from Loved-IT, takes money off delivery fees.
- At most **one of each kind** per order (one store voucher per shop). Buyers claim vouchers into a wallet first.
- The minimum spend is checked against the price actually paid, after sales.
- If an order is cancelled, unexpired vouchers go back to the wallet.

### Delivery fee

- Each shop's items become **one order**, so a cart with 3 shops makes 3 orders, each with its own delivery fee.
- The app **picks the courier automatically**. The buyer doesn't choose. It prefers the courier whose hub covers the **seller's barangay**, then one that also covers the buyer's barangay, then the courier with more hubs, then the default courier.
- The fee comes from that courier's **rate table**: the route (shop's area → buyer's area) and the weight, rounded up to the next whole kg (minimum 1 kg).
- If no courier has set up rates yet, the fee is a flat **₱50**.
- A shop can set a **free delivery minimum**.
- If no courier covers the buyer's address, the order can't be placed: "We cannot deliver to this address yet."

### Payment methods

| Method | How it works |
|---|---|
| **Cash on delivery (COD)** | The buyer pays the rider in cash. |
| **GCash** | The buyer sends money straight to **each shop's own GCash**, then enters the 13-digit reference number and uploads the receipt for each shop. GCash is off if a shop in the cart hasn't set up GCash. |
| **E-wallet or card** | Paid on Loved-IT's **sandbox payment page**, where no real money moves. It must be paid within **1 hour**, or the order is cancelled by itself. The buyer can tap "Pay Again" before the hour is up. |

### Placing the order

- The app prices everything again at the moment the order is placed. If the total changed, or a voucher stopped working, the buyer is shown the new total and must confirm.
- Double-clicking "Place Order" won't create two orders.
- **Stock is taken out right away**, for every payment method.

---

## 5. An order from start to finish

| Step | Status | Who moves it |
|---|---|---|
| 1 | **Placed** | Buyer places the order |
| 2 | **Confirmed** | Seller accepts it (for GCash: after checking the receipt; a wrong receipt is rejected with a reason) |
| 3 | **Preparing** | Seller is packing |
| 4 | **Ready for Pickup** | Seller is done. A **tracking number** (`LIT-YYMMDD-XXXXXX`) and a printable **waybill** are created. |
| 5 | **Picked Up** | Rider collects it from the shop by scanning the tracking number |
| 6 | **At Sorting Center** | Hub scans it in |
| 7 | **Sorted** | Hub sorts it by the buyer's barangay |
| 8 | **Assigned to Rider** | Hub gives it to a delivery rider |
| 9 | **Out for Delivery** | Rider collects it at the hub by scanning a QR code |
| 10 | **Delivered** | Rider delivers it (see section 6) |
| 11 | **Completed** | Buyer taps "Order Received", or the app completes it **7 days** after delivery |

Other endings: **Cancelled**, **Delivery Failed**, **Returned**, and **Disputed** (a return request is open).

The seller's address and the buyer's address both need a barangay, or the order can't be marked Ready for Pickup.

---

## 6. Delivery

### Pickup (shop → hub)

- When an order is Ready for Pickup, the app **offers the job to the nearest free rider** of that courier for **60 seconds**.
- "Nearest" means: a rider whose area covers the shop's barangay first, then same city, then same province, then same region.
- "Free" means: Active, **Online**, and holding **fewer than 3 jobs**.
- If the rider declines or the 60 seconds pass, the job goes to the next rider. After 3 tries it waits in the courier's **Unassigned** list, and the courier company assigns it by hand.
- At the shop, the rider scans or types the tracking number and confirms the handover.

### At the hub

- The hub (or the courier company's scanning page) does **Inbound → Sort → Outbound**. Each scan works only in that order, only once, and only on that courier's own parcels.
- The hub assigns sorted parcels to a rider who covers the buyer's barangay.
- The rider collects them by scanning the QR code shown on the hub's screen.

### Delivering to the buyer

To mark a parcel **Delivered**, the rider must:
1. Take a **proof photo**. A second photo is optional.
2. Enter the buyer's **6-digit delivery code**, which the buyer sees on their order. **5 wrong codes lock code entry for 15 minutes.**
3. For COD, enter the cash collected. It must be **exactly** the order's COD amount.

### When a delivery fails

- The rider picks a reason: recipient unavailable, wrong address, refused, couldn't contact, address not accessible, or other (other needs a note). A failed attempt pays the rider nothing.
- The hub can **reschedule**. A parcel gets at most **3 attempts**.
- If the **buyer refused it**, or it was the **3rd failed attempt**, it goes **back to the seller** automatically:
  - The courier gives the return trip to a rider.
  - The order becomes **Cancelled (failed delivery)**, and a prepaid order is refunded in full.
  - The stock goes back on sale **only when the seller confirms** the parcel arrived.

### Lost or damaged parcels

The courier company can mark a parcel **Lost** (with a reason) or **Damaged** (with a reason and a photo). The order is cancelled, a prepaid order is refunded, and a claim is opened for the seller.

### Tracking and location

- **Track Package** shows the timeline and a map. While a rider carries the parcel, it shows the rider's first name, vehicle and live location.
- A rider must share their phone's location while carrying parcels. The rider pages stay locked until they do.

---

## 7. Cancelling, returns and refunds

### Cancelling

| Who | Until when | Reasons |
|---|---|---|
| Buyer | Before **Ready for Pickup** | Changed my mind, found a better price, ordered by mistake, change address, change payment method, other |
| Seller | Before **Picked Up** | Out of stock, buyer asked, can't ship to the address, pricing error, other |
| The app | Unpaid e-wallet or card orders after **1 hour** | — |

When an order is cancelled, the stock goes back, unexpired vouchers go back, and a prepaid order is refunded the exact amount.

### Returns

1. The buyer asks after the order is **Delivered**, within **7 days**, and before it's Completed. They give a reason, a description and **1 to 5 photos**.
2. The shop has **3 days** to approve or reject (a rejection needs a reason). **No answer means it's approved.**
3. If it's rejected, the buyer can **escalate once**, within **3 days**. The admin then decides: refund or reject.
4. If it's approved, the buyer is refunded and the order becomes **Returned**. If it's rejected and not escalated, the order completes.

The admin can change the 7-day and 3-day windows in Platform Settings.

---

## 8. Reviews

- The buyer can review each product **once per order**, only after the order is **Completed**, within **30 days**.
- 1 to 5 stars, up to 500 characters, up to 5 photos. It can be **edited once** within the 30 days.
- The seller can post **one reply** per review and edit it. Nobody can delete or hide a buyer's review. The admin's Reviews page is read-only.

---

## 9. Chat and notifications

- **Buyer ↔ seller chat:** buyers message shops and can attach orders and products. It's live, with refresh as a backup.
- **Rider chat:** the **rider starts it**, about one parcel:
  - with the **seller** during pickup
  - with the **buyer** during delivery
  - with the **hub** during both

  It closes when the parcel is done; old messages stay readable. The buyer can also start it with **Message rider** on Track Package while the parcel is out for delivery, and the "Out for delivery" notice names the rider ("Juan is bringing your parcel"). Riders find their messages on the **Account** page. Limits: 1000 characters per message, 20 messages a minute.
- **Order confirmation:** after an order is placed, the shop's chat sends a card asking the buyer to confirm the delivery address.
- **Courier ↔ hub chat:** each courier company has a private chat with each of its hubs (Messages in both portals). Loved-IT admins can't read it.
- **Loved-IT Assistant (AI, off until a key is set):** answers the buyer's Loved-IT Support chat first. It can look up **only that buyer's** orders and explain the rules; it can't cancel, refund or change anything. "Talk to a person" hands the chat to the admins, and so does an admin's reply or any AI error.
- **Notification bell:** every role has one. It updates live and shows a red count. Emails go out too. Sellers can choose which notifications they get by bell and by email.

---

## 10. What each portal can do

### Seller Center (`/seller`)

- **Products:** drafts, publish, edit, duplicate, bulk activate, deactivate or delete, variants with price and stock, store categories (up to 3 per product). Published products go live right away. With the **AI product check** on (off until a key is set), a published product waits in review while the AI (Groq's free plan by default) checks it: approved ones go live, unsure ones and ones it would reject go to the admin's Pending review list with the AI's reason, and if the AI can't be reached the admin decides.
- **Promotions:** sales, flash sales, bundles, buy X get Y.
- **Vouchers:** store vouchers.
- **Orders:** tabs (New, To Ship, Shipping, Completed, Cancelled, Return/Refund), accept or reject payment, packing, waybill, cancel, answer returns, confirm returned parcels.
- **Shop profile:** name, contact, vacation mode, response time, low-stock alert level (default 5).
- **Payment settings:** the shop's GCash (number, name, QR) and free delivery minimum.
- **Earnings and payouts**, **Payments** (weekly courier settlements, monthly commission), **Reports**, **Reviews**, **Messages**.

### Courier portal (`/logistics`)

- **Dashboard** and **Reports**, with CSV and Excel exports.
- **Hubs:** approve, reject, suspend or reactivate hubs that applied.
- **Riders:** add, approve or reject online applications, share the rider application link, resend the activation link, verify, suspend with a reason (their jobs are released), reactivate.
- **Dispatch:** auto-assign, assign, bulk assign and reassign pickups. Includes the Unassigned list.
- **Hub scanning:** Inbound, Sort, Outbound, with the camera.
- **Parcels:** search, move a parcel forward with a reason (logged), mark Lost or Damaged, the Return to Sender queue.
- **Zones & rates:** delivery areas and the price table. Every change is logged and applies only to new checkouts.
- **COD:** confirm cash the riders hand in. A short amount is flagged.
- **Settlements & pay:** weekly payments with shops, paying riders and hubs, and the company's GCash.

### Hub portal (`/hub`)

- **Dashboard**, **Parcel Intake** (scan in), **Sorting**, **Dispatch** (assign to riders, show QR codes), **Deliveries** (out for delivery and failed: reschedule or return).
- **Riders** (approve or reject applications, the apply link and QR code, delivery areas), **Reports** (CSV, print), **Earnings**, **Messages**, **Settings**.
- The hub's name, address and coverage can't be edited there, because the courier approves them.

### Rider app (`/rider`), made for phones

- Go **Online/Offline**. Going Offline never drops jobs already accepted.
- **Job offers** with a 60-second countdown. Accept or decline.
- **Pickups:** scan at the shop.
- **Deliveries:** collect at the hub, deliver with photo, code and cash.
- **Returns:** take parcels back to sellers.
- **COD:** see the cash held and hand it in to the company.
- **Earnings** and **History**.
- **Account:** profile, vehicle (a change needs a new OR/CR and is checked again), license renewal, GCash, Messages.

### Admin (`/admin`)

- **Dashboard** and **Reports** (last 30 days by default, any date range).
- **Approvals:** sellers, buyer IDs, courier companies, hubs (as a backup).
- **Orders**, **Products** (archive or reactivate; approve or reject listings waiting for review), **Categories** (with commission rates).
- **Payments:** payouts to shops, monthly commission, courier ↔ shop settlements that went wrong.
- **Disputes** (escalated returns), **Vouchers** (platform and shipping), **Reviews** (read-only), **Messages**, **Activity log**, **Site feedback**.
- **Users:** sellers, buyers, riders. Suspend or reactivate.
- **Platform Settings:** base commission, return window, the shop's days to answer, the buyer's days to escalate, payment methods.

---

## 11. Money: who pays whom

| Money | How it works |
|---|---|
| **Commission** | **5%** of each item after the shop's own discounts. The admin can set a different rate for a category; a sub-category without one uses its parent's rate. |
| **COD orders** | The rider collects the cash and hands it in to the courier company, which confirms it. |
| **GCash orders** | The money goes straight into the shop's GCash. |
| **E-wallet and card orders** | Loved-IT collects (sandbox). The shop's earnings become **Available when the order is Completed**, and the shop requests a payout. |
| **Payouts** | Minimum **₱100**, at most the available balance, **one request at a time**, sent to a GCash number. The admin marks it sent and complete, or rejects it. |
| **Courier ↔ shop (weekly)** | COD cash collected minus the delivery fees the courier earned. If positive, the courier pays the shop; if negative, the shop pays the courier. The payer records the GCash transfer (with a receipt). The other side confirms it or reports "not received". After **3 days** unconfirmed, the admin sees it and decides. |
| **Shop → Loved-IT (monthly)** | The commission on direct orders (COD and GCash), paid to Loved-IT's GCash. The admin confirms it. |
| **Rider pay** | **₱30 per pickup**, **₱50 per successful delivery**. A failed attempt pays nothing. One rider doing both earns both. Paid by the courier. |
| **Hub share** | **15%** of the delivery fee for each delivered parcel. Paid by the courier. |

---

## 12. What the app does by itself

| Job | How often |
|---|---|
| Expire 60-second rider offers and pass the job on | Every minute |
| Cancel e-wallet and card orders unpaid after 1 hour | Every minute |
| Send flash sale reminders | Every minute |
| Complete orders 7 days after delivery | Every 5 minutes |
| Apply return deadlines (auto-approve after 3 days, close unescalated rejections) | Every 15 minutes |
| Release earnings that are due | Every hour |

These only run while `php artisan schedule:work` is running.

---

## 13. Validation rules

### Shared rules

| Field | Rule |
|---|---|
| First, middle, last name | 2 to 50 characters. Letters (ñ and accents allowed), spaces, `-`, `'`, `.` |
| Email | Valid format, up to 100 characters, not used by another account |
| Mobile number | `09XXXXXXXXX` or `+639XXXXXXXXX`. Both are saved as the same number. Not used by another account. |
| Date of birth | A real date, not in the future, **18 or older** (Philippine date) |
| Password | **8+ characters** with an uppercase letter, a lowercase letter, a number and a symbol, typed twice |
| Terms | Must be accepted |
| Email code | 6 digits, works for **5 minutes**, once. 5 wrong tries means a new code is needed. Resending cancels the old code. |
| Image upload | JPG or PNG, up to **5 MB**, checked by the file's content (a renamed file is refused) |
| Document upload | JPG, PNG or PDF, up to **5 MB** |
| TIN | 12 digits, `000-000-000-000`. One TIN per seller or courier. |
| Postal code | 4 digits |
| GCash number | `09XXXXXXXXX` |
| GCash account name | 2 to 120 characters, starts with a letter; letters, spaces and `. , ' & ( ) -` |
| Reason someone else reads | Usually 10 to 300 or 500 characters, and must be written in words (not "..." or "123") |

### Seller application

| Field | Rule |
|---|---|
| Shop name | 3 to 30 characters, at least 2 letters, not already taken (case doesn't matter) |
| Shop category | One of the main categories |
| Description | Up to 500 characters (optional) |
| Seller type | Individual, Sole Proprietorship or Corporation, which decides the documents (section 3) |
| Address | Region, province, city, barangay, street and postal code |

### Courier application

| Field | Rule |
|---|---|
| Company name | 2 to 120 characters, not already used |
| Short code | 2 to 6 capital letters or digits (optional; made from the initials if empty) |
| SEC number | 2 letters + 9 digits, not already used |
| Contact position | 2 to 80 characters |
| Regions served | 1 to 17, no repeats |

### Hub application

| Field | Rule |
|---|---|
| Account | A buyer account with a government ID, not a courier company member, and no other hub waiting or approved |
| Courier | Must be an approved courier |
| Hub name | Up to 150 characters |
| Coverage | At least 1 barangay, no repeats |
| DTI permit | Document upload |

### Adding a rider (courier company)

| Field | Rule |
|---|---|
| License number | LTO format `A00-00-000000`, not used by another rider |
| License expiry | Today or later |
| Vehicle | Motorcycle, tricycle, car or van |
| Plate number | 2 to 10 letters and numbers, not used by another rider |
| License and OR/CR photos | Document uploads |

### Products

| Field | Rule |
|---|---|
| Draft | Only a name is needed |
| Name | 5 to 120 characters, at least 2 letters |
| Description | 20 to 3,000 characters of visible text |
| Category | An active sub-category |
| Images | 1 to 9, JPG or PNG, up to 5 MB each |
| Weight | More than 0, up to 1,000 kg |
| Price | ₱1.00 to ₱1,000,000.00, at most 2 decimals |
| Stock | Whole number, 0 to 99,999 |
| Variations | Up to 2 types (like Color and Size), up to 20 options each, each option up to 20 characters |
| SKU | Letters, numbers, `.` `_` `-` |
| Purchase limit | 1 to 99,999 per buyer (optional). It counts every earlier order that wasn't cancelled. |
| Food and similar categories | Need an **FDA License to Operate** and the product's **CPR/CPN** to be published |
| Removing a variant | Refused while it has unfinished orders |

### Vouchers

| Field | Rule |
|---|---|
| Code | 4 to 12 letters and numbers, no spaces, saved in capitals, unique on the whole site |
| Fixed amount | Can't be more than the minimum spend |
| Percentage | 1% to 99%, with an optional cap above ₱0 |
| Usage limits | At least 1. The per-buyer limit can't be more than the total. |
| Dates | The end must be after the start |
| After someone claims it | Only a later end date and a higher total limit can be changed |

### Checkout

| Check | Rule |
|---|---|
| Quantity | Whole number, 1 or more, within stock and the purchase limit |
| Address | Must include a barangay. A courier must cover it. |
| GCash | Every shop in the order must accept GCash. One 13-digit reference and one receipt (JPG/PNG, 5 MB) per shop. |
| Shop on vacation | Its items can't be ordered |

### Orders, returns and reviews

| Form | Rule |
|---|---|
| Cancel | Pick a reason. "Other" needs 10 to 300 characters. |
| Return request | Reason, a 10 to 500 character description, 1 to 5 photos |
| Seller rejecting a return | Reason of 10 to 300 characters |
| Review | 1 to 5 stars, up to 500 characters, up to 5 photos |
| Payout request | ₱100 or more, at most 2 decimals, no more than the available balance |

### Rider and hub

| Action | Rule |
|---|---|
| Delivered | Proof photo, the buyer's 6-digit code (locked 15 minutes after 5 wrong tries), and for COD the exact cash amount |
| Failed | A reason from the list. "Other" needs a note. |
| Accept a job | Must be Online, the offer still open, fewer than 3 jobs |
| Tracking number | `LIT-YYMMDD-XXXXXX`. Typing it without dashes is fine. |
| Rider area name (hub) | 3 to 60 characters, at least 2 letters |
| Disapproval reason (hub) | 10 to 500 characters, in words |

---

## 14. Things to know

These are how the app behaves today. Some may be worth changing:

- **Non-returnable categories** (food, custom items, personal care) appear as policy text in Platform Settings, but the app doesn't actually block returns for them.
- After applying for a hub or courier, the message says "wait for administrator approval". For hubs, it's actually the **courier company** that reviews it.
- Buyers **can't start** a chat with the rider. The rider has to message first.
- "Nearest" uses barangay coverage and addresses, **not GPS distance**. Hubs and shops have no map pin.
- The notification and email for "Out for delivery" don't name the rider. The rider's first name shows only on Track Package.
- Rider messages are a section of the rider's **Account** page, not a separate tab.
