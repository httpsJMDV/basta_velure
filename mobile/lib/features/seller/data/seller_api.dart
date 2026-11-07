import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/media/photo_picker.dart';
import 'seller_models.dart';

final sellerApiProvider = Provider<SellerApi>(
  (ref) => SellerApi(ref.watch(dioProvider)),
);

/// The Seller Centre's calls: the same `/seller/*` endpoints as the website. Each throws an [ApiFailure] ready to
/// show; the server checks every action again.
class SellerApi {
  SellerApi(this._dio);

  final Dio _dio;

  Future<Json> _call(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
  }) async {
    try {
      return asJson(
        (await _dio.request<Object?>(
          path,
          data: data,
          queryParameters: query,
          options: Options(method: method),
        )).data,
      );
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  String _message(Json body, String fallback) =>
      asString(body['message']) ?? fallback;

  // Dashboard ------------------------------------------------------------------------------------------------------

  Future<SellerStats> stats() async => SellerStats.fromJson(
    asJson((await _call('GET', '/seller/dashboard/stats'))['data']),
  );

  Future<List<SellerAttention>> attention() async => [
    for (final a in asJsonList(
      (await _call('GET', '/seller/dashboard/attention'))['data'],
    ))
      (
        type: asString(a['type']) ?? '',
        label: asString(a['label']) ?? '',
        sub: asString(a['sub']) ?? '',
      ),
  ];

  // Orders ---------------------------------------------------------------------------------------------------------

  /// One page of a tab, and the count of every tab.
  Future<(ApiPage<SellerOrder>, Map<String, int>)> orders(
    SellerOrderTab tab, {
    int page = 1,
    String? search,
  }) async {
    final body = await _call(
      'GET',
      '/seller/orders',
      query: {
        'tab': tab.key,
        'page': page,
        'per_page': 20,
        if (search != null && search.isNotEmpty) 'search': search,
      },
    );
    final counts = asJson(body['counts']);
    return (
      ApiPage.from(body, SellerOrder.fromJson),
      {for (final t in SellerOrderTab.values) t.key: asInt(counts[t.key])},
    );
  }

  Future<SellerOrder> order(int id) async => SellerOrder.fromJson(
    asJson((await _call('GET', '/seller/orders/$id'))['data']),
  );

  Future<(String, SellerOrder)> _orderAction(
    String method,
    String path, {
    Object? data,
    required String fallback,
  }) async {
    final body = await _call(method, path, data: data);
    return (
      _message(body, fallback),
      SellerOrder.fromJson(asJson(body['data'])),
    );
  }

  /// `CONFIRMED`, `PREPARING` or `READY_FOR_PICKUP` (with an optional pickup time).
  Future<(String, SellerOrder)> setStatus(
    int id,
    String status, {
    String? pickupDate,
    String? pickupWindow,
  }) => _orderAction(
    'PATCH',
    '/seller/orders/$id/status',
    fallback: 'Order updated.',
    data: {
      'status': status,
      'pickup_date': ?pickupDate,
      'pickup_window': ?pickupWindow,
    },
  );

  /// Change when the rider comes, until the rider has the parcel; both null for as soon as possible.
  Future<(String, SellerOrder)> setPickupSlot(
    int id, {
    String? date,
    String? window,
  }) => _orderAction(
    'PATCH',
    '/seller/orders/$id/pickup-slot',
    fallback: 'Pickup time saved.',
    data: {'pickup_date': ?date, 'pickup_window': ?window},
  );

  Future<(String, SellerOrder)> confirmPayment(int id) => _orderAction(
    'POST',
    '/seller/orders/$id/confirm-payment',
    fallback: 'Payment confirmed.',
  );

  Future<(String, SellerOrder)> rejectPayment(int id, String reason) =>
      _orderAction(
        'POST',
        '/seller/orders/$id/reject-payment',
        fallback: 'Payment rejected.',
        data: {'reason': reason},
      );

  Future<(String, SellerOrder)> cancel(
    int id,
    String reason, {
    String? details,
  }) => _orderAction(
    'POST',
    '/seller/orders/$id/cancel',
    fallback: 'Order cancelled.',
    data: {'reason': reason, 'details': ?details},
  );

  /// Approve (a rider brings the item back unless [returnItem] is false) or reject with a reason.
  Future<(String, SellerOrder)> respondReturn(
    int id, {
    required bool approve,
    String? reason,
    bool returnItem = true,
  }) => _orderAction(
    'POST',
    '/seller/orders/$id/respond-return',
    fallback: 'Answer sent.',
    data: {
      'action': approve ? 'approve' : 'reject',
      'reason': ?reason,
      if (approve) 'return_item': returnItem,
    },
  );

  Future<String> returnPickupReceived(int id) async => _message(
    await _call('POST', '/seller/orders/$id/return-pickup/received'),
    'Thanks. The return is complete.',
  );

  Future<String> sendRefund(
    int id, {
    required String reference,
    required PickedPhoto receipt,
  }) async => _message(
    await _call(
      'POST',
      '/seller/orders/$id/refund/sent',
      data: FormData.fromMap({
        'reference': reference,
        'receipt': receipt.toMultipart(),
      }),
    ),
    'Refund marked sent.',
  );

  // Products -------------------------------------------------------------------------------------------------------

  Future<List<SellerProduct>> products() async =>
      asJsonList((await _call('GET', '/seller/products'))['data'])
          .map(SellerProduct.fromJson)
          .toList();

  Future<SellerProduct> setStock(
    int productId,
    int variantId,
    int stock,
  ) async => SellerProduct.fromJson(
    asJson(
      (await _call(
        'PATCH',
        '/seller/products/$productId/stock',
        data: {'variant_id': variantId, 'stock': stock},
      ))['data'],
    ),
  );

  Future<SellerProduct> setPrice(
    int productId,
    int variantId,
    double price,
  ) async => SellerProduct.fromJson(
    asJson(
      (await _call(
        'PATCH',
        '/seller/products/$productId/price',
        data: {'variant_id': variantId, 'price': price},
      ))['data'],
    ),
  );

  /// `active` to show it in the shop, `archived` to hide it.
  Future<String> setProductStatus(int productId, String status) async =>
      _message(
        await _call(
          'PATCH',
          '/seller/products/$productId/status',
          data: {'status': status},
        ),
        'Saved.',
      );
}
