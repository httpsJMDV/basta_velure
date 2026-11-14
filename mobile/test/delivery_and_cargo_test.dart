import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/features/buyer/data/buyer_api.dart';
import 'package:loved_it/features/buyer/data/orders.dart';
import 'package:loved_it/features/buyer/orders/delivery_address_sheet.dart';
import 'package:loved_it/features/logistics/operations/cargo_screen.dart';
import 'package:loved_it/features/logistics/operations/portal_api.dart';
import 'package:loved_it/features/rider/data/rider_models.dart';

import 'support/fakes.dart';

void main() {
  test('a reviewed weight allowance replaces the three-job full indicator', () {
    final json = {
      'online': true,
      'status': 'ACTIVE',
      'active_jobs': 9,
      'max_active_jobs': 3,
      'capacity': {
        'mode': 'weight',
        'capacity_kg': 20,
        'reserved_kg': 9,
        'remaining_kg': 11,
        'unmeasured_jobs': 0,
      },
    };
    expect(RiderWorkState.fromJson(json).isFull, isFalse);
    expect(
      RiderWorkState.fromJson({
        ...json,
        'capacity': {'mode': 'weight', 'remaining_kg': 0, 'unmeasured_jobs': 0},
      }).isFull,
      isTrue,
    );
  });

  testWidgets(
    'a buyer corrects one order with its current revision and no route change',
    (tester) async {
      Object? saved;
      final order = Order.fromJson({
        'id': 5,
        'order_number': 'TEST-5',
        'status': 'PLACED',
        'payment_method': 'cod',
        'shipping_name': 'Ana Buyer',
        'shipping_phone': '09171234567',
        'shipping_address': '1 Original Street',
        'shipping_barangay': 'Central',
        'shipping_city': 'Quezon City',
        'shipping_province': 'Metro Manila',
        'address_revision': 2,
        'can_edit_delivery_address': true,
        'items': [],
      });
      final api = FakeApi({
        'PATCH /buyer/orders/5/delivery-address': (r) {
          saved = r.data;
          return jsonBody(200, {
            'data': {'id': 5, 'items': []},
          });
        },
      });
      final dio = Dio()..httpClientAdapter = api;
      addTearDown(dio.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [buyerApiProvider.overrideWithValue(BuyerApi(dio))],
          child: MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => DeliveryAddressSheet(order: order),
                    ),
                    child: const Text('Open correction'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open correction'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'House, street, building and unit'),
        '22 Correct Street',
      );
      await tester.ensureVisible(find.text('Save correction'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save correction'));
      await tester.pumpAndSettle();
      expect(saved, {
        'shipping_name': 'Ana Buyer',
        'shipping_phone': '09171234567',
        'shipping_address': '22 Correct Street',
        'address_revision': 2,
      });
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'courier review requires documented inputs and an explicit inspection check',
    (tester) async {
      Object? saved;
      final api = FakeApi({
        'PATCH /logistics/cargo/riders/7': (r) {
          saved = r.data;
          return jsonBody(200, {});
        },
      });
      final dio = Dio()..httpClientAdapter = api;
      addTearDown(dio.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [portalApiProvider.overrideWithValue(PortalApi(dio))],
          child: const MaterialApp(
            home: CargoReviewScreen(riderId: 7, configuration: {}),
          ),
        ),
      );
      final approve = find.widgetWithText(
        FilledButton,
        'Approve reviewed allowance',
      );
      expect(tester.widget<FilledButton>(approve).onPressed, isNull);
      const numbers = {
        'registered_payload_kg': '150',
        'manufacturer_payload_kg': '150',
        'rider_gear_kg': '80',
        'carrier_rating_kg': '25',
        'empty_carrier_kg': '5',
        'length_cm': '50',
        'width_cm': '40',
        'height_cm': '40',
      };
      for (final entry in cargoRatingFields.entries) {
        final field = find.widgetWithText(TextFormField, entry.value);
        await tester.ensureVisible(field);
        await tester.pumpAndSettle();
        await tester.enterText(field, numbers[entry.key]!);
      }
      final notes = find.widgetWithText(
        TextFormField,
        'Document references and inspection notes',
      );
      await tester.ensureVisible(notes);
      await tester.pumpAndSettle();
      await tester.enterText(
        notes,
        'Fixture registration, manufacturer and rack documents checked.',
      );
      await tester.ensureVisible(find.byType(CheckboxListTile));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pumpAndSettle();
      await tester.tap(approve);
      await tester.pumpAndSettle();
      final body = saved as Map;
      expect(body['reviewed_documents_and_mounting'], true);
      expect(body['carrier_rating_kg'], 25);
      expect(body.containsKey('usable_cargo_kg'), false);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a rider sees reviewed kg and unmeasured jobs without approval controls',
    (tester) async {
      final api = FakeApi({
        'GET /rider/cargo': (_) => jsonBody(200, {
          'data': {
            'mode': 'weight',
            'capacity_kg': 20,
            'reserved_kg': 4,
            'active_jobs': 4,
            'unmeasured_jobs': 1,
            'capacity_litres': 80,
            'reserved_litres': 5,
            'notice': 'Physical fit still needs checking.',
          },
        }),
      });
      final dio = Dio()..httpClientAdapter = api;
      addTearDown(dio.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [portalApiProvider.overrideWithValue(PortalApi(dio))],
          child: const MaterialApp(home: CargoScreen(scope: 'rider')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('4 / 20 kg reserved'), findsOneWidget);
      expect(
        find.text('4 assigned parcels · 1 need measurement'),
        findsOneWidget,
      );
      expect(find.text('Approve reviewed allowance'), findsNothing);
      expect(find.text('Record packed measurements'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
