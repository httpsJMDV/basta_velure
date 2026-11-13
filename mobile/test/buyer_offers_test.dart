import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/theme/app_theme.dart';
import 'package:loved_it/features/buyer/account/vouchers_screen.dart';
import 'package:loved_it/features/buyer/widgets/buyer_offers.dart';

import 'support/fakes.dart';

void main() {
  Map<String, dynamic> offer({int id = 1, bool claimed = false}) => {
    'id': id,
    'code': id == 1 ? 'SHOP50' : 'SHIP20',
    'name': 'Shop savings',
    'label': id == 1 ? '50% off' : 'Shipping up to ₱20 off',
    'scope': id == 1 ? 'store' : 'shipping',
    'min_spend': 100,
    'status': 'ongoing',
    'claimed': claimed,
    'fully_used': false,
    'seller': id == 1 ? {'id': 9, 'shop_name': 'Craft Shop'} : null,
  };

  Future<void> open(WidgetTester tester, FakeApi api, Widget child) async {
    final scope = containerWith(api, MemoryTokenStore());
    addTearDown(scope.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: scope,
        child: MaterialApp(theme: buildAppTheme(), home: child),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'Home renders actual shop offers and sale products with the sale filter',
    (tester) async {
      final api = FakeApi({
        'GET /vouchers/discover': (_) => jsonBody(200, {
          'data': [offer()],
        }),
        'GET /products': (request) {
          expect(request.queryParameters['on_sale'], 1);
          return jsonBody(200, {
            'data': [
              {
                'id': 2,
                'name': 'Sale basket',
                'base_price': 100,
                'original_price': 200,
              },
            ],
          });
        },
      });
      await open(
        tester,
        api,
        const Scaffold(
          body: SingleChildScrollView(
            child: Column(
              children: [BuyerVoucherSection(), BuyerSaleSection()],
            ),
          ),
        ),
      );
      expect(find.text('Vouchers for you'), findsOneWidget);
      expect(find.text('50% off'), findsOneWidget);
      expect(find.textContaining('Craft Shop'), findsOneWidget);
      expect(find.text('On sale now'), findsOneWidget);
      expect(find.text('Sale basket'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'unsaved shop vouchers appear, can be saved, and then appear in the wallet',
    (tester) async {
      var saved = false;
      final api = FakeApi({
        'GET /buyer/vouchers': (_) => jsonBody(200, {
          'data': saved ? [offer(claimed: true)] : [],
        }),
        'GET /vouchers/discover': (_) => jsonBody(200, {
          'data': [offer(claimed: saved)],
        }),
        'POST /buyer/vouchers/claim': (request) {
          expect((request.data as Map)['voucher_id'], 1);
          saved = true;
          return jsonBody(201, {'message': 'Voucher saved.'});
        },
      });
      await open(tester, api, const VouchersScreen());
      expect(find.text('Available vouchers'), findsOneWidget);
      expect(find.text('SHOP50'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Save').last);
      await tester.pumpAndSettle();
      expect(saved, isTrue);
      expect(find.text('SHOP50'), findsOneWidget);
      expect(find.text('Saved'), findsWidgets);
      expect(api.requests.any((r) => r.path == '/vouchers/platform'), isFalse);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('more offers are reachable without replacing the first page', (
    tester,
  ) async {
    final api = FakeApi({
      'GET /buyer/vouchers': (_) => jsonBody(200, {'data': []}),
      'GET /vouchers/discover': (request) {
        final page = request.queryParameters['page'] as int;
        return jsonBody(200, {
          'data': [offer(id: page)],
          'meta': {'current_page': page, 'last_page': 2},
        });
      },
    });
    await open(tester, api, const VouchersScreen());
    await tester.ensureVisible(find.text('Load more vouchers'));
    await tester.tap(find.text('Load more vouchers'));
    await tester.pumpAndSettle();
    expect(find.text('SHOP50'), findsOneWidget);
    expect(find.text('SHIP20'), findsOneWidget);
    expect(find.text('Load more vouchers'), findsNothing);
  });

  testWidgets('an offers outage shows a retry and recovers', (tester) async {
    var fails = true;
    final api = FakeApi({
      'GET /vouchers/discover': (_) => fails
          ? jsonBody(503, {'message': 'Offers unavailable'})
          : jsonBody(200, {
              'data': [offer()],
            }),
    });
    await open(tester, api, const Scaffold(body: BuyerVoucherSection()));
    expect(find.text('Could not load vouchers. Try again'), findsOneWidget);
    fails = false;
    await tester.tap(find.text('Could not load vouchers. Try again'));
    await tester.pumpAndSettle();
    expect(find.text('50% off'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
