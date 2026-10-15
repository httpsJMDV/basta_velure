# Demo data and click-through walkthrough

One command fills your **local** database with a realistic dataset: every role, and an order at every stage. This page is the checklist for clicking through it, role by role. It is also your demo script for the capstone defense.

> **WARNING: run this only on your own development database.**
> `php artisan demo:seed` and `php artisan demo:reset` refuse to run when the environment is `production` or when the database name ends in `_test`, but they will happily fill (and later delete from) whatever database your `.env` points at. Check `DB_DATABASE` first. They print the database name before they do anything.

Everything the seeder creates uses an email on **`@demo.loved-it.test`** (a reserved domain no real person can own), and every other demo row hangs off those users. `demo:reset` removes exactly those rows and the demo files, never anything else. If you have real data that depends on a demo account (for example a real order from a demo seller), the reset stops and tells you instead of deleting.

---

## 1. Start everything

Open one PowerShell window per line.

```powershell
# Backend API (http://127.0.0.1:8000)
cd backend
php artisan serve

# Frontend (the URL Vite prints, usually http://localhost:5173)
cd frontend
npm run dev

# Scheduler: auto-completes unconfirmed deliveries and releases escrow every hour
cd backend
php artisan schedule:work

# Live buyer and seller chat (websockets). Without it chat still works, but buyers and sellers
# must refresh to see new messages. Riders and the hub poll, so they do not need it.
cd backend
php artisan reverb:start

# Queue worker, only if QUEUE_CONNECTION in .env is not "sync"
cd backend
php artisan queue:work
```

Also check once:

- [ ] `php artisan storage:link` has been run (product photos and payment slips are served from `public/storage`).
- [ ] `php artisan migrate` is up to date (`php artisan migrate:status` shows no `Pending`).
- [ ] **PHP upload limit.** Delivery proof photos can be up to 8 MB and product images 5 MB. If uploads fail with a size error, raise `upload_max_filesize` and `post_max_size` in `php.ini` to at least `10M`, then restart `php artisan serve`. (The app downsizes proof photos in the browser, so this only bites with very large originals.)
- [ ] `VITE_API_URL` (or the proxy in `vite.config.ts`) points at the backend.

## 2. Seed and reset

```powershell
cd backend
php artisan demo:seed     # removes any earlier demo data first, then creates it again
php artisan demo:reset    # removes the demo data and the demo files
```

- Running `demo:seed` twice never duplicates anything: it resets first.
- It takes about 10 to 20 seconds, because every status change goes through the real order state machine.
- If your database has **no categories**, the seeder adds the standard category list. `demo:reset` leaves categories alone (they are shared data).
- The orders are spread over the last ten days, so the earnings and report pages have history. The clock-based numbers below (such as "inbound today") depend on what time you seed.

### Accounts

Every account signs in with its **username** or its **email**, at the normal sign-in page (the rider and hub sign-in pages take the same two). Letter case does not matter. Each role has its own simple password.

> **These passwords are deliberately weak and are for the local demo only.** `demo:seed` and `demo:reset` refuse to run in production and on any database whose name ends in `_test`, so the weak accounts can never be created there. Never copy them to a shared or hosted database.

| Role | Username | Email | Password | Sign in at |
|---|---|---|---|---|
| Admin | `admin` | `admin@demo.loved-it.test` | `admin123` | `/login` |
| Buyer 1 (Ana Cruz) | `buyer1` | `buyer1@demo.loved-it.test` | `buyer123` | `/login` |
| Buyer 2 (Ben Dela Cruz) | `buyer2` | `buyer2@demo.loved-it.test` | `buyer123` | `/login` |
| Seller 1 (Marco Gadgets, pickup in Area A) | `seller1` | `seller1@demo.loved-it.test` | `seller123` | `/login` |
| Seller 2 (Liza Pantry & Home, pickup in Area B) | `seller2` | `seller2@demo.loved-it.test` | `seller123` | `/login` |
| Hub owner (Hector Bautista, Demo Sorting Hub - Santa Cruz) | `hub1` | `hub@demo.loved-it.test` | `hub123` | `/hub/login` (or `/login`) |
| Rider 1 (Juan Dela Rosa, Motorcycle, covers Area A) | `rider1` | `rider1@demo.loved-it.test` | `rider123` | `/rider/login` (or `/login`) |
| Rider 2 (Pedro Mendoza, Tricycle, covers Area B) | `rider2` | `rider2@demo.loved-it.test` | `rider123` | `/rider/login` (or `/login`) |
| Rider 3 (Carlo Navarro, applicant, **PENDING**) | `rider3` | `rider3@demo.loved-it.test` | `rider123` | `/rider/login` |

