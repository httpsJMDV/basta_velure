# Loved-IT defense guide (Monday, Nov 16, 2026)

## November 15 follow-up: delivery details and cargo allowance (Android 26111502)

After installing the newest build from https://loved-it.shop/download:

- Buyer chat address confirmation is **optional**. The order proceeds using checkout details if ignored. In Orders, use **Delivery details → Correct** (web), or tap Delivery details in the app. Recipient/phone/street corrections work until a waybill exists. A different barangay/city requires cancellation while eligible and a new checkout; a dispatched parcel cannot be silently rerouted by editing a saved address.
- **Cargo allowance** appears in the courier/hub web sidebar and app More menu; riders see it in Account. The old three-job count refers to parcels, not product units, and is not a legal motorcycle kg allowance.
- No vehicle ratings have been invented. Existing riders retain the three-parcel safeguard until **courier-company staff** review actual registration/manufacturer and carrier/rack documents, rider/gear and empty-equipment mass, dimensions and inspection references. Hub staff cannot approve/increase these limits.
- Record physical packed kg and dimensions using the parcel tracking number or buyer-return pickup code. Reviewed vehicles use weight and space reservations instead of three slots. Unknown, oversized or excessive loads wait for another rider or a suitable vehicle. Package measurements do not change shipping prices. Then assign manually or retry automatic dispatch from the dispatch board.
- Each real load still needs secure mounting, physical fit and visibility checks. Staff review is not LTO certification; do not enter sample/documentation ratings as real vehicle ratings.


## November 15 update: pickup controls and Android 26111501

Install the latest signed APK from **https://loved-it.shop/download**. Rider, hub and courier accounts have no buyer switch; ordinary buyers and sellers keep shopping access.

- Web: hub/courier sidebar → **Pickup control**. App: logistics **More → Pickup control**.
- **Seller pickups**: automatic offers are on by default. Switch off for staff assignment, then choose a ready parcel and an eligible rider in the manual queue. Unaccepted offers close; existing assigned jobs remain. Hubs manage their own origin coverage and local riders; courier staff manage their network.
- **Buyer returns**: approval can book the pickup automatically, but the rider is manually assigned by default. Use **Return pickups** to select the collecting rider, or enable automatic returns in Pickup control. Automatic returns use available local riders below the three-job limit; otherwise the job stays waiting.
- The delivering hub handles buyer collection. A distant return travels back through hubs, then the shop's hub assigns the final rider. Assignment never means the parcel was physically collected: the rider records collection in the app.
- Hub settings may follow the courier default or override it. Regular delivery dispatch and truck trips remain manual.
- Rider app: **Earnings → History** now includes tracking/order search and Manila date filters, alongside outcome filters. The action-by-action audit is in the repo at **docs/rider-mobile-parity-2026-11-15.md**.

The complete walkthrough below remains applicable.

Step-by-step scripts for showing every role live on **https://loved-it.shop** (and the app from loved-it.shop/download).
Each script says **who signs in, where, and what to click**, so nobody has to guess which seller, hub or rider to use.

> Keep this file private. It is **not** in the GitHub repo (the repo is public).

---

## 0. Before you start (5 minutes, the morning of the defense)

- [ ] Open loved-it.shop and sign in once as the admin, so the server and database are awake (first load can take ~10 s).
- [ ] Have **3 browser windows** ready: a normal window, an **Incognito/InPrivate** window, and a second browser
      (Chrome + Edge). Each one can be signed in as a different person at the same time.
- [ ] For accounts you create live (buyer, seller, hub, rider), use **your own Gmail with a `+` tag**, e.g.
      `yourname+buyer@gmail.com`, `yourname+hub@gmail.com`. They all arrive in your one inbox, so you can read the
      6-digit codes and the rider activation link on your phone.
- [ ] Passwords for new accounts: 8+ characters, upper and lower case, a number and a symbol, **no spaces**
      (e.g. `Defense@2026`).

---

## 1. Ready-made accounts

Sign in with the **username** (or `username@loved-it.shop`). These accounts never receive email.

Account names and passwords are intentionally excluded from this version. The full local guide is retained at `.local/archive/original-notes/DEFENSE_GUIDE.private.md`, which Git ignores.

