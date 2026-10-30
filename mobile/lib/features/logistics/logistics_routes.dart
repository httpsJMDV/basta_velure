import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/session.dart';
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
import 'data/logistics_api.dart';
import 'data/logistics_models.dart';
import 'data/logistics_state.dart';
import 'hub/hub_deliveries_screen.dart';
import 'hub/hub_dispatch_screen.dart';
import 'hub/hub_home_screen.dart';
import 'hub/hub_intake_screen.dart';
import 'hub/hub_more_screen.dart';
import 'hub/hub_rider_areas_screen.dart';
import 'hub/hub_riders_screen.dart';
import 'hub/hub_scan_screen.dart';
import 'hub/hub_shell.dart';
import 'hub/hub_sorting_screen.dart';
import 'logistics_paths.dart';
import 'widgets/logistics_widgets.dart';

/// Hub staff's screens wear the hub portal's colours.
Widget _hub(Widget screen) => HubThemed(child: screen);

/// Part D (Liam): every hub and courier-team screen lives under `/logistics`. A courier team member opens the courier
/// screens and hub staff the hub screens (a courier member can't also run a hub, so an account is only ever one).
final logisticsRoutes = <RouteBase>[
  GoRoute(
    path: LogisticsPaths.root,
    redirect: (context, _) {
      final user = ProviderScope.containerOf(
        context,
        listen: false,
      ).read(currentUserProvider);
      return user?.logisticsCompany?.isApproved ?? false
          ? LogisticsPaths.courierHome
          : LogisticsPaths.hubHome;
    },
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
    builder: (_, _, shell) => CourierShell(shell: shell),
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
    builder: (_, state) =>
        CourierHubScreen(hubId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: '${LogisticsPaths.courierParcels}/:id',
    builder: (_, state) =>
        CourierParcelScreen(parcelId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: LogisticsPaths.courierAddRider,
    builder: (_, _) => const CourierAddRiderScreen(),
  ),
  GoRoute(
    path: '${LogisticsPaths.courierRiders}/:id',
    builder: (_, state) =>
        CourierRiderScreen(riderId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: LogisticsPaths.courierDispatch,
    builder: (_, _) => const CourierDispatchScreen(),
  ),
  GoRoute(
    path: LogisticsPaths.courierScan,
    builder: (_, _) => const CourierScanScreen(),
  ),
  GoRoute(
    path: LogisticsPaths.courierCod,
    builder: (_, _) => const CourierCodScreen(),
  ),
  GoRoute(
    path: LogisticsPaths.courierChats,
    builder: (_, _) => const CourierChatsScreen(),
  ),
  GoRoute(
    path: '${LogisticsPaths.courierChats}/:id',
    builder: (_, state) {
      final id = int.parse(state.pathParameters['id']!);
      return LogisticsChatScreen(
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
      );
    },
  ),
];