`demo:seed` prints this same table (with the username column) when it finishes. The usernames and passwords live in `backend/config/demo.php`.

A demo **seller is also a buyer**, exactly like a real one: they registered as a buyer, applied to sell, and were approved, so `seller1` and `seller2` can shop (they have a saved address) as well as open `/seller`. Their `role` is `buyer`; the approved shop profile is what makes them a seller.

Use a separate browser profile or a private window per role so sessions do not overwrite each other.

### Where everything is

Every sign-up and sign-in page, per role. All sign-in pages take an **email or a username**.

| Role | Sign up | Sign in | Lands on after sign-in | Approved by |
|---|---|---|---|---|
| Buyer | `/register` | `/login` | `/` (home) | Admin approves the buyer profile (`/admin/buyer-applications`) |
| Seller | `/register/seller` (a signed-in buyer applies; a buyer becomes a seller by being approved, there is no separate seller account) | `/login` | `/seller` | Admin (`/admin/seller-applications`) |
| Rider (courier) | `/register/rider` | `/rider/login` (or `/login`) | `/rider/dashboard` | The logistics hub the rider chose (hub **Riders** page, `/hub/riders`) |
| Logistics hub owner | `/register/hub` | `/hub/login` (or `/login`) | `/hub/dashboard` | Admin (`/admin/sorting-center-applications`) |
| Admin | none (created by the team or the demo seeder) | `/login` | `/admin` | n/a |

How people find them: the **Partner with us** page (`/partner`) has three cards (Sell on Loved-IT, Become a delivery rider, Register a logistics hub), each with what you need, who approves you, and Register and Sign in buttons. The site header's top bar and mobile menu and the footer link to `/partner`, **Become a rider** and **Logistics partner**; the footer also has **Courier sign in** and **Hub sign in**. The main sign-in page ends with two cards, **Courier sign-in** and **Logistics hub sign-in**. `/hub/login` and `/register/hub` link to each other, and so do `/rider/login` and `/register/rider`.

After a successful sign-in on `/login`: admin goes to `/admin`, an approved seller to `/seller`, an approved hub owner to `/hub/dashboard`, an active rider to `/rider/dashboard`, and a buyer to `/`. A pending or rejected hub or rider, and a suspended account, is refused with a message and stays on the sign-in page. A signed-out visit to `/hub/*` goes to `/hub/login`, and to `/rider/*` goes to `/rider/login`.

### The three places (real PSGC codes)

| Area | Municipality | Barangay | Barangay code |
|---|---|---|---|
| A | Santa Cruz, Laguna | Bagumbayan | `043426002` |
| B | Pagsanjan, Laguna | Anibong | `043419001` |
| C | Los Baños, Laguna | Batong Malake | `043411004` |

Area C is in the hub's coverage but **no rider covers it**, on purpose: the parcel bound for Area C shows what the hub sees when nobody can take a delivery.

### What the seed creates

29 orders, 24 parcels, 8 products, 11 rider earnings, 1 rider-buyer chat, 1 dispute, 6 reviews (ratings 5, 5, 4, 3, 2, 1; three approved, two pending, one hidden; the 2-star one is flagged).

