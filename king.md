# King: Loved-IT rider app (Flutter, Part C)

Updated October 28, 2026. Tick each box when it's done and checked on the emulator **and** a real Android phone. Check the location tasks outside.

The whole plan is in `amaru.md`: Amaru builds the setup and shared base (Part A) and the buyer app (Part B), Liam builds the logistics app (Part D, `liam.md`), and you build the **rider** app (Part C) here. It's one app: after sign-in, a rider account opens the rider screens.

**Same repo as the website:** everything goes in **basta_velure** (`github.com/httpsJMDV/basta_velure`), in the `mobile/` folder Amaru makes in Part A. Don't make a new repository.

## Before you start

- [ ] **Part A is merged into `main`.** Amaru tells you. You need its shared base.
- [ ] On your own PC, do tasks **A1, A2 and A4 in `amaru.md`**: install Android Studio, Flutter and the emulator, and run the backend.
- [ ] Make your branch from the updated `main`:
  ```
  git checkout main
  git pull
  git checkout -b king/mobile-part-c
  ```
- [ ] Read `guides/RIDER.md`, `docs/api/rider-*.md` and section 6 of `HOW_IT_WORKS.md`.
- [ ] Also follow these parts of `amaru.md`: **Ground rules**, **Validation rules for the app** and the **Security checklist**.

**Use Part A's shared base, don't copy it:** the API client and error handling (`core/api/`), the session (`core/session/`), the rules and input formatters (`Rules`, `Only` in `core/validation/`), `AppTextField` and the other widgets, the photo picker (`core/media/`), live updates (`core/realtime/`) and the theme. If something you need is missing, add it to `core/` and tell Amaru.

Your screens go in `mobile/lib/features/rider/`. Every rider endpoint starts with `/rider`, and the account must be an approved rider.

**A task is done when:** it works on the emulator and a real phone, wrong input shows a clear message under the field, the server's error messages show too, it doesn't crash with no internet, and it behaves like the same page on the rider website (`/rider`).

---

## How the rider app looks: modern and professional

Riders use the app **outside, in sunlight, standing next to a motorbike, often with one hand**. Every choice follows from that. Match the rider website ("Courier Station"), and check each screen against it.

- [ ] **Colours** like the rider website: white and light gray backgrounds, **brand red** `#C0001A` for the main action and the active tab, an **amber** block for cash to collect ("Collect ₱1,250 cash on delivery"), an **emerald** "Delivered" button, a **red outline** "Delivery failed" button, and gray for finished stops.
- [ ] **Bottom bar** with the same 5 places as the website's menu: Home, Pickups, Deliveries, Earnings, Account. The chat and notification icons sit at the top right.
- [ ] **Home:** a big **Online / Offline** switch at the top (green when Online, with "You get jobs while you're Online"), then today's jobs, today's earnings, and anything waiting (offers, returns, cash to hand over).
- [ ] **Job offer:** a full-screen card with a **60-second countdown ring**, the shop and area, what the job pays, and two big buttons, **Accept** (red) and **Decline** (outline). The phone vibrates and plays a sound when an offer comes in.
- [ ] **Stop card** like the website's: "Stop 1" in a red circle, an "Attempt 1 of 3" chip, the recipient's name big, the amber COD block, the phone number (tap to call), the address with **Open in Maps**, the items, and the tracking number in a monospace font with a copy button. **Delivered** and **Delivery failed** sit side by side at the bottom of the card.
- [ ] **Confirm delivery** as a bottom sheet with numbered steps, like the website's: 1 the photo, 2 a second photo (optional), then the cash. The title and the buttons stay fixed, and only the middle scrolls.
- [ ] **Scanner:** the camera fills the screen with a framed box, a torch button and **"Type it instead"**. A good scan gives a green flash, a short vibration and a tick in the list below. A bad scan shows the reason in red ("Already ticked off", "Not one of your parcels").
- [ ] **Readable in sunlight:** high contrast, text on stop cards at least 16, numbers bold, and no light-gray text for anything that matters.
- [ ] **One hand:** the main buttons at the bottom, nothing important in the top corners, no small icon-only buttons for main actions.
- [ ] A thin **"Sharing your location"** bar while location is on (task C6).
- [ ] **Earnings:** a big total for the week, then a simple list of each pickup (₱30) and delivery (₱50).
- [ ] Follow **"Modern and professional, the basics"** in `amaru.md` (task A7): skeleton loading, pull to refresh, real empty states, Try again on errors, 48 × 48 tap targets, and no generic template look.

