import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/session/app_user.dart';
import 'core/session/home_route.dart';
import 'core/session/session.dart';
import 'features/auth/auth_routes.dart';
import 'features/buyer/buyer_paths.dart';
import 'features/buyer/buyer_routes.dart';
import 'features/logistics/logistics_paths.dart';
import 'features/logistics/logistics_routes.dart';
import 'features/rider/rider_routes.dart';
import 'features/seller/seller_routes.dart';

/// Every screen of the app. Each part adds its screens in its own file, under its home's path:
/// Part B in `features/buyer/buyer_routes.dart` (`/buyer/...`), Part C in `features/rider/rider_routes.dart`
/// (`/rider/...`), Part D in `features/logistics/logistics_routes.dart` (`/logistics/...`).
final routerProvider = Provider<GoRouter>((ref) {
  final session = ValueNotifier<SessionState>(ref.read(sessionProvider));
  late final GoRouter router;
  ref.listen(sessionProvider, (previous, next) {
    session.value = next;
    // A redirect only sees the bottom of the stack, and the screens on top are this person's own. They all go. A notice
    // says why they were signed out, and only the sign-in screen shows it.
    if (previous is SignedIn && next is SignedOut) {
      router.go(next.notice == null ? BuyerPaths.home : AuthPaths.signIn);
    }
  });

  router = GoRouter(
    initialLocation: AuthPaths.launch,
    refreshListenable: session,
    redirect: (context, state) => redirectFor(
      session.value,
      state.uri.path,
      next: state.uri.queryParameters['next'],
    ),
    routes: [...authRoutes, ...buyerRoutes, ...riderRoutes, ...logisticsRoutes, ...sellerRoutes],
  );
  ref.onDispose(() {
    router.dispose();
    session.dispose();
  });
  return router;
});

/// Which screen may open for the session (task A6), or null to stay. Signed in, a person only sees the screens of
/// the home they are in. Signed out, they are a guest: the shop window and the sign-in screens are open, and anything
/// else of the shop asks them to sign in and then comes back to it. [next] is where sign-in was asked to return to.
@visibleForTesting
String? redirectFor(SessionState session, String location, {String? next}) {
  bool at(String path) => location == path || location.startsWith('$path/');
  String? only(String path) => at(path) ? null : path;

  return switch (session) {
    SessionRestoring() => only(AuthPaths.launch),
    SessionUnreachable() => only(AuthPaths.offline),
    NeedsEmailCode() => only(AuthPaths.verifyEmail),
    AccountBlocked() => only(AuthPaths.blocked),
    SignedOut() when AuthPaths.signedOut.any(at) => null,
    SignedOut() when BuyerPaths.openToGuests(location) => null,
    SignedOut() when at(BuyerPaths.home) => AuthPaths.signInThen(location),
    // The launch screen, and another home's screens after signing out.
    SignedOut() => BuyerPaths.home,
    // A Google sign-up finishes its profile before anything else opens.
    SignedIn(:final user, :final home)
        when home == AppHome.buyer && user.needsProfile =>
      only(BuyerPaths.completeProfile),
    SignedIn(:final user, :final home)
        when !at(home.path) || location == LogisticsPaths.root =>
      home == AppHome.buyer && BuyerPaths.tabs.contains(next)
          ? next
          : _landing(user, home),
    SignedIn() => null,
  };
}

/// Where a home opens. Logistics splits by who signed in: a courier team member, or hub staff. Decided here from the
/// session itself, because this redirect runs before providers that depend on the session have caught up.
String _landing(AppUser user, AppHome home) => home == AppHome.logistics
    ? (user.logisticsCompany?.isApproved ?? false
          ? LogisticsPaths.courierHome
          : LogisticsPaths.hubHome)
    : home.path;