| Role | Account | Who / what | Credentials |
|---|---|---|---|
| Admin | Private test account | Loved-IT admin console | Shared privately |
| Buyer | Private test account | Irene Del Rosario, **Bitin, Bay, Laguna** (same area as ByteBox) | Shared privately |
| Buyer | Private test account | Danica Valdez, **Dila, Bay, Laguna** | Shared privately |
| Seller | Private test account | **ByteBox Gadgets**, San Francisco, Victoria, Laguna (phones, laptops) | Shared privately |
| Seller | Private test account | **Lamig Appliance Center** (fans, aircon, TVs) | Shared privately |
| Seller | Private test account | **Sari-Saring Bagay PH** (the **Others** category: parol, gifts) | Shared privately |
| Courier admin | Private test account | Sofia Perez, **J&T Express** courier portal | Shared privately |
| Courier admin | Private test account | Flash Express / Ninja Van | Shared privately |
| Hub | Private test account | Liza Robles, **J&T Express Bay Hub** (picks up from ByteBox) | Shared privately |
| Hub | Private test account | Mark Navarro, **J&T Express Santa Rosa Hub** (CALABARZON gateway) | Shared privately |
| Hub | Private test account | **J&T Express Manila Hub** (Luzon island gateway: ship/plane) | Shared privately |
| Hub | Private test account | **J&T Express Davao City Hub** (Mindanao gateway + Davao branch) | Shared privately |
| Rider | Private test account | Bay Hub rider, covers **Bay & Victoria** (pickup at ByteBox, delivery in Bay) | Shared privately |
| Rider | Private test account | Davao City Hub rider (delivers to Davao City barangays) | Shared privately |
| Truck driver | Private test account | drives Bay Hub → Santa Rosa Hub | Shared privately |
| Truck driver | Private test account | drives Santa Rosa Hub → Manila Hub | Shared privately |

Where each one signs in:

| Who | Website | App |
|---|---|---|
| Buyer, seller, courier admin, admin | loved-it.shop/login | Sign in (seller: Account → Seller Centre) |
| Hub | loved-it.shop/hub/login | Sign in → Logistics |
| Rider, truck driver | loved-it.shop/rider/login | Sign in → Rider |

Other numbers: there are 220 buyers (`buyer1`…`buyer220`), 53 sellers (`seller1`…`seller53`), and every J&T branch
has a hub `hub-jnt-<town>`, riders `rider-jnt-<town>` and a truck driver `truck-jnt-<town>` (Flash = `flx`,
Ninja Van = `njv`).

---

## 2. Script A: a buyer in Laguna buys from a Laguna shop (one hub, about 6 minutes)

Shows the whole order life cycle with one hub. People: `buyer44`, `seller1`, `rider5`, `hub2`.

1. **Buyer** (`buyer44`) → search **ByteBox Gadgets** or open any ByteBox product (e.g. an iPhone case or AirPods).
   **Add to cart** → **Cart** → **Check out**.
   - Address is already saved (Bitin, Bay). Courier: **J&T Express**. Payment: **Cash on delivery**.
   - Point out: the delivery fee comes from the route and the weight; the estimate shows the delivery days.
   - **Place order**. Order status: **Placed**.
2. **Seller** (`seller1`) → **Seller Centre → Orders → New** → open the order → **Accept order**.
   → when packed: **Ready for pickup** (pickup time: as soon as possible). This creates the **waybill / tracking
   number** `LIT-…` (show **Print waybill**).
3. **Rider** (`rider5`, phone app is best) → **Go Online** → a **pickup offer** appears (60 seconds) → **Accept**.
   At the shop: **Picked up**.
4. **Hub** (`hub2`) → **Parcel intake** → **Scan parcels in**: scan the waybill QR/barcode with the camera **or type the
   tracking number** → **Receive**. Status: **At the sorting center**.
   → **Sorting**: the parcel is sorted to the buyer's barangay → **Dispatch**: **Assign** it to `rider5`.
5. **Rider** (`rider5`) → **Deliveries** → **Start delivery** → at the buyer: **Call/Text** first (required before
   "not at home") → **Confirm delivery**: take **2 photos** and enter the **exact COD amount**.
6. **Buyer** → **My orders** → the order is **Delivered** → **Order Received** → write a **review** with stars and photos.
7. Show money: **Seller Centre → Earnings** (commission taken), **Hub → Earnings** (15% of the fee),
   **Rider → Earnings** (pickup + delivery pay), **Admin → Reports**.