---

## C1. Rider sign in and applying

- [ ] Same `POST /auth/login`. Handle the rider `403` codes: `rider_application_pending`, `rider_application_rejected`, `pending_activation` (show each message as the server sends it).
- [ ] **Become a rider** `POST /auth/register-rider` (public form, multipart): name, birthday, email, mobile, license number and expiry, vehicle, plate, and license and OR/CR photos, for one hub (`GET /logistics/hubs`). Or `POST /auth/apply-rider` from a signed-in account. The activation link in the email opens the website.
- [ ] `GET /rider/me` for the rider's details.

**Inputs:** see the table at the end of this file (license, plate, vehicle, documents), plus names, email, mobile and birthday from `amaru.md`.

## C2. Online and offline

- [ ] `GET /rider/status`, `POST /rider/availability`. A big, clear switch. Riders only get jobs while Online.

## C3. Job offers

- [ ] `GET /rider/offers`. Each offer lasts **60 seconds**: show a countdown. `POST /rider/offers/{offer}/accept` and `/decline`.
- [ ] Accepting needs the rider to be Online, the offer still open, and fewer than 3 jobs. Show the server's message when it refuses.

## C4. Pickups from shops

- [ ] `GET /rider/pickups`, then per shop: `POST /rider/pickups/sellers/{seller}/accept`, `/decline` and `/release`.
- [ ] Scan each parcel with `mobile_scanner`: `POST /rider/pickups/verify`, then `POST /rider/pickups/confirm`.

**Inputs:** a scanned or typed tracking number must look like `LIT-YYMMDD-XXXXXX` (typing it without dashes is fine). Check the format before sending.

## C5. Deliveries

- [ ] `GET /rider/deliveries` (To collect / Out for delivery). At the hub, scan the QR code: `POST /rider/deliveries/start`.
- [ ] Each stop card: address, buyer's phone (`url_launcher` `tel:`), Open in Maps, COD amount, "Attempt 1 of 3", and Message.
- [ ] **Delivered** `POST /rider/deliveries/{tracking}/delivered` (multipart):
  - `proof_photo` (required): JPG, PNG or WEBP, up to **8 MB**
  - `proof_photo_2` (optional): must be a **different** photo
  - `received_by` (optional): a person's name (name rule)
  - `cod_amount` (COD only): must be **exactly** the COD amount, to the centavo
  - There is **no delivery code**.
- [ ] **Delivery failed** `POST /rider/deliveries/{tracking}/failed`: a reason from `GET /rider/deliveries/failure-reasons`. When the reason needs a note ("Other"), the note is required.
- [ ] Returns to the shop: `GET /rider/returns`, `POST /rider/returns/{tracking}/delivered`.

**Inputs:** the cash box takes digits and one dot with at most 2 decimals (`Only.pesos`) and shows "Collect exactly ₱X" in amber.

**Security:** proof photos come **from the camera only** (`ImageSource.camera`), not the gallery, so an old photo can't be used. Ask "Mark as delivered?" before sending.

## C6. Live location

- [ ] While the rider has a parcel to collect or carry, send `POST /rider/location` `{latitude, longitude, heading, accuracy}` about **every 5 seconds**. Ask `GET /rider/location/status` every 30 seconds whether it's still needed. Stop when the list is empty. This is what the website does (`useRiderLocationBeacon.ts`).
- [ ] Use `geolocator`. Explain why before asking for location. Keep sending while the app is in the background only during a trip (Android needs a foreground service notification for that).

**Security:** send location **only during work**, never when Offline or with no parcels. Show the "Sharing your location" bar while it's on.

## C7. COD, earnings and GCash

