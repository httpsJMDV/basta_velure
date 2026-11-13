import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'activity/activity_screen.dart';
import 'operations/money_screens.dart';
import 'operations/returns_screen.dart';
import 'operations/settings_screens.dart';
import 'operations/shipping_screen.dart';
import 'chat/logistics_chat.dart';
import 'courier/courier_add_rider_screen.dart';
import 'courier/courier_cod_screen.dart';
import 'courier/courier_dispatch_screen.dart';
import 'courier/courier_home_screen.dart';
import 'courier/courier_hubs_screen.dart';
import 'courier/courier_more_screen.dart';
import 'courier/courier_parcels_screen.dart';
import 'courier/courier_riders_screen.dart';
import 'courier/courier_scan_screen.dart';
import 'courier/courier_shell.dart';
import 'courier/courier_trucks_screen.dart';
import 'data/logistics_api.dart';
import 'data/logistics_models.dart';
import 'data/logistics_state.dart';
import 'hub/hub_deliveries_screen.dart';
import 'hub/hub_dispatch_screen.dart';
import 'hub/hub_home_screen.dart';
import 'hub/hub_intake_screen.dart';
import 'hub/hub_more_screen.dart';
import 'hub/hub_return_pickups_screen.dart';
import 'hub/hub_counter_screen.dart';
import 'hub/hub_rider_areas_screen.dart';
import 'hub/hub_riders_screen.dart';
import 'hub/hub_scan_screen.dart';
import 'hub/hub_shell.dart';
import 'hub/hub_sorting_screen.dart';
import 'logistics_paths.dart';
import 'widgets/logistics_widgets.dart';

/// Hub staff's screens wear the hub portal's colours.
Widget _hub(Widget screen) => HubThemed(child: screen);

/// The same for the courier team's screens.
Widget _courier(Widget screen) => CourierThemed(child: screen);

