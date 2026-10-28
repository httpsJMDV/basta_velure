# Loved-IT mobile app (Flutter)

Updated October 28, 2026. Tick each box when it's done and checked on the emulator **and** a real Android phone.

| Who | Part | File | What |
|---|---|---|---|
| **Amaru** | A, then B, then E | this file | Setup and the shared base everyone uses, then the **buyer** app, then the release |
| **King** | C | `king.md` | The **rider** screens (starts once Part A is merged) |
| **Liam** | D | `liam.md` | The **logistics** screens: hub staff and the courier company team (starts once Part A is merged) |

Sellers and admins keep using the website. The app tells them so after they sign in.

This file also holds what all three of you share: the **validation rules**, the **security checklist** and the **release** (Part E).

**Same repo as the website:** everything goes in **basta_velure** (`github.com/httpsJMDV/basta_velure`), in a new `mobile/` folder next to `backend/` and `frontend/`. Don't make a new repository.

## How each part is saved: one branch per part

Every part gets **its own branch**, and the last task of each part is to commit, push and open a pull request:

| Part | Branch | Who |
|---|---|---|
| A | `amaru/mobile-part-a` | Amaru |
| B | `amaru/mobile-part-b` | Amaru |
| C | `king/mobile-part-c` | King |
| D | `liam/mobile-part-d` | Liam |
| E | `amaru/mobile-part-e` | Amaru |

- Start each part's branch from an up-to-date `main`: `git checkout main`, `git pull`, `git checkout -b <branch>`.
- Commit small and often on that branch while you work, and push at least at the end of each day.
- **Never commit** `android/key.properties`, `*.jks`, `*.keystore`, `dart_defines/dev.json` or `prod.json`, or `build/`. Check `git status` before every commit.
- Parts C and D start after **Part A is merged** into `main`, because they need its shared base.

### Merging a part into `main`

Do this at the end of every part, after the push:

1. **Open a pull request.** On GitHub, go to `github.com/httpsJMDV/basta_velure` → **Pull requests** → **New pull request**, set **base: `main`** and **compare: your part's branch**, then **Create pull request**. Or run `gh pr create --base main --fill`.
2. **A teammate tries it** on their own PC before it's merged:
   ```
   git fetch
   git checkout <the part's branch>
   ```
   Then they run the app on their emulator or phone.
3. **If GitHub says "This branch has conflicts"**, fix them on your branch first:
   ```
   git checkout <your part's branch>
   git pull origin main
   ```
   Fix the files Git lists, run `flutter analyze` and `flutter test` again, then `git add`, `git commit` and `git push`.
4. **Merge it:** on the pull request, click **Merge pull request** → **Confirm merge**. Or run `gh pr merge --merge --delete-branch`.
5. **Everyone updates their `main`:**
   ```
   git checkout main
   git pull
   ```
   The next part's branch starts from this updated `main`.

Never push straight to `main`. Every part goes in through its pull request.

## Ground rules

- The app uses the **same Laravel API as the website** (`/api/v1`). Don't add backend code unless a task says so. If you need a backend change, ask first and add tests for it, as `CLAUDE.md` says.
- **One Flutter project, one app.** After sign-in, the account decides which home screen opens (task A6). The sign-in, API client, validation and widgets are shared, so build them once in Part A.
- Keep Loved-IT's look: brand red `#C0001A` (dark `#8B0013`, light `#E8002A`) and the same colours as each part of the website. The design must look hand-made, not like a generic template.
- **The server makes the final check every time.** What the app checks is only there to help people type it right. Never skip a server check because the app already checked.
- How each feature should work: `HOW_IT_WORKS.md` (section 13 has every validation rule), the role guides in `guides/` (`BUYER.md`, `RIDER.md`, `HUB.md`, `COURIER.md`) and the API notes in `docs/api/`. Every endpoint is in `backend/routes/api.php`.
- Android only. An iPhone build needs a Mac, so we skip iOS for the capstone.

**A task is done when:** it works on the emulator and a real phone, wrong input shows a clear message under the field, the server's error messages show too, it doesn't crash with no internet, and it behaves like the same page on the website.

---

## Part A: Setup and the shared base (Amaru)

### A1. Install the tools (Windows 11)

- [ ] **Git** (you already have it).
- [ ] **Android Studio**, latest stable, from developer.android.com/studio. In the installer keep *Android SDK*, *Android SDK Platform* and *Android Virtual Device* ticked.
- [ ] In Android Studio, open **Settings → Languages & Frameworks → Android SDK → SDK Tools** and tick:
  - Android SDK Build-Tools
  - Android SDK Command-line Tools (latest)
  - Android SDK Platform-Tools
  - Android Emulator
  - Google USB Driver (for testing on a real phone over USB on Windows)
- [ ] **Flutter SDK**, stable channel, from docs.flutter.dev (Get started → Windows → Android). Unzip it to `C:\dev\flutter`. Don't put it in `Program Files` or any folder with spaces. Then add `C:\dev\flutter\bin` to your **Path** (Start → "Edit the system environment variables" → Environment Variables → Path → New).
- [ ] **Flutter plugin** in Android Studio (Settings → Plugins → search "Flutter"; it installs Dart too). If you prefer **VS Code**, install its *Flutter* extension instead. Either works.
- [ ] Turn on **virtualization** so the emulator is fast:
  - In the BIOS, enable Intel VT-x or AMD-V (SVM). Task Manager → Performance → CPU shows "Virtualization: Enabled" when it's on.
  - In Windows "Turn Windows features on or off", tick **Windows Hypervisor Platform**, then restart.
