# Liam: Loved-IT logistics app (Flutter, Part D)

Updated October 28, 2026. Tick each box when it's done and checked on the emulator **and** a real Android phone.

The whole plan is in `amaru.md`: Amaru builds the setup and shared base (Part A) and the buyer app (Part B), King builds the rider app (Part C, `king.md`), and you build the **logistics** app (Part D) here. It's one app: after sign-in, a hub or courier account opens the logistics screens.

**Same repo as the website:** everything goes in **basta_velure** (`github.com/httpsJMDV/basta_velure`), in the `mobile/` folder Amaru makes in Part A. Don't make a new repository.

## Before you start

- [ ] **Part A is merged into `main`.** Amaru tells you. You need its shared base.
- [ ] On your own PC, do tasks **A1, A2 and A4 in `amaru.md`**: install Android Studio, Flutter and the emulator, and run the backend.
- [ ] Make your branch from the updated `main`:
  ```
  git checkout main
  git pull
  git checkout -b liam/mobile-part-d
  ```
- [ ] Read `guides/HUB.md`, `guides/COURIER.md`, `docs/api/logistics-*.md`, `docs/api/courier-*.md` and `docs/api/hub-awaiting-pickup.md`.
- [ ] Also follow these parts of `amaru.md`: **Ground rules**, **Validation rules for the app** and the **Security checklist**.

**Use Part A's shared base, don't copy it:** the API client and error handling (`core/api/`), the session (`core/session/`), the rules and input formatters (`Rules`, `Only` in `core/validation/`), `AppTextField` and the other widgets, the photo picker (`core/media/`), live updates (`core/realtime/`) and the theme. If something you need is missing, add it to `core/` and tell Amaru.

Your screens go in `mobile/lib/features/logistics/`.

Two kinds of people use these screens:

| Who | How you know (task A6 in `amaru.md`) | Endpoints start with |
|---|---|---|
| **Hub staff** | `sorting_center` is approved | `/hub` |
| **Courier company team** | `logistics_company` is set | `/logistics` |

**Mobile scope:** the work done on the floor and on the go goes in the app: scanning, sorting, dispatch, failed deliveries, rider approvals, chat. The office work stays on the website: shipping zones and rates, settlements, payouts, reports, exports and company settings. The app links to the website for those.

**A task is done when:** it works on the emulator and a real phone, wrong input shows a clear message under the field, the server's error messages show too, it doesn't crash with no internet, and it behaves like the same page on the hub or courier website.

---

## How the logistics app looks: modern and professional

Hub staff scan parcels all day at a counter, often in a hurry. Courier staff check on hubs and riders from their phone. Make the common job **one tap away**, and keep each website's look.

