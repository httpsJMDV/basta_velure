import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:loved_it/core/api/api_client.dart';
import 'package:loved_it/core/api/api_failure.dart';
import 'package:loved_it/core/media/photo_picker.dart';
import 'package:loved_it/core/session/session.dart';
import 'package:loved_it/core/theme/app_theme.dart';
import 'package:loved_it/core/validation/rules.dart';
import 'package:loved_it/features/auth/auth_routes.dart';
import 'package:loved_it/features/rider/data/rider_api.dart';
import 'package:loved_it/features/rider/data/rider_models.dart';
import 'package:loved_it/features/rider/location/location_beacon.dart';
import 'package:loved_it/features/rider/widgets/rider_widgets.dart';
import 'package:loved_it/router.dart';

import 'support/fakes.dart';

/// Part C: the rider's own validation rules, how the rider screens read the API, and what they send.
void main() {
  group('rider rules', () {
    test('license number: the LTO format, tidied first', () {
      expect(Rules.licenseNumber('N01-23-456789'), isNull);
      expect(Rules.licenseNumber(' n01-23-456789 '), isNull);
      expect(Rules.normalizeLicenseNumber('n01 -23-456789'), 'N01-23-456789');
      expect(Rules.licenseNumber(''), isNotNull);
      expect(Rules.licenseNumber('N0123456789'), isNotNull);
      expect(Rules.licenseNumber('123-45-678901'), isNotNull);
    });

    test('license expiry: today or later in Manila', () {
      // 17:00 UTC on Oct 30 is already Oct 31 in Manila.
      final now = DateTime.utc(2026, 10, 30, 17);
      expect(Rules.licenseExpiry(DateTime(2026, 10, 31), now: now), isNull);
      expect(Rules.licenseExpiry(DateTime(2027, 1, 1), now: now), isNull);
      expect(Rules.licenseExpiry(DateTime(2026, 10, 30), now: now), isNotNull);
      expect(Rules.licenseExpiry(null, now: now), isNotNull);
    });

    test('plate: 2 to 10 letters and digits, spaces and dashes dropped', () {
      expect(Rules.plateNumber('NBC 1234'), isNull);
      expect(Rules.normalizePlateNumber('nbc-1234'), 'NBC1234');
      expect(Rules.plateNumber('1'), isNotNull);
      expect(Rules.plateNumber('ABCDEFGHIJK'), isNotNull);
      expect(Rules.plateNumber('NBC#123'), isNotNull);
    });

    test('vehicle: one of the four types', () {
      expect(Rules.vehicleType('Motorcycle'), isNull);
      expect(Rules.vehicleType('motorcycle'), isNotNull);
      expect(Rules.vehicleType(null), isNotNull);
    });

    test('COD cash: exactly the amount, to the centavo', () {
      expect(Rules.codCollected('1250', 1250), isNull);
      expect(Rules.codCollected('1250.00', 1250), isNull);
      expect(Rules.codCollected('99.9', 99.90), isNull);
      expect(Rules.codCollected('1249.99', 1250), contains('exactly ₱1250.00'));
      expect(Rules.codCollected('1250.001', 1250), isNotNull);
      expect(Rules.codCollected('', 1250), 'Enter the cash you collected.');
    });

    test('remittance: above zero, two decimals, no more than held', () {
      expect(Rules.remittanceAmount('500', max: 500), isNull);
      expect(Rules.remittanceAmount('500.01', max: 500), isNotNull);
      expect(Rules.remittanceAmount('0', max: 500), isNotNull);
      expect(Rules.remittanceAmount('1.234'), isNotNull);
      expect(Rules.remittanceAmount(''), isNotNull);
    });

    test('payment reference: optional, 4 to 40 with a digit', () {
      expect(Rules.paymentReference(''), isNull);
      expect(Rules.paymentReference('1234 567 890123'), isNull);
      expect(Rules.paymentReference('ABCD'), isNotNull);
      expect(Rules.paymentReference('12'), isNotNull);
      expect(Rules.paymentReference('<b>1234</b>'), isNotNull);
    });

    test('failed delivery note: words, 5 to 500, required only for Other', () {
      expect(
        Rules.words('', 'The note', min: 5, max: 500, required: false),
        isNull,
      );
      expect(Rules.words('', 'The note', min: 5, max: 500), isNotNull);
      expect(
        Rules.words('Gate locked, nobody home', 'The note', min: 5, max: 500),
        isNull,
      );
      expect(Rules.words('.....', 'The note', min: 5, max: 500), isNotNull);
    });
  });

  group('reading the rider API', () {
    test('an offer counts down from the server, not the phone clock', () {
      final received = DateTime(2026, 10, 30, 9);
      final offer = RiderOffer.fromJson({
        'id': 4,
        'tracking_number': 'LIT-261030-AB12CD',
        // A phone clock that is off would make this already expired.
        'expires_at': '2020-01-01T00:00:00+00:00',
        'seconds_left': 42,
        'pickup': {'shop_name': 'Aling Nena', 'address': 'Pagsanjan, Laguna'},
        'dropoff_area': 'Poblacion, Santa Cruz',
        'cod_amount': 1250,
        'pay': '8.50',
      }, receivedAt: received);
      expect(offer.leftAt(received), const Duration(seconds: 42));
      expect(
        offer.leftAt(received.add(const Duration(minutes: 2))),
        Duration.zero,
      );
      expect(offer.codAmount, 1250);
      expect(offer.pay, '8.50');
    });

    test(
      'a delivery list: COD or prepaid, attempts and barangay codes as text',
      () {
        final list = DeliveryList.fromJson({
          'data': [
            {
              'barangay_code': '043428001',
              'barangay_name': 'Poblacion I',
              'city': 'Santa Cruz',
              'parcels': [
                {
                  'tracking_number': 'LIT-261030-AAAAAA',
                  'recipient': {
                    'name': 'Ana Santos',
                    'phone': '+639171234567',
                    'address': {
                      'full_address':
                          '12 Rizal St, Poblacion I, Santa Cruz, Laguna',
                    },
                  },
                  'cod_amount': '1250.00',
                  'attempt': 2,
                  'max_attempts': 3,
                  'item_count': 2,
                  'item_summary': 'Rice cooker',
                },
                {
                  'tracking_number': 'LIT-261030-BBBBBB',
                  'recipient': {'name': 'Ben', 'phone': '', 'address': {}},
                  'cod_amount': null,
                  'item_count': 1,
                  'item_summary': 'Book',
                },
              ],
            },
          ],
          'hub': {
            'hub_name': 'Santa Cruz Hub',
            'full_address': 'Santa Cruz, Laguna',
          },
          'meta': {'assigned_count': 0, 'out_for_delivery_count': 2},
        });
        expect(list.groups.single.barangayCode, '043428001');
        expect(list.stops.first.isCod, isTrue);
        expect(list.stops.first.codAmount, 1250);
        expect(list.stops.first.attempt, 2);
        expect(list.stops.last.isCod, isFalse);
        expect(list.hub?.name, 'Santa Cruz Hub');
        expect(list.outForDeliveryCount, 2);
      },
    );

    test(
      'a 422 that names parcels by index becomes tracking number → reason',
      () {
        expect(
          itemErrors(
            {
              'tracking_numbers.1': 'This parcel is already out for delivery.',
              'tracking_numbers.7': 'Out of range',
              'other': 'Ignored',
            },
            ['LIT-261030-AAAAAA', 'LIT-261030-BBBBBB'],
          ),
          {'LIT-261030-BBBBBB': 'This parcel is already out for delivery.'},
        );
      },
    );

    test('earned jobs know pickups from deliveries and paid from unpaid', () {
      final pickup = EarnedJob.fromJson({
        'id': 1,
        'kind': 'pickup',
        'tracking_number': 'LIT-261030-AAAAAA',
        'destination': {'barangay_name': 'Poblacion I', 'city': 'Santa Cruz'},
        'delivered_at': '2026-10-30T02:00:00+00:00',
        'fee': '8.50',
        'paid_at': null,
      });
      expect(pickup.isPickup, isTrue);
      expect(pickup.paidAt, isNull);
      expect(pickup.area, 'Poblacion I, Santa Cruz');
    });

    test('a thread shows the counterpart by name, never contact details', () {
      final thread = RiderThread.fromJson({
        'id': 9,
        'counterpart': 'buyer',
        'subject': 'LIT-261030-AAAAAA',
        'recipient': {'name': 'Ana Santos', 'role': 'buyer'},
        'parcel': {'tracking_number': 'LIT-261030-AAAAAA'},
        'can_send': false,
        'closed_message': 'This delivery is finished.',
        'unread': 2,
      });
      expect(thread.counterpart, Counterpart.buyer);
      expect(thread.title, 'Ana Santos');
      expect(thread.canSend, isFalse);
      expect(
        RiderApi.threadKey(thread.trackingNumber, thread.counterpart),
        'LIT-261030-AAAAAA:buyer',
      );
    });
  });

  group('what the rider app sends', () {
    late FakeApi api;
    late RiderApi rider;

    setUp(() {
      api = FakeApi({
        'POST /rider/deliveries/LIT-261030-AAAAAA/delivered': (_) =>
            jsonBody(200, {'message': 'Delivery recorded.', 'pay': '42.50'}),
        'POST /rider/deliveries/start': (_) => jsonBody(422, {
          'message':
              'One or more parcels cannot be started. Nothing was changed.',
          'errors': {
            'tracking_numbers.0': [
              'Parcel not found among your assigned deliveries.',
            ],
          },
        }),
        'POST /rider/cod/remittances': (_) =>
            jsonBody(201, {'message': 'Remittance submitted.'}),
        'PATCH /rider/gcash': (_) => jsonBody(200, {
          'data': {
            'gcash_number': '0917 123 4567',
            'gcash_name': 'Juan Dela Cruz',
          },
        }),
        'POST /rider/location': (_) => jsonBody(409, {
          'message': 'You have no parcels to share your location for.',
        }),
      });
      final dio = buildApiClient(
        tokenStore: MemoryTokenStore('t'),
        onSessionEnded: (_) {},
      );
      dio.httpClientAdapter = api;
      rider = RiderApi(dio);
    });

    test('Delivered: the proof photo and the COD cash, no delivery code, no second photo unless taken', () async {
      final result = await rider.delivered(
        'LIT-261030-AAAAAA',
        photo: const PickedPhoto(bytes: [1, 2, 3], filename: 'proof.jpg'),
        receivedBy: 'Ana Santos',
        codAmount: '1250.00',
      );
      expect(result.pay, '42.50');
      final form = api.requests.single.data as FormData;
      expect(form.files.map((f) => f.key), ['proof_photo']);
      expect(Map.fromEntries(form.fields), {
        'received_by': 'Ana Santos',
        'cod_amount': '1250.00',
      });
      expect(form.fields.map((f) => f.key), isNot(contains('otp')));
    });

    test('Delivered on a prepaid order sends no cash', () async {
      await rider.delivered(
        'LIT-261030-AAAAAA',
        photo: const PickedPhoto(bytes: [1], filename: 'a.jpg'),
        secondPhoto: const PickedPhoto(bytes: [2], filename: 'b.jpg'),
        receivedBy: '',
      );
      final form = api.requests.single.data as FormData;
      expect(form.files.map((f) => f.key), ['proof_photo', 'proof_photo_2']);
      expect(form.fields, isEmpty);
    });

    test('a refused start names the parcel', () async {
      final sent = ['LIT-261030-ZZZZZZ'];
      try {
        await rider.startDeliveries(sent);
        fail('expected a 422');
      } on ApiFailure catch (failure) {
        expect(failure.kind, FailureKind.validation);
        expect(itemErrors(failure.fieldErrors, sent), {
          'LIT-261030-ZZZZZZ':
              'Parcel not found among your assigned deliveries.',
        });
      }
    });

    test(
      'a remittance carries its Idempotency-Key and no empty reference',
      () async {
        await rider.remit(amount: '500.00', idempotencyKey: 'key-1');
        await rider.remit(amount: '500.00', idempotencyKey: 'key-1');
        expect(api.requests.map((r) => r.headers['Idempotency-Key']), [
          'key-1',
          'key-1',
        ]);
        expect(api.requests.first.data, {'amount': '500.00'});
      },
    );

    test('GCash is saved with PATCH', () async {
      final saved = await rider.saveGcash(
        number: '09171234567',
        name: 'Juan Dela Cruz',
      );
      expect(api.requests.single.method, 'PATCH');
      expect(saved.number, '0917 123 4567');
    });

    test(
      'a location ping with nothing to carry is a 409 the beacon stops on',
      () async {
        await expectLater(
          rider.sendLocation(latitude: 14.28, longitude: 121.41),
          throwsA(
            isA<ApiFailure>().having(
              (f) => f.kind,
              'kind',
              FailureKind.conflict,
            ),
          ),
        );
        expect(api.requests.single.data, {
          'latitude': 14.28,
          'longitude': 121.41,
        });
      },
    );
  });

  group('location', () {
    Position at({double heading = 90, double speed = 5}) => Position(
      latitude: 14.28,
      longitude: 121.41,
      timestamp: DateTime(2026, 10, 30),
      accuracy: 8,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: heading,
      headingAccuracy: 0,
      speed: speed,
      speedAccuracy: 0,
    );

    test('a heading only while moving, within 0 to 360', () {
      expect(LocationBeacon.headingOf(at(heading: 90)), 90);
      expect(LocationBeacon.headingOf(at(heading: 360)), 0);
      expect(LocationBeacon.headingOf(at(heading: -1)), isNull);
      expect(LocationBeacon.headingOf(at(speed: 0)), isNull);
    });
  });

  test('"Become a rider" opens signed out, and only signed out', () {
    expect(redirectFor(const SignedOut(), AuthPaths.becomeRider), isNull);
    expect(AuthPaths.signedOut, contains(AuthPaths.becomeRider));
  });

  testWidgets(
    'the COD block and the outcome buttons are big and say what to do',
    (tester) async {
      var delivered = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(),
          home: Scaffold(
            body: Column(
              children: [
                const CodBlock(amount: '1250.00'),
                OutcomeButtons(onDelivered: () => delivered++, onFailed: () {}),
              ],
            ),
          ),
        ),
      );
      expect(
        find.textContaining(
          'Collect ₱1,250.00 cash on delivery',
          findRichText: true,
        ),
        findsOneWidget,
      );
      final button = tester.getSize(
        find.widgetWithText(FilledButton, 'Delivered'),
      );
      expect(button.height, greaterThanOrEqualTo(kMinTap));
      await tester.tap(find.text('Delivered'));
      expect(delivered, 1);
    },
  );
}
