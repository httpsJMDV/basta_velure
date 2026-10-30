# Liam: Loved-IT logistics app (Flutter, Part D)

Updated October 30, 2026. Tick each box when it's done and checked on the emulator **and** a real Android phone.

> **Status, Oct 31:** the whole logistics app (D1 to D8) is **built** and merged into `main` from `liam/mobile-part-d`,
> at Liam's request and before a teammate tried it, so a teammate should still try it. It's in
> `mobile/lib/features/logistics/`, and passes `flutter analyze` (no issues) and `flutter test` (172 tests in all: the
> logistics rules and API shapes in `test/logistics_test.dart`, and hub and courier screens driven through the router
> against a fake server in `test/logistics_screens_test.dart`, including a tablet and a small phone with large text).
> `flutter build apk --debug` passes too. Each screen was also rendered with the real fonts against fake data and
> checked by eye at phone, small-phone and tablet size. The boxes below stay unticked until each screen is checked on a
> real phone against the backend, which is still to do: the backend is skipped for now, and no emulator can run on this
> laptop (a standard Windows account can't turn on Windows Hypervisor Platform, and it has 7.4 GB of RAM). Notes:
> - **Tried on a real phone with a fake server (Redmi Note 10, Android 12):** the app installs and opens, and sign-in,
>   its error messages and sign-out work. Hub Home, Sorting, Dispatch, More, Parcel intake, Deliveries, Riders and rider
>   details, the Disapprove reason check and Messages all work, and so does typing a tracking number in Scan, in Receive
>   and Sort: Received, Sorted, already received and not this hub's parcel. **Not tried on a phone yet:** the courier
>   team's screens, the real camera, torch, vibration and damage photo, and anything against the real backend.
> - **Still to fix:** the hub's bottom bar (`hub/hub_shell.dart`) can't be pressed with a screen reader. `_BarItem` and
>   `_ScanButton` need `onTap:` on their `Semantics`, and the `Scan` label needs `ExcludeSemantics`.
> - **Not explained:** one time, tapping Scan after reopening the app showed a rider chat instead of Scan. It didn't
>   happen again, and test scripts were also tapping that phone, so they may have caused it. Watch for it.
> - **First build on a new PC:** it may stop with `Failed to find target with hash string 'android-37'` right after
>   Gradle installs the platform. Run it again and it passes. Let Gradle install `android-37.0` itself: the copy
>   `sdkmanager` installed was not recognised. On a laptop with little RAM, lower Gradle's 8 GB in
>   `~/.gradle/gradle.properties` (`org.gradle.jvmargs=-Xmx3g ...`), not in the project.
> - Scanning **receives straight away** with `POST /hub/parcels/{tracking}/receive`, like the website's scanner with
>   auto-receive on: the answer has everything the row needs, so a `GET` first would only slow a long session. The
>   `GET /hub/parcels/{tracking}` lookup opens when you tap a parcel in Parcel intake.
> - **No QR codes on the phone.** The website's hub Dispatch page draws a handover QR per parcel, but the app has no QR
>   package. Riders scan the waybill's barcode on the parcel, or type the number. A QR needs a new package (for
>   example `qr_flutter`); ask before adding it.
> - **On the website only:** Return to sender (`/logistics/returns`) isn't in D7, so More links to it, with zones and
>   rates, settlements and pay, reports and exports, and settings. Hub reports, earnings and settings link there too.
> - **Added to the shared base (tell Amaru):** `Rules.reason` and `Rules.areaLabel`; `Fmt.dayTime` and `Fmt.waited`;
>   `AppColors.gray200` and the `hero*` colours; `Psgc.barangayNames`, because hub coverage and rider areas are stored as
>   codes. `StatusChip` now wraps a long label instead of overflowing, and `confirmAction` uses the theme's main colour
>   (still brand red everywhere except the hub's screens).
> - **Added to Part C's widgets (tell King):** `ParcelScanner.session` for many scans in a row, with an amber flash, and
>   `RiderTabs.selectedColor`. The rider screens behave as before; their tests still pass.
> - **A form must not be a `ListView`:** a field scrolled out of a lazy list is unmounted and `validate()` skips it, so
>   blank fields pass and `_birthday!` can crash. Add rider and the area sheet use `SingleChildScrollView`.

The whole plan is in `amaru.md`: Amaru builds the setup and shared base (Part A) and the buyer app (Part B), King builds the rider app (Part C, `king.md`), and you build the **logistics** app (Part D) here. It's one app: after sign-in, a hub or courier account opens the logistics screens.

**Same repo as the website:** everything goes in **basta_velure** (`github.com/httpsJMDV/basta_velure`), in the `mobile/` folder Amaru makes in Part A. Don't make a new repository.

## Before you start

- [x] **Part A is merged into `main`.** Amaru tells you. You need its shared base. (Parts A and B are in `main`, PR #47; Part C too, `a2b57c0`.)
- [ ] On your own PC, do tasks **A1, A2 and A4 in `amaru.md`**: install Android Studio, Flutter and the emulator, and run the backend. (Done on this PC: Flutter 3.47.9 at `C:\dev\flutter`, Android Studio at `C:\dev\android-studio`, the Android SDK with its licenses accepted. Still to do: the real phone, and the backend's `.env`, `composer install` and the `velure` database. No emulator here: see the status above.)
- [x] Make your branch from the updated `main`:
  ```
  git checkout main
  git pull
  git checkout -b liam/mobile-part-d
  ```
- [x] Read `guides/HUB.md`, `guides/COURIER.md`, `docs/api/logistics-*.md`, `docs/api/courier-*.md` and `docs/api/hub-awaiting-pickup.md`.
- [x] Also follow these parts of `amaru.md`: **Ground rules**, **Validation rules for the app** and the **Security checklist**.

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
