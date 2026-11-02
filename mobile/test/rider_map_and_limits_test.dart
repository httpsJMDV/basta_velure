import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:loved_it/core/api/api_client.dart';
import 'package:loved_it/core/env.dart';
import 'package:loved_it/features/buyer/data/catalog.dart';
import 'package:loved_it/features/buyer/data/checkout.dart';
import 'package:loved_it/features/rider/data/rider_models.dart';
import 'package:loved_it/features/rider/location/location_bar.dart';
import 'package:loved_it/features/rider/location/location_beacon.dart';
import 'package:loved_it/features/rider/map/route_map_screen.dart';
import 'package:loved_it/features/rider/map/route_map_services.dart';
import 'package:loved_it/features/rider/work/rider_guide_screen.dart';

import 'support/fakes.dart';

class _Lookups extends RouteMapServices {
  _Lookups(this.places);

  final Map<String, LocatedPlace?> places;

  @override
  Future<LocatedPlace?> locate(RiderPlace place) async =>
      places[place.fullAddress];

  @override
  Future<RoutePath?> route(List<LatLng> points) async =>
      RoutePath(points: points, meters: 8200, seconds: 1440);
}

class _StuckBeacon extends LocationBeacon {
  _StuckBeacon(this.fixed);

  final BeaconState fixed;

  @override
  BeaconState build() => fixed;
}

/// Records what is sent, so a test can read the requests a third party would receive.
class _Recorder implements HttpClientAdapter {
  _Recorder(this.answer);

  final Object Function(RequestOptions options) answer;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return jsonBody(200, answer(options));
  }

  @override
  void close({bool force = false}) {}
}

const _placeA = RiderPlace(
  fullAddress: '12 Rizal St, Bubukal, Santa Cruz, Laguna',
  street: '12 Rizal St',
  barangay: 'Bubukal',
  city: 'Santa Cruz',
  province: 'Laguna',
);
const _placeB = RiderPlace(
  fullAddress: 'Blk 3, Pinagsanjan, Pila, Laguna',
  street: 'Blk 3',
  barangay: 'Pinagsanjan',
  city: 'Pila',
  province: 'Laguna',
);
final _stops = [
  const RouteStop(
    number: 1,
    title: 'Ana Reyes',
    place: _placeA,
    phone: '09171234567',
    codAmount: 450,
  ),
  const RouteStop(
    number: 2,
    title: 'Ben Cruz',
    place: _placeB,
    phone: '09177654321',
  ),
];