- [ ] **Courier company screens** look like the courier portal (`/logistics`): a **dark header** with the numbers in soft see-through boxes (like the website's `HeroStats`) and an **amber** accent for alerts and the company logo tile.
- [ ] **Hub screens** look like the hub portal (`/hub`): light pages with **dark gray** (`gray-900`) main buttons. Brand red is only for problems that need action.
- [ ] **The same status colours everywhere:** amber = waiting, blue = on the way, emerald = done, rose/red = failed or lost, gray = closed. Use the same words as the website, never new ones.
- [ ] **Bottom bar for hub staff:** Home, Sorting, a big round **Scan** button in the middle, Dispatch, More (riders, chat, account). **For the courier team:** Home, Hubs, Parcels, Riders, More (dispatch, COD, chat, account).
- [ ] **Scanning is the heart of the hub app.** It opens in one tap from anywhere and stays open for **many scans in a row**. Each scan adds a row at the top: green "Received", amber "Already received on Oct 28, 2:15 PM", red "Not one of this hub's parcels". It shows a count for today, vibrates on each scan, and has a torch button and "Type it instead".
- [ ] **Home:** 4 numbers at the top (expected today, received today, to sort, out for delivery), then a short **alerts** list (failed deliveries, rider applications, hub applications for the courier team) like the courier portal's alerts. Each alert opens the right screen.
- [ ] **Lists** are compact but readable: one row per parcel with the tracking number in monospace, the barangay **name** (never the code), and a status chip. Filter chips on top, search by tracking number, pull to refresh.
- [ ] **Rider application review:** the license and OR/CR photos (tap to zoom), the rider's facts, then **Approve** and **Disapprove** fixed at the bottom. Disapprove opens a reason box.
- [ ] **A counter tablet works too:** on a wide screen, show the list and the details side by side.
- [ ] Follow **"Modern and professional, the basics"** in `amaru.md` (task A7): skeleton loading, pull to refresh, real empty states, Try again on errors, 48 × 48 tap targets, and no generic template look.

---

## D1. Hub dashboard

- [ ] `GET /hub/dashboard/metrics`, `GET /hub/profile`.

## D2. Parcels coming in (scan in)

- [ ] Expected today `GET /hub/intake/expected`, received today `GET /hub/intake/received-today`.
- [ ] Scan to receive: `GET /hub/parcels/{tracking}`, then `POST /hub/parcels/{tracking}/receive`. Show "Already received on ..." (`409`) clearly, in a different colour from a success.

## D3. Sorting

- [ ] `GET /hub/sorting/groups`, `GET /hub/sorting/groups/{barangay_code}/parcels`, scan to sort `POST /hub/sorting/sort`. Show barangay **names**, not codes.

## D4. Dispatch to riders

- [ ] `GET /hub/dispatch/batches`, `/batches/{barangay_code}/parcels`, `/batches/{barangay_code}/riders`, assign `POST /hub/dispatch/assign`, waiting for pickup `GET /hub/dispatch/awaiting-pickup`.

## D5. Out for delivery and failed

- [ ] `GET /hub/deliveries/out`, `GET /hub/deliveries/failed`, reschedule `POST /hub/deliveries/{tracking}/reschedule`, send back to the shop `POST /hub/deliveries/{tracking}/return-to-seller` (ask first).

## D6. Riders (hub approves applications)

- [ ] `GET /hub/riders`, `GET /hub/riders/{rider}`, license and OR/CR `GET /hub/riders/{rider}/license` and `/or-cr`.
- [ ] Approve `POST /hub/riders/{rider}/approve`. Disapprove `POST /hub/riders/{rider}/disapprove` with a reason of 10 to 500 characters, written in words.
- [ ] Rider areas: `GET/POST /hub/riders/{rider}/areas`, `PUT/DELETE .../areas/{area}`. An area name is 3 to 60 characters with at least 2 letters.

**Security:** show rider documents inside the app only. Never save them to the phone's gallery or cache them after the screen closes. Every approve, disapprove and suspend asks first.

## D7. Courier company team on the go

- [ ] Dashboard `GET /logistics/dashboard`, hubs `GET /logistics/network/hubs` (approve, reject, suspend and reactivate need a reason where the website asks for one).
- [ ] Hub operations by scanning: `POST /logistics/hub-ops/inbound`, `/sort`, `/outbound` (`{tracking_number, rider_id}`), zones `GET /logistics/hub-ops/zones`.
- [ ] Dispatch `GET /logistics/dispatch`, `/dispatch/riders`, `POST /logistics/dispatch/assign`, `/auto-assign`.
- [ ] Parcel search `GET /logistics/parcels`, `GET /logistics/parcels/{parcel}`. Exception `POST /logistics/parcels/{parcel}/exception` (multipart): `type` is `lost` or `damaged`, `reason`, and for damaged a camera `photo`. Reschedule, and override (`status` and a `reason`).
- [ ] Riders: `GET /logistics/riders`, add a rider `POST /logistics/riders`, approve, reject, suspend, reactivate, resend activation.
- [ ] COD from riders: `GET /logistics/cod`, confirm `POST /logistics/cod/remittances/{remittance}/confirm` (ask first, since it's money).

## D8. Logistics chat

- [ ] Hub ↔ courier: `GET /hub/courier-chat`, `GET/POST /hub/courier-chat/messages`, `POST /hub/courier-chat/read`. On the courier side: `GET /logistics/chat/hubs`, `POST /logistics/chat/hubs/{hub}/thread`, the thread's `messages` and `read`.
- [ ] Hub ↔ riders: `GET /hub/chat/threads` and the thread's `messages` and `read`.
- [ ] Go through `guides/HUB.md` and `guides/COURIER.md` on a real phone.

## D9. Commit and push Part D

- [ ] In `mobile/`:
  ```
  dart format .
  flutter analyze          (no errors and no warnings)
  flutter test             (all pass)
  ```
- [ ] From the repo root (`basta_velure`), on `liam/mobile-part-d`:
  ```
  git status               (no key, keystore, dart_defines/dev.json or build folder listed)
  git add mobile liam.md
  git commit -m "mobile: Part D, logistics app"
  git push -u origin liam/mobile-part-d
  ```
- [ ] **Merge Part D into `main`:**
  1. Open a pull request: on GitHub, `github.com/httpsJMDV/basta_velure` → **Pull requests** → **New pull request**, **base: `main`**, **compare: `liam/mobile-part-d`** → **Create pull request**. Or run `gh pr create --base main --fill`.
  2. Amaru or King tries it first: `git fetch`, `git checkout liam/mobile-part-d`, then they run the app on their phone.
  3. If GitHub says **"This branch has conflicts"** (Part B or C was merged while you worked):
     ```
     git checkout liam/mobile-part-d
     git pull origin main
     ```
     Fix the files Git lists, run `flutter analyze` and `flutter test` again, then `git add`, `git commit` and `git push`.
  4. Click **Merge pull request** → **Confirm merge**. Or run `gh pr merge --merge --delete-branch`.
  5. Everyone updates their `main`: `git checkout main`, then `git pull`.
- [ ] Never push straight to `main`. Part D goes in through its pull request.

---

## Validation rules for the logistics screens

The shared ones (names, email, mobile, password, uploads) are in `amaru.md`. These are the logistics screens' own:

| Field | Keyboard / what can be typed | Checked before sending |
|---|---|---|
| Tracking number (scan or typed) | Letters, digits and `-` only, uppercase (`Only.upper`) | `LIT-YYMMDD-XXXXXX` (dashes optional) |
| Rider disapproval reason (hub) | Counter shown | 10 to 500 characters, written in words |
| Reject, suspend, override and exception reasons | Counter shown | 10 to 300 characters |
| Rider area name | Counter shown, 60 max | 3 to 60 characters, at least 2 letters |
| Exception type | A picker | Lost or Damaged |
| Damage photo | **Camera only**, shrunk first | Required for Damaged. JPG or PNG, 5 MB |
| Adding a rider: license number | Letters, digits and `-`, uppercase | `A00-00-000000` |
| Adding a rider: license expiry | **Date picker only** | Today or later |
| Adding a rider: plate number | Letters and digits only, uppercase, 10 max | 2 to 10 characters |
| Adding a rider: vehicle | A picker | Motorcycle, tricycle, car or van |

## Security for the logistics app

On top of the **Security checklist in `amaru.md`**:

- [ ] Rider documents, hub documents and damage photos are shown in the app only, never saved to the gallery, and cleared from the cache when the screen closes.
- [ ] Approve, disapprove, suspend, override, Lost and Damaged, send back to the shop, and confirming COD each **ask first**, and their buttons lock while sending.
- [ ] A hub account only ever sees its own hub's parcels and riders, and a courier account only its own company's. The server already enforces this, so never try to work around a `403` or `404`.
- [ ] Buyers' names, phone numbers and addresses on parcel screens are never copied into logs or crash reports.
