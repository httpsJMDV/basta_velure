# Loved-IT mobile app (Flutter, Android)

One app for buyers, riders and logistics teams, on the same API as the website (`/api/v1`). The plan and the task
lists are in `amaru.md` (Parts A, B, E), `king.md` (Part C) and `liam.md` (Part D).

## Run it

1. Point `DB_DATABASE` in `backend/.env` at `velure` (the real Loved-IT data), then start the backend (`SETUP.md`): `php artisan serve`, `php artisan reverb:start`, `php artisan queue:work --tries=3`.
2. Copy `dart_defines/example.json` to `dart_defines/dev.json` and put `REVERB_APP_KEY` from `backend/.env` in it.
   `dev.json` is ignored by git. On a real phone, use your PC's Wi-Fi address instead of `10.0.2.2` and start the
   backend with `php artisan serve --host=0.0.0.0 --port=8000`.
3. In `mobile/`: `flutter run --dart-define-from-file=dart_defines/dev.json`

Before every commit: `dart format .`, `flutter analyze` (no issues) and `flutter test` (all pass).

## Where things are

| Path | What |
|---|---|
| `lib/core/env.dart` | `API_URL`, `WS_*`, `REVERB_KEY`, `WEB_URL` from the dart defines, and `Env.mediaUrl()` for every photo link |
| `lib/core/api/` | `dioProvider` (token, timeouts) and `ApiFailure` (every error turned into a message) |
| `lib/core/session/` | The signed-in user (`currentUserProvider`), sign in and out, which home opens (`home_route.dart`) |
| `lib/core/validation/rules.dart` | `Rules` (the server's checks and messages) and `Only` (what a field lets people type) |
| `lib/core/widgets/` | `AppTextField`, `SubmitButton`, `PesoText`, `EmptyState`, `ErrorRetry`, `Skeleton`, `MessageBanner`, `StatusChip`, `confirmAction`, `UploadProgress`, `NetImage` (public photos, cached), `PagedList` (any paginated list), `DateOfBirthField`, `PasswordChecklist` |
| `lib/core/api/json.dart`, `lib/core/format.dart` | Reading the API's JSON safely (`ApiPage`), and Philippine dates, sold counts and countdowns (`Fmt`) |
| `lib/core/media/` | `PhotoPicker` (shrinks, re-encodes, strips GPS, checks the size) and `askPermission` |
| `lib/core/realtime/` | `realtimeProvider`: Reverb channels for notifications and chat |
| `lib/core/theme/` | `AppColors`, `StatusTone`, `AppSpace`, `AppRadius`, `buildAppTheme()` |
| `lib/router.dart` | Which screen may open for the session |
| `lib/features/buyer/`, `rider/`, `logistics/` | Each part's screens, with its routes in `*_routes.dart` |
| `lib/features/buyer/data/` | Part B: `BuyerApi` (every buyer endpoint), the models, `cartProvider` and the unread counts |
| `lib/features/buyer/buyer_shell.dart` | The bottom bar (Home, Categories, Messages, Cart, Account); `buyer_paths.dart` has every buyer address |

## Adding screens

Put a part's routes in its own routes file, under its home's path, so the three parts never edit the same file:
`/buyer/...` in `features/buyer/buyer_routes.dart`, `/rider/...` in `features/rider/rider_routes.dart`,
`/logistics/...` in `features/logistics/logistics_routes.dart`. The router only lets a signed-in person open screens
under the home they are in. Replace the placeholder home screen (`PlaceholderHome`) with the real one.

## Calling the API

```dart
final dio = ref.read(dioProvider);
try {
  final response = await dio.post<Map<String, dynamic>>('/auth/verify-email', data: {'email': email, 'code': code});
  // ...
} catch (error) {
  final failure = ApiFailure.from(error);
  // failure.message: what to show (banner or ErrorRetry)
  // failure.errorFor('field'): the 422 message for a field (AppTextField.serverError)
  // failure.canRetry: show Try again (no internet, server error)
}
```

A `401`, or a `403` saying the account is suspended, unverified or not activated, ends the session on its own: the
token is deleted and the right screen opens. Screens don't handle those.

Providers that hold one person's data should watch `currentUserProvider`, so they reset when someone signs out.

## Release build (Part E)

1. `android/key.properties` points at the release keystore (kept outside the repo, never committed). Without it a
   release build is signed with the debug key: fine for testing, but it can't be published or updated later.
2. `dart_defines/prod.json` has the live addresses (`https://api.loved-it.shop/api/v1`, Reverb `ws.loved-it.shop:443`).
   Put the live server's `REVERB_APP_KEY` in it; while it is empty, live updates are off and screens refresh instead.
3. In `mobile/`:
   ```
   flutter build apk --release --obfuscate --split-debug-info=build/symbols --dart-define-from-file=dart_defines/prod.json
   ```
   The APK is `build/app/outputs/flutter-apk/app-release.apk`. Keep `build/symbols` (it reads crash reports); don't commit it.

Google sign-in needs `GOOGLE_CLIENT_IDS` on the server (`docs/api/auth-google.md`) and an Android OAuth client in Google
Cloud with each debug SHA-1 and the release SHA-1.