/// Part D (Liam): every hub and courier-team screen lives under `/logistics`. A courier team member opens the courier
/// screens and hub staff the hub screens (a courier member can't also run a hub, so an account is only ever one).
final logisticsRoutes = <RouteBase>[
  GoRoute(
    path: LogisticsPaths.courierReturns,
    builder: (_, _) => _courier(const CourierReturnsScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierMoney,
    builder: (_, _) => _courier(const CourierMoneyScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierShipping,
    builder: (_, _) => _courier(const ShippingScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierSettings,
    builder: (_, _) => _courier(const PortalSettingsScreen(courier: true)),
  ),
  GoRoute(
    path: LogisticsPaths.courierCoverage,
    builder: (_, _) => _courier(const CoverageScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierPlanning,
    builder: (_, _) => _courier(const TruckPlanningScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.hubEarnings,
    builder: (_, _) => _hub(const HubEarningsScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.hubSettings,
    builder: (_, _) => _hub(const PortalSettingsScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.root,
    // redirectFor in router.dart sends each account to its own screens before this is reached.
    redirect: (_, _) => LogisticsPaths.hubHome,
  ),
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => _hub(HubShell(shell: shell)),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.hubHome,
            builder: (_, _) => const HubHomeScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.hubSorting,
            builder: (_, _) => const HubSortingScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.hubDispatch,
            builder: (_, _) => const HubDispatchScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.hubMore,
            builder: (_, _) => const HubMoreScreen(),
          ),
        ],
      ),
    ],
  ),
  GoRoute(
    path: LogisticsPaths.hubScan,
    builder: (_, state) => _hub(
      HubScanScreen(
        initialMode: state.uri.queryParameters['mode'] == 'sort'
            ? HubScanMode.sort
            : HubScanMode.receive,
      ),
    ),
  ),
  GoRoute(
    path: LogisticsPaths.hubIntake,
    builder: (_, state) => _hub(
      HubIntakeScreen(
        showReceived: state.uri.queryParameters['tab'] == 'received',
      ),
    ),
  ),
  // These need the row they were opened from; opened any other way (a restored link), they go back to the list.
  GoRoute(
    path: '${LogisticsPaths.hubSorting}/:code',
    redirect: (_, state) =>
        state.extra is SortingGroup ? null : LogisticsPaths.hubSorting,
    builder: (_, state) =>
        _hub(HubSortingGroupScreen(group: state.extra! as SortingGroup)),
  ),
  GoRoute(
    path: LogisticsPaths.hubAwaiting,
    builder: (_, _) => _hub(const HubAwaitingScreen()),
  ),
  GoRoute(
    path: '${LogisticsPaths.hubDispatch}/batches/:code',
    redirect: (_, state) =>
        state.extra is DispatchBatch ? null : LogisticsPaths.hubDispatch,
    builder: (_, state) =>
        _hub(HubBatchScreen(batch: state.extra! as DispatchBatch)),
  ),
  GoRoute(
    path: LogisticsPaths.hubDeliveries,
    builder: (_, state) => _hub(
      HubDeliveriesScreen(
        showFailed: state.uri.queryParameters['tab'] == 'failed',
      ),
    ),
  ),
  GoRoute(
    path: LogisticsPaths.hubRiders,
    builder: (_, _) => _hub(const HubRidersScreen()),
  ),
  GoRoute(
    path: '${LogisticsPaths.hubRiders}/:id',
    builder: (_, state) =>
        _hub(HubRiderScreen(riderId: int.parse(state.pathParameters['id']!))),
  ),
  GoRoute(
    path: '${LogisticsPaths.hubRiders}/:id/areas',
    builder: (_, state) => _hub(
      HubRiderAreasScreen(
        riderId: int.parse(state.pathParameters['id']!),
        riderName: state.extra is String ? state.extra! as String : null,
      ),
    ),
  ),
  GoRoute(
    path: LogisticsPaths.hubChats,
    builder: (_, _) => _hub(const HubChatsScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.hubCourierChat,
    builder: (_, state) => _hub(
      LogisticsChatScreen(
        title: state.extra is String
            ? state.extra! as String
            : 'Your courier company',
        onRead: (ref) => ref.read(hubUnreadProvider.notifier).refresh(),
        connection: (ref) {
          final api = ref.read(hubApiProvider);
          return ChatConnection(
            myRole: 'hub',
            fetch: ({afterId}) => api.courierMessages(afterId: afterId),
            send: api.sendToCourier,
            markRead: api.markCourierRead,
          );
        },
      ),
    ),
  ),
  GoRoute(
    path: '${LogisticsPaths.hubChats}/riders/:id',
    builder: (_, state) {
      final id = int.parse(state.pathParameters['id']!);
      return _hub(
        LogisticsChatScreen(
          title: state.extra is String
              ? state.extra! as String
              : 'Delivery rider',
          onRead: (ref) => ref.read(hubUnreadProvider.notifier).refresh(),
          connection: (ref) {
            final api = ref.read(hubApiProvider);
            return ChatConnection(
              myRole: 'hub',
              fetch: ({afterId}) => api.riderMessages(id, afterId: afterId),
              send: (body) => api.sendToRider(id, body),
              markRead: () => api.markRiderRead(id),
            );
          },
        ),
      );
    },
  ),
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => _courier(CourierShell(shell: shell)),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.courierHome,
            builder: (_, _) => const CourierHomeScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.courierHubs,
            builder: (_, _) => const CourierHubsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.courierParcels,
            builder: (_, state) => CourierParcelsScreen(
              key: ValueKey(state.uri.queryParameters['problems']),
              problems: state.uri.queryParameters['problems'] == '1',
            ),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.courierRiders,
            builder: (_, _) => const CourierRidersScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: LogisticsPaths.courierMore,
            builder: (_, _) => const CourierMoreScreen(),
          ),
        ],
      ),
    ],
  ),
  GoRoute(
    path: '${LogisticsPaths.courierHubs}/:id',
    builder: (_, state) => _courier(
      CourierHubScreen(hubId: int.parse(state.pathParameters['id']!)),
    ),
  ),
  GoRoute(
    path: '${LogisticsPaths.courierParcels}/:id',
    builder: (_, state) => _courier(
      CourierParcelScreen(parcelId: int.parse(state.pathParameters['id']!)),
    ),
  ),
  GoRoute(
    path: LogisticsPaths.courierAddRider,
    builder: (_, _) => _courier(const CourierAddRiderScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierTrucks,
    builder: (_, _) => _courier(const CourierTrucksScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierActivity,
    builder: (_, _) => _courier(const ActivityScreen(scope: 'logistics')),
  ),
  GoRoute(
    path: LogisticsPaths.hubReturnPickups,
    builder: (_, _) => _hub(const HubReturnPickupsScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.hubCounter,
    builder: (_, _) => _hub(const HubCounterScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.hubActivity,
    builder: (_, _) => _hub(const ActivityScreen(scope: 'hub')),
  ),
  GoRoute(
    path: '${LogisticsPaths.courierRiders}/:id',
    builder: (_, state) => _courier(
      CourierRiderScreen(riderId: int.parse(state.pathParameters['id']!)),
    ),
  ),
  GoRoute(
    path: LogisticsPaths.courierDispatch,
    builder: (_, _) => _courier(const CourierDispatchScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierScan,
    builder: (_, _) => _courier(const CourierScanScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierCod,
    builder: (_, _) => _courier(const CourierCodScreen()),
  ),
  GoRoute(
    path: LogisticsPaths.courierChats,
    builder: (_, _) => _courier(const CourierChatsScreen()),
  ),
  GoRoute(
    path: '${LogisticsPaths.courierChats}/:id',
    builder: (_, state) {
      final id = int.parse(state.pathParameters['id']!);
      return _courier(
        LogisticsChatScreen(
          title: state.extra is String ? state.extra! as String : 'Hub',
          onRead: (ref) => ref.read(courierUnreadProvider.notifier).refresh(),
          connection: (ref) {
            final api = ref.read(courierApiProvider);
            return ChatConnection(
              myRole: 'courier',
              fetch: ({afterId}) => api.threadMessages(id, afterId: afterId),
              send: (body) => api.sendToHub(id, body),
              markRead: () => api.markThreadRead(id),
            );
          },
        ),
      );
    },
  ),
];