| Order status | Count | Notes |
|---|---|---|
| PLACED | 2 | one GCash awaiting verification (with a payment slip), one COD |
| CONFIRMED | 1 | |
| PREPARING | 1 | |
| READY_FOR_PICKUP | 2 | one unclaimed (rider 1 sees it under Available), one accepted by rider 1 (My pickups) |
| PICKED_UP | 1 | rider 2 has it; the hub has not scanned it in yet |
| AT_SORTING_CENTER | 1 | bound for Area C |
| SORTED | 2 | both for Area B, ready for dispatch to rider 2 |
| ASSIGNED_TO_RIDER | 2 | one each for rider 1 (Area A) and rider 2 (Area B) |
| OUT_FOR_DELIVERY | 2 | rider 1 (COD, has the chat) and rider 2 (prepaid) |
| DELIVERED | 4 | waiting for the buyer to confirm; each has a proof photo |
| COMPLETED | 6 | escrow release date set; two were slow at the hub (past 48 hours) |
| DELIVERY_FAILED | 2 | one at 1 attempt, one at 3 attempts (the limit) |
| RETURNED | 1 | failed twice, then returned to the seller by the hub |
| DISPUTED | 1 | return requested after delivery (buyer 2, seller 2) |
| CANCELLED | 1 | cancelled by buyer 1 |

---

## 3. Click-through checklist

Tick each box as you go. Write down anything that looks wrong or breaks (what you clicked, what you expected, what happened) and send me the list.

### Entry points (signed out)

- [ ] The site header's top bar (desktop) and the mobile menu show **Partner with us**, **Become a rider** and **Logistics partner**; the footer shows the same plus **Courier sign in** and **Hub sign in**.
- [ ] `/partner` shows three cards, each with the documents you need, who approves you, and **Register** and **Sign in** buttons that go to the right pages (see "Where everything is").
- [ ] `/login` ends with two cards, **Courier sign-in** (`/rider/login`) and **Logistics hub sign-in** (`/hub/login`).
- [ ] `/hub/login` and `/register/hub` link to each other; a wrong password shows "Invalid email, username or password" and keeps you on the page.
- [ ] On `/login`, `/rider/login` and `/hub/login`, type `ADMIN`-style capitals or an email: both work. Sign in as `hub1` on `/login` and you land on `/hub/dashboard`; `seller1` lands on `/seller`; `rider1` on `/rider/dashboard`; `buyer1` on the home page.
- [ ] `rider3` (the pending applicant) is refused on `/rider/login` with the pending-hub-approval message.

### Admin (`admin` / `admin123`, then `/admin`)

- [ ] **Dashboard** loads with the last 30 days of numbers (GMV, commission, orders, active buyers and sellers, payment split, pipeline), a chart and a recent-activity feed, no errors in the browser console. Click GMV, a chart link or the pipeline card: **Reports** opens with the same dates in the address bar and scrolls to that section, showing the same figures.
- [ ] **Orders** (Orders & Fulfillment): the KPI row (total, awaiting action, in transit, delivered or completed, problem orders, GMV) and the status chips with counts add up to the total for the date range (default last 30 days, so with a fresh seed all 29 orders). Click a chip or KPI to filter; search by order number, tracking number, buyer or shop; filter by payment; sort by Date and Total; open a PLACED, a DELIVERED and a DISPUTED one: the drawer shows the status history and the admin actions. Narrow the window to a phone width: the table becomes cards.
- [ ] **Payments** loads and lists the GCash orders (14 in the seed, 2 of them not yet verified). *(See "Known problems" below: the seeded GCash orders are stored as `pending`, so a filter for `pending_verification` will not match them.)*
- [ ] **Disputes** shows 1 open dispute (buyer 2, "Item not as described"). Open it; try resolving it, then run `php artisan demo:seed` again to put it back.
- [ ] **Products** lists the 8 active demo products. Open one.
- [ ] **Reviews** (Reviews & Ratings) shows the 6 demo reviews: average rating 3.33, 6 total, 2 pending moderation, 1 flagged, and the rating distribution. The chips (All, Pending, Approved, Hidden, Flagged) filter the list; open a long comment with Show more; **Approve** the pending ones and **Hide** another, and watch the counts move. The order number links to the Orders page. (Buyers cannot submit reviews yet, so these demo rows are the only reviews; `demo:reset` removes them.)
- [ ] **Sellers**, **Buyers**, **Riders** list the demo accounts. The **Riders** page also shows each rider's hub and hub-application status, and lets you suspend or reactivate the account. There is no "Rider Applications" page: a rider is approved by the hub they chose (hub **Riders** page), so approve `rider3` as `hub1`, not as the admin.
- [ ] **Sorting center applications** and **Seller applications** show the approved demo hub and the two approved shops (nothing pending).
- [ ] **Categories** shows the taxonomy. **Settings** shows the commission settings.
- [ ] **Reports** loads with presets and a From/To date picker; the dates in the address bar (`?from=- [ ] **Reports** loads. **Activity log** loads.to=`) drive every figure. **Activity log** loads.
- [ ] **Messages** loads (the rider-buyer chat is private to its two participants, so it is **not** listed here).

