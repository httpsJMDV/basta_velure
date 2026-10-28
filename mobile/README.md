# Loved-IT mobile app (Flutter, Android)

One app for buyers, riders and logistics teams, on the same API as the website (`/api/v1`). The plan and the task
lists are in `amaru.md` (Parts A, B, E), `king.md` (Part C) and `liam.md` (Part D).

## Run it

1. Start the backend (`SETUP.md`): `php artisan serve`, `php artisan reverb:start`, `php artisan queue:work --tries=3`.
2. Copy `dart_defines/example.json` to `dart_defines/dev.json` and put `REVERB_APP_KEY` from `backend/.env` in it.
   `dev.json` is ignored by git. On a real phone, use your PC's Wi-Fi address instead of `10.0.2.2` and start the
   backend with `php artisan serve --host=0.0.0.0 --port=8000`.
3. In `mobile/`: `flutter run --dart-define-from-file=dart_defines/dev.json`

Before every commit: `dart format .`, `flutter analyze` (no issues) and `flutter test` (all pass).

## Where things are

| Path | What |
|---|---|
| `lib/core/env.dart` | `API_URL`, `WS_*`, `REVERB_KEY`, `WEB_URL` from the dart defines |
| `lib/core/api/` | `dioProvider` (token, timeouts) and `ApiFailure` (every error turned into a message) |
| `lib/core/session/` | The signed-in user (`currentUserProvider`), sign in and out, which home opens (`home_route.dart`) |
| `lib/core/validation/rules.dart` | `Rules` (the server's checks and messages) and `Only` (what a field lets people type) |
| `lib/core/widgets/` | `AppTextField`, `SubmitButton`, `PesoText`, `EmptyState`, `ErrorRetry`, `Skeleton`, `MessageBanner`, `StatusChip`, `confirmAction`, `UploadProgress` |
| `lib/core/media/` | `PhotoPicker` (shrinks, re-encodes, strips GPS, checks the size) and `askPermission` |
| `lib/core/realtime/` | `realtimeProvider`: Reverb channels for notifications and chat |
| `lib/core/theme/` | `AppColors`, `StatusTone`, `AppSpace`, `AppRadius`, `buildAppTheme()` |
| `lib/router.dart` | Which screen may open for the session |
| `lib/features/buyer/`, `rider/`, `logistics/` | Each part's screens, with its routes in `*_routes.dart` |

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
