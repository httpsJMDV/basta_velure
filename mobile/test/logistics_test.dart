import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/format.dart';
import 'package:loved_it/core/theme/app_colors.dart';
import 'package:loved_it/core/validation/rules.dart';
import 'package:loved_it/features/logistics/data/logistics_models.dart';

/// Part D's rules and the API's real shapes, without any screen.
void main() {
  group('reasons', () {
    test('a reject, suspend, override or exception reason is 10 to 300', () {
      expect(Rules.reason(''), 'Please give a reason (10 to 300 characters).');
      expect(
        Rules.reason('too short'),
        'The reason must be at least 10 characters.',
      );
      expect(Rules.reason('Long enough reason.'), isNull);
      expect(Rules.reason('x' * 300), isNull);
      expect(
        Rules.reason('x' * 301),
        'The reason must be 300 characters or fewer.',
      );
    });

    test('a disapproval is 10 to 500 characters, written in words', () {
      String? check(String value) =>
          Rules.words(value, 'The disapproval reason');
      expect(check('Blurry license photo.'), isNull);
      expect(
        check('1234567890'),
        'The disapproval reason must be written in words.',
      );
      expect(
        check('no'),
        'The disapproval reason must be at least 10 characters.',
      );
      expect(
        check('word ' * 101),
        'The disapproval reason may not be longer than 500 characters.',
      );
    });
  });

  group('area names', () {
    test('3 to 60 characters with at least 2 letters', () {
      expect(Rules.areaLabel('Zone 2 - Poblacion'), isNull);
      expect(Rules.areaLabel('Area A'), isNull);
      expect(Rules.areaLabel(''), 'Area name is required.');
      expect(Rules.areaLabel('T'), contains('3 to 60 characters'));
      expect(Rules.areaLabel('x' * 61), contains('3 to 60 characters'));
      expect(Rules.areaLabel('12345'), contains('at least two letters'));
      expect(Rules.areaLabel('!!!'), contains('at least two letters'));
    });

    test('runs of spaces collapse, as on the server', () {
      expect(Rules.areaLabel('  Zone   2  '), isNull);
    });
  });

  group('status words', () {
    test('parcels use the website\'s words and the shared colours', () {
      expect(StatusWords.parcel('AT_SORTING_CENTER'), (
        'At hub',
        StatusTone.amber,
      ));
      expect(StatusWords.parcel('PICKED_UP').$2, StatusTone.blue);
      expect(StatusWords.parcel('DELIVERED'), (
        'Delivered',
        StatusTone.emerald,
      ));
      expect(StatusWords.parcel('LOST').$2, StatusTone.rose);
      expect(StatusWords.parcel('RETURNED').$2, StatusTone.gray);
      expect(StatusWords.parcel('SOMETHING_NEW'), (
        'SOMETHING NEW',
        StatusTone.gray,
      ));
    });

    test(
      'the hub and the courier word a rider differently, like the website',
      () {
        expect(StatusWords.hubRider('PENDING').$1, 'Pending');
        expect(
          StatusWords.courierRider('PENDING').$1,
          'Waiting for verification',
        );
        expect(StatusWords.hubRider('DISAPPROVED').$1, 'Disapproved');
        expect(StatusWords.courierRider('DISAPPROVED').$1, 'Not approved');
      },
    );

    test('a hub is Active once approved', () {
      expect(StatusWords.hub('APPROVED'), ('Active', StatusTone.emerald));
      expect(StatusWords.hub('PENDING').$1, 'Pending review');
    });
  });

  group('parsing', () {
    test('a rider is decided on when pending or when documents changed', () {
      CourierRider rider(String status, {bool changed = false}) =>
          CourierRider.fromJson({
            'id': 1,
            'name': 'Pedro',
            'status': status,
            'needs_reverification': changed,
          });
      expect(rider('PENDING').canDecide, isTrue);
      expect(rider('ACTIVE').canDecide, isFalse);
      expect(rider('ACTIVE', changed: true).canDecide, isTrue);
      expect(rider('ACTIVE').canSuspend, isTrue);
      expect(rider('SUSPENDED').isSuspended, isTrue);
      expect(rider('PENDING_ACTIVATION').canResendActivation, isTrue);
    });

    test('an application can be decided on but not suspended', () {
      final applicant = CourierRider.fromJson({
        'id': 1,
        'status': 'PENDING',
        'applicant': true,
      });
      expect(applicant.canDecide, isTrue);
      expect(applicant.canSuspend, isFalse);
    });

    test('a parcel can be rescheduled only while attempts are left', () {
      ParcelDetail parcel(String status, int attempts) => ParcelDetail.fromJson(
        {'id': 1, 'status': status, 'attempts': attempts, 'max_attempts': 3},
      );
      expect(parcel('DELIVERY_FAILED', 2).canReschedule, isTrue);
      expect(parcel('DELIVERY_FAILED', 3).canReschedule, isFalse);
      expect(parcel('OUT_FOR_DELIVERY', 0).canReschedule, isFalse);
    });

    test('money stays exactly as the server sent it', () {
      final remittance = Remittance.fromJson({
        'id': 1,
        'amount': '1250.00',
        'shortfall': '0.00',
        'status': 'PENDING',
      });
      expect(remittance.amount, '1250.00');
      expect(remittance.isShort, isFalse);
      expect(
        Remittance.fromJson({'id': 1, 'shortfall': '50.00'}).isShort,
        isTrue,
      );
    });

    test('a missing relation never crashes a row', () {
      expect(IntakeParcel.fromJson({'pickup_rider': null}).riderName, isNull);
      expect(OutDelivery.fromJson({'rider': null}).riderName, isNull);
      expect(FailedDelivery.fromJson({'failure_reason': null}).reason, isNull);
      expect(
        NetworkHubDetail.fromJson({'applicant': null}).applicantName,
        isNull,
      );
    });

    test('a hub\'s documents come from its links, never its paths', () {
      final hub = NetworkHubDetail.fromJson({
        'id': 3,
        'dti_permit_url': 'http://x/permit',
        'applicant': {'government_id_image_url': null},
      });
      expect(hub.hasPermit, isTrue);
      expect(hub.hasId, isFalse);
    });

    test('the hub reads a rider thread as the rider\'s name and parcel', () {
      final thread = RiderThreadRow.fromJson({
        'id': 9,
        'recipient': {'name': 'Pedro Mendoza'},
        'parcel': {'tracking_number': 'LIT-261030-AAAAAA'},
        'last_message': {'body': 'Nasa hub na po.'},
        'can_send': true,
        'unread': 2,
      });
      expect(thread.riderName, 'Pedro Mendoza');
      expect(thread.trackingNumber, 'LIT-261030-AAAAAA');
      expect(thread.lastMessage, 'Nasa hub na po.');
      expect(thread.unread, 2);
    });
  });

  group('Fmt', () {
    test('dayTime is Philippine time', () {
      expect(Fmt.dayTime(DateTime.utc(2026, 10, 28, 6, 15)), 'Oct 28, 2:15 PM');
      expect(Fmt.dayTime(null), '—');
    });

    test('waited counts minutes, hours and days', () {
      final now = DateTime.utc(2026, 10, 30, 12);
      expect(
        Fmt.waited(now.subtract(const Duration(minutes: 12)), now: now),
        '12m',
      );
      expect(
        Fmt.waited(now.subtract(const Duration(hours: 3)), now: now),
        '3h',
      );
      expect(Fmt.waited(now.subtract(const Duration(days: 2)), now: now), '2d');
      expect(Fmt.waited(now.add(const Duration(minutes: 5)), now: now), '0m');
      expect(Fmt.waited(null), '—');
    });
  });
}
