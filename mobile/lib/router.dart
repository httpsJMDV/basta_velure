import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/session/session.dart';
import 'features/auth/auth_routes.dart';
import 'features/buyer/buyer_routes.dart';
import 'features/logistics/logistics_routes.dart';
import 'features/rider/rider_routes.dart';

/// Every screen of the app. Each part adds its screens in its own file, under its home's path:
/// Part B in `features/buyer/buyer_routes.dart` (`/buyer/...`), Part C in `features/rider/rider_routes.dart`
/// (`/rider/...`), Part D in `features/logistics/logistics_routes.dart` (`/logistics/...`).
final routerProvider = Provider<GoRouter>((ref) {
  final session = ValueNotifier<SessionState>(ref.read(sessionProvider));
  ref.listen(sessionProvider, (_, next) => session.value = next);

  final router = GoRouter(
    initialLocation: AuthPaths.launch,
    refreshListenable: session,
    redirect: (context, state) => redirectFor(session.value, state.uri.path),
    routes: [...authRoutes, ...buyerRoutes, ...riderRoutes, ...logisticsRoutes],
  );
  ref.onDispose(() {
    router.dispose();
    session.dispose();
  });
  return router;
});

/// Which screen may open for the session (task A6), or null to stay. Signed in, a person only sees the screens of
/// the home they are in; signed out, only the sign-in screens.
@visibleForTesting
String? redirectFor(SessionState session, String location) {
  bool at(String path) => location == path || location.startsWith('$path/');
  String? only(String path) => at(path) ? null : path;

  return switch (session) {
    SessionRestoring() => only(AuthPaths.launch),
    SessionUnreachable() => only(AuthPaths.offline),
    NeedsEmailCode() => only(AuthPaths.verifyEmail),
    AccountBlocked() => only(AuthPaths.blocked),
    SignedOut() => AuthPaths.signedOut.any(at) ? null : AuthPaths.signIn,
    SignedIn(:final home) => at(home.path) ? null : home.path,
  };
}
