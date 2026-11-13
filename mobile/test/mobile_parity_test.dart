import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_client.dart';
import 'package:loved_it/core/theme/app_theme.dart';
import 'package:loved_it/core/widgets/private_pdf_view.dart';
import 'package:loved_it/features/buyer/data/buyer_api.dart';
import 'package:loved_it/features/buyer/data/checkout.dart';
import 'package:loved_it/features/buyer/shop/shop_screen.dart';
import 'package:loved_it/features/logistics/operations/money_screens.dart';
import 'package:loved_it/features/logistics/operations/returns_screen.dart';
import 'package:loved_it/features/logistics/operations/settings_screens.dart';
import 'package:loved_it/features/logistics/operations/shipping_screen.dart';

import 'support/fakes.dart';

void main() {
  Future<void> open(WidgetTester tester, FakeApi api, Widget screen) async {
    final scope = containerWith(api, MemoryTokenStore());
    addTearDown(scope.dispose);
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: scope,
        child: MaterialApp(theme: buildAppTheme(), home: screen),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  test('shipping details, shop category filters and flash reminders use the shared API', () async {
    final store = QuoteStore.fromJson({
      'shipping': {
        'fee': 190,
        'route': 'Within Luzon',
        'weight_grams': 15000,
        'chargeable_kg': 15,
      },
    });
    expect(store.shippingRoute, 'Within Luzon');
    expect(store.weightGrams, 15000);
    expect(store.chargeableKg, 15);
    final api = FakeApi({
      'GET /products': (r) {
        expect(r.queryParameters['store_category_id'], 14);
        return jsonBody(200, {'data': []});
      },
      'POST /flash-sales/8/reminder': (_) => jsonBody(200, {
        'data': {'reminder_set': true},
      }),
      'DELETE /flash-sales/8/reminder': (_) => jsonBody(200, {
        'data': {'reminder_set': false},
      }),
    });
    final dio = buildApiClient(
      tokenStore: MemoryTokenStore(),
      onSessionEnded: (_) {},
    );
    dio.httpClientAdapter = api;
    final buyer = BuyerApi(dio);
    await buyer.products(storeCategoryId: 14);
    expect(await buyer.setFlashReminder(8, true), isTrue);
    expect(await buyer.setFlashReminder(8, false), isFalse);
    dio.close();
  });

  testWidgets('shop categories and subcategories filter the products', (
    tester,
  ) async {
    final api = FakeApi({
      'GET /shops/9': (_) => jsonBody(200, {
        'data': {
          'seller_id': 9,
          'shop_name': 'Craft Shop',
          'store_categories': [
            {
              'id': 10,
              'name': 'Woven',
              'children': [
                {'id': 11, 'name': 'Baskets'},
              ],
            },
          ],
        },
      }),
      'GET /shops/9/vouchers': (_) => jsonBody(200, {'data': []}),
      'GET /products': (_) => jsonBody(200, {'data': []}),
    });
    await open(tester, api, const ShopScreen(shopKey: '9'));
    await tester.scrollUntilVisible(
      find.text('Woven'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tapVisible(tester, find.text('Woven'));
    expect(
      api.requests
          .lastWhere((r) => r.path == '/products')
          .queryParameters['store_category_id'],
      10,
    );
    await tapVisible(tester, find.text('Baskets'));
    expect(
      api.requests
          .lastWhere((r) => r.path == '/products')
          .queryParameters['store_category_id'],
      11,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'payout needs review and confirmation, and sends no client amount',
    (tester) async {
      var paid = false;
      final api = FakeApi({
        'GET /logistics/payouts/riders/7/history': (_) => jsonBody(200, {
          'data': [
            {
              'tracking_number': 'LIT-TEST',
              'kind': 'delivery',
              'amount': '50.00',
              'earned_at': '2026-11-14T00:00:00Z',
            },
          ],
        }),
        'POST /logistics/payouts/riders/7': (r) {
          expect(r.data, {'reference': '1234567890123'});
          paid = true;
          return jsonBody(200, {
            'data': {'paid_count': 1},
          });
        },
      });
      await open(
        tester,
        api,
        const PayeeScreen(
          kind: 'riders',
          payee: {'id': 7, 'name': 'Juan', 'unpaid': 50, 'unpaid_count': 1},
        ),
      );
      await tapVisible(tester, find.text('Record payment'));
      await tester.enterText(find.byType(TextFormField), '1234567890123');
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save changes'),
            )
            .onPressed,
        isNull,
      );
      await tapVisible(tester, find.byType(CheckboxListTile));
      await tapVisible(tester, find.text('Save changes'));
      expect(paid, isFalse);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Confirm'));
      expect(paid, isTrue);
      expect(find.text('Payment recorded'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'return assignment uses the company endpoint only after confirmation',
    (tester) async {
      var assigned = false;
      final api = FakeApi({
        'GET /logistics/returns': (_) => jsonBody(200, {
          'data': [
            {
              'id': 3,
              'tracking_number': 'LIT-RETURN',
              'shop': 'Craft Shop',
              'shop_area': 'Laguna',
            },
          ],
        }),
        'GET /logistics/dispatch/riders': (_) => jsonBody(200, {
          'data': [
            {'id': 7, 'name': 'Juan', 'assignable': true},
          ],
        }),
        'GET /logistics/return-pickups': (_) => jsonBody(200, {
          'data': [],
          'meta': {'riders': []},
        }),
        'POST /logistics/returns/3/assign': (r) {
          expect(r.data, {'rider_id': 7});
          assigned = true;
          return jsonBody(200, {'message': 'Rider assigned.'});
        },
      });
      await open(tester, api, const CourierReturnsScreen());
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Assign rider'),
      );
      await tapVisible(tester, find.text('Juan'));
      expect(assigned, isFalse);
      await tapVisible(
        tester,
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.widgetWithText(FilledButton, 'Assign rider'),
        ),
      );
      expect(assigned, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'shipping rate editor preserves the route and confirms before saving',
    (tester) async {
      var saved = false;
      final api = FakeApi({
        'GET /logistics/shipping': (_) => jsonBody(200, {
          'data': {
            'zones': [
              {'id': 1, 'name': 'Luzon', 'areas': []},
            ],
            'rates': [
              {
                'id': 2,
                'origin_zone_id': 1,
                'destination_zone_id': 1,
                'first_kg': 50,
                'additional_kg': 10,
              },
            ],
          },
        }),
        'PUT /logistics/shipping/rates': (r) {
          expect((r.data as Map)['origin_zone_id'], 1);
          expect((r.data as Map)['destination_zone_id'], 1);
          expect((r.data as Map)['first_kg'], 50);
          saved = true;
          return jsonBody(200, {'message': 'Saved.'});
        },
      });
      await open(tester, api, const ShippingScreen());
      await tester.scrollUntilVisible(
        find.text('Edit price'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tapVisible(tester, find.text('Edit price'));
      await tapVisible(tester, find.text('Save changes'));
      expect(saved, isFalse);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Confirm'));
      expect(saved, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('hub settings edit its own payout account without a browser', (
    tester,
  ) async {
    var saved = false;
    final api = FakeApi({
      'GET /hub/profile': (_) => jsonBody(200, {
        'data': {'hub_name': 'Laguna Hub'},
      }),
      'GET /hub/gcash': (_) => jsonBody(200, {
        'data': {'gcash_number': '09171234567', 'gcash_name': 'Laguna Hub'},
      }),
      'PATCH /hub/gcash': (r) {
        expect((r.data as Map)['gcash_name'], 'Laguna Hub');
        saved = true;
        return jsonBody(200, {'data': r.data});
      },
    });
    await open(tester, api, const PortalSettingsScreen());
    await tester.scrollUntilVisible(
      find.text('Edit GCash account'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tapVisible(tester, find.text('Edit GCash account'));
    await tapVisible(tester, find.text('Save changes'));
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Confirm'));
    expect(saved, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'private PDF pages render in app and the handle is closed on leave',
    (tester) async {
      const channel = MethodChannel('shop.lovedit/pdf');
      final image = (await rootBundle.load('assets/home/vouchers.webp')).buffer
          .asUint8List();
      var closed = false;
      final pages = <int>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        call,
      ) async {
        if (call.method == 'open') {
          return {'handle': 'private-test', 'pages': 2};
        }
        if (call.method == 'render') {
          pages.add((call.arguments as Map)['page'] as int);
          return image;
        }
        if (call.method == 'close') closed = true;
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          null,
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PrivatePdfView(
              bytes: Uint8List.fromList([37, 80, 68, 70, 45]),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Page 1 of 2'), findsOneWidget);
      await tapVisible(tester, find.byTooltip('Next page'));
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(pages, [0, 1]);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      expect(closed, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('settlement confirmation is distinct from sending a payment', (
    tester,
  ) async {
    var confirmed = false;
    final api = FakeApi({
      'POST /logistics/settlements/4/confirm': (r) {
        expect(r.data, isEmpty);
        confirmed = true;
        return jsonBody(200, {
          'data': {'id': 4, 'state': 'settled', 'paid_by': 'seller'},
        });
      },
    });
    await open(
      tester,
      api,
      const SettlementScreen(
        week: '2026-11-02',
        line: {
          'net': 250,
          'direction': 'seller_pays',
          'seller': {'id': 9, 'shop_name': 'Craft Shop'},
          'settlement': {'id': 4, 'state': 'sent', 'paid_by': 'seller'},
        },
      ),
    );
    await tapVisible(tester, find.text('Confirm money received'));
    await tapVisible(tester, find.byType(CheckboxListTile));
    await tapVisible(tester, find.text('Save changes'));
    expect(confirmed, isFalse);
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Confirm'));
    expect(confirmed, isTrue);
    expect(find.text('settled'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('company details edit only allowed public fields', (
    tester,
  ) async {
    var saved = false;
    final api = FakeApi({
      'GET /logistics/me': (_) => jsonBody(200, {
        'data': {
          'name': 'Loved Courier',
          'contact_email': 'courier@example.test',
          'contact_phone': '09171234567',
          'description': 'Local delivery',
        },
      }),
      'GET /logistics/gcash': (_) => jsonBody(200, {'data': {}}),
      'PATCH /logistics/company': (r) {
        expect((r.data as Map).keys.toSet(), {
          'contact_email',
          'contact_phone',
          'description',
        });
        saved = true;
        return jsonBody(200, {'data': r.data});
      },
    });
    await open(tester, api, const PortalSettingsScreen(courier: true));
    await tester.scrollUntilVisible(
      find.text('Edit contact details'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tapVisible(tester, find.text('Edit contact details'));
    await tapVisible(tester, find.text('Save changes'));
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Confirm'));
    expect(saved, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'truck planning sends capacity and shift settings, not computed driver counts',
    (tester) async {
      var saved = false;
      final api = FakeApi({
        'GET /logistics/truck-planner': (_) => jsonBody(200, {
          'data': {
            'settings': {'capacity': 100, 'shift_hours': 8},
            'needed': {'recommended': 2},
            'routes': [],
          },
        }),
        'GET /logistics/truck-drivers': (_) => jsonBody(200, {
          'data': [],
          'summary': {'rate': 800},
        }),
        'PUT /logistics/truck-planner': (r) {
          expect(r.data, {'capacity': 100, 'shift_hours': 8});
          saved = true;
          return jsonBody(200, {'data': {}});
        },
      });
      await open(tester, api, const TruckPlanningScreen());
      await tapVisible(tester, find.text('Edit planning settings'));
      await tapVisible(tester, find.text('Save changes'));
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Confirm'));
      expect(saved, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('hub earnings display the server balance and paid status', (
    tester,
  ) async {
    await open(
      tester,
      FakeApi({
        'GET /hub/earnings': (_) => jsonBody(200, {
          'data': {
            'unpaid_total': '75.00',
            'today': {'total': '10.00'},
            'week': {'total': '75.00'},
            'month': {'total': '75.00'},
            'lifetime': {'total': '150.00'},
            'recent': [
              {
                'tracking_number': 'LIT-HUB',
                'amount': '7.50',
                'earned_at': '2026-11-14T00:00:00Z',
                'paid_at': null,
              },
            ],
          },
        }),
      }),
      const HubEarningsScreen(),
    );
    await tester.scrollUntilVisible(
      find.text('LIT-HUB'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.textContaining('Unpaid'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('zone edits preserve existing named areas until confirmed', (
    tester,
  ) async {
    var saved = false;
    await open(
      tester,
      FakeApi({
        'PATCH /logistics/shipping/zones/1': (r) {
          expect(r.data, {
            'name': 'Luzon',
            'areas': [
              {
                'level': 'region',
                'psgc_code': '040000000',
                'name': 'CALABARZON',
                'excluded': false,
              },
            ],
          });
          saved = true;
          return jsonBody(200, {'data': {}});
        },
      }),
      const ZoneEditor(
        zone: {
          'id': 1,
          'name': 'Luzon',
          'areas': [
            {
              'id': 9,
              'level': 'region',
              'psgc_code': '040000000',
              'name': 'CALABARZON',
              'excluded': false,
            },
          ],
        },
      ),
    );
    await tapVisible(tester, find.text('Save delivery zone'));
    expect(saved, isFalse);
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Save'));
    expect(saved, isTrue);
    expect(tester.takeException(), isNull);
  });
}