### Seller 1 (`seller1` / `seller123`, then `/seller`)

- [ ] **Dashboard** shows orders and an earnings summary.
- [ ] **Products**: 4 products with variants and stock. Open one to edit, change a price, save.
- [ ] **Orders** lists 15 orders across many statuses.
  - [ ] The PLACED GCash order shows the payment slip. **Verify payment**: it moves to CONFIRMED.
  - [ ] Walk a CONFIRMED order to **Preparing** and **Ready for pickup**; open the **waybill** (printable A6 page with a barcode).
  - [ ] An order at DELIVERED shows the delivery proof photo.
- [ ] **Earnings** lists order earnings; COMPLETED orders show a release date, others show pending release.
- [ ] **Messages** loads. **Shop profile** shows the shop with its pickup address (Santa Cruz, Bagumbayan).

### Seller 2 (`seller2` / `seller123`, then `/seller`)

- [ ] **Orders** lists 14 orders. The PLACED COD order has a **Confirm** action.
- [ ] The **DISPUTED** order shows the buyer's return request; try **Respond to return**.
- [ ] **Earnings** and **Products** (4 products, two with two variants) load.

### Buyer 1 (`buyer1` / `buyer123`)

- [ ] **Home** and a **product page** (for example Wireless Earbuds) load with photos, price and variants.
- [ ] **Settings > Orders** (`/settings/orders`) lists Ana's orders.
  - [ ] Two orders are **DELIVERED**: open each, view the **delivery proof** photo, and **Confirm Order Received**. The order becomes COMPLETED and the seller's earnings get a release date.
  - [ ] The order that is **OUT_FOR_DELIVERY** shows its tracking number and history.
- [ ] **Settings > Cancellations** shows the cancelled order.
- [ ] **Settings > Messages**: a thread labelled **Delivery rider** with a tracking number and **1 unread** message. Open it, read it, reply. (Replies appear live only with `reverb:start` running.)
- [ ] **Settings > Addresses** shows 3 saved addresses with their barangay (Area A default). Edit one.
- [ ] **Cart and checkout** with **COD** to the Area A address works (see the live flow in section 4).

### Buyer 2 (`buyer2` / `buyer123`)

- [ ] **Settings > Returns** shows the disputed order.
- [ ] **Settings > Orders** shows the DELIVERED, DELIVERY_FAILED, SORTED and other orders. Open the **DELIVERY_FAILED** one and read the status.

### Hub (`hub1` / `hub123`, then `/hub`)

- [ ] **Dashboard** (`/hub/dashboard`): **In sorting 1**, **Out for delivery 2**, **Failed deliveries 2**, **Active riders 2**. *Inbound today* is 1 or more (it counts parcels scanned in since midnight Manila time).
- [ ] **Parcel Intake** (`/hub/intake`): **1 expected parcel** (the PICKED_UP one with rider 2). Receive it by typing or scanning its tracking number. It moves to *In sorting* (now 2).
- [ ] **Sorting** (`/hub/sorting`): one group for **Batong Malake (Area C)**. Sort it. (It then waits in Dispatch with no eligible rider.)
- [ ] **Dispatch** (`/hub/dispatch`): a batch for **Anibong (Area B)** with **2 parcels**, and **Pedro Mendoza** as the eligible rider. Assign them.
- [ ] **Deliveries** (`/hub/deliveries`):
  - [ ] *Out for delivery* shows 2 parcels (rider 1 and rider 2).
  - [ ] *Failed*: 2 parcels. The 1-attempt one can be **rescheduled** to a rider; the 3-attempt one can only be **returned to the seller**. Try both.