- [ ] Open a new terminal and run:
  ```
  flutter doctor
  flutter doctor --android-licenses     (press y for each one)
  ```
  Everything for **Android** must be ✓. You can ignore the *Visual Studio* warning (only for Windows desktop apps) and the *Chrome* one.

### A2. Make the emulator and connect a real phone

- [ ] Android Studio → **Device Manager → Create Virtual Device**:
  - Phone: **Pixel 8** (or Pixel 7).
  - System image: the newest stable Android with **Google Play** in the name, x86_64. Google sign-in needs the Google Play image.
  - RAM: 2048 to 4096 MB.
- [ ] Make a second, **small-screen** phone too (5-inch class), to check that nothing gets cut off.
- [ ] Real phone: Settings → About phone → tap **Build number** 7 times → Developer options → turn on **USB debugging**. Plug it in and allow the PC. `flutter devices` must list it.
- [ ] Sign into the emulator's Play Store with a Google account. Google sign-in needs it.

### A3. Create the project

- [ ] In the repo root (`basta_velure`):
  ```
  flutter create --org shop.lovedit --project-name loved_it --platforms android mobile
  ```
  The app id becomes `shop.lovedit.loved_it`.
- [ ] Folders inside `mobile/lib/`:
  ```
  main.dart
  core/        api/  session/  validation/  widgets/  theme/  realtime/  media/
  features/
    auth/      sign up, sign in, email code, Google, forgot password
    buyer/     Part B (Amaru)
    rider/     Part C (King)
    logistics/ Part D (Liam)
  ```
- [ ] Add to `mobile/.gitignore`: `android/key.properties`, `*.jks`, `*.keystore`, `dart_defines/*.json` (keep `dart_defines/example.json` in git).
- [ ] Packages (`flutter pub add <name>`). Read each package's page on pub.dev for its Android setup steps:

| Package | For |
|---|---|
| `dio` | Calling the API: token, timeouts, errors, upload progress |
| `flutter_secure_storage` | Keeping the sign-in token safely (task A5) |
| `flutter_riverpod` | App state (signed-in user, cart count, unread counts) |
| `go_router` | Screens and sending each role to its own home |
| `cached_network_image` | Product, shop and category photos |
| `image_picker` | Camera and gallery (ID, GCash receipt, review and return photos, proof photos) |
| `flutter_image_compress` | Shrinking photos before upload, like the website does |
| `intl` | Pesos (`₱1,234.50`) and Philippine dates and times |
| `uuid` | The checkout's Idempotency-Key (task B8) |
| `google_sign_in` | Continue with Google (task B1) |
| `dart_pusher_channels` | Live chat and notifications from Laravel Reverb (task A7) |
| `url_launcher` | Opening Maps and the phone dialer |
| `flutter_map` + `latlong2` | Track package map (OpenStreetMap, the same map as the website, no API key) |
| `mobile_scanner` | Scanning tracking numbers and QR codes (Parts C and D) |
| `geolocator` | The rider's live location (Part C) |
| `permission_handler` | Asking for camera and location access with a clear reason |

### A4. Connect the app to the backend

- [ ] Run the backend on your own PC first. Follow `SETUP.md`, then start `php artisan serve`, `php artisan reverb:start` and `php artisan queue:work --tries=3` in `backend`.
- [ ] Never write the server address in the code. Pass it when you run the app. Put this in `mobile/dart_defines/dev.json`:
  ```json
  {
    "API_URL": "http://10.0.2.2:8000/api/v1",
    "WS_HOST": "10.0.2.2",
    "WS_PORT": "8080",
    "WS_SCHEME": "http",
    "REVERB_KEY": "<REVERB_APP_KEY from backend/.env>"
  }
  ```
  Run with `flutter run --dart-define-from-file=dart_defines/dev.json`. In the code, read the values with `const String.fromEnvironment('API_URL', defaultValue: 'https://api.loved-it.shop/api/v1')`.
- [ ] Which address to use:

