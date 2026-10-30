import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/app.dart';

import 'support/fakes.dart';

/// Part C end to end through the router: a signed-in rider on every tab, against a fake server with the API's
/// real shapes. Checks what each screen shows and exactly what it sends.
void main() {
  late ProviderContainer container;
  late FakeApi api;
  late bool online;

  const stopTn = 'LIT-261030-AAAAAA';

  Map<String, dynamic> state() => {
    'online': online,
    'status': 'ACTIVE',
    'active_jobs': 1,
    'max_active_jobs': 3,
    'online_since': null,
  };

  Map<String, dynamic> stop() => {
    'tracking_number': stopTn,
    'order_number': 'VEL-1',
    'recipient': {
      'name': 'Ana Santos',
      'phone': '+639171234567',
      'address': {
        'full_address': '12 Rizal St, Poblacion I, Santa Cruz, Laguna',
      },
    },
    'cod_amount': 1250,
    'attempt': 1,
    'max_attempts': 3,
    'item_count': 2,
    'item_summary': 'Rice cooker',
  };

  Map<String, dynamic> thread() => {
    'id': 9,
    'type': 'rider_buyer',
    'counterpart': 'buyer',
    'subject': stopTn,
    'recipient': {'name': 'Ana Santos', 'role': 'buyer'},
    'parcel': {'tracking_number': stopTn, 'status': 'OUT_FOR_DELIVERY'},
    'can_send': true,
    'unread': 1,
  };

  FakeApi server() => FakeApi({
    'GET /auth/me': (_) => jsonBody(200, {
      'data': userJson(
        firstName: 'King',
        role: 'rider',
        rider: {'id': 1, 'status': 'ACTIVE'},
      ),
    }),
    'GET /rider/status': (_) => jsonBody(200, {'data': state()}),
    'POST /rider/availability': (r) {
      online = (r.data as Map)['online'] as bool;
      return jsonBody(200, {
        'message': online ? 'You are Online.' : 'You are Offline.',
        'data': state(),
      });
    },
    'GET /rider/offers': (_) => jsonBody(200, {
      'data': [
        if (online)
          {
            'id': 4,
            'tracking_number': 'LIT-261030-OFFER1',
            'expires_at': '2030-01-01T00:00:00+00:00',
            'seconds_left': 55,
            'pickup': {
              'shop_name': 'Aling Nena Store',
              'address': 'Pagsanjan, Laguna',
            },
            'dropoff_area': 'Poblacion I, Santa Cruz',
            'cod_amount': null,
            'weight_kg': 1.5,
            'pay': '8.50',
          },
      ],
      'meta': state(),
    }),
    'POST /rider/offers/4/accept': (_) =>
        jsonBody(200, {'message': 'Job accepted. Head to the shop.'}),
    'GET /rider/pickups': (r) {
      final view = r.queryParameters['view'];
      return jsonBody(200, {
        'data': [
          if (view == 'available')
            {
              'seller_id': 12,
              'shop_name': 'Aling Nena Store',
              'shop_phone': '+639181112222',
              'pickup_address': {'full_address': 'Pagsanjan, Laguna'},
              'parcel_count': 2,
              'ready_since': '2026-10-30T01:00:00+00:00',
              'matched_area_label': 'Pagsanjan',
            },
          if (view == 'mine')
            {
              'seller_id': 12,
              'shop_name': 'Aling Nena Store',
              'shop_phone': '+639181112222',
              'pickup_address': {'full_address': 'Pagsanjan, Laguna'},
              'parcel_count': 1,
              'tracking_numbers': ['LIT-261030-PICK01'],
              'ready_since': '2026-10-30T01:00:00+00:00',
            },
        ],
        'meta': {
          'available_count': 1,
          'mine_count': 1,
          'picked_up_count': 0,
          'has_areas': true,
        },
      });
    },
    'POST /rider/pickups/sellers/12/accept': (_) =>
        jsonBody(200, {'message': 'Pickup accepted.'}),
    'GET /rider/deliveries': (r) => jsonBody(200, {
      'data': [
        if (r.queryParameters['view'] == 'out_for_delivery')
          {
            'barangay_code': '043428001',
            'barangay_name': 'Poblacion I',
            'city': 'Santa Cruz',
            'parcels': [stop()],
          },
      ],
      'hub': {'hub_name': 'Santa Cruz Hub', 'full_address': 'Santa Cruz'},
      'meta': {'assigned_count': 0, 'out_for_delivery_count': 1},
    }),
    'GET /rider/deliveries/failure-reasons': (_) => jsonBody(200, {
      'data': [
        {
          'code': 'recipient_unavailable',
          'label': 'Recipient unavailable',
          'requires_note': false,
        },
        {'code': 'other', 'label': 'Other', 'requires_note': true},
      ],
    }),
    'POST /rider/deliveries/$stopTn/failed': (_) => jsonBody(200, {
      'message': 'Delivery failure recorded: attempt 1 of 3.',
      'delivery_attempts': 1,
    }),
    'GET /rider/earnings/summary': (_) => jsonBody(200, {
      'data': {
        'period': {
          'start_date': '2026-10-26',
          'end_date': '2026-11-01',
          'is_current': true,
        },
        'total_earned': '93.50',
        'deliveries_count': 3,
        'previous': {'total_earned': '42.50'},
        'lifetime_total': '500.00',
        'unpaid_total': '93.50',
      },
    }),
    'GET /rider/earnings/deliveries': (_) => jsonBody(200, {
      'data': [
        {
          'id': 1,
          'kind': 'pickup',
          'tracking_number': 'LIT-261030-PICK01',
          'destination': {'barangay_name': 'Poblacion I', 'city': 'Santa Cruz'},
          'delivered_at': '2026-10-30T02:00:00+00:00',
          'fee': '8.50',
          'paid_at': null,
        },
      ],
      'meta': {'current_page': 1, 'last_page': 1, 'total': 1},
    }),
    'GET /rider/history': (_) => jsonBody(200, {
      'data': [
        {
          'outcome': 'failed',
          'occurred_at': '2026-10-29T02:00:00+00:00',
          'tracking_number': 'LIT-261029-FAIL01',
          'destination': {'barangay_name': 'Poblacion I', 'city': 'Santa Cruz'},
          'failure_reason': {'code': 'refused', 'label': 'Refused'},
          'fee': null,
          'cod_collected': null,
        },
      ],
      'meta': {'current_page': 1, 'last_page': 1, 'total': 1},
    }),
    'GET /rider/returns': (_) => jsonBody(200, {'data': []}),
    'GET /rider/cod': (_) => jsonBody(200, {
      'data': {
        'balance': {
          'collected': '1250.00',
          'confirmed': '0.00',
          'pending': '0.00',
          'outstanding': '1250.00',
          'can_remit': '1250.00',
        },
        'collections': [],
        'remittances': [],
      },
    }),
    'GET /rider/location/status': (_) => jsonBody(200, {
      'data': {'sharing_required': false, 'active_parcels': 0},
    }),
    'GET /rider/chat/unread': (_) => jsonBody(200, {
      'data': [
        {
          'thread_id': 9,
          'tracking_number': stopTn,
          'counterpart': 'buyer',
          'unread': 1,
        },
      ],
      'meta': {'unread_total': 1},
    }),
    'GET /notifications/unread-count': (_) => jsonBody(200, {
      'data': {'unread': 0},
    }),
    'POST /rider/chat/parcels/$stopTn/threads': (_) =>
        jsonBody(200, {'data': thread()}),
    'GET /rider/chat/threads/9': (_) => jsonBody(200, {'data': thread()}),
    'GET /rider/chat/threads/9/messages': (_) => jsonBody(200, {
      'data': [
        {
          'id': 1,
          'body': 'Nasa gate po ako.',
          'sender_id': 99,
          'sender_name': 'Ana',
          'created_at': '2026-10-30T02:00:00+00:00',
        },
      ],
      'meta': {'is_closed': false, 'can_send': true},
    }),
    'POST /rider/chat/threads/9/messages': (r) => jsonBody(201, {
      'data': {
        'id': 2,
        'body': (r.data as Map)['body'],
        'sender_id': 7,
        'created_at': '2026-10-30T02:01:00+00:00',
      },
    }),
    'POST /rider/chat/threads/9/read': (_) => jsonBody(200, {}),
    'GET /rider/me': (_) => jsonBody(200, {
      'data': {
        'id': 1,
        'full_name': 'King Ordona',
        'email': 'king@example.com',
        'phone': '+639171234567',
        'status': 'ACTIVE',
        'vehicle_type': 'Motorcycle',
        'plate_number': 'NBC1234',
        'license_number': 'N01-23-456789',
        'license_expiry': '2030-01-01',
        'company': {'name': 'Demo Courier Co.'},
        'hub': {'hub_name': 'Santa Cruz Hub', 'address_city': 'Santa Cruz'},
        'needs_reverification': false,
        'active_areas': [
          {'area_label': 'Pagsanjan'},
        ],
        'documents': [
          {'key': 'license', 'label': "Driver's license"},
        ],
      },
    }),
    'GET /rider/gcash': (_) => jsonBody(200, {
      'data': {'gcash_number': '0917 123 4567', 'gcash_name': 'King Ordona'},
    }),
  });

  Future<void> openApp(WidgetTester tester) async {
    online = false;
    api = server();
    container = containerWith(api, MemoryTokenStore('t'));
    addTearDown(container.dispose);
    // A tall phone, so whole cards fit and taps land.
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const LovedItApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Lets requests and animations run when something on screen keeps moving (a spinner, a countdown).
  Future<void> pumpFor(WidgetTester tester, [int frames = 20]) async {
    for (var i = 0; i < frames; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  /// Stops the rider screens' timers before the test ends.
  Future<void> closeApp(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    container.dispose();
  }

  List<RequestOptions> sent(String method, String path) =>
      api.requests.where((r) => r.method == method && r.path == path).toList();

  testWidgets('Home: go Online, get an offer, accept it', (tester) async {
    await openApp(tester);
    expect(find.text('Courier Station'), findsOneWidget);
    expect(find.text('Offline'), findsOneWidget);
    expect(find.text('Paid jobs today'), findsOneWidget);

    await tester.tap(find.byType(Switch));
    // The offer's countdown redraws all the time, so pump instead of settling.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(sent('POST', '/rider/availability').single.data, {'online': true});
    expect(find.text('Online'), findsOneWidget);

    expect(find.text('New pickup job'), findsOneWidget);
    expect(find.text('Aling Nena Store'), findsOneWidget);
    expect(find.text('₱8.50'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Accept'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(sent('POST', '/rider/offers/4/accept'), hasLength(1));
    expect(find.text('New pickup job'), findsNothing);
    await closeApp(tester);
  });

  testWidgets('Pickups: accept a shop, then its parcels are mine to scan', (
    tester,
  ) async {
    await openApp(tester);
    await tester.tap(find.text('Pickups'));
    await tester.pumpAndSettle();
    expect(find.text('Aling Nena Store'), findsOneWidget);
    expect(find.text('Available  1'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Accept'));
    await tester.pumpAndSettle();
    expect(sent('POST', '/rider/pickups/sellers/12/accept'), hasLength(1));
    expect(find.text('LIT-261030-PICK01'), findsOneWidget);
    expect(find.text('Scan parcels at the shop'), findsOneWidget);
    await closeApp(tester);
  });

  testWidgets('Deliveries: the stop card and a failed delivery', (
    tester,
  ) async {
    await openApp(tester);
    await tester.tap(find.text('Deliveries'));
    await tester.pumpAndSettle();
    expect(find.text('Ana Santos'), findsOneWidget);
    expect(find.text('Attempt 1 of 3'), findsOneWidget);
    expect(
      find.textContaining(
        'Collect ₱1,250.00 cash on delivery',
        findRichText: true,
      ),
      findsOneWidget,
    );
    expect(find.text(stopTn), findsOneWidget);

    await tester.ensureVisible(find.text('Delivery failed'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delivery failed'));
    await tester.pumpAndSettle();
    expect(find.text('What happened?'), findsOneWidget);

    // "Other" needs a note.
    await tester.tap(find.text('Other'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Record failed delivery'));
    await tester.pumpAndSettle();
    expect(find.text('The note is required.'), findsOneWidget);
    expect(sent('POST', '/rider/deliveries/$stopTn/failed'), isEmpty);

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Note (required)'),
      'The gate was locked and nobody answered.',
    );
    await tester.tap(find.text('Record failed delivery'));
    // The button stays locked (spinning) while the confirm dialog is open.
    await pumpFor(tester);
    expect(find.text('Record failed delivery?'), findsOneWidget);
    await tester.tap(find.text('Record it'));
    await pumpFor(tester);
    expect(sent('POST', '/rider/deliveries/$stopTn/failed').single.data, {
      'reason': 'other',
      'note': 'The gate was locked and nobody answered.',
    });
    expect(
      find.text('Delivery failure recorded: attempt 1 of 3.'),
      findsOneWidget,
    );
    await closeApp(tester);
  });

  testWidgets(
    'Delivered: no photo and the wrong cash are stopped on the phone',
    (tester) async {
      await openApp(tester);
      await tester.tap(find.text('Deliveries'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Delivered'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Delivered'));
      await tester.pumpAndSettle();
      expect(find.text('Confirm delivery'), findsOneWidget);
      expect(find.text('Take photo'), findsNWidgets(2));

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Cash you collected (₱)'),
        '1200',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Delivered').last);
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Take a photo of the parcel at the door as proof of delivery.',
        ),
        findsOneWidget,
      );
      expect(
        find.text("The cash must be exactly ₱1250.00, the order's COD amount."),
        findsOneWidget,
      );
      expect(sent('POST', '/rider/deliveries/$stopTn/delivered'), isEmpty);
      await closeApp(tester);
    },
  );

  testWidgets('Message the buyer from a stop card', (tester) async {
    await openApp(tester);
    await tester.tap(find.text('Deliveries'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Message'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Message'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Message the buyer'));
    await tester.pumpAndSettle();
    expect(sent('POST', '/rider/chat/parcels/$stopTn/threads').single.data, {
      'counterpart': 'buyer',
    });
    expect(find.text('Nasa gate po ako.'), findsOneWidget);
    expect(sent('POST', '/rider/chat/threads/9/read'), isNotEmpty);

    await tester.enterText(find.byType(TextField), '  Papunta na po.  ');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(sent('POST', '/rider/chat/threads/9/messages').single.data, {
      'body': 'Papunta na po.',
    });
    expect(find.text('Papunta na po.'), findsOneWidget);
    await closeApp(tester);
  });

  testWidgets('Earnings and History', (tester) async {
    await openApp(tester);
    await tester.tap(find.text('Earnings'));
    await tester.pumpAndSettle();
    expect(find.text('₱93.50'), findsWidgets);
    expect(find.text('Pickup'), findsOneWidget);
    expect(find.text('Unpaid'), findsOneWidget);
    expect(find.textContaining('₱1,250.00 to hand over'), findsOneWidget);

    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(find.text('LIT-261029-FAIL01'), findsOneWidget);
    expect(find.text('Refused'), findsOneWidget);
    await closeApp(tester);
  });

  testWidgets('Account: profile, vehicle, license, GCash and areas', (
    tester,
  ) async {
    await openApp(tester);
    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();
    expect(find.text('King Ordona'), findsWidgets);
    expect(find.text('Motorcycle · NBC1234'), findsOneWidget);
    expect(find.text('N01-23-456789'), findsOneWidget);
    expect(find.text('GCash 0917 123 4567'), findsOneWidget);
    expect(find.text('Pagsanjan', skipOffstage: false), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Sign out'), 300);
    expect(find.text('Sign out'), findsOneWidget);
    await closeApp(tester);
  });

  testWidgets('every tab fits a small 360 x 640 phone', (tester) async {
    await openApp(tester);
    tester.view.physicalSize = const Size(720, 1280);
    tester.view.devicePixelRatio = 2;
    await tester.pumpAndSettle();
    for (final tab in [
      'Pickups',
      'Deliveries',
      'Earnings',
      'Account',
      'Home',
    ]) {
      await tester.tap(find.text(tab).last);
      await tester.pumpAndSettle();
      // A RenderFlex overflow is reported as an exception: none may happen.
      expect(tester.takeException(), isNull, reason: tab);
    }
    await tester.tap(find.text('Deliveries').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Delivery failed'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delivery failed'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull, reason: 'failed sheet');
    await closeApp(tester);
  });
}