- [ ] **Riders** (`/hub/riders`): **1 pending applicant (Carlo Navarro)**. Open his application, view the documents, **Approve** him (or disapprove). 2 active riders, each with an area assignment.
- [ ] **Reports** (`/hub/reports`) with the default *Last 30 days* (these are the numbers at seed time; they change as you work):
  - [ ] Received **21**, Delivered **11**, Failed attempts **7**, Returned **1**.
  - [ ] On-time rate **81.8%** (9 of 11 within 48 hours), Success rate **61.1%**, Avg hub dwell about **31 h**.
  - [ ] The daily chart shows bars on several days; **Table** view lists the same numbers.
  - [ ] Rider table: **Pedro Mendoza** delivered 6, failed 3, **Juan Dela Rosa** delivered 5, failed 4.
  - [ ] **Export daily CSV** and **Export riders CSV** download files that open in Excel.
  - [ ] **Print** hides the sidebar and the controls.
- [ ] **Messages** (`/hub/messages`): empty state at first. It fills when a rider messages the hub (see the live flow).

### Rider 1 (`rider1` / `rider123`, then `/rider/login`)

- [ ] **Dashboard** shows the profile, hub (Demo Sorting Hub - Santa Cruz) and the Area A assignment.
- [ ] **Pickups**:
  - [ ] *Available*: 1 pickup from **Marco Gadgets** (1 parcel). **Accept** it.
  - [ ] *My pickups*: the parcel you accepted earlier (and the one you just accepted). **Start pickup**, verify the tracking number, **confirm handover**.
  - [ ] *Picked up*: shows what you are carrying to the hub, with the hub address.
- [ ] **Deliveries**:
  - [ ] *To collect*: 1 parcel for Area A. **Collect at hub**, tick it.
  - [ ] *Out for delivery*: 1 parcel, **COD**, with the cash amount, recipient phone and address. Open **Maps**.
  - [ ] **Message** > buyer: the existing thread opens in a bottom sheet with 3 messages. Send one.
  - [ ] **Delivered**: take or choose a photo, tick the COD cash confirmation, submit. The parcel disappears from the list.
  - [ ] **Delivery failed**: pick a reason, submit (use a different parcel, or reseed afterwards).
- [ ] **Earnings**: lifetime **₱250** (5 deliveries at the default ₱50 fee), with a day/week/month breakdown. **History** lists deliveries and failed attempts.
- [ ] **Account**: profile, vehicle form (change the plate, see "saved"), Messages list, **Log out** asks to confirm.

### Rider 2 (`rider2` / `rider123`)

- [ ] **Deliveries**: *To collect* 1, *Out for delivery* 1 (prepaid, nothing to collect).
- [ ] **Pickups > Picked up**: 1 parcel waiting to be scanned at the hub.
- [ ] **Earnings**: lifetime **₱300** (6 deliveries).

### Rider 3 (`rider3` / `rider123`, pending applicant)

- [ ] Signing in at `/rider/login` is **refused** with the message that the application is *pending hub approval*; the rider app is not usable.
- [ ] After the hub approves Carlo (hub **Riders** page), signing in works and opens the rider app. He has no area assignment yet, so he sees no pickups: assign him one from the hub **Riders** page.

---

## 4. Run the live flow by hand

Take a brand-new order from placement to COMPLETED. Use **COD** (see "Known problems" for GCash). Keep the hub, the rider and the buyer in separate browser profiles.

