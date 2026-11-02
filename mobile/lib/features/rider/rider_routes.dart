import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../buyer/widgets/buyer_theme.dart';

import 'account/account_forms.dart';
import 'account/rider_account_screen.dart';
import 'apply/rider_apply_screen.dart';
import 'chat/rider_chat.dart';
import 'data/rider_models.dart';
import 'deliveries/collect_screen.dart';
import 'deliveries/deliveries_screen.dart';
import 'earnings/earnings_screen.dart';
import 'home/rider_home_screen.dart';
import 'map/route_map_screen.dart';
import 'pickups/handover_screen.dart';
import 'pickups/pickups_screen.dart';
import 'rider_paths.dart';
import 'rider_shell.dart';
import 'work/cod_screen.dart';
import 'work/returns_screen.dart';
import 'work/rider_guide_screen.dart';
import 'work/rider_notifications_screen.dart';

/// A rider screen outside the tabs, in the same look as the shop.
Widget _themed(Widget screen) => BuyerThemed(child: screen);

/// Part C (King): every rider screen lives under `/rider`. The five tabs share the bottom bar; everything else opens
/// over it. "Become a rider" opens signed out.
final riderRoutes = <RouteBase>[
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => BuyerThemed(child: RiderShell(shell: shell)),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: RiderPaths.home,
            builder: (_, _) => const RiderHomeScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: RiderPaths.pickups,
            builder: (_, _) => const PickupsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: RiderPaths.deliveries,
            builder: (_, _) => const DeliveriesScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: RiderPaths.earnings,
            builder: (_, _) => const EarningsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: RiderPaths.account,
            builder: (_, _) => const RiderAccountScreen(),
          ),
        ],
      ),
    ],
  ),
  // The scan screens need the list they were opened from; opened any other way (a restored link), they go back.
  GoRoute(
    path: RiderPaths.handover,
    redirect: (_, state) =>
        state.extra is PickupGroup ? null : RiderPaths.pickups,
    builder: (_, state) =>
        _themed(HandoverScreen(group: state.extra! as PickupGroup)),
  ),
  GoRoute(
    path: RiderPaths.collect,
    redirect: (_, state) =>
        state.extra is DeliveryList ? null : RiderPaths.deliveries,
    builder: (_, state) =>
        _themed(CollectScreen(list: state.extra! as DeliveryList)),
  ),
  GoRoute(
    path: RiderPaths.routeMap,
    redirect: (_, state) =>
        state.extra is List<RouteStop> ? null : RiderPaths.deliveries,
    builder: (_, state) =>
        _themed(RouteMapScreen(stops: state.extra! as List<RouteStop>)),
  ),
  GoRoute(
    path: RiderPaths.guide,
    builder: (_, _) => _themed(const RiderGuideScreen()),
  ),
  GoRoute(
    path: RiderPaths.returns,
    builder: (_, _) => _themed(const ReturnsScreen()),
  ),
  GoRoute(path: RiderPaths.cod, builder: (_, _) => _themed(const CodScreen())),
  GoRoute(
    path: RiderPaths.chats,
    builder: (_, _) => _themed(const RiderChatsScreen()),
  ),
  GoRoute(
    path: '/rider/chats/:id',
    builder: (_, state) => _themed(
      RiderChatScreen(threadId: int.parse(state.pathParameters['id']!)),
    ),
  ),
  GoRoute(
    path: RiderPaths.notifications,
    builder: (_, _) => _themed(const RiderNotificationsScreen()),
  ),
  GoRoute(
    path: RiderPaths.vehicle,
    builder: (_, state) => _themed(
      VehicleScreen(
        profile: state.extra is RiderProfile
            ? state.extra! as RiderProfile
            : null,
      ),
    ),
  ),
  GoRoute(
    path: RiderPaths.license,
    builder: (_, state) => _themed(
      LicenseScreen(
        profile: state.extra is RiderProfile
            ? state.extra! as RiderProfile
            : null,
      ),
    ),
  ),
  GoRoute(
    path: RiderPaths.gcash,
    builder: (_, state) => _themed(
      GcashScreen(
        current: state.extra is GcashAccount
            ? state.extra! as GcashAccount
            : null,
      ),
    ),
  ),
  GoRoute(
    path: '/rider/account/documents/:doc',
    builder: (_, state) => _themed(
      RiderDocumentScreen(
        docKey: state.pathParameters['doc']!,
        label: state.extra is String ? state.extra! as String : null,
      ),
    ),
  ),
  GoRoute(path: RiderPaths.apply, builder: (_, _) => const RiderApplyScreen()),
];
