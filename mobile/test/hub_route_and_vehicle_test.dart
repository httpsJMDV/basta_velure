import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:loved_it/core/session/app_user.dart';
import 'package:loved_it/features/logistics/data/logistics_models.dart';
import 'package:loved_it/features/logistics/hub/hub_sorting_screen.dart';
import 'package:loved_it/features/rider/data/rider_models.dart';
import 'package:loved_it/features/rider/location/location_beacon.dart';
import 'package:loved_it/features/rider/map/road_track.dart';
import 'package:loved_it/features/rider/map/route_map_screen.dart';
import 'package:loved_it/features/rider/map/route_map_services.dart';
import 'package:loved_it/features/rider/map/vehicle_marker.dart';
import 'package:loved_it/features/rider/widgets/parcel_journey.dart';

import 'support/fakes.dart';

/// An L-shaped road: about 1.1 km east, then 1.1 km north.
final _corner = [
  const LatLng(14.28, 121.40),
  const LatLng(14.28, 121.41),
  const LatLng(14.29, 121.41),
];

class _RoadServices extends RouteMapServices {
  @override
  Future<LocatedPlace?> locate(RiderPlace place) async => LocatedPlace(
    place.city == 'A'
        ? const LatLng(14.28, 121.41)
        : const LatLng(14.29, 121.41),
    exact: true,
  );

  @override
  Future<RoutePath?> route(List<LatLng> points) async =>
      RoutePath(points: _corner, meters: 2200, seconds: 400);
}

const _nodes = [
  JourneyNode(
    kind: 'shop',
    title: 'Marco Gadgets',
    subtitle: 'Bubukal, Santa Cruz',
    state: JourneyNode.done,
    label: 'Picked up',
  ),
  JourneyNode(
    kind: 'hub',
    title: 'Santa Cruz Hub',
    subtitle: 'Santa Cruz, Laguna',
    state: JourneyNode.done,
    label: 'Left this hub',
  ),
  JourneyNode(
    kind: 'hub',
    title: 'Pila Hub',
    subtitle: 'Pila, Laguna',
    state: JourneyNode.upcoming,
    label: 'On the way here',
    movingHere: true,
  ),
  JourneyNode(
    kind: 'buyer',
    title: 'Delivery to Santa Clara',
    subtitle: 'Pila, Laguna',
    state: JourneyNode.upcoming,
    label: 'Last stop',
  ),
];

