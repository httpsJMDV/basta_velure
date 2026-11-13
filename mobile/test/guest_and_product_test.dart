import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/app.dart';
import 'package:loved_it/core/session/session.dart';
import 'package:loved_it/features/buyer/data/account.dart';
import 'package:loved_it/router.dart';

import 'support/fakes.dart';

/// Guests look around like on the website, and sign in for anything of their own. The product page, end to end through
/// the router, and the checkout that sends an old address to be updated instead of stopping.
void main() {
  late ProviderContainer container;
  late FakeApi api;

  Map<String, dynamic> product({
    List<Map<String, dynamic>>? combinations,
    int reviews = 12,
    int stock = 8,
    int? originalPrice,
  }) => {
    'id': 1,
    'name': 'Wireless Earbuds',
    'description': 'Small and light, with a case that charges them.',
    'base_price': 899,
    'original_price': ?originalPrice,
    'thumbnail_url': null,
    'images': <Object>[],
    'units_sold': 37,
    'avg_rating': 4.5,
    'review_count': reviews,
    'total_stock': stock,
    'on_vacation': false,
    'seller': {
      'id': 9,
      'shop_name': 'Maria Audio',
      'shop_slug': 'maria-audio',
      'product_count': 14,
      'avg_rating': 4.6,
      'units_sold': 320,
      'city': 'Pagsanjan',
      'province': 'Laguna',
      'joined_at': '2026-03-04T00:00:00+00:00',
    },
    'variation_types': <String>[],
    'combinations':
        combinations ??
        [
          {
            'variant_id': 11,
            'id': 11,
            'label': 'Default',
            'stock': stock,
            'stock_quantity': stock,
            'price': 899,
          },
        ],
    'specs': {'material': 'Plastic', 'weight_grams': '40'},
    'estimated_delivery_days_min': 2,
    'estimated_delivery_days_max': 5,
    'return_policy': 'Unopened items only.',
  };

  Map<String, FakeHandler> shopWindow({Map<String, dynamic>? item}) => {
    'GET /categories': (_) => jsonBody(200, {'data': <Object>[]}),
    'GET /products': (_) => jsonBody(200, {
      'data': [
        {'id': 1, 'name': 'Wireless Earbuds', 'base_price': 899},
      ],
      'meta': {'current_page': 1, 'last_page': 1, 'total': 1},
    }),
    'GET /shops': (_) => jsonBody(200, {'data': <Object>[]}),
    'GET /products/1': (_) => jsonBody(200, {'data': item ?? product()}),
    'GET /products/1/vouchers': (_) => jsonBody(200, {'data': <Object>[]}),
    'GET /vouchers/discover': (_) => jsonBody(200, {'data': <Object>[]}),
    'GET /products/1/related': (_) => jsonBody(200, {
      'data': [
        {'id': 2, 'name': 'Phone Case', 'base_price': 249},
      ],
    }),
    'GET /products/1/reviews': (r) => jsonBody(200, {
      'data': [
        {
          'id': 5,
          'rating': r.queryParameters['rating'] == 4 ? 4 : 5,
          'comment': r.queryParameters['rating'] == 4
              ? 'Good for the price.'
              : 'Clear sound, and it came fast.',
          'verified_purchase': true,
          'variant_label': 'Black',
          'images': <Object>[],
          'created_at': '2026-10-13T00:00:00+00:00',
          'buyer': {'name': 'A***a'},
        },
      ],
      'meta': {
        'current_page': 1,
        'last_page': 1,
        'total': 12,
        'rating_counts': {'1': 0, '2': 0, '3': 0, '4': 3, '5': 9},
      },
    }),
    'GET /checkout/shops': (_) => jsonBody(200, {
      'data': [
        {
          'seller_id': 9,
          'shop_name': 'Maria Audio',
          'accepts_gcash': true,
          'free_delivery_min': 999,
        },
      ],
    }),
    'GET /platform/policies': (_) => jsonBody(200, {
      'data': {
        'return_policy': {'return_window_days': 7},
      },
    }),
  };

  Map<String, FakeHandler> signedInToo() => {
    'POST /auth/login': (_) => jsonBody(200, {
      'token': 'new-token',
      'data': userJson(firstName: 'Ana'),
    }),
    'GET /auth/me': (_) => jsonBody(200, {'data': userJson(firstName: 'Ana')}),
    'GET /cart': (_) => jsonBody(200, {'data': <String, Object>{}}),
    'POST /cart/items': (_) =>
        jsonBody(200, {'message': 'Added to your cart.', 'data': {}}),
    'GET /notifications/unread-count': (_) => jsonBody(200, {'count': 0}),
    'GET /chat/unread-count': (_) => jsonBody(200, {'count': 0}),
  };

  Future<void> openApp(
    WidgetTester tester,
    Map<String, FakeHandler> routes, {
    String? token,
  }) async {
    api = FakeApi(routes);
    container = containerWith(api, MemoryTokenStore(token));
    addTearDown(container.dispose);
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

  Future<void> closeApp(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    container.dispose();
  }

  void push(String path) => container.read(routerProvider).push(path);
  String where() => container.read(routerProvider).state.uri.path;
  List<RequestOptions> sent(String method, String path) =>
      api.requests.where((r) => r.method == method && r.path == path).toList();

  /// To the middle of the screen, clear of the top bar and the cart button.
  Future<void> scrollTo(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(
      target,
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.runAsync(
      () => Scrollable.ensureVisible(tester.element(target), alignment: 0.5),
    );
    await tester.pumpAndSettle();
  }

  group('a guest', () {
    testWidgets('opens the shop, not the sign-in screen', (tester) async {
      await openApp(tester, shopWindow());

      expect(find.text('Search Loved-IT'), findsOneWidget);
      expect(find.text('Welcome back'), findsNothing);
      // Nothing of a person's own is asked for, so nothing comes back refused.
      const open = {
        '/categories',
        '/products',
        '/shops',
        '/vouchers/platform',
        '/vouchers/discover',
      };
      expect(api.requests.map((r) => r.path).toSet().difference(open), isEmpty);
      await closeApp(tester);
    });

    testWidgets('back goes Categories to Home, then asks before leaving', (
      tester,
    ) async {
      final calls = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          calls.add(call.method);
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      await openApp(tester, shopWindow());

      await tester.tap(find.byTooltip('Categories'));
      await tester.pumpAndSettle();
      expect(where(), '/buyer/categories');

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(where(), '/buyer');
      expect(find.text('Leave Loved-IT?'), findsNothing);

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Leave Loved-IT?'), findsOneWidget);
      await tester.tap(find.text('Stay'));
      await tester.pumpAndSettle();
      expect(calls, isNot(contains('SystemNavigator.pop')));

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Leave'));
      await tester.pumpAndSettle();
      expect(calls, contains('SystemNavigator.pop'));
      await closeApp(tester);
    });

    testWidgets('signs in for Cart, and can go back to browsing', (
      tester,
    ) async {
      await openApp(tester, shopWindow());

      await tester.tap(find.byTooltip('Cart'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(sent('GET', '/cart'), isEmpty);

      await tester.tap(find.text('Keep browsing without an account'));
      await tester.pumpAndSettle();
      expect(find.text('Search Loved-IT'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('sees a product with no account, until buying it', (
      tester,
    ) async {
      await openApp(tester, shopWindow());
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      expect(find.text('Wireless Earbuds'), findsWidgets);
      await tester.tap(find.text('Add to cart'));
      await tester.pumpAndSettle();

      expect(find.text('Welcome back'), findsOneWidget);
      expect(sent('POST', '/cart/items'), isEmpty);
      await closeApp(tester);
    });

    testWidgets('comes back to the product after signing in', (tester) async {
      await openApp(tester, {...shopWindow(), ...signedInToo()});
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Buy now'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email or username'),
        'ana@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'Secret#12',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();

      expect(where(), '/buyer/product/1');
      expect(find.text('Welcome back'), findsNothing);
      // Home is under it, so Back goes somewhere.
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(where(), '/buyer');
      await closeApp(tester);
    });

    Future<void> signIn(WidgetTester tester) async {
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email or username'),
        'ana@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'Secret#12',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
    }

    testWidgets('signing in from Cart opens the cart', (tester) async {
      await openApp(tester, {...shopWindow(), ...signedInToo()});
      await tester.tap(find.byTooltip('Cart'));
      await tester.pumpAndSettle();
      await signIn(tester);

      expect(where(), '/buyer/cart');
      expect(find.text('Welcome back'), findsNothing);
      await closeApp(tester);
    });

    testWidgets('signing in from the bell opens the notifications', (
      tester,
    ) async {
      await openApp(tester, {
        ...shopWindow(),
        ...signedInToo(),
        'GET /notifications': (_) => jsonBody(200, {
          'data': <Object>[],
          'meta': {'current_page': 1, 'last_page': 1, 'total': 0},
        }),
      });
      await tester.tap(find.byTooltip('Notifications'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      await signIn(tester);

      expect(where(), '/buyer/notifications');
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(where(), '/buyer');
      await closeApp(tester);
    });

    testWidgets('a rider signing in from the shop goes to Rider', (
      tester,
    ) async {
      await openApp(tester, {
        ...shopWindow(),
        'POST /auth/login': (_) => jsonBody(200, {
          'token': 'new-token',
          'data': userJson(role: 'rider', rider: {'id': 1, 'status': 'ACTIVE'}),
        }),
      });
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add to cart'));
      await tester.pumpAndSettle();
      await signIn(tester);

      expect(where().startsWith('/rider'), isTrue);
      await closeApp(tester);
    });

    testWidgets('signing out from deep in the shop leaves as a guest', (
      tester,
    ) async {
      await openApp(tester, {
        ...shopWindow(),
        ...signedInToo(),
        'POST /auth/logout': (_) => jsonBody(200, {'message': 'Signed out.'}),
      }, token: 't');
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      expect(where(), '/buyer/product/1');

      unawaited(container.read(sessionProvider.notifier).signOut());
      await tester.pumpAndSettle();

      expect(where(), '/buyer');
      expect(find.text('Search Loved-IT'), findsOneWidget);
      expect(find.text('Welcome back'), findsNothing);
      await closeApp(tester);
    });
  });

  group('the product page', () {
    testWidgets('an upcoming flash sale reminder can be enabled and removed', (
      tester,
    ) async {
      var enabled = false;
      await openApp(tester, {
        ...shopWindow(
          item: {
            ...product(),
            'upcoming_flash_sale': {
              'id': 8,
              'starts_at': '2026-11-16T02:00:00Z',
              'reminder_set': false,
            },
          },
        ),
        ...signedInToo(),
        'POST /flash-sales/8/reminder': (_) {
          enabled = true;
          return jsonBody(200, {
            'data': {'reminder_set': true},
          });
        },
        'DELETE /flash-sales/8/reminder': (_) {
          enabled = false;
          return jsonBody(200, {
            'data': {'reminder_set': false},
          });
        },
      }, token: 'buyer-token');
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text('Remind me'));
      await tester.tap(find.text('Remind me'));
      await tester.pumpAndSettle();
      expect(enabled, isTrue);
      expect(find.text('Reminder on'), findsOneWidget);
      await tester.tap(find.text('Reminder on'));
      await tester.pumpAndSettle();
      expect(enabled, isFalse);
      expect(find.text('Remind me'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await closeApp(tester);
    });
    testWidgets(
      'the shop page shows its voucher after retrying a failed request',
      (tester) async {
        var fails = true;
        await openApp(tester, {
          ...shopWindow(),
          ...signedInToo(),
          'GET /shops/9': (_) => jsonBody(200, {
            'data': {'seller_id': 9, 'shop_name': 'Maria Audio'},
          }),
          'GET /shops/9/vouchers': (_) => fails
              ? jsonBody(503, {'message': 'Offers unavailable'})
              : jsonBody(200, {
                  'data': [
                    {
                      'id': 12,
                      'code': 'SHOPPAGE50',
                      'name': 'Shop savings',
                      'scope': 'store',
                      'label': '₱50 off',
                      'min_spend': 100,
                      'status': 'ongoing',
                    },
                  ],
                }),
        }, token: 'buyer-token');
        push('/buyer/shop/9');
        await tester.pumpAndSettle();
        await scrollTo(
          tester,
          find.text('Could not load shop vouchers. Try again'),
        );
        fails = false;
        await tester.tap(find.text('Could not load shop vouchers. Try again'));
        await tester.pumpAndSettle();
        expect(find.text('SHOPPAGE50'), findsOneWidget);
        expect(find.text('Shop vouchers'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await closeApp(tester);
      },
    );
    testWidgets(
      'shop vouchers load visibly and can recover from a failed request',
      (tester) async {
        var fails = true;
        await openApp(tester, {
          ...shopWindow(),
          'GET /products/1/vouchers': (_) => fails
              ? jsonBody(503, {'message': 'Offers unavailable'})
              : jsonBody(200, {
                  'data': [
                    {
                      'id': 11,
                      'code': 'PRODUCT50',
                      'name': 'Product savings',
                      'scope': 'store',
                      'label': '₱50 off',
                      'min_spend': 100,
                      'status': 'ongoing',
                    },
                  ],
                }),
        });
        push('/buyer/product/1');
        await tester.pumpAndSettle();
        await scrollTo(
          tester,
          find.text('Could not load shop vouchers. Try again'),
        );
        fails = false;
        await tester.tap(find.text('Could not load shop vouchers. Try again'));
        await tester.pumpAndSettle();
        expect(find.text('PRODUCT50'), findsOneWidget);
        expect(find.text('₱50 off'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await closeApp(tester);
      },
    );
    testWidgets('shows what the server says, and only that', (tester) async {
      await openApp(tester, shopWindow());
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      expect(find.text('Arrives in 2 to 5 days'), findsOneWidget);
      expect(find.text('Free delivery from ₱999.00'), findsOneWidget);
      await scrollTo(tester, find.text('7-day returns'));
      expect(find.text('Ships from Pagsanjan, Laguna'), findsOneWidget);
      await scrollTo(tester, find.text('5 stars (9)'));
      expect(find.text('4 stars (3)'), findsOneWidget);
      // Stars nobody gave aren't offered as a filter.
      expect(find.text('1 star (0)'), findsNothing);
      await scrollTo(tester, find.text('Clear sound, and it came fast.'));
      expect(find.text('Excellent'), findsOneWidget);
      expect(find.text('Verified purchase'), findsOneWidget);
      expect(find.text('Purchased: Black'), findsOneWidget);
      // The page asks for the most helpful reviews first.
      expect(
        sent('GET', '/products/1/reviews').first.queryParameters['sort'],
        'helpful',
      );
      await scrollTo(tester, find.text('Maria Audio'));
      expect(
        find.text('14 products  •  320 sold  •  4.6 rating'),
        findsOneWidget,
      );
      await closeApp(tester);
    });

    testWidgets('a shop with no free delivery doesn\'t say it has one', (
      tester,
    ) async {
      await openApp(tester, {
        ...shopWindow(),
        'GET /checkout/shops': (_) => jsonBody(200, {
          'data': [
            {'seller_id': 9, 'shop_name': 'Maria Audio', 'accepts_gcash': true},
          ],
        }),
      });
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      expect(find.textContaining('Free delivery'), findsNothing);
      expect(find.textContaining('delivers for free'), findsNothing);
      await closeApp(tester);
    });

    testWidgets('still works when the extra reading can\'t load', (
      tester,
    ) async {
      final routes = shopWindow()
        ..remove('GET /checkout/shops')
        ..remove('GET /platform/policies')
        ..remove('GET /products/1/related');
      await openApp(tester, routes);
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      expect(find.text('Add to cart'), findsOneWidget);
      await scrollTo(tester, find.text('Returns').first);
      expect(find.textContaining('-day returns'), findsNothing);
      await closeApp(tester);
    });

    testWidgets('choosing a star rating opens those reviews on their page', (
      tester,
    ) async {
      await openApp(tester, shopWindow());
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text('4 stars (3)'));

      await tester.tap(find.text('4 stars (3)'));
      await tester.pumpAndSettle();

      expect(where(), '/buyer/product/1/reviews');
      expect(find.text('Item reviews'), findsOneWidget);
      expect(
        sent('GET', '/products/1/reviews').last.queryParameters['rating'],
        4,
      );
      expect(find.text('Good for the price.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('past the photo, the tabs appear and follow the page', (
      tester,
    ) async {
      await openApp(tester, shopWindow());
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      Opacity tabs() => tester.widget<Opacity>(
        find.ancestor(
          of: find.text('Overview'),
          matching: find.byType(Opacity),
        ),
      );
      expect(tabs().opacity, 0);

      await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
      await tester.pumpAndSettle();
      expect(tabs().opacity, 1);

      await tester.tap(find.text('Reviews'));
      await tester.pumpAndSettle();
      expect(find.text('5 stars (9)'), findsOneWidget);
      final top = tester.getTopLeft(find.text('5 stars (9)')).dy;
      expect(top, lessThan(400));

      // The end of the page lights up the last tab, even if that part never reaches the top.
      FontWeight? weightOf(String label) =>
          tester.widget<Text>(find.text(label).last).style?.fontWeight;
      expect(weightOf('Reviews'), FontWeight.w700);
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -9000));
      await tester.pumpAndSettle();
      expect(weightOf('Recommended'), FontWeight.w700);
      await closeApp(tester);
    });

    testWidgets('one way to buy it: adds the page\'s quantity straight away', (
      tester,
    ) async {
      await openApp(tester, {...shopWindow(), ...signedInToo()}, token: 't');
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('More'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add to cart'));
      await tester.pumpAndSettle();

      final data = sent('POST', '/cart/items').single.data as Map;
      expect(data['variant_id'], 11);
      expect(data['quantity'], 2);
      await closeApp(tester);
    });

    testWidgets('several ways to buy it: the sheet asks which', (tester) async {
      await openApp(tester, {
        ...shopWindow(
          item: product(
            combinations: [
              {
                'variant_id': 11,
                'id': 11,
                'label': 'Black',
                'stock': 3,
                'stock_quantity': 3,
                'price': 899,
              },
              {
                'variant_id': 12,
                'id': 12,
                'label': 'White',
                'stock': 5,
                'stock_quantity': 5,
                'price': 899,
              },
            ],
          ),
        ),
        ...signedInToo(),
      }, token: 't');
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      expect(find.text('Choose from 2 options'), findsOneWidget);
      await tester.tap(find.text('Add to cart'));
      await tester.pumpAndSettle();

      expect(find.text('Choose an option'), findsOneWidget);
      expect(sent('POST', '/cart/items'), isEmpty);
      await closeApp(tester);
    });

    testWidgets('fits a small phone with large text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await openApp(tester, shopWindow());
      tester.view.physicalSize = const Size(720, 1280);
      tester.view.devicePixelRatio = 2;
      push('/buyer/product/1');
      await tester.pumpAndSettle();

      for (var i = 0; i < 8; i++) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -500));
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
      await closeApp(tester);
    });
  });

  group('item reviews', () {
    Map<String, dynamic> review(
      int id, {
      int helpful = 0,
      bool helped = false,
      bool mine = false,
      String? reply,
    }) => {
      'id': id,
      'rating': 5,
      'comment': 'Review number $id.',
      'verified_purchase': true,
      'variant_label': 'Black',
      'images': <Object>[],
      'created_at': '2026-10-13T00:00:00+00:00',
      'buyer': {'name': 'B***r $id'},
      'seller_reply': ?(reply == null ? null : {'body': reply}),
      'helpful_count': helpful,
      'helped': helped,
      'is_mine': mine,
    };

    Map<String, FakeHandler> reviewsPage() => {
      ...shopWindow(),
      'GET /products/1/reviews': (r) => jsonBody(200, {
        'data': r.queryParameters['with_photos'] == 1
            ? [review(9)]
            : [
                review(5, helpful: 2, reply: 'Salamat po!'),
                review(6, mine: true),
              ],
        'meta': {
          'current_page': 1,
          'last_page': 1,
          'total': 2,
          'avg_rating': 4.8,
          'rating_counts': {'1': 0, '2': 0, '3': 0, '4': 1, '5': 1},
          'photo_count': 1,
        },
      }),
    };

    testWidgets(
      'shows the summary, the reply, and Helpful only on other people\'s reviews',
      (tester) async {
        await openApp(tester, {
          ...reviewsPage(),
          ...signedInToo(),
          'PUT /reviews/5/helpful': (_) => jsonBody(200, {
            'data': {'review_id': 5, 'helpful_count': 3, 'helped': true},
          }),
        }, token: 't');
        push('/buyer/product/1/reviews');
        await tester.pumpAndSettle();

        expect(
          find.text('All reviews are from verified purchases'),
          findsOneWidget,
        );
        expect(find.text('4.8'), findsOneWidget);
        expect(find.text('2 ratings'), findsOneWidget);
        expect(find.text('With photos (1)'), findsOneWidget);
        expect(
          sent('GET', '/products/1/reviews').first.queryParameters['sort'],
          'helpful',
        );
        expect(find.text("Shop's reply"), findsOneWidget);
        expect(find.text('Salamat po!'), findsOneWidget);
        expect(find.text('Your review'), findsOneWidget);
        expect(find.text('Helpful (2)'), findsOneWidget);

        await tester.tap(find.text('Helpful (2)'));
        await tester.pumpAndSettle();
        expect(sent('PUT', '/reviews/5/helpful'), hasLength(1));
        expect(find.text('Helpful (3)'), findsOneWidget);
        await closeApp(tester);
      },
    );

    testWidgets('fits a small phone with large text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await openApp(tester, {...reviewsPage(), ...signedInToo()}, token: 't');
      tester.view.physicalSize = const Size(720, 1280);
      tester.view.devicePixelRatio = 2;
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text('See all'));
      await tester.tap(find.text('See all'));
      await tester.pumpAndSettle();

      expect(find.text('Item reviews'), findsOneWidget);
      for (var i = 0; i < 4; i++) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -400));
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
      await closeApp(tester);
    });

    testWidgets('Helpful goes back when the server refuses', (tester) async {
      await openApp(tester, {
        ...reviewsPage(),
        ...signedInToo(),
        'PUT /reviews/5/helpful': (_) =>
            jsonBody(404, {'message': 'Review not found.'}),
      }, token: 't');
      push('/buyer/product/1/reviews');
      await tester.pumpAndSettle();

      await tester.tap(find.text('Helpful (2)'));
      await tester.pumpAndSettle();
      expect(find.text('Helpful (2)'), findsOneWidget);
      expect(find.text('Review not found.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('a guest signs in before marking a review helpful', (
      tester,
    ) async {
      await openApp(tester, reviewsPage());
      push('/buyer/product/1/reviews');
      await tester.pumpAndSettle();

      await tester.tap(find.text('Helpful (2)'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(sent('PUT', '/reviews/5/helpful'), isEmpty);
      await closeApp(tester);
    });

    testWidgets('With photos asks for those, and Clear shows them all again', (
      tester,
    ) async {
      await openApp(tester, reviewsPage());
      push('/buyer/product/1/reviews');
      await tester.pumpAndSettle();

      await tester.tap(find.text('With photos (1)'));
      await tester.pumpAndSettle();
      expect(
        sent('GET', '/products/1/reviews').last.queryParameters['with_photos'],
        1,
      );
      expect(find.text('Review number 9.'), findsOneWidget);

      await tester.tap(find.text('Clear'));
      await tester.pumpAndSettle();
      expect(
        sent('GET', '/products/1/reviews').last.queryParameters,
        isNot(contains('with_photos')),
      );
      expect(find.text('Review number 5.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('the (?) explains star ratings and links the guidelines', (
      tester,
    ) async {
      await openApp(tester, reviewsPage());
      push('/buyer/product/1/reviews');
      await tester.pumpAndSettle();

      await tester.tap(find.text('All reviews are from verified purchases'));
      await tester.pumpAndSettle();
      expect(find.text('Guidelines for star rating'), findsOneWidget);

      await tester.tap(find.text('Read the review guidelines'));
      await tester.pumpAndSettle();
      expect(find.text('Review guidelines'), findsOneWidget);
      expect(find.text('Who can review'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Add to cart there comes back to the product and adds it', (
      tester,
    ) async {
      await openApp(tester, {...reviewsPage(), ...signedInToo()}, token: 't');
      push('/buyer/product/1');
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text('See all'));
      await tester.tap(find.text('See all'));
      await tester.pumpAndSettle();
      expect(where(), '/buyer/product/1/reviews');

      await tester.tap(find.widgetWithText(FilledButton, 'Add to cart'));
      await tester.pumpAndSettle();
      expect(where(), '/buyer/product/1');
      expect(sent('POST', '/cart/items'), hasLength(1));
      await closeApp(tester);
    });
  });

  group('write a review', () {
    const pending = PendingReview(
      orderId: 40,
      orderNumber: 'VEL-ABC123',
      productId: 1,
      productName: 'Wireless Earbuds',
      variantLabel: 'Black',
      shopName: 'Maria Audio',
    );

    Future<void> openWriter(WidgetTester tester) async {
      await openApp(tester, {
        ...shopWindow(),
        ...signedInToo(),
        'POST /buyer/reviews': (_) => jsonBody(201, {'data': {}}),
      }, token: 't');
      container
          .read(routerProvider)
          .push('/buyer/reviews/write', extra: pending);
      await tester.pumpAndSettle();
    }

    testWidgets('asks for stars, names them, and posts the rating', (
      tester,
    ) async {
      await openWriter(tester);
      expect(find.text('Rate product'), findsOneWidget);
      expect(find.text('Wireless Earbuds'), findsOneWidget);
      expect(find.text('Add photos'), findsOneWidget);
      expect(find.text('0/5'), findsOneWidget);

      await tester.tap(find.text('Post review'));
      await tester.pumpAndSettle();
      expect(sent('POST', '/buyer/reviews'), isEmpty);

      await tester.tap(find.byTooltip('4 stars'));
      await tester.pumpAndSettle();
      expect(find.text('Good'), findsOneWidget);
      await tester.tap(find.text('Post review'));
      await tester.pumpAndSettle();

      final form = sent('POST', '/buyer/reviews').single.data as FormData;
      expect(Map.fromEntries(form.fields), containsPair('rating', '4'));
      await closeApp(tester);
    });

    testWidgets('fits a small phone with large text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await openWriter(tester);
      tester.view.physicalSize = const Size(720, 1280);
      tester.view.devicePixelRatio = 2;
      await tester.pumpAndSettle();
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -600));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await closeApp(tester);
    });
  });

  group('checkout with an old address', () {
    final old = {
      'id': 3,
      'full_name': 'Ana Santos',
      'phone': '09171234567',
      'address': '12 Rizal St',
      'province': 'Laguna',
      'district': 'Santa Cruz',
      'ward': 'Poblacion',
      'barangay_code': null,
      'is_default': true,
      'address_needs_update': true,
    };
    final refused = {
      'POST /checkout/quote': (_) => jsonBody(422, {
        'message': 'This address needs updating.',
        'errors': {
          'address_id': [
            'This address needs updating: edit it and choose the province, city and barangay again.',
          ],
        },
      }),
    };

    Future<void> openCheckout(WidgetTester tester) async {
      await openApp(tester, {
        ...signedInToo(),
        'GET /categories': (_) => jsonBody(200, {'data': <Object>[]}),
        'GET /products': (_) => jsonBody(200, {
          'data': <Object>[],
          'meta': {'current_page': 1, 'last_page': 1, 'total': 0},
        }),
        'GET /shops': (_) => jsonBody(200, {'data': <Object>[]}),
        'GET /addresses': (_) => jsonBody(200, {
          'data': [old],
        }),
        ...refused,
      }, token: 't');
      push('/buyer/checkout');
      await tester.pumpAndSettle();
    }

    testWidgets('goes straight to the address form', (tester) async {
      await openCheckout(tester);

      expect(where(), '/buyer/addresses/edit');
      expect(
        find.textContaining('Pick the region, city and barangay again'),
        findsOneWidget,
      );
      expect(find.text('Something went wrong'), findsNothing);
      await closeApp(tester);
    });

    testWidgets('coming back unsaved says what to do, not "try again"', (
      tester,
    ) async {
      await openCheckout(tester);
      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(where(), '/buyer/checkout');
      expect(find.text('Update your address to continue'), findsOneWidget);
      expect(find.text('Something went wrong'), findsNothing);
      expect(find.text('Try again'), findsNothing);
      expect(find.text('Ana Santos'), findsOneWidget);

      // It doesn't keep sending them away, but the button still goes.
      await tester.tap(find.text('Update this address'));
      await tester.pumpAndSettle();
      expect(where(), '/buyer/addresses/edit');
      await closeApp(tester);
    });
  });

  group('who goes where', () {
    test(
      'a guest may see the shop window, and is asked to sign in for the rest',
      () {
        for (final open in [
          '/buyer',
          '/buyer/categories',
          '/buyer/search',
          '/buyer/product/1',
          '/buyer/product/1/reviews',
          '/sign-in',
        ]) {
          expect(redirectFor(const SignedOut(), open), isNull, reason: open);
        }
        for (final own in [
          '/buyer/cart',
          '/buyer/account',
          '/buyer/orders',
          '/buyer/checkout',
          '/buyer/shop/maria-audio',
        ]) {
          expect(
            redirectFor(const SignedOut(), own),
            '/sign-in?next=${Uri.encodeComponent(own)}',
            reason: own,
          );
        }
      },
    );

    test('opening or leaving another home lands on the shop', () {
      expect(redirectFor(const SignedOut(), '/launch'), '/buyer');
      expect(redirectFor(const SignedOut(), '/rider'), '/buyer');
      expect(redirectFor(const SignedOut(), '/logistics/hub'), '/buyer');
    });
  });
}