- [ ] COD to hand over `GET /rider/cod`, remit `POST /rider/cod/remittances`.
- [ ] Earnings `GET /rider/earnings/summary`, `GET /rider/earnings/deliveries`, history `GET /rider/history` (₱30 a pickup, ₱50 a delivery).
- [ ] GCash for payouts: `GET/PATCH /rider/gcash`.

## C8. Rider chat and account

- [ ] Chat with buyers and the hub: `GET /rider/chat/threads`, `GET /rider/chat/unread`, `POST /rider/chat/parcels/{tracking}/threads`, the thread's `messages` and `read`.
- [ ] Vehicle `POST/PUT /rider/vehicle`, license `POST /rider/license`, documents `GET /rider/documents/{doc}`.
- [ ] Go through `guides/RIDER.md` start to finish on a real phone, outside, with location on.

## C9. Commit and push Part C

- [ ] In `mobile/`:
  ```
  dart format .
  flutter analyze          (no errors and no warnings)
  flutter test             (all pass)
  ```
- [ ] From the repo root (`basta_velure`), on `king/mobile-part-c`:
  ```
  git status               (no key, keystore, dart_defines/dev.json or build folder listed)
  git add mobile king.md
  git commit -m "mobile: Part C, rider app"
  git push -u origin king/mobile-part-c
  ```
- [ ] **Merge Part C into `main`:**
  1. Open a pull request: on GitHub, `github.com/httpsJMDV/basta_velure` → **Pull requests** → **New pull request**, **base: `main`**, **compare: `king/mobile-part-c`** → **Create pull request**. Or run `gh pr create --base main --fill`.
  2. Amaru or Liam tries it first: `git fetch`, `git checkout king/mobile-part-c`, then they run the app on their phone.
  3. If GitHub says **"This branch has conflicts"** (Part B or D was merged while you worked):
     ```
     git checkout king/mobile-part-c
     git pull origin main
     ```
     Fix the files Git lists, run `flutter analyze` and `flutter test` again, then `git add`, `git commit` and `git push`.
  4. Click **Merge pull request** → **Confirm merge**. Or run `gh pr merge --merge --delete-branch`.
  5. Everyone updates their `main`: `git checkout main`, then `git pull`.
- [ ] Never push straight to `main`. Part C goes in through its pull request.

---

## Validation rules for the rider screens

The shared ones (names, email, mobile, password, birthday, uploads) are in `amaru.md`. These are the rider's own:

| Field | Keyboard / what can be typed | Checked before sending |
|---|---|---|
| Tracking number | Letters, digits and `-` only, uppercase (`Only.upper`) | `LIT-YYMMDD-XXXXXX` (dashes optional) |
| COD cash collected | Digits and one dot, at most 2 decimals (`Only.pesos`) | Exactly the order's COD amount, to the centavo |
| "Received by" | Name characters only (`Only.nameChars`), 50 max | Optional. If filled: 2 to 50 characters, starts with a letter |
| Failed delivery note | Counter shown | Required when the reason needs a note |
| License number | Letters, digits and `-`, uppercase | `A00-00-000000` |
| License expiry | **Date picker only** | Today or later |
| Plate number | Letters and digits only, uppercase, 10 max | 2 to 10 characters |
| Vehicle | A picker | Motorcycle, tricycle, car or van |
| License and OR/CR photos | Camera or files, shrunk first | JPG, PNG or PDF, 5 MB |
| Proof photo | **Camera only** | JPG, PNG or WEBP, 8 MB. A second photo must be a different one |
| GCash number | Digits only, 11 max | `09XXXXXXXXX` |
| GCash account name | Letters, spaces, `. , ' & ( ) -`, 120 max | 2 to 120 characters, starts with a letter |

## Security for the rider app

On top of the **Security checklist in `amaru.md`**:

- [ ] Proof photos from the **camera only**, never the gallery.
- [ ] Location is sent **only while working** (Online with parcels), and the rider can always see that it's on.
- [ ] The buyer's phone number and address are shown only on the rider's own stops, and never copied into logs or crash reports.
- [ ] Delivered, Delivery failed and remitting cash each **ask first**, and their buttons lock while sending.
- [ ] Rider documents (license, OR/CR) are shown in the app only, never saved to the gallery.