| Where the app runs | API address |
|---|---|
| Emulator | `http://10.0.2.2:8000/api/v1` (`10.0.2.2` is the emulator's name for your PC) |
| Real phone on the same Wi-Fi | Start the backend with `php artisan serve --host=0.0.0.0 --port=8000`, then use `http://<your PC's IPv4 from ipconfig>:8000/api/v1`. Allow PHP through Windows Firewall when it asks. |
| The live site | `https://api.loved-it.shop/api/v1`, Reverb `ws.loved-it.shop` port `443`, scheme `https`. Only while JM's PC is running the site. **It's real data: use test accounts only.** |

- [ ] Android blocks plain `http://` by default. Allow it **only in debug builds**: in `android/app/src/debug/AndroidManifest.xml`, add `android:usesCleartextTraffic="true"` to `<application>`. The release build stays HTTPS-only.
- [ ] Photo addresses come from `APP_URL` in `backend/.env` (now `https://api.loved-it.shop`), so photos only load while the tunnel is running. If they don't show, that's why.
- [ ] Every request sends `Accept: application/json`, and once signed in, `Authorization: Bearer <token>`.

### A5. The shared base: API client and sign-in session

- [ ] **One API client** (`core/api/`) with `dio`:
  ```dart
  final dio = Dio(BaseOptions(
    baseUrl: const String.fromEnvironment('API_URL', defaultValue: 'https://api.loved-it.shop/api/v1'),
    headers: {'Accept': 'application/json'},
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
  ));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await secureStorage.read(key: 'token');
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    },
    onError: (e, handler) async {
      if (e.response?.statusCode == 401) await session.signOut(); // token gone or revoked
      handler.next(e);
    },
  ));
  ```
- [ ] Turn every error into something people understand:

| Status | Meaning | The app does |
|---|---|---|
| `401` | Not signed in, or the token was revoked | Delete the token, go to Sign in |
| `403` + `code: email_unverified` | Email code not entered | Open the code screen with their email |
| `403` + `code: account_suspended` | Suspended | Sign out, show the suspended screen |
| `403` + `code: pending_activation` | Rider not activated | Show "Open the activation link we emailed you" |
| `403` + `code: id_not_verified` | Buyer's ID not approved (checkout) | Show the ID verification screen (task B2) |
| `404` / `409` | Gone, or already changed by someone else | Show the message, refresh the screen |
| `422` | Wrong input. `errors` is `{ field: [messages] }` | Show each message **under its field** |
| `429` | Too many tries | "Too many tries. Wait a minute and try again." Don't retry by itself. |
| `5xx`, no internet, timeout | Server or network problem | "Couldn't reach Loved-IT. Check your internet and try again." with a Try again button |

- [ ] **Session:** keep the token in `flutter_secure_storage` (the Android Keystore). When the app opens, call `GET /auth/me`. A valid token shows the home screen; a `401` shows Sign in.
- [ ] **Sign out:** `POST /auth/logout`, then delete the token and every cached user detail, even if the request fails.

**Security (A5):**
- Keep the token **only** in secure storage. Never in `SharedPreferences`, a file, a log or a crash report.
- Don't `print()` tokens, passwords, addresses, phone numbers or ID details. Wrap any debug output in `if (kDebugMode)`.
- An account that gets suspended or unverified is refused on **every** request (`403` with a `code`), so the app must sign out right away and never keep showing old data.

### A6. Which home screen opens

`POST /auth/login` and `GET /auth/me` return `role`, `rider`, `sorting_center` and `logistics_company`.

- [ ] `rider` present and approved → **Rider home** (Part C).
- [ ] `sorting_center` approved, or `logistics_company` present → **Logistics home** (Part D).
- [ ] `role` is `admin` → "Use loved-it.shop on a computer for the admin console" and a Sign out button.
- [ ] Everyone else (buyers, and sellers, who can shop too) → **Buyer home** (Part B). A seller sees a note that the shop is run from the website.
- [ ] Someone with two roles (for example a buyer who is also a rider) gets **Switch to rider/logistics** in Account.

### A7. The shared base: validation, widgets, photos, live updates

- [ ] **Validation kit** (`core/validation/`): one file with every rule from the table in **"Validation rules for the app"** below. Every form uses it, and nobody writes their own regex in a screen.
  ```dart
  import 'package:flutter/services.dart';

  /// The same rules as backend/app/Support/Validation.php. The server checks again.
  class Rules {
    static final _name = RegExp(r"^\p{L}[\p{L}\p{M} .'\-]*$", unicode: true);
    static final _mobile = RegExp(r'^(09\d{9}|\+639\d{9})$');
    static final _words = RegExp(r'(?:\p{L}.*){3}', unicode: true, dotAll: true);

    static String? name(String? v, String label, {bool required = true}) {
      final s = (v ?? '').trim();
      if (s.isEmpty) return required ? '$label is required.' : null;
      if (s.length < 2 || s.length > 50) return '$label must be 2 to 50 characters.';
      if (!_name.hasMatch(s)) return '$label may contain letters only (spaces, hyphens, apostrophes and periods are allowed).';
      return null;
    }

    static String? mobile(String? v) {
      final s = (v ?? '').replaceAll(RegExp(r'[\s-]'), '');
      if (s.isEmpty) return 'Mobile number is required.';
      if (!_mobile.hasMatch(s)) return 'Enter a valid Philippine mobile number: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.';
      return null;
    }

    static String? password(String? v) {
      final s = v ?? '';
      if (s.length < 8 || !RegExp('[A-Z]').hasMatch(s) || !RegExp('[a-z]').hasMatch(s)
          || !RegExp(r'\d').hasMatch(s) || !RegExp(r'[^A-Za-z0-9]').hasMatch(s)) {
        return 'Use 8 or more characters with an uppercase letter, a lowercase letter, a number and a symbol.';
      }
      return null;
    }

    /// A reason someone else reads: min to max characters, written in words (not "..." or "123").
    static String? words(String? v, String label, {int min = 10, int max = 500}) {
      final s = (v ?? '').trim();
      if (s.length < min || s.length > max) return '$label must be $min to $max characters.';
      if (!_words.hasMatch(s)) return '$label must be written in words.';
      return null;
    }
  }

  /// What each field lets people type at all. Wrong characters never appear in the box.
  class Only {
    static final digits = FilteringTextInputFormatter.digitsOnly;
    static final nameChars = FilteringTextInputFormatter.allow(RegExp(r"[\p{L}\p{M} .'\-]", unicode: true));
    static final mobileChars = FilteringTextInputFormatter.allow(RegExp(r'[0-9+]'));
    static final noSpaces = FilteringTextInputFormatter.deny(RegExp(r'\s'));
    static TextInputFormatter max(int n) => LengthLimitingTextInputFormatter(n);

    /// Pesos: digits and one dot, at most 2 decimals ("500", "500.5", "500.50").
    static final pesos = TextInputFormatter.withFunction((oldValue, newValue) =>
        RegExp(r'^\d{0,9}(\.\d{0,2})?$').hasMatch(newValue.text) ? newValue : oldValue);

    static final upper = TextInputFormatter.withFunction((oldValue, newValue) =>
        newValue.copyWith(text: newValue.text.toUpperCase()));
  }
  ```
- [ ] **Theme** (`core/theme/`), one for the whole app so every screen feels like the same product:
  - Font: **Inter**, the website's font (add it with the `google_fonts` package, or bundle the font files in `assets/fonts/`).
  - Colours as named constants, never typed into screens: `brandRed #C0001A`, `brandRedDark #8B0013`, `brandRedLight #E8002A`. Status colours used the same way everywhere: **amber** = waiting or cash to collect, **emerald** = done or delivered, **rose/red** = failed or cancelled, **blue** = on the way, **gray** = closed.
  - Material 3 with our own `ColorScheme` (start from `ColorScheme.fromSeed(seedColor: brandRed)`, then set the main colours yourself so it doesn't drift to pink or purple).
  - Spacing on a 4 px grid (4, 8, 12, 16, 24, 32), corner radius 12 for cards and 999 for chips and pills, one shadow style.
  - Icons: one set for the whole app, the same **Lucide** icons the website uses (`lucide_icons_flutter`), never mixed with other icon packs or emoji.
- [ ] **Modern and professional, the basics** (all three parts follow these):
  - One main action per screen, in brand red, at the bottom where the thumb reaches. Everything else is quieter (outline or text buttons).
  - Tap targets at least **48 × 48**. Body text at least 14, numbers that matter (prices, cash, counts) bigger and bold.
  - **Loading** shows grey placeholders shaped like the content (skeletons), not a spinner in the middle of an empty screen. Lists have **pull to refresh**.
  - Every list has a real **empty state** (a short sentence and the next step), and every error has **Try again**.
  - Movement is short and quiet: about 200 ms, no bouncing, nothing that blocks a tap.
  - No generic template look: no purple gradients, no glowing cards, no emoji as icons, no stock "AI" illustrations. Open the same page on the website next to the app and match it.
  - Check it with the phone's text size set to **Large**, and in sunlight for the rider and hub screens.
- [ ] **Widgets** (`core/widgets/`), used everywhere:
  - `AppTextField`: label, the right keyboard, formatters, the error under the field, and a character counter when there's a limit
  - `PesoText`, `EmptyState`, `ErrorRetry`, loading placeholders, `ConfirmDialog` (for every delete, cancel and approve)
  - A submit button that **disables itself while sending**, so a double tap can't send twice
- [ ] **Photos** (`core/media/`): a photo picker that checks the type, shrinks the photo (long side 1600 px, JPEG quality about 80) and refuses anything still over the limit **before** uploading. Show upload progress.
- [ ] **Live updates** (`core/realtime/`) with `dart_pusher_channels`, the same Laravel Reverb server the website uses:
  - Host, port and scheme from `WS_HOST` / `WS_PORT` / `WS_SCHEME`, key from `REVERB_KEY`.
  - Private channels sign in at `<API_URL without /v1>/broadcasting/auth` (for example `http://10.0.2.2:8000/api/broadcasting/auth`), with the same `Authorization: Bearer` header.
  - Channels: `private-App.Models.User.{userId}` (notifications), `private-user.{userId}.conversations` (chat list), `private-conversation.{id}` (one chat: `MessageSent`, `MessageRead`).
  - If the connection drops, the screens still work by refreshing. The website also checks the unread count every 30 seconds.

- [ ] **Tests** for the validation kit (`mobile/test/validation_test.dart`): for every rule, at least one value that passes and one that fails, using the examples in the table at the end of this file.

**Security (A7):**
- Re-encoding the photo also **removes its hidden location data (EXIF GPS)**, so a buyer's ID or receipt doesn't reveal where they live. Keep that on.
- Ask for the camera only when someone taps "Take photo", and location only on the rider's screens. Say why in one sentence.

### A8. Commit and push Part A

- [ ] Check it first, in `mobile/`:
  ```
  dart format .
  flutter analyze          (no errors and no warnings)
  flutter test             (all pass)
  ```
- [ ] Commit and push on the Part A branch, from the repo root (`basta_velure`):
  ```
  git checkout main
  git pull
  git checkout -b amaru/mobile-part-a
  git status               (make sure no key, keystore, dart_defines/dev.json or build folder is listed)
  git add mobile amaru.md
  git commit -m "mobile: Part A, project setup and shared base"
  git push -u origin amaru/mobile-part-a
  ```
  If you already made the branch at the start, skip the first three lines.
- [ ] **Merge Part A into `main`** using the steps in "Merging a part into `main`" at the top of this file. Ask King or Liam to try it on their PC first.
- [ ] Tell King and Liam that Part A is merged, so they can start `king.md` and `liam.md`.

---

## Part B: The buyer app (Amaru)

Start the branch from the updated `main` once Part A is merged: `git checkout main`, `git pull`, `git checkout -b amaru/mobile-part-b`.

### B0. How the buyer app looks: like the website

The buyer app should feel like **loved-it.shop on a phone**. Open the website on your phone (or Chrome's phone view) next to the emulator while you build each screen.

- [ ] **Colours:** white and warm stone backgrounds (like the website's `stone-50` / `stone-100`), dark stone text, **brand red** `#C0001A` for the main buttons, prices, the cart badge and sale tags. Amber for vouchers and warnings, emerald for "Delivered" and "Completed".
- [ ] **Bottom bar** with 5 tabs: Home, Categories, Messages (with the unread count), Cart (with the count), Account. The search bar sits at the top of Home and Categories.
- [ ] **Home** in the website's order: the hero banner (the same 4 photos plus the beauty slide, swipeable, about 16:9), the category grid (2 rows, photo tiles), Trending now (ranked cards), the shops to know, then the product grid.
- [ ] **Category photos:** the same pictures as the website. Copy `frontend/src/assets/categories/photos/*.jpg` into `mobile/assets/categories/`, **resized to 400 × 400** so the app stays small (the full set is 7.4 MB). Use the admin's uploaded `photo_url` first, then the built-in photo by `slug`, then the best seller's `image_url`, then an icon. This is the same order as `CategoryArt.tsx`. Keep `CREDITS.md` with them.
- [ ] **Product card** like the website's `ProductCard.tsx`: square photo, the name in 2 lines at most, the price in red (and the old price struck through when on sale), rating and sold count, and a sale or flash tag in the corner. Two cards per row.
- [ ] **Product page:** full-width photos you can swipe, the price block, variant chips, the shop card, then reviews. **Add to cart** and **Buy now** stay fixed at the bottom.
- [ ] **Cart and checkout:** grouped by shop with the shop name on top, like the website. The total and the main button stay fixed at the bottom.
- [ ] **Order cards** with the same status colours and wording as the website's order list (`utils/orderStatus.ts`).

### B1. Sign up, email code, sign in, Google, forgot password

- [ ] **Sign up** `POST /auth/register`: `first_name`, `middle_name` (optional), `last_name`, `email`, `phone`, `date_of_birth` (`YYYY-MM-DD`), `password`, `password_confirmation`, `accept_terms`. Then go to the code screen.
- [ ] **Email code** `POST /auth/verify-email` `{email, code}`. **Resend** `POST /auth/resend-verification` `{email}` (the old code stops working). The code works for 5 minutes, and 5 wrong tries means they need a new code. Show a resend countdown.
- [ ] **Sign in** `POST /auth/login` `{identifier, password}`. `identifier` is an email or username. A `401` always says "Invalid credentials". Handle each `403` `code` as in task A5.
- [ ] **Continue with Google** `POST /auth/google` `{credential}`, where `credential` is a Google **access token** with the `email` and `profile` scopes from `google_sign_in`. Setup in Google Cloud: in the same project as the website's client ID, add an **Android** OAuth client with package `shop.lovedit.loved_it` and your debug **SHA-1**:
  ```
  keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
  ```
  Each teammate's PC has its own debug key, so add each SHA-1 (and the release key's later).
- [ ] **Forgot password** `POST /auth/forgot-password` `{email}`. The reset link in the email opens the website, which is fine.

**Inputs:** names, email, mobile, date of birth (a date picker only, latest date allowed = 18 years ago), password with a live checklist, a password confirmation that must match, the terms checkbox, and a 6-digit code (digits only).

**Security:** don't say whether an email exists ("Invalid credentials" only). Never trim or change passwords. Hide them, with an eye button to show. Sign-in is limited to 10 tries a minute, so show `429` nicely.

### B2. Complete profile (Google sign-ups) and ID verification

- [ ] Google sign-ups fill in birthday, sex, mobile, address and their ID: `POST /auth/complete-profile` (multipart). Fields: `date_of_birth`, `sex`, `phone`, `province`, `city_municipality`, `barangay`, `street_address`, `government_id_type`, `government_id_image`, `government_id_image_back`.
- [ ] **ID verification** `GET /account/id-verification`, `POST /account/id-verification` (multipart): `government_id_type` is one of `national_id`, `drivers_license`, `passport`, `umid`, `sss_id`, `philhealth_id`, `voters_id`, `postal_id` (no school IDs), plus `government_id_image` and `government_id_image_back` for IDs that have a back. JPG, PNG or PDF, up to 5 MB.
- [ ] Show the status (none, pending, approved, rejected with the admin's reason) and let them send it again after a rejection.
- [ ] **No order until the ID is approved.** Buyers can still browse and fill a cart. Checkout shows why ordering is closed and links here.

**Security:** take ID photos from the **camera or files only for this screen** and don't keep copies in the app's cache after upload. Optional: block screenshots on this screen (`FLAG_SECURE`).

### B3. Home, categories and search

- [ ] **Home:** banners, categories `GET /categories` (photos: `photo_url`, then `image_url`; the "Others" category is hidden on the home grid like the website), featured shops `GET /shops`, products `GET /products`.
- [ ] **Search and filters** `GET /products` with `q`, `category_id`, `parent_category_id`, `sort`, `min_price`, `max_price`, `min_rating`, `on_sale`, `new_arrivals`, `per_page`, and pages. Load more while scrolling.

**Inputs:** search is trimmed, never sent empty, and waits until typing stops (about 400 ms) before calling the API. Price filters use digits only (`Only.pesos`), and the minimum can't be above the maximum.

### B4. Product page

- [ ] `GET /products/{id}`: photos (swipe and zoom), price, sale and flash sale price with its countdown, variants (up to 2 types), stock, purchase limit, shop card, reviews `GET /products/{id}/reviews`, related products `GET /products/{id}/related`, and vouchers `GET /products/{id}/vouchers`.
- [ ] **Add to cart** and **Buy now**. The quantity box takes digits only. Typing more than the stock or purchase limit sets it to the most allowed, like the website's quantity box. Out of stock disables both buttons.
- [ ] Wishlist heart `POST /wishlist/toggle`.

### B5. Shop page (signed-in only)

- [ ] `GET /shops/{shop}`: profile, products, shop vouchers `GET /shops/{seller}/vouchers`, follow `POST /store-follows/toggle`.
- [ ] Product reviews `GET /shops/{shop}/reviews` (with stars) and **shop comments** `GET /shops/{shop}/shop-reviews` (no stars, with the seller's reply).
- [ ] Write or edit your comment: `GET/POST/PATCH /shops/{shop}/my-shop-review`. One per buyer per shop, only after a completed order from it, and at most 2 edits a day.

### B6. Cart

- [ ] `GET /cart`, `POST /cart/items`, `PATCH /cart/items/{line}`, `DELETE /cart/items/{line}`, `POST /cart/select`. The cart is saved on the server, so it's the same as on the website.
- [ ] Group by shop. Sold-out, hidden or on-vacation items are marked and can't be selected. 100 lines at most.
- [ ] **Removing an item asks first** ("Remove this item?"). Quantity works like B4.

**Security:** the cart shows prices from the server. The app never calculates the amount the buyer pays.

### B7. Addresses

- [ ] `GET/POST /addresses`, `PATCH /addresses/{id}`, `DELETE /addresses/{id}` (ask first), `PATCH /addresses/{id}/default`. 10 addresses at most.
- [ ] Region → province → city/municipality → barangay pickers from the same free PSGC list the website uses: `https://psgc.gitlab.io/api/regions/`, then `/regions/{code}/provinces/`, `/provinces/{code}/cities-municipalities/` (NCR has no provinces: use `/regions/{NCR code}/cities-municipalities/`), and `/cities-municipalities/{code}/barangays/`.
- [ ] Send the names **and** the codes: `full_name`, `phone`, `address` (street), `floor_unit`, `region`, `region_code`, `province`, `province_code`, `district` (city), `city_code`, `ward` (barangay), `barangay_code`, `label` (`home` or `office`), `is_default`.

**Inputs:** the places come from pickers only, never typed. Full name is 2 to 100 characters. Mobile follows the mobile rule. Street is up to 255 characters, floor/unit up to 100. Always show **names, never the codes**.

### B8. Checkout (cash on delivery and GCash only)

- [ ] `POST /checkout/quote` with the selected items (or `source: buy_now`), `address_id` and vouchers (one store voucher per shop, one platform and one shipping). Show the server's totals per shop: each shop is its own order with its own delivery fee.
- [ ] Payment: **cash on delivery** or **GCash** only (the website hides e-wallet and card too). GCash: `GET /checkout/shops` shows each shop's GCash. The buyer pays each shop in the GCash app, then enters each shop's **13-digit reference** and uploads the **receipt** (JPG/PNG, 5 MB). GCash is off if any shop in the order has no GCash.
- [ ] `POST /checkout/place-order` (multipart): `payment_method` (`cod` or `gcash`), the same items, address and vouchers, and for GCash `gcash[SELLER_ID][reference]` and `gcash_proof[SELLER_ID]`.
- [ ] Send an **`Idempotency-Key`** header: a new `uuid` for each checkout attempt, **the same one if they retry** after a network error. That way a retry never makes a second order.
- [ ] If the server says the total changed or a voucher stopped working, show the new total and ask again. `403 id_not_verified` → task B2. "We cannot deliver to this address yet" → pick another address.

**Security:** the server prices everything again when the order is placed, so the app only sends item ids, quantities, the address id and voucher codes, **never prices or totals**. The Place order button locks while sending.

### B9. Orders, tracking, cancel, receive, return

- [ ] `GET /buyer/orders` with tabs (To pay, To ship, To receive, Completed, Cancelled, Returns) and `GET /buyer/orders/{id}`.
- [ ] **Track package** `GET /parcels/{tracking}/tracking`: the timeline, and a map with the rider's position while out for delivery. Refresh every 15 to 30 seconds while the screen is open.
- [ ] **Message rider** `POST /parcels/{tracking}/rider-chat`, only while the parcel is out for delivery.
- [ ] **Proof of delivery photo** `GET /parcels/{tracking}/delivery-proof`. It needs the token, so pass the `Authorization` header to the image. There's **no delivery code** any more: the rider's photo, and for COD the exact cash, are the proof.
- [ ] **Cancel** `POST /buyer/orders/{id}/cancel`: pick a reason. "Other" needs 10 to 300 characters. Ask "Cancel this order?" first.
- [ ] **Order received** `POST /buyer/orders/{id}/confirm-receipt`. Ask first. Otherwise it completes by itself 7 days after delivery.
- [ ] **Return** `POST /buyer/orders/{id}/request-return` (multipart): reason, a 10 to 500 character description, and 1 to 5 photos. **Escalate** `POST /buyer/orders/{id}/escalate-return`. Check the field names in `BuyerOrderController`.

### B10. Reviews

- [ ] To review `GET /buyer/reviews/pending`, my reviews `GET /buyer/reviews`.
- [ ] Write `POST /buyer/reviews` (multipart): 1 to 5 stars (required), up to 500 characters, up to 5 photos. Edit `PATCH /buyer/reviews/{id}`. One per product per delivered order.

### B11. Messages and Loved-IT Support

- [ ] `GET /conversations`, `GET /conversations/unread-count`, `POST /conversations/start` (from a shop or product page), `GET /conversations/{id}`, `GET/POST /conversations/{id}/messages`.
- [ ] Attach a product or an order: `GET /conversations/{id}/attachable-products` and `attachable-orders`.
- [ ] **Loved-IT Support** (the AI): "Talk to a person" `POST /conversations/{id}/handoff`, and back to the assistant `POST /conversations/{id}/assistant`. It only explains and guides. It never refunds or cancels.
- [ ] Live messages from task A7. Look at `frontend/src/hooks/useChat.tsx` to see how the website does it.

**Inputs:** messages are trimmed and never sent empty. Show a character limit if the server has one. A send button that locks while sending.

### B12. Notifications

- [ ] The bell: `GET /notifications`, `GET /notifications/unread-count` (every 30 seconds, plus live on the user channel), `POST /notifications/{id}/read`, `POST /notifications/read-all`. Tapping one opens the right order or chat.
- [ ] There are **no phone push notifications yet**. The backend has no Firebase (FCM) support. If we want them, it's a separate task with backend work (save each phone's FCM token, send from `Notifier.php`). Ask before starting it.

### B13. Account

- [ ] Profile `PATCH /auth/profile`, photo `POST /auth/avatar` (JPG/PNG, 5 MB).
- [ ] Password `POST /auth/change-password`: current password first, and the new one must be different. **Other devices are signed out**, so handle a `401` on them.
- [ ] Email `POST /auth/email-change` and `/confirm` (the code goes to the new email). Mobile `POST /auth/phone-change` and `/confirm` (the code goes to their email, since Loved-IT sends no SMS).
- [ ] Wishlist `GET /wishlist`, followed shops `GET /store-follows`, voucher wallet `GET /buyer/vouchers` and claim `POST /buyer/vouchers/claim` (also `GET /vouchers/platform`).
- [ ] Feedback `POST /feedback`, and the policies `GET /platform/policies`.
- [ ] Sign out (task A5).

### B14. Finish the buyer app

- [ ] Empty states, error and Try again screens, and no-internet handling on every screen.
- [ ] Check every screen on the small phone. Nothing is cut off, and every button is at least 48 px tall.
- [ ] App name "Loved-IT" and the app icon (from the website's logo).
- [ ] Go through `guides/BUYER.md` start to finish on the phone.

### B15. Commit and push Part B

- [ ] In `mobile/`: `dart format .`, `flutter analyze` (no errors and no warnings), `flutter test` (all pass).
- [ ] From the repo root, on `amaru/mobile-part-b`:
  ```
  git status               (no key, keystore, dart_defines/dev.json or build folder)
  git add mobile amaru.md
  git commit -m "mobile: Part B, buyer app"
  git push -u origin amaru/mobile-part-b
  ```
- [ ] **Merge Part B into `main`** using the steps in "Merging a part into `main`" at the top of this file. Have a teammate try the buyer app on their phone first.

---

## Parts C and D

The rider app (Part C) is in `king.md`. The logistics app (Part D) is in `liam.md`.

---

## Validation rules for the app

Three layers, every time: the **keyboard and formatter** stop wrong characters, the **validator** explains what's wrong before sending, and the **server's `422`** message shows under the field if something still gets through.

| Field | Keyboard / what can be typed | Checked before sending |
|---|---|---|
| First, middle, last name | `TextInputType.name`, words capitalised. Letters (ñ and accents too), space, `-` `'` `.` only (`Only.nameChars`), 50 max | 2 to 50 characters, starts with a letter. Middle name is optional |
| Email | `TextInputType.emailAddress`, no spaces, 100 max | A valid email. Sent trimmed and in lowercase |
| Mobile number | `TextInputType.phone`, digits and `+` only, 13 max | `09XXXXXXXXX` or `+639XXXXXXXXX` |
| Password | Hidden, nothing filtered (symbols are needed) | 8+ with an uppercase letter, a lowercase letter, a number and a symbol. The confirmation must match. Never trimmed |
| Date of birth | **Date picker only**, no typing | Not in the future, 18 or older (Philippine date). Sent as `YYYY-MM-DD` |
| Email code | Number keyboard, digits only, exactly 6, one-time-code autofill | 6 digits |
| Postal code | Digits only, 4 max | Exactly 4 digits |
| Quantity | Digits only | 1 or more. Above the stock or purchase limit becomes the most allowed |
| Prices in filters | Digits and one dot, at most 2 decimals (`Only.pesos`) | The minimum can't be above the maximum |
| GCash reference | Digits only (spaces stripped), 13 max | Exactly 13 digits |
| Cancel "Other" reason | Counter shown | 10 to 300 characters, written in words |
| Return description | Counter shown | 10 to 500 characters, written in words |
| Review | Stars required; text counter | 1 to 5 stars, up to 500 characters, up to 5 photos |
| Address | Places from pickers only; street 255 max, floor/unit 100 max | Full name 2 to 100 characters, mobile rule, barangay required |
| Search | Trimmed | Never sent empty |
| Image upload | Camera or gallery, shrunk first | JPG or PNG, 5 MB (ID and documents can also be PDF) |

The rider fields are in `king.md` and the hub and courier fields in `liam.md`. The full list (seller and courier forms too) is section 13 of `HOW_IT_WORKS.md`. If a rule here and the server ever disagree, the server is right: fix the app.

---

## Security checklist (every part)

This is for all three of you: King and Liam follow it too, along with the security notes in their own files.


- [ ] **Token** only in `flutter_secure_storage`. Delete it on sign out, on any `401`, and when a `403` says the account is suspended or unverified.
- [ ] **HTTPS only** in release builds. Plain `http://` is allowed in the debug build only (task A4).
- [ ] **No secrets in the app.** Anything inside an APK can be read. The Groq AI key, the payment sandbox secret, database passwords and the Reverb **secret** stay on the server. (The Reverb **app key** is public, so it's fine.)
- [ ] **The server decides prices, totals, stock, who can see what, and every status change.** The app sends ids and what the person typed, nothing it worked out itself.
- [ ] **Three-layer validation** on every field (table above).
- [ ] **No double sending:** buttons lock while sending, and checkout uses the `Idempotency-Key`.
- [ ] **Ask before** every delete, cancel, approve, reject, suspend, "Order received", "Delivered" and money confirmation.
- [ ] **Photos:** check the type and size, shrink and re-encode them (this drops the hidden GPS data), and use the camera only for proof photos.
- [ ] **Private files** (IDs, receipts, rider documents, proof photos) are shown in the app only, never saved to the gallery, and cleared from the cache after the screen closes.
- [ ] **Permissions** only when needed, with a reason: camera when taking a photo, location for riders while working.
- [ ] **No personal data in logs**: no tokens, passwords, phone numbers, addresses or ID details. Debug output only inside `if (kDebugMode)`.
- [ ] **Too many tries (`429`):** show a wait message, never retry in a loop.
- [ ] **Backend fix before release (Google sign-in):** `GoogleAuthController` accepts any Google access token and only reads the profile, so it doesn't check that the token was made for Loved-IT. Before release, have the app send Google's **ID token** and have the server check that its `aud` is one of our client IDs. Do it with a test, and keep the website working.
- [ ] **Release build:** a release keystore that is **never committed** (`key.properties` and `*.jks` in `.gitignore`), and
  ```
  flutter build apk --release --obfuscate --split-debug-info=build/symbols
  ```
  Keep the `build/symbols` folder (it's needed to read crash reports), but don't commit it.

---

## Part E: Release (all three)

Start once Parts B, C and D are merged: `git checkout main`, `git pull`, `git checkout -b amaru/mobile-part-e`.

- [ ] Fix the Google sign-in check on the server first (the last item of the security checklist).
- [ ] Make the release keystore once (`keytool -genkey ...`, see "Build and release an Android app" on docs.flutter.dev). Keep it and its passwords somewhere safe and outside git. Losing it means the app can't be updated.
- [ ] Add the release key's SHA-1 to the Google Cloud Android client (task B1).
- [ ] `flutter build apk --release --obfuscate --split-debug-info=build/symbols` with `dart_defines/prod.json` (the `https://api.loved-it.shop` addresses).
- [ ] Install the APK on 2 or 3 different phones and go through the buyer, rider and hub guides once more.
- [ ] Commit and push Part E (the release settings and the Google fix, **never the keystore or `key.properties`**):
  ```
  git status
  git add mobile backend amaru.md
  git commit -m "mobile: Part E, release build"
  git push -u origin amaru/mobile-part-e
  ```
  Check that the backend tests still pass (`php artisan test`), then **merge Part E into `main`** using the steps in "Merging a part into `main`" at the top of this file.

---

## Web tasks still open (from before)

The finished web tasks (courier Settings and Messages, rider chat, footer pages, shop profile, shop reviews, the AI product check and support chat) are in git history, in commit `0800243`.

### Buyer pages: find and fix bugs

Check every buyer page for bugs, and check that each form only accepts valid input (the same rules the server uses).

- [ ] Home, search and category (`CatalogPage.tsx`)
- [ ] Product page (`ProductDetailPage.tsx`): variants, quantity, Add to cart, Buy now, flash sale reminder
- [ ] Payment page (`PaymentPage.tsx`): pay, Pay again, the 1-hour limit
- [ ] Account pages (`SettingsPage.tsx`): Profile, Addresses, Orders, Returns, Cancellations, My vouchers, Reviews, Wishlist & stores, Messages
- [ ] Wrong input shows a clear message under the field (empty, too long, wrong format).
- [ ] Every button does what it says, with no console errors.
- [ ] Each page works at phone width.

> First pass done October 24, 2026: see `docs/buyer-pages-check.md`. Still open: clicking through every button on
> every page, and a phone-width pass of the Catalog, Product, Payment, Vouchers and Wishlist pages.
