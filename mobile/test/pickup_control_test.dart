import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/features/logistics/operations/pickup_control_screen.dart';
import 'package:loved_it/features/logistics/operations/portal_api.dart';

import 'support/fakes.dart';

void main() {
  for (final courier in [false, true]) {
    testWidgets(
      '${courier ? 'courier' : 'hub'} saves assignment mode and explicitly confirms a manual pickup',
      (tester) async {
        tester.view.physicalSize = const Size(900, 1500);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final base = '/${courier ? 'logistics' : 'hub'}/pickup-control';
        Object? saved, assignment;
        final settings = {
          'auto_seller_pickups': {
            'value': courier ? true : null,
            'effective': true,
            'company_default': true,
          },
          'auto_return_pickups': {
            'value': courier ? false : null,
            'effective': false,
            'company_default': false,
          },
        };
        final api = FakeApi({
          'GET $base': (_) => jsonBody(200, {
            'data': {'name': 'Test Dispatch', 'settings': settings},
          }),
          'PATCH $base': (r) {
            saved = r.data;
            return jsonBody(200, {});
          },
          'GET $base/jobs': (_) => jsonBody(200, {
            'data': [
              {
                'id': 8,
                'tracking_number': 'LIT-TEST-8',
                'shop': 'Test Shop',
                'address': 'Santa Cruz',
                'state': 'unassigned',
              },
            ],
          }),
          'GET $base/riders': (r) {
            expect(r.queryParameters['parcel_id'], 8);
            return jsonBody(200, {
              'data': [
                {
                  'id': 4,
                  'name': 'Juan Rider',
                  'jobs': 0,
                  'distance': 'Same city',
                },
              ],
            });
          },
          'POST $base/assign': (r) {
            assignment = r.data;
            return jsonBody(200, {'message': 'Assigned'});
          },
        });
        final dio = Dio()..httpClientAdapter = api;
        addTearDown(dio.close);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [portalApiProvider.overrideWithValue(PortalApi(dio))],
            child: MaterialApp(home: PickupControlScreen(courier: courier)),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byType(Switch).first);
        await tester.pumpAndSettle();
        expect(saved, {
          'auto_seller_pickups': false,
          'auto_return_pickups': courier ? false : null,
        });
        await tester.ensureVisible(find.text('Assign rider'));
        await tester.tap(find.text('Assign rider'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Juan Rider'));
        await tester.pumpAndSettle();
        expect(assignment, isNull);
        expect(find.text('Assign Juan Rider?'), findsOneWidget);
        await tester.tap(find.text('Assign rider').last);
        await tester.pumpAndSettle();
        expect(assignment, {'parcel_id': 8, 'rider_id': 4});
        expect(tester.takeException(), isNull);
      },
    );
  }
}