Tip: **Track package** (buyer's order page) shows every step, the map and the rider's live location while out for
delivery.

---

## 3. Script B: register a brand-new buyer live

1. Signed out → **Register** → name, `yourname+buyer@gmail.com`, mobile, birthday (18+), password → **Create account**.
2. Enter the **6-digit code** from your Gmail.
3. **Account → ID verification**: upload a government ID (any photo works for the demo).
4. **Admin** → **Buyer applications** → open the new buyer → **Approve**. (A buyer can browse and fill the cart before
   this, but cannot place an order until the ID is approved.)
5. **Account → Addresses → Add**: pick Region → Province → City → Barangay from the lists (PSGC codes), street, label.
6. Buy anything (Script A step 1), or continue with Script C for Davao.

Validation to show while registering: a password like `        1Ba` (spaces) is refused; names can't start with a
space; under-18 birthdays are refused; a duplicate email or mobile is refused.

---

## 4. Script C: a buyer in **Davao** buys from a shop in **Laguna** (truck, gateway, ship/plane)

People: the new buyer from Script B (or any buyer you add a Davao address to), `seller1`, `rider5`, `hub2`,
`truck-jnt-bay`, `hub3`, `truck-jnt-city-of-santa-rosa`, `hub-jnt-manila`, `hub-jnt-davao-city`,
`rider-jnt-davao-city`.

The route (J&T Express):

```
ByteBox Gadgets (Victoria, Laguna)
  → rider5 picks up
  → J&T Bay Hub (hub2)              ── truck: truck-jnt-bay ──▶
  → J&T Santa Rosa Hub (hub3)       ── truck: truck-jnt-city-of-santa-rosa ──▶   (CALABARZON gateway)
  → J&T Manila Hub (hub-jnt-manila) ── SHIP or PLANE ──▶                         (Luzon island gateway)
  → J&T Davao City Hub (hub-jnt-davao-city)                                       (Mindanao gateway + branch)
  → rider-jnt-davao-city delivers to Barangay Acacia, City of Davao
```

> The buyer's **Track package** page shows this exact route with the gateways before the parcel moves. If it shows a
> different gateway, follow what it shows (the hub usernames are always `hub-jnt-<town>`).

1. **Buyer**: **Addresses → Add**: Region **XI (Davao Region)** → **Davao del Sur** → **City of Davao** →
   Barangay **Acacia** → street e.g. `123 Acacia St.` → set as default.
2. **Buyer**: buy a **ByteBox Gadgets** product → courier **J&T Express**. The checkout shows a longer estimate
   (another island group: about 5 to 8 days) and a higher fee (Luzon → Mindanao). Place the order (COD or GCash).
3. **Seller** (`seller1`): **Accept order** → **Ready for pickup**.
4. **Rider** (`rider5`): **Go Online** → **Accept** the pickup → **Picked up**.
5. **Hub** (`hub2`, Bay): **Parcel intake** → scan/type the tracking number → **Receive**.
   → **Sorting** → panel **For other hubs** (the parcel is for Santa Rosa) → **Load on a truck** → choose driver
   **truck-jnt-bay** → **Send**.
6. **Truck driver** (`truck-jnt-bay`): **Trips** → sees the parcels on board → at Santa Rosa: **I'm at J&T Express Santa Rosa Hub**.
7. **Hub** (`hub3`, Santa Rosa): **Parcel intake** → **Receive all** (everything on that truck at once).
   → **Sorting → For other hubs** → **Load on a truck** → driver **truck-jnt-city-of-santa-rosa** → **Send** (to Manila).
8. **Truck driver** (`truck-jnt-city-of-santa-rosa`): **Trips** → **I'm at J&T Express Manila Hub**.
9. **Hub** (`hub-jnt-manila`): **Parcel intake** → **Receive all**.
   → **Sorting → For other hubs** → **Load on a ship or plane** → **By ship** (e.g. carrier `2GO Freight`,
   **Bill of lading no.** `BL-20261116-001`) or **By plane** (e.g. `Cebu Pacific Cargo`, **Air waybill no.**
   `AWB-5021116`) → ETA date → **Send**. (Only island gateways can send by ship/plane; no driver is paid for it.)
10. **Hub** (`hub-jnt-davao-city`): **Parcel intake** → **Receive** the ship/plane trip.
    → **Sorting** (Acacia) → **Dispatch** → **Assign** to **rider-jnt-davao-city**.
11. **Rider** (`rider-jnt-davao-city`): **Go Online** → **Deliveries** → **Start delivery** → **Call/Text** →
    **Confirm delivery** (2 photos, exact COD).
12. **Buyer**: **Order Received** → review. **Track package** now shows: truck, truck, ship/plane, rider.
13. **Courier admin** (`courier1`): **Truck drivers** (trips, truck planner, pay per trip), **Coverage** (hubs by island
    and region), **Activity log** (every scan), **Reports**.

---

## 5. Script D: register the delivery partners (each has its **own** account, none can shop)

Rule to say out loud: **hub, courier, rider and truck driver accounts are for deliveries only. They cannot buy and
cannot switch to the shop. Only a seller account switches between selling and buying.** If you sign in as a hub and
open loved-it.shop, it sends you back to the hub dashboard; the API refuses their cart and checkout too.

### D1. A new hub (about 4 minutes)
1. Signed out → **Partner with us → Run a logistics hub** (or loved-it.shop/register/hub).
2. Fill **the hub operator** (name, birthday, mobile, `yourname+hub@gmail.com`, password), **government ID** (type +
   photo), **courier company: J&T Express**, hub name, permit (any image/PDF), facility address, **barangays you
   cover** → accept terms → **Create hub account and apply**.
3. Enter the **6-digit code** from Gmail. Status: **Pending Approval**.
4. **Courier admin** (`courier1`) → **Hubs** → the new hub → check permit, ID and area → **Approve**.
5. The new hub signs in at **/hub/login** → hub dashboard.
6. Show: if you are signed in as a buyer and open /register/hub, it says **"A hub needs its own account"** and asks you
   to sign out first.

### D2. A new rider (about 3 minutes)
1. Signed out → **Become a rider** (loved-it.shop/register/rider) → Job: **Delivery rider** → pick a hub (e.g. the
   hub from D1, or **J&T Express Bay Hub**) → name, birthday, `yourname+rider@gmail.com`, mobile, license number
   `A12-34-567890`, expiry (future), vehicle **Motorcycle**, plate `123ABC`, license and OR/CR photos → **Apply**.
2. **Hub** (`hub2`, or your new hub) → **Riders & Fleet** → applications → **Approve**.
3. Open the **activation email** in Gmail → set the password → the rider signs in at /rider/login → **Go Online**.

### D3. A new truck driver
1. **Become a rider** → Job: **Truck driver** → home hub → vehicle **Truck** or **Van** → apply.
2. **Courier admin** (`courier1`) → **Riders** → approve (a hub cannot approve truck drivers).
3. Activation email → set password → **Trips** page. The courier sets the **pay per trip** on **Truck drivers**.

### D4. A new courier company
1. Signed out → **Partner with us → Run a courier company** (loved-it.shop/register/courier) → contact person,
   `yourname+courier@gmail.com`, company, SEC no. `CS202612345`, TIN `123-456-789-000`, service regions, head office,
   the 4 documents → **Create account and apply** → code from Gmail.
2. **Admin** → **Courier applications** → **Approve**. The company signs in → **/logistics** courier portal.

### D5. A new seller
1. **Partner with us → Sell on Loved-IT** (or signed in as a buyer: Account → Start selling) → shop details, ID,
   documents → code.
2. **Admin** → **Seller applications** → **Approve**.
3. **Seller Centre → Products → Add product** → photos, price, stock, weight. The **AI product check** runs. A product
   in **Others** (or one that mentions medicine) is **held for the admin** to review. Medicines and vitamins are never
   allowed.

---

## 6. Things to point at during Q&A

| Topic | Where to show it |
|---|---|
| Every category has products | Home → **Categories** menu; any category page: the chip row scrolls with arrows |
| Reviews and ratings | Any product page → **Reviews** (stars, photos, "Helpful", shop replies) |
| Shop comments | A shop page → comments with tags (Fast shipping, Good packaging…) |
| Big purchase rules | Add items over ₱50,000 to the cart: a **"This is a big purchase"** notice; checkout asks to **tick the agreement**; COD is off above ₱50,000 per shop |
| Cart limits | 100 different items; one line can't be more than 200 pieces or one 50 kg parcel; one checkout max 50 items / 200 pieces / ₱1,000,000 |
| Validation | Password with spaces refused; names trimmed; PH mobile format; 18+; file type and 5 MB on uploads |
| Couriers and network | Courier portal → **Coverage** (≈594 branches per courier), **Truck drivers** (truck planner) |
| Remote islands | 14 far towns: buyer picks **barangay hall** or **branch counter** at checkout; hub **Counter pickups** |
| Delivery guide | Footer → **Delivery guide** (/help/delivery) |
| Security | Roles can't open each other's pages; hub/courier/rider can't shop; rate limits on sign-in |

---

## 7. If something goes wrong

| Problem | Fix |
|---|---|
| Rider sees no pickup offer | Rider must be **Online**; offers last 60 s. Courier admin → **Dispatch** → assign it by hand. |
| "Go Online" is locked | Allow **location** in the browser/app (riders must share location). |
| No email code | Check Gmail spam/Promotions; press **Resend code** after 60 s. |
| Buyer can't place an order | The buyer's **ID** is not approved yet (Admin → Buyer applications). |
| Checkout says no courier covers it | Choose **J&T Express** (all three couriers cover the country, J&T is the one in this guide). |
| A hub sees the parcel under "For other hubs" | That is correct: it must go on a truck (or ship/plane) to the next hub first. |
| Page shows old data | Refresh; the hub and courier pages also refresh by themselves every few seconds. |