void main() {
  group('A road you can walk along', () {
    final road = RoadTrack(_corner);

    test('it knows its length and where any distance falls', () {
      expect(road.length, closeTo(2185, 40));
      expect(road.pointAt(0), _corner.first);
      expect(road.pointAt(road.length + 100), _corner.last);
      final middle = road.pointAt(road.length / 2);
      expect(middle.latitude, closeTo(14.28, 0.001));
      expect(middle.longitude, closeTo(121.41, 0.001));
    });

    test(
      'it knows which way the road runs, so the vehicle turns the corner',
      () {
        expect(road.bearingAt(100), closeTo(90, 2));
        expect(
          road.bearingAt(road.length - 100),
          anyOf(closeTo(0, 2), closeTo(360, 2)),
        );
      },
    );

    test('a position beside the road lands on it', () {
      final snap = road.project(const LatLng(14.2801, 121.405));

      expect(snap.offRoad, lessThan(20));
      expect(snap.meters, closeTo(540, 30));
    });

    test('a position far from the road is known to be off it', () {
      expect(
        road.project(const LatLng(14.35, 121.50)).offRoad,
        greaterThan(1000),
      );
    });

    test('a slice stays on the road, around the corner', () {
      final piece = road.slice(road.length * 0.4, road.length * 0.6);

      expect(piece.length, 3);
      expect(piece[1], _corner[1]);
      expect(road.slice(500, 500), isEmpty);
      expect(road.slice(800, 200), isEmpty);
    });

    test('a road too short to walk does not break anything', () {
      final dot = RoadTrack(const [LatLng(14, 121)]);

      expect(dot.length, 0);
      expect(dot.pointAt(50), const LatLng(14, 121));
      expect(dot.slice(0, 10), isEmpty);
      expect(dot.project(const LatLng(14, 121)).meters, 0);
    });
  });

  group('The vehicle on the map', () {
    test('it is the one the rider registered', () {
      expect(RiderVehicle.from('Motorcycle'), RiderVehicle.motorcycle);
      expect(RiderVehicle.from('Tricycle'), RiderVehicle.tricycle);
      expect(RiderVehicle.from('Car'), RiderVehicle.car);
      expect(RiderVehicle.from('VAN'), RiderVehicle.van);
      expect(RiderVehicle.from(null), RiderVehicle.motorcycle);
      expect(RiderVehicle.from('Hoverboard'), RiderVehicle.motorcycle);
    });

    test('the signed-in rider carries it', () {
      final rider = RiderSummary.fromJson({
        'id': 1,
        'status': 'ACTIVE',
        'vehicle_type': 'Tricycle',
      });

      expect(rider.vehicleType, 'Tricycle');
    });

    for (final vehicle in RiderVehicle.values) {
      testWidgets('the ${vehicle.name} draws without a problem', (
        tester,
      ) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Center(
              child: VehicleMarker(vehicle: vehicle, heading: 45, pulse: 0.5),
            ),
          ),
        );
        expect(tester.takeException(), isNull);
        expect(find.bySemanticsLabel('Your position'), findsOneWidget);
      });
    }

    Future<void> pumpMap(WidgetTester tester) async {
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const RouteMapScreen(
              stops: [
                RouteStop(
                  number: 1,
                  title: 'Ana',
                  place: RiderPlace(fullAddress: 'First', city: 'A'),
                ),
                RouteStop(
                  number: 2,
                  title: 'Ben',
                  place: RiderPlace(fullAddress: 'Second', city: 'B'),
                ),
              ],
            ),
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            riderMapTilesProvider.overrideWithValue(null),
            routeMapServicesProvider.overrideWithValue(_RoadServices()),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump(const Duration(seconds: 2));
      await tester.pump(const Duration(seconds: 2));
    }

    testWidgets('it follows the road as new positions come in', (tester) async {
      await pumpMap(tester);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(RouteMapScreen)),
      );

      for (final position in const [
        RiderFix(latitude: 14.28, longitude: 121.402),
        RiderFix(latitude: 14.28, longitude: 121.405),
        RiderFix(latitude: 14.283, longitude: 121.41),
      ]) {
        container.read(riderFixProvider.notifier).set(position);
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(seconds: 7));
      }

      expect(find.byType(VehicleMarker), findsOneWidget);
      // Rounding the corner, the road runs north.
      final marker = tester.widget<VehicleMarker>(find.byType(VehicleMarker));
      expect(marker.heading, anyOf(lessThan(60), greaterThan(300)));
      expect(tester.takeException(), isNull);
    });

    testWidgets('a position off the road still shows, without a crash', (
      tester,
    ) async {
      await pumpMap(tester);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(RouteMapScreen)),
      );

      container
          .read(riderFixProvider.notifier)
          .set(
            const RiderFix(latitude: 14.40, longitude: 121.55, heading: 200),
          );
      await tester.pump(const Duration(seconds: 3));
      // The map flies over to make room for them.
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(VehicleMarker), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'the preview drives the road, brings up each stop and stops by itself',
      (tester) async {
        await pumpMap(tester);
        expect(find.byTooltip('Preview the route'), findsOneWidget);

        await tester.tap(find.byTooltip('Preview the route'));
        await tester.pump(const Duration(seconds: 1));
        expect(find.text('Previewing your route'), findsOneWidget);
        expect(find.byTooltip('Stop the preview'), findsOneWidget);
        expect(find.byType(VehicleMarker), findsOneWidget);

        for (var i = 0; i < 30; i++) {
          await tester.pump(const Duration(milliseconds: 400));
        }
        // Back to the normal map, with the last stop's card up.
        expect(find.byTooltip('Preview the route'), findsOneWidget);
        expect(find.text('Previewing your route'), findsNothing);
        expect(find.text('Ben'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('someone who asked for less motion gets no preview button', (
      tester,
    ) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue =
          const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(
        tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
      );

      await pumpMap(tester);

      expect(find.byTooltip('Preview the route'), findsNothing);
    });
  });

  group('A parcel\'s way, hub by hub', () {
    testWidgets('each place shows in order, with what is happening there', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: JourneyTimeline(nodes: _nodes)),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('Marco Gadgets'), findsOneWidget);
      expect(find.text('Santa Cruz Hub'), findsOneWidget);
      expect(find.text('On the way here'), findsOneWidget);
      expect(find.text('Delivery to Santa Clara'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the route strip opens the timeline from the server', (
      tester,
    ) async {
      final api = FakeApi({
        'GET /parcels/LIT-1/tracking': (_) => jsonBody(200, {
          'data': {
            'journey': [
              {
                'kind': 'shop',
                'title': 'Marco Gadgets',
                'subtitle': '',
                'state': 'done',
                'label': 'Picked up',
              },
              {
                'kind': 'hub',
                'title': 'Pila Hub',
                'subtitle': 'Pila',
                'state': 'current',
                'label': 'At this hub',
              },
              {
                'kind': 'buyer',
                'title': 'Delivery to Santa Clara',
                'subtitle': 'Pila',
                'state': 'upcoming',
                'label': 'Last stop',
              },
            ],
          },
        }),
      });
      final container = containerWith(api, MemoryTokenStore('t'));
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(
              body: HubPathStrip(
                path: ['Santa Cruz Hub', 'Pila Hub'],
                trackingNumber: 'LIT-1',
              ),
            ),
          ),
        ),
      );
      expect(find.text('Santa Cruz Hub → Pila Hub'), findsOneWidget);

      await tester.tap(find.text('Santa Cruz Hub → Pila Hub'));
      await tester.pumpAndSettle();

      expect(find.text('Parcel route'), findsOneWidget);
      expect(find.text('At this hub'), findsOneWidget);
      expect(find.text('Delivery to Santa Clara'), findsOneWidget);
    });

    test('a shop\'s parcels can go different ways', () {
      final group = PickupGroup.fromJson({
        'seller_id': 1,
        'shop_name': 'Marco',
        'parcel_count': 3,
        'hub_routes': [
          {
            'path': ['Santa Cruz Hub'],
            'parcel_count': 2,
            'tracking_number': 'A',
          },
          {
            'path': ['Santa Cruz Hub', 'Pila Hub'],
            'parcel_count': 1,
            'tracking_number': 'B',
          },
        ],
      });

      expect(group.hubRoutes, hasLength(2));
      expect(group.hubRoutes.last.path.last, 'Pila Hub');
    });
  });

  group('A hub sending parcels on', () {
    Map<String, FakeHandler> routes({required bool sent}) => {
      'GET /hub/sorting/groups': (_) =>
          jsonBody(200, {'data': <Object>[], 'meta': <String, Object>{}}),
      'GET /hub/transfers': (_) => jsonBody(200, {
        'data': sent
            ? <Object>[]
            : [
                {
                  'hub': {
                    'id': 2,
                    'name': 'Pila Hub',
                    'city': 'Pila',
                    'province': 'Laguna',
                  },
                  'parcel_count': 2,
                  'oldest_scanned_in_at': '2026-11-02T01:00:00Z',
                  'tracking_numbers': ['LIT-1', 'LIT-2'],
                },
              ],
        'meta': {
          'total_parcels': sent ? 0 : 2,
          'on_the_way_here': 1,
          'sent_today': 0,
        },
      }),
    };

    testWidgets('it sees them by the hub they go to, and sends them all', (
      tester,
    ) async {
      var sent = false;
      final base = routes(sent: false);
      final after = routes(sent: true);
      Object? body;
      final api = FakeApi({
        'GET /hub/sorting/groups': (r) => base['GET /hub/sorting/groups']!(r),
        'GET /hub/transfers': (r) =>
            (sent ? after : base)['GET /hub/transfers']!(r),
        'POST /hub/transfers/send': (r) {
          sent = true;
          body = r.data;
          return jsonBody(200, {
            'message': '2 parcels sent.',
            'sent_count': 2,
            'to': ['Pila Hub'],
          });
        },
      });
      final container = containerWith(api, MemoryTokenStore('t'));
      addTearDown(container.dispose);
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.75;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: HubSortingScreen()),
        ),
      );
      await tester.pump(const Duration(seconds: 1));

      expect(find.text('For other hubs'), findsOneWidget);
      expect(find.text('Pila Hub'), findsOneWidget);
      expect(find.text('On the way from other hubs'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Send'));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Send to Pila Hub?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Send').last);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));

      expect(body, {
        'tracking_numbers': ['LIT-1', 'LIT-2'],
      });
      expect(find.text('Pila Hub'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 4));
    });

    testWidgets('sorting still works when the server has no transfers yet', (
      tester,
    ) async {
      final api = FakeApi({
        'GET /hub/sorting/groups': (_) =>
            jsonBody(200, {'data': <Object>[], 'meta': <String, Object>{}}),
        'GET /hub/transfers': (_) => jsonBody(404, {'message': 'Not found.'}),
      });
      final container = containerWith(api, MemoryTokenStore('t'));
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: HubSortingScreen()),
        ),
      );
      await tester.pump(const Duration(seconds: 1));

      expect(find.text('Nothing to sort'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 4));
    });

    test('the courier\'s report reads each hub, gaps included', () {
      final report = CourierReport.fromJson({
        'sla_hours': 72,
        'totals': {
          'received': 296,
          'delivered': 240,
          'failed_attempts': 22,
          'returned': 5,
          'on_time_rate': null,
          'success_rate': 0.916,
        },
        'hubs': [
          {
            'hub_id': 4,
            'hub_name': 'Santa Cruz Hub',
            'delivered': 151,
            'success_rate': 0.94,
            'avg_hub_dwell_hours': 6.4,
          },
        ],
      });

      expect(report.slaHours, 72);
      expect(report.successRate, closeTo(0.916, 0.0001));
      expect(report.onTimeRate, isNull);
      expect(report.hub(4)?.delivered, 151);
      expect(report.hub(4)?.avgDeliveryHours, isNull);
      expect(report.hub(99), isNull);
    });

    test('a dashboard from an older server still reads', () {
      final old = CourierDashboard.fromJson({
        'parcels_now': {'awaiting_pickup': 2, 'at_hubs': 3},
        'last_30_days': {'delivered': 100},
      });
      expect(old.period, isNull);
      expect(old.parcelsNow, 5);
      expect(old.delivered30Days, 100);
    });

    test('payouts tell who is still owed from who was paid in full', () {
      final payouts = CourierPayouts.fromJson({
        'riders': [
          {
            'id': 7,
            'name': 'Pedro Mendoza',
            'gcash': {'name': 'Pedro Mendoza', 'number': '0917 123 4567'},
            'unpaid': 1840.5,
            'unpaid_count': 37,
          },
          {'id': 8, 'name': 'Paid Up', 'unpaid': 0, 'unpaid_count': 0},
        ],
        'hubs': [],
      });

      expect(payouts.ridersOwed.single.name, 'Pedro Mendoza');
      expect(payouts.rider(7)?.gcashNumber, '0917 123 4567');
      expect(payouts.rider(8)?.unpaidCount, 0);
      expect(payouts.hub(7), isNull);
    });

    test('the hub\'s week reads what the server sends, gaps included', () {
      final week = HubWeek.fromJson({
        'sla_hours': 48,
        'totals': {
          'received': 96,
          'delivered': 68,
          'failed_attempts': 7,
          'success_rate': 0.9067,
          'on_time_rate': null,
        },
        'daily': [
          {'date': '2026-11-03', 'delivered': 11},
        ],
      });

      expect(week.received, 96);
      expect(week.successRate, closeTo(0.9067, 0.0001));
      expect(week.onTimeRate, isNull);
      expect(week.avgDwellHours, isNull);
      expect(week.days.single.delivered, 11);
      // November 3, 2026 is a Tuesday.
      expect(week.days.single.weekdayLetter, 'T');
    });

    test('the hub\'s share reads each period', () {
      final earnings = HubEarningsSummary.fromJson({
        'today': {'total': '84.50', 'deliveries_count': 11},
        'week': {'total': '512.00'},
        'month': {'total': '2140.75'},
        'unpaid_total': '630.25',
      });

      expect(earnings.todayTotal, '84.50');
      expect(earnings.todayCount, 11);
      expect(earnings.unpaidTotal, '630.25');
    });

    test('a parcel from another hub knows where it came from', () {
      final parcel = IntakeParcel.fromJson({
        'tracking_number': 'LIT-1',
        'status': 'AT_SORTING_CENTER',
        'coming_from': 'Santa Cruz Hub',
      });

      expect(parcel.comingFrom, 'Santa Cruz Hub');
      expect(parcel.nextHub, isNull);
    });
  });
}