void main() {
  group('Finding a location', () {
    test('it goes round every source, and starts with the precise one', () {
      final tries = [for (var i = 0; i < 5; i++) LocationBeacon.settingsFor(i)];

      expect(tries[0].accuracy, LocationAccuracy.high);
      expect(tries[0].forceLocationManager, isFalse);
      expect(tries[1].forceLocationManager, isTrue);
      expect(tries[1].accuracy, LocationAccuracy.low);
      expect(tries[2].forceLocationManager, isTrue);
      expect(tries[2].accuracy, LocationAccuracy.high);
      expect(tries[3].forceLocationManager, isFalse);
      expect(tries[3].accuracy, LocationAccuracy.low);
      expect(tries[4].accuracy, tries[0].accuracy);
      expect(
        tries.every((t) => t.foregroundNotificationConfig != null),
        isTrue,
      );
    });

    Future<void> pumpBar(WidgetTester tester, BeaconState state) =>
        tester.pumpWidget(
          ProviderScope(
            overrides: [
              locationBeaconProvider.overrideWith(() => _StuckBeacon(state)),
            ],
            child: const MaterialApp(home: Scaffold(body: LocationBar())),
          ),
        );

    testWidgets('a rider is told when the signal is weak, not left waiting', (
      tester,
    ) async {
      await pumpBar(tester, BeaconState.weakSignal);
      expect(
        find.text('Weak GPS signal. Move near a window or outdoors.'),
        findsOneWidget,
      );
      expect(find.text('Finding your location…'), findsNothing);
    });

    testWidgets('a weak signal does not lock the job screens', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            locationBeaconProvider.overrideWith(
              () => _StuckBeacon(BeaconState.weakSignal),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: LocationGate(child: Text('The job'))),
          ),
        ),
      );
      expect(find.text('The job'), findsOneWidget);
    });
  });

  group('Looking up addresses', () {
    test('it falls back to the barangay and says the pin is rough', () async {
      final recorder = _Recorder(
        (options) => '${options.queryParameters['q']}'.contains('12 Rizal')
            ? <Object>[]
            : [
                {'lat': '14.28', 'lon': '121.41'},
              ],
      );
      final dio = Dio()..httpClientAdapter = recorder;

      final found = await OpenRouteMapServices(dio: dio).locate(_placeA);

      expect(found?.exact, isFalse);
      expect(found?.point, const LatLng(14.28, 121.41));
      expect(recorder.requests, hasLength(2));
    });

    test('the same address is looked up once', () async {
      final recorder = _Recorder(
        (_) => [
          {'lat': '14.28', 'lon': '121.41'},
        ],
      );
      final services = OpenRouteMapServices(
        dio: Dio()..httpClientAdapter = recorder,
      );

      await services.locate(_placeA);
      await services.locate(_placeA);

      expect(recorder.requests, hasLength(1));
    });

    test('the rider\'s token and the buyer\'s details never go out', () async {
      final recorder = _Recorder(
        (_) => [
          {'lat': '14.28', 'lon': '121.41'},
        ],
      );
      await OpenRouteMapServices(dio: Dio()..httpClientAdapter = recorder)
          .locate(_placeA);

      final sent = recorder.requests.single;
      expect(
        sent.headers.keys.map((k) => k.toLowerCase()),
        isNot(contains('authorization')),
      );
      expect('${sent.uri}', isNot(contains('Ana')));
      expect('${sent.uri}', isNot(contains('0917')));
    });

    test('a road comes back as points, distance and time', () async {
      final recorder = _Recorder(
        (_) => {
          'routes': [
            {
              'distance': 8200.0,
              'duration': 1440.0,
              'geometry': {
                'coordinates': [
                  [121.41, 14.28],
                  [121.42, 14.29],
                ],
              },
            },
          ],
        },
      );

      final road = await OpenRouteMapServices(
        dio: Dio()..httpClientAdapter = recorder,
      ).route(const [LatLng(14.28, 121.41), LatLng(14.29, 121.42)]);

      expect(road?.points.first, const LatLng(14.28, 121.41));
      expect(road?.meters, 8200);
    });
  });

  test('the map uses the free tiles that need no key, one zoom closer on a sharp screen', () {
    final layer = TileLayer(
      urlTemplate: Env.mapTileUrl,
      retinaMode: true,
      maxNativeZoom: 19,
      userAgentPackageName: 'shop.lovedit.loved_it',
    );

    expect(
      layer.tileProvider.getTileUrl(
        const TileCoordinates(13717, 7577, 14),
        layer,
      ),
      'https://tile.openstreetmap.org/15/13717/7577.png',
    );
  });

  group('The route map', () {
    Future<void> pumpMap(
      WidgetTester tester, {
      Map<String, LocatedPlace?> places = const {'x': null},
    }) async {
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => RouteMapScreen(stops: _stops),
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            riderMapTilesProvider.overrideWithValue(null),
            routeMapServicesProvider.overrideWithValue(_Lookups(places)),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump(const Duration(seconds: 2));
      await tester.pump(const Duration(seconds: 2));
    }

    const both = {
      'x': null,
      '12 Rizal St, Bubukal, Santa Cruz, Laguna': LocatedPlace(
        LatLng(14.28, 121.41),
        exact: true,
      ),
      'Blk 3, Pinagsanjan, Pila, Laguna': LocatedPlace(
        LatLng(14.23, 121.36),
        exact: false,
      ),
    };

    testWidgets('it shows the pins, the road and the first stop', (
      tester,
    ) async {
      await pumpMap(tester, places: both);

      expect(find.bySemanticsLabel('Stop 1'), findsOneWidget);
      expect(find.bySemanticsLabel('Stop 2'), findsOneWidget);
      expect(find.text('2 stops'), findsOneWidget);
      expect(find.text('8.2 km · about 24 min'), findsOneWidget);
      expect(find.text('Ana Reyes'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'tapping a pin brings up its stop, and it says when a pin is rough',
      (tester) async {
        await pumpMap(tester, places: both);

        await tester.tap(find.bySemanticsLabel('Stop 2'));
        await tester.pump(const Duration(seconds: 1));
        await tester.pump(const Duration(seconds: 1));

        expect(find.text('Ben Cruz'), findsOneWidget);
        expect(
          find.text('The pin shows the area, not the exact house.'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('an address not found says so instead of a blank map', (
      tester,
    ) async {
      await pumpMap(tester);

      expect(
        find.text('The addresses were not found on the map'),
        findsOneWidget,
      );
      // The next stop's card peeks in from the side.
      expect(
        find.text('Not found on the map. Use Maps or call them.'),
        findsWidgets,
      );
    });

    testWidgets('the rider moves smoothly to a new position', (tester) async {
      await pumpMap(tester, places: both);
      final element = tester.element(find.byType(RouteMapScreen));
      final container = ProviderScope.containerOf(element);

      container
          .read(riderFixProvider.notifier)
          .set(const RiderFix(latitude: 14.25, longitude: 121.40, heading: 90));
      await tester.pump(const Duration(seconds: 2));

      expect(find.bySemanticsLabel('Your position'), findsOneWidget);
      expect(find.byTooltip('Show where I am'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('The rider guide', () {
    testWidgets('its pay comes from the server, not from the app', (
      tester,
    ) async {
      final api = FakeApi({
        'GET /rider/earnings/summary': (_) => jsonBody(200, {
          'data': {
            'period': <String, Object>{},
            'previous': <String, Object>{},
            'total_earned': '0',
            'rates': {
              'pickup': '35.00',
              'delivery': '65.00',
              'max_delivery_attempts': 3,
              'max_parcel_kg': 50,
              'cod_max': 50000,
            },
          },
        }),
      });
      final container = containerWith(api, MemoryTokenStore('t'));
      addTearDown(container.dispose);
      expect(container.read(dioProvider).httpClientAdapter, api);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: RiderGuideScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('₱35.00'), findsOneWidget);
      expect(find.text('₱65.00'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('Order limits', () {
    CheckoutQuote quote(Map<String, Object> limits) => CheckoutQuote.fromJson({
      'stores': <Object>[],
      'problems': <Object>[],
      'can_place': true,
      'wallet': <Object>[],
      'totals': {'total': 60000},
      'limits': limits,
    });

    test('a big order tells the screen what it needs', () {
      final big = quote({
        'cod_max': 50000,
        'cod_available': false,
        'agreement_required': true,
      });

      expect(big.codAvailable, isFalse);
      expect(big.agreementRequired, isTrue);
      expect(big.codMax, 50000);
    });

    test('an answer from an older server still allows cash', () {
      final old = CheckoutQuote.fromJson({
        'stores': <Object>[],
        'problems': <Object>[],
        'can_place': true,
        'wallet': <Object>[],
        'totals': {'total': 100},
      });

      expect(old.codAvailable, isTrue);
      expect(old.agreementRequired, isFalse);
    });

    test('a heavy item explains the limit', () {
      final block = BulkyInfo.fromJson({
        'weight_kg': 15,
        'max_per_order': 3,
        'max_parcel_kg': 50,
      });

      expect(block.title, 'Heavy item: 15 kg each');
      expect(block.message, contains('at most 3 in one order'));
    });

    test('an item too heavy for any parcel says so', () {
      final beam = BulkyInfo.fromJson({
        'weight_kg': 60,
        'max_per_order': 0,
        'max_parcel_kg': 50,
      });

      expect(beam.message, contains('too heavy for a rider'));
    });
  });

  group('A description written on the website', () {
    test('shows without its tags', () {
      expect(
        plainTextFromHtml(
          '<p><b>Soft</b> cotton &amp; linen</p><ul><li>One</li><li>Two</li></ul>',
        ),
        'Soft cotton & linen\n\n• One\n• Two',
      );
    });

    test('leaves plain text alone', () {
      expect(plainTextFromHtml('Just words.'), 'Just words.');
    });

    test('shows typed symbols as the seller typed them', () {
      expect(plainTextFromHtml('<p>5 &lt; 10</p>'), '5 < 10');
      expect(plainTextFromHtml('<p>&amp;lt;</p>'), '&lt;');
    });

    test('never shows a script, or runs one: the app only draws text', () {
      expect(plainTextFromHtml('<p>Hi</p><img src=x onerror=alert(1)>'), 'Hi');
    });
  });
}
