import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/theme/app_theme.dart';
import 'package:loved_it/features/payments/rider_payments.dart';

import 'support/fakes.dart';

void main() {
  Map<String, dynamic> payment({String status = 'pending'}) => {
    'id': 7,
    'reference_code': 'RP-TEST',
    'amount': '150.25',
    'status': status,
    'can_process': true,
    'assigned_to': null,
    'rider_name': 'Juan Rider',
    'hub_name': 'Home hub',
    'gcash_name': 'Juan Rider',
    'gcash_number': '09171234567',
    'breakdown': {'earnings_count': 2, 'trips_count': 0},
    'has_receipt': false,
    'transfer_reference': status == 'processing' ? '1234567890123' : null,
  };

  Future<void> open(
    WidgetTester tester,
    FakeApi api, {
    String role = 'rider',
  }) async {
    final scope = containerWith(api, MemoryTokenStore());
    addTearDown(scope.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: scope,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: Scaffold(
            body: SingleChildScrollView(child: RiderPaymentPanel(role: role)),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'rider requests payment on the phone after reviewing exact amount and GCash',
    (tester) async {
      var requested = false;
      final api = FakeApi({
        'GET /rider/payment-requests': (_) => jsonBody(200, {
          'data': requested ? [payment()] : [],
          'summary': {
            'available': requested ? '0.00' : '150.25',
            'gcash_name': 'Juan Rider',
            'gcash_number': '09171234567',
            'has_open_request': requested,
            'can_request': !requested,
          },
          'meta': {'last_page': 1},
        }),
        'POST /rider/payment-requests': (request) {
          expect((request.data as Map)['expected_amount'], '150.25');
          expect((request.data as Map)['expected_gcash_number'], '09171234567');
          expect((request.data as Map)['confirmed'], true);
          requested = true;
          return jsonBody(201, {'data': payment()});
        },
      });
      await open(tester, api);
      await tester.tap(find.widgetWithText(FilledButton, 'Request payment'));
      await tester.pumpAndSettle();
      expect(requested, isFalse);
      expect(find.textContaining('09171234567'), findsWidgets);
      await tester.tap(
        find.widgetWithText(FilledButton, 'Request payment').last,
      );
      await tester.pumpAndSettle();
      expect(requested, isTrue);
      expect(find.text('RP-TEST'), findsOneWidget);
      expect(
        find
            .widgetWithText(FilledButton, 'Request payment')
            .evaluate()
            .single
            .widget,
        isA<FilledButton>().having(
          (b) => b.onPressed,
          'disabled with open request',
          isNull,
        ),
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('rider confirms received funds and sees the completed status', (
    tester,
  ) async {
    var received = false;
    final api = FakeApi({
      'GET /rider/payment-requests': (_) => jsonBody(200, {
        'data': [payment(status: received ? 'completed' : 'processing')],
        'summary': {
          'available': '0.00',
          'has_open_request': !received,
          'can_request': false,
        },
        'meta': {'last_page': 1},
      }),
      'POST /rider/payment-requests/7/confirm': (request) {
        expect((request.data as Map)['confirmed'], true);
        received = true;
        return jsonBody(200, {});
      },
    });
    await open(tester, api);
    await tester.ensureVisible(find.text('I received it'));
    await tester.tap(find.text('I received it'));
    await tester.pumpAndSettle();
    expect(received, isFalse);
    await tester.tap(find.text('Yes, I received it'));
    await tester.pumpAndSettle();
    expect(received, isTrue);
    expect(find.text('Received'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('hub sees requests and can decline with a reason on the phone', (
    tester,
  ) async {
    var declined = false;
    final api = FakeApi({
      'GET /hub/rider-payment-requests': (_) => jsonBody(200, {
        'data': declined ? [] : [payment()],
        'meta': {'last_page': 1},
      }),
      'POST /hub/rider-payment-requests/7/reject': (request) {
        expect(
          (request.data as Map)['note'],
          'Please correct the account name.',
        );
        declined = true;
        return jsonBody(200, {});
      },
    });
    await open(tester, api, role: 'hub');
    await tester.ensureVisible(find.text('Decline'));
    await tester.tap(find.text('Decline'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'Please correct the account name.',
    );
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    expect(declined, isTrue);
    expect(find.text('No payment requests here yet.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'courier must attach transfer proof before recording payment on the phone',
    (tester) async {
      final api = FakeApi({
        'GET /logistics/rider-payment-requests': (_) => jsonBody(200, {
          'data': [payment()],
          'meta': {'last_page': 1},
        }),
        'POST /logistics/rider-payment-requests/7/claim': (_) =>
            jsonBody(200, {'data': payment()}),
      });
      await open(tester, api, role: 'logistics');
      await tester.ensureVisible(find.text('Take request'));
      await tester.tap(find.text('Take request'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '1234567890123');
      await tester.ensureVisible(find.text('Record transfer').last);
      await tester.tap(find.text('Record transfer').last);
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Add a 13-digit GCash reference, receipt and transfer confirmation.',
        ),
        findsOneWidget,
      );
      expect(
        api.requests.where(
          (r) => r.method == 'POST' && r.path.endsWith('/send'),
        ),
        isEmpty,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('a failed claim never opens transfer instructions on the phone', (
    tester,
  ) async {
    final api = FakeApi({
      'GET /logistics/rider-payment-requests': (_) => jsonBody(200, {
        'data': [payment()],
        'meta': {'last_page': 1},
      }),
      'POST /logistics/rider-payment-requests/7/claim': (_) => jsonBody(409, {
        'message':
            'Another staff member is handling this payment. Do not send money.',
      }),
    });
    await open(tester, api, role: 'logistics');
    await tester.ensureVisible(find.text('Take request'));
    await tester.tap(find.text('Take request'));
    await tester.pumpAndSettle();
    expect(find.text('Record rider payment'), findsNothing);
    expect(
      find.text(
        'Another staff member is handling this payment. Do not send money.',
      ),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