1. [ ] **Buyer 1**: open a Marco Gadgets product (for example *USB-C Fast Charger 20W*), add to cart, check out with the **Area A (Home)** address and **Cash on delivery**. Note the order number.
2. [ ] **Seller 1** > Orders: the new order is **PLACED**. **Confirm**, then **Preparing**, then **Ready for pickup**. A tracking number `LIT-YYMMDD-XXXXXX` appears; open the **waybill**.
3. [ ] **Rider 1** > Pickups > Available: the pickup appears (Marco Gadgets, Area A). **Accept**, then in *My pickups* **Start pickup**, enter the tracking number, **confirm handover**. Status: PICKED_UP.
4. [ ] **Hub** > Intake: enter the tracking number and **receive**. Status: AT_SORTING_CENTER.
5. [ ] **Hub** > Sorting: select the Area A group and **sort**. Status: SORTED.
6. [ ] **Hub** > Dispatch: select the Area A batch, choose **Juan Dela Rosa**, **assign**. Status: ASSIGNED_TO_RIDER.
7. [ ] **Rider 1** > Deliveries > To collect: **Collect at hub**, tick the parcel. It moves to *Out for delivery*.
8. [ ] **Rider 1** on the card: **Message > buyer**, send "I am nearby". **Buyer 1** > Settings > Messages: the message is there (live with `reverb:start`, otherwise refresh). Reply.
9. [ ] **Rider 1**: **Message > hub**, ask a question. **Hub** > Messages: the thread appears with an unread badge; reply. The rider sees the reply within a few seconds.
10. [ ] **Rider 1**: **Delivered** with a photo and the COD confirmation. **Check:** the buyer thread now says **"This conversation is closed"** and has no compose box, for both rider and buyer.
11. [ ] **Buyer 1** > Orders: the order is **DELIVERED** with the proof photo. **Confirm Order Received**. Status: COMPLETED.
12. [ ] **Seller 1** > Earnings: the order shows a **release date** (7 days after completion by default). **Rider 1** > Earnings: the new delivery adds ₱50. **Hub** > Reports > Last 30 days: Delivered and Received each went up by 1.
13. [ ] **Admin** > Orders: the order's history shows every step and who did it.

**Failure variant.** Repeat steps 1 to 7, then in step 10 use **Delivery failed** instead. The hub's *Deliveries > Failed* tab lists it; **reschedule** it to the same rider (attempt 2), fail it again, then **return it to the seller**. Reports > Failed attempts goes up by 2, and the order ends RETURNED.

**Buyer-confirmation shortcut.** If a buyer never confirms, the scheduler completes the order after 3 days (`orders:auto-complete`, run hourly by `schedule:work`).

## 5. Phone-view checklist (rider)

Open the rider app at `/rider/login`, then press F12 and turn on the device toolbar (a phone such as 390 x 844). Sign in as **rider 1**.

- [ ] The bottom navigation bar shows Dashboard, Pickups, Deliveries, Earnings, Account and is not hidden by the browser bar.
- [ ] No horizontal scrolling on any rider screen.
- [ ] All buttons are comfortably tappable (about 44 px); the **Delivered** and **Delivery failed** buttons are side by side on the stop card.
- [ ] **Pickups**: Accept, Start pickup and the handover screen fit on one screen without zooming.
- [ ] **Deliveries > Out for delivery**: the COD amount banner, the tap-to-call phone link and **Open in Maps** are all visible without scrolling much.
- [ ] **Message** opens a bottom sheet that fills most of the screen; the keyboard does not hide the send button; closing it returns you to the same card.
- [ ] **Delivered** sheet: the photo picker works; the COD confirmation is a clear checkbox; the submit button stays reachable.
- [ ] **Earnings** and **History** tables or lists are readable without sideways scrolling.
- [ ] **Account**: the vehicle form is usable with the on-screen keyboard; **Log out** shows a confirmation.
- [ ] An unread message puts a red badge on **Account** and on the stop card's Message button.
- [ ] Rotate to landscape: nothing is cut off.

---

## 6. Known problems found while building the seeder

These are real behaviours of the current code, not seeder bugs. They are written down here so you do not mistake them for something you did wrong.

- **GCash checkout cannot save an order.** `BuyerOrderController::placeOrder` writes `payment_status = 'pending_verification'`, but the `orders.payment_status` column only allows `pending`, `paid` and `failed`, so MySQL rejects it (`Data truncated for column 'payment_status'`). Several admin and buyer filters also look for `pending_verification`. Until that is fixed, place demo orders with **COD**. The seeded GCash orders use `pending` (with a payment reference and slip) so the seller can still verify them, but the admin *Payments > pending verification* queue will not list them.
- **The 8% Food & Grocery commission never applies.** `placeOrder` passes the product's numeric `category_id` to a lookup that matches category slugs, so every item gets the 10% base rate (check an order item for *Kapeng Barako Coffee*: rate 0.10). I did not change any money logic.
- **Categories are not seeded on a fresh database.** The standard category list only exists after `php artisan db:seed --class=CategorySeeder`. `demo:seed` adds it for you when the table is empty.

## 7. When you are done

```powershell
cd backend
php artisan demo:reset
```

It prints what it found and what it removed. Your real accounts, orders, products and files are not touched.
