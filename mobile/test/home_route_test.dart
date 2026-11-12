import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_failure.dart';
import 'package:loved_it/core/session/app_user.dart';
import 'package:loved_it/core/session/home_route.dart';
import 'package:loved_it/core/session/session.dart';
import 'package:loved_it/features/buyer/buyer_paths.dart';
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
      expect(homesFor(seller), [AppHome.buyer, AppHome.seller]);
      expect(seller.isSeller, isTrue);
    });

    test('an admin gets the "use the website" screen only', () {
      expect(homesFor(user(role: 'admin')), [AppHome.webOnly]);
    });

    test('an active rider opens Rider and cannot switch to the shop, even with a buyer role', () {
      final ridingBuyer = user(rider: {'id': 1, 'status': 'ACTIVE'});
      expect(homesFor(ridingBuyer), [AppHome.rider]);
      expect(defaultHomeFor(ridingBuyer), AppHome.rider);
    });

    test('an approved hub or courier account has no shop to switch to', () {
      expect(
        homesFor(
          user(
            hub: {'id': 3, 'hub_name': 'Sta. Cruz Hub', 'status': 'APPROVED'},
          ),
        ),
        [AppHome.logistics],
      );
      expect(
        homesFor(
          user(
            courier: {
              'id': 2,
              'name': 'DCC',
              'status': 'APPROVED',
              'role': 'owner',
            },
          ),
        ),
        [AppHome.logistics],
      );
    });

    test('a hub owner who also rides switches between those two only', () {
      final both = user(
        hub: {'id': 3, 'hub_name': 'Hub', 'status': 'APPROVED'},
        rider: {'id': 1, 'status': 'ACTIVE'},
      );
      expect(homesFor(both), [AppHome.logistics, AppHome.rider]);
    });

    test('a rider account still waiting for activation gets no shop', () {
      expect(
        homesFor(user(role: 'rider', rider: {'id': 1, 'status': 'PENDING'})),
        [AppHome.rider],
      );
    });

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
      'a pending rider application is a work account; a refused one keeps the person shopping',
      () {
        expect(homesFor(user(rider: {'id': 1, 'status': 'PENDING'})), [
          AppHome.rider,
        ]);
        expect(homesFor(user(rider: {'id': 1, 'status': 'DISAPPROVED'})), [
          AppHome.buyer,
        ]);
      },
    );

    test(
      'an approved hub or courier team opens Logistics; a pending one waits on the website, a refused one shops',
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
          [AppHome.webOnly],
        );
        expect(
          homesFor(
            user(courier: {'id': 2, 'name': 'DCC', 'status': 'PENDING'}),
          ),
          [AppHome.webOnly],
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
    test('signed out: the shop window and the sign-in screens', () {
      expect(redirectFor(const SignedOut(), '/buyer'), isNull);
      expect(redirectFor(const SignedOut(), '/sign-in'), isNull);
      expect(
        redirectFor(const SignedOut(), '/buyer/cart'),
        '/sign-in?next=%2Fbuyer%2Fcart',
      );
    });

    test(
      'after signing in, a dock tab opens; nothing leaves the home it opened',
      () {
        final buyer = SignedIn(user(), AppHome.buyer);
        expect(
          redirectFor(buyer, '/sign-in', next: '/buyer/cart'),
          '/buyer/cart',
        );
        expect(redirectFor(buyer, '/sign-in'), '/buyer');
        expect(
          redirectFor(buyer, '/sign-in', next: 'https://evil.test'),
          '/buyer',
        );
        final rider = SignedIn(
          user(rider: {'id': 1, 'status': 'ACTIVE'}),
          AppHome.rider,
        );
        expect(redirectFor(rider, '/sign-in', next: '/buyer/cart'), '/rider');
      },
    );

    test('only a screen of the shop can be returned to', () {
      expect(BuyerPaths.isShopScreen('/buyer/product/1'), isTrue);
      expect(BuyerPaths.isShopScreen('/rider/home'), isFalse);
      expect(BuyerPaths.isShopScreen('https://evil.test/buyer/x'), isFalse);
      expect(BuyerPaths.isShopScreen('//evil.test/buyer/x'), isFalse);
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
      final both = user(
        hub: {'id': 3, 'hub_name': 'Hub', 'status': 'APPROVED'},
        rider: {'id': 1, 'status': 'ACTIVE'},
      );
      expect(
        redirectFor(SignedIn(both, AppHome.rider), '/logistics'),
        '/rider',
      );
    });

    test('a rider is kept out of every shop screen', () {
      final rider = SignedIn(
        user(rider: {'id': 1, 'status': 'ACTIVE'}),
        AppHome.rider,
      );
      expect(redirectFor(rider, '/buyer'), '/rider');
      expect(redirectFor(rider, '/buyer/cart'), '/rider');
      expect(redirectFor(rider, '/buyer/product/1'), '/rider');
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
