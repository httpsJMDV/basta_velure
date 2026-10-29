import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_client.dart';
import 'package:loved_it/core/api/api_failure.dart';
import 'package:loved_it/core/api/json.dart';
import 'package:loved_it/core/format.dart';
import 'package:loved_it/core/media/photo_picker.dart';
import 'package:loved_it/features/buyer/data/buyer_api.dart';
import 'package:loved_it/features/buyer/data/cart.dart';
import 'package:loved_it/features/buyer/data/catalog.dart';
import 'package:loved_it/features/buyer/data/checkout.dart';
import 'package:loved_it/features/buyer/data/orders.dart';

import 'support/fakes.dart';

/// Part B: the buyer app's formatting, how it reads the API, and what checkout sends.
void main() {
  group('Fmt', () {
    test('sold counts read like the website', () {
      expect(Fmt.sold(0), isNull);
      expect(Fmt.sold(950), '950 sold');
      expect(Fmt.sold(1200), '1.2K sold');
      expect(Fmt.sold(1000), '1K sold');
      expect(Fmt.sold(15400), '15K sold');
    });

    test('sale percentage', () {
      expect(Fmt.discountPercent(80, 100), 20);
      expect(Fmt.discountPercent(100, null), 0);
      expect(Fmt.discountPercent(100, 90), 0);
    });

    test('dates are Philippine dates whatever the phone says', () {
      // 17:30 UTC is 1:30 AM the next day in Manila.
      expect(Fmt.date(DateTime.utc(2026, 10, 28, 17, 30)), 'Oct 29, 2026');
    });

    test('countdown', () {
      final now = DateTime(2026, 10, 29, 10);
      expect(
        Fmt.countdown(
          now.add(const Duration(hours: 1, minutes: 2, seconds: 3)),
          now: now,
        ),
        '01:02:03',
      );
      expect(
        Fmt.countdown(now.add(const Duration(days: 2, hours: 4)), now: now),
        '2d 04:00:00',
      );
      expect(
        Fmt.countdown(now.subtract(const Duration(seconds: 1)), now: now),
        'Ended',
      );
    });
  });

  group('reading the API', () {
    test(
      'an order adds up its discounts and finds its shop from the items',
      () {
        final order = Order.fromJson({
          'id': 9,
          'order_number': 'VEL-P2VQ-261027140302',
          'tracking_number': 'LIT-261027-8F4VD3',
          'status': 'SORTED',
          'payment_method': 'cod',
          'payment_status': 'pending',
          'subtotal': 320,
          'promo_discount': '10.00',
          'store_voucher_discount': 5,
          'platform_voucher_discount': 0,
          'shipping_voucher_discount': 0,
          'shipping_fee': 50,
          'total': '355.00',
          'shipping_address': '21 Narra Avenue',
          'shipping_barangay': 'Anibong',
          'shipping_city': 'Pagsanjan',
          'shipping_province': 'Laguna',
          'items': [
            {
              'id': 12,
              'seller_id': 24,
              'shop_name': 'Liza Pantry & Home',
              'product_name': 'Basket',
              'quantity': 1,
            },
          ],
        });
        expect(order.status, OrderStatus.sorted);
        expect(order.status.label, 'Sorted for Dispatch');
        expect(order.discount, 15);
        expect(order.total, 355);
        expect(order.shopName, 'Liza Pantry & Home');
        expect(order.sellerId, 24);
        expect(
          order.shippingAddress,
          '21 Narra Avenue, Anibong, Pagsanjan, Laguna',
        );
        expect(order.canTrack, isTrue);
        expect(order.canConfirmReceipt, isFalse);
      },
    );

    test('an unknown status never crashes the list', () {
      expect(OrderStatus.from('SOMETHING_NEW'), OrderStatus.placed);
      expect(OrderStatus.from('delivered'), OrderStatus.delivered);
    });

    test('the quantity can go up to the stock and what is left of the purchase limit', () {
      ProductDetail product({int? limit, int bought = 0}) =>
          ProductDetail.fromJson({
            'id': 1,
            'name': 'Earbuds',
            'base_price': 899,
            'total_stock': 69,
            'purchase_limit': limit,
            'purchased_by_you': bought,
            'seller': {'id': 23, 'shop_name': 'Marco Gadgets'},
            'combinations': [
              {
                'variant_id': 51,
                'label': 'Standard',
                'parts': ['Standard'],
                'stock_quantity': 69,
                'price': 899,
              },
            ],
          });
      final noLimit = product();
      expect(noLimit.maxFor(noLimit.options.single), 69);
      final limited = product(limit: 3, bought: 1);
      expect(limited.maxFor(limited.options.single), 2);
      final used = product(limit: 3, bought: 3);
      expect(used.maxFor(used.options.single), 0);
    });

    test('sold-out, hidden and away cart lines cannot be selected', () {
      CartLine line(String status) => CartLine.fromJson({
        'id': 1,
        'variant_id': 2,
        'product_id': 3,
        'name': 'x',
        'status': status,
      });
      expect(line('sold_out').blocked, isTrue);
      expect(line('unavailable').blocked, isTrue);
      expect(line('on_vacation').blocked, isTrue);
      expect(line('insufficient_stock').blocked, isFalse);
      expect(line('available').blocked, isFalse);
    });

    test('GCash only when every shop in the checkout has it', () {
      CheckoutQuote quote(List<bool> gcash) => CheckoutQuote.fromJson({
        'stores': [
          for (final (i, accepts) in gcash.indexed)
            {
              'seller': {
                'id': i + 1,
                'shop_name': 'Shop $i',
                'accepts_gcash': accepts,
              },
              'shipping': {'fee': 50, 'serviceable': true},
            },
        ],
        'totals': {'total': 100},
        'can_place': true,
      });
      expect(quote([true, true]).gcashPossible, isTrue);
      expect(quote([true, false]).gcashPossible, isFalse);
      expect(quote([]).gcashPossible, isFalse);
    });

    test('a paginated list knows when there is more', () {
      final page = ApiPage.from({
        'data': [
          {'id': 1, 'name': 'A', 'base_price': 10},
        ],
        'meta': {'current_page': 1, 'last_page': 3, 'total': 25},
      }, ProductSummary.fromJson);
      expect(page.items.single.name, 'A');
      expect(page.hasMore, isTrue);
      expect(page.total, 25);
    });
  });

  group('checkout sends', () {
    late FakeApi api;
    late BuyerApi buyer;
    final placed = <String, dynamic>{
      'message': 'Order placed successfully!',
      'repeated': false,
      'orders': [],
    };

    setUp(() {
      api = FakeApi({
        'POST /checkout/place-order': (_) => jsonBody(201, placed),
        'POST /checkout/quote': (_) => jsonBody(200, {
          'data': {'stores': [], 'totals': {}},
        }),
      });
      final dio = buildApiClient(
        tokenStore: MemoryTokenStore('t'),
        onSessionEnded: (_) {},
      );
      dio.httpClientAdapter = api;
      buyer = BuyerApi(dio);
    });

    test(
      'ids, quantities, the address and voucher codes, never prices',
      () async {
        await buyer.quote(
          const CheckoutRequest.buyNow(51, 2),
          addressId: 19,
          storeVouchers: {23: 'SHOP10'},
        );
        final body = api.requests.single.data as Map<String, dynamic>;
        expect(body['source'], 'buy_now');
        expect(body['items'], [
          {'variant_id': 51, 'quantity': 2},
        ]);
        expect(body['address_id'], 19);
        expect(body['vouchers'], {
          'store': {'23': 'SHOP10'},
          'platform': null,
          'shipping': null,
        });
        expect(jsonEncode(body), isNot(contains('price')));
      },
    );

    test('an Idempotency-Key, the same one on a retry', () async {
      for (var i = 0; i < 2; i++) {
        await buyer.placeOrder(
          const CheckoutRequest.cart(),
          idempotencyKey: 'key-1',
          paymentMethod: 'cod',
          addressId: 19,
          expectedTotal: 370,
        );
      }
      expect(api.requests.map((r) => r.headers['Idempotency-Key']), [
        'key-1',
        'key-1',
      ]);
      final body = api.requests.first.data as Map<String, dynamic>;
      expect(body['payment_method'], 'cod');
      expect(body['source'], 'cart');
    });

    test(
      "GCash sends each shop's reference and receipt as the server names them",
      () async {
        await buyer.placeOrder(
          const CheckoutRequest.cart(),
          idempotencyKey: 'key-2',
          paymentMethod: 'gcash',
          addressId: 19,
          expectedTotal: 370,
          gcashReferences: {23: '1234567890123'},
          gcashProofs: {
            23: const PickedPhoto(bytes: [1, 2, 3], filename: 'receipt.jpg'),
          },
        );
        final form = api.requests.single.data as FormData;
        final fields = Map.fromEntries(form.fields);
        expect(fields['gcash[23][reference]'], '1234567890123');
        expect(fields['payment_method'], 'gcash');
        expect(fields['address_id'], '19');
        expect(fields['source'], 'cart');
        expect(form.files.single.key, 'gcash_proof[23]');
      },
    );

    test('a 403 id_not_verified comes back as its own kind', () async {
      api.routes['POST /checkout/place-order'] = (_) => jsonBody(403, {
        'code': 'id_not_verified',
        'message': 'Verify your ID first.',
      });
      await expectLater(
        buyer.placeOrder(
          const CheckoutRequest.cart(),
          idempotencyKey: 'k',
          paymentMethod: 'cod',
          addressId: 1,
          expectedTotal: 1,
        ),
        throwsA(
          isA<ApiFailure>().having(
            (f) => f.kind,
            'kind',
            FailureKind.idNotVerified,
          ),
        ),
      );
    });
  });
}
