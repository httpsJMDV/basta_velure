import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_failure.dart';
import 'package:loved_it/core/session/app_user.dart';
import 'package:loved_it/core/session/home_route.dart';
import 'package:loved_it/core/session/session.dart';
import 'package:loved_it/router.dart';

import 'support/fakes.dart';

/// Task A6: which home screen opens, and which screens may open at all.
void main() {
  AppUser user({
    String role = 'buyer',
    Map<String, dynamic>? rider,
    Map<String, dynamic>? hub,
    Map<String, dynamic>? courier,
    Map<String, dynamic>? seller,
  }) => AppUser.fromJson(
    userJson(
      role: role,
      rider: rider,
      sortingCenter: hub,
      logisticsCompany: courier,
      sellerProfile: seller,
    ),
  );

  group('homesFor', () {
    test('a buyer, and a seller (who shops too), open the shop', () {
      expect(homesFor(user()), [AppHome.buyer]);
      final seller = user(seller: {'application_status': 'approved'});
      expect(homesFor(seller), [AppHome.buyer]);
      expect(seller.isSeller, isTrue);
    });

    test('an admin gets the "use the website" screen only', () {
      expect(homesFor(user(role: 'admin')), [AppHome.webOnly]);
    });

    test(
      'an active rider opens Rider; a buyer who rides can switch to the shop',
      () {
        final ridingBuyer = user(rider: {'id': 1, 'status': 'ACTIVE'});
        expect(homesFor(ridingBuyer), [AppHome.rider, AppHome.buyer]);
        expect(defaultHomeFor(ridingBuyer), AppHome.rider);
      },
    );

    test('a rider-only account has no shop', () {
      expect(
        homesFor(user(role: 'rider', rider: {'id': 1, 'status': 'ACTIVE'})),
        [AppHome.rider],
      );
    });

    test('a suspended rider still opens Rider and sees why there', () {
      expect(
        defaultHomeFor(
          user(role: 'rider', rider: {'id': 1, 'status': 'SUSPENDED'}),
        ),
        AppHome.rider,
      );
    });

    test(
      'a pending or refused rider application keeps the person shopping',
      () {
        expect(homesFor(user(rider: {'id': 1, 'status': 'PENDING'})), [
          AppHome.buyer,
        ]);
        expect(homesFor(user(rider: {'id': 1, 'status': 'DISAPPROVED'})), [
          AppHome.buyer,
        ]);
      },
    );

    test(
      'an approved hub or courier team opens Logistics; a pending one does not',
      () {
        expect(
          defaultHomeFor(
            user(
              hub: {'id': 3, 'hub_name': 'Sta. Cruz Hub', 'status': 'APPROVED'},
            ),
          ),
          AppHome.logistics,
        );
        expect(
          defaultHomeFor(
            user(
              courier: {
                'id': 2,
                'name': 'DCC',
                'status': 'APPROVED',
                'role': 'owner',
              },
            ),
          ),
          AppHome.logistics,
        );
        expect(
          homesFor(
            user(hub: {'id': 3, 'hub_name': 'Hub', 'status': 'PENDING'}),
          ),
          [AppHome.buyer],
        );
        expect(
          homesFor(
            user(courier: {'id': 2, 'name': 'DCC', 'status': 'REJECTED'}),
          ),
          [AppHome.buyer],
        );
      },
    );
  });

  group('redirectFor', () {
    test('signed out: only the sign-in screens', () {
      expect(redirectFor(const SignedOut(), '/buyer'), '/sign-in');
      expect(redirectFor(const SignedOut(), '/sign-in'), isNull);
    });

    test('checking the token, unreachable, email code and blocked each have one screen', () {
      expect(redirectFor(const SessionRestoring(), '/buyer'), '/launch');
      expect(redirectFor(const SessionUnreachable('x'), '/buyer'), '/offline');
      expect(
        redirectFor(const NeedsEmailCode('a@b.co'), '/sign-in'),
        '/verify-email',
      );
      expect(
        redirectFor(
          const AccountBlocked(FailureKind.accountSuspended, 'x'),
          '/buyer',
        ),
        '/account-blocked',
      );
    });

    test('signed in: the current home and its screens, nothing else', () {
      final rider = SignedIn(
        user(rider: {'id': 1, 'status': 'ACTIVE'}),
        AppHome.rider,
      );
      expect(redirectFor(rider, '/sign-in'), '/rider');
      expect(redirectFor(rider, '/rider'), isNull);
      expect(redirectFor(rider, '/rider/deliveries'), isNull);
      expect(redirectFor(rider, '/logistics'), '/rider');
      // "/riderx" is not a rider screen.
      expect(redirectFor(rider, '/riderx'), '/rider');
    });

    test('switching home moves to that home', () {
      final shopping = SignedIn(
        user(rider: {'id': 1, 'status': 'ACTIVE'}),
        AppHome.buyer,
      );
      expect(redirectFor(shopping, '/rider'), '/buyer');
    });

    test('a Google sign-up finishes its profile before anything else', () {
      final fresh = SignedIn(
        AppUser.fromJson(userJson(dateOfBirth: null)),
        AppHome.buyer,
      );
      expect(redirectFor(fresh, '/buyer'), '/buyer/complete-profile');
      expect(redirectFor(fresh, '/buyer/cart'), '/buyer/complete-profile');
      expect(redirectFor(fresh, '/buyer/complete-profile'), isNull);

      final finished = SignedIn(AppUser.fromJson(userJson()), AppHome.buyer);
      expect(redirectFor(finished, '/buyer/complete-profile'), isNull);
      expect(redirectFor(finished, '/buyer/cart'), isNull);
    });
  });
}
