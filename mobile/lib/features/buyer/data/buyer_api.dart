import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/session/session.dart';
import 'account.dart';
import 'catalog.dart';
import 'checkout.dart';
import 'orders.dart';

final buyerApiProvider = Provider<BuyerApi>(
  (ref) => BuyerApi(ref.watch(dioProvider)),
);

/// Every buyer endpoint the app calls (Part B). Each method returns the server's data as a model, or throws an
/// [ApiFailure] ready to show. The app sends ids and what the person typed; prices and totals come back from the
/// server.
class BuyerApi {
  BuyerApi(this._dio);

  final Dio _dio;

  Future<T> _run<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  Future<Json> _get(String path, {Map<String, dynamic>? query}) => _run(
    () async =>
        asJson((await _dio.get<Object?>(path, queryParameters: query)).data),
  );

  Future<Json> _send(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? headers,
    ProgressCallback? onSendProgress,
  }) => _run(
    () async => asJson(
      (await _dio.request<Object?>(
        path,
        data: data,
        options: Options(method: method, headers: headers),
        onSendProgress: onSendProgress,
      )).data,
    ),
  );

  // Catalog ------------------------------------------------------------------

  Future<List<Category>> categories() async =>
      asJsonList((await _get('/categories'))['data'])
          .map(Category.fromJson)
          .toList();

  Future<List<FeaturedShop>> featuredShops({int limit = 8}) async =>
      asJsonList((await _get('/shops', query: {'limit': limit}))['data'])
          .map(FeaturedShop.fromJson)
          .toList();

  /// `GET /products` with the website's filters. [sort]: `best_match`, `trending`, `newest`, `best_selling`,
  /// `price_asc`, `price_desc` or `highest_rated`.
  Future<ApiPage<ProductSummary>> products({
    int page = 1,
    int perPage = 20,
    String? q,
    Object? categoryId,
    Object? parentCategoryId,
    String? sort,
    String? minPrice,
    String? maxPrice,
    int? minRating,
    bool onSale = false,
    bool newArrivals = false,
    int? sellerId,
    int? seed,
  }) async {
    final body = await _get(
      '/products',
      query: {
        'page': page,
        'per_page': perPage,
        'q': ?q,
        'category_id': ?categoryId,
        'parent_category_id': ?parentCategoryId,
        'sort': ?sort,
        'min_price': ?minPrice,
        'max_price': ?maxPrice,
        'min_rating': ?minRating,
        if (onSale) 'on_sale': 1,
        if (newArrivals) 'new_arrivals': 1,
        if (sellerId != null) 'seller_ids': '$sellerId',
        'seed': ?seed,
      },
    );
    return ApiPage.from(body, ProductSummary.fromJson);
  }

  Future<ProductDetail> product(int id) async =>
      ProductDetail.fromJson(asJson((await _get('/products/$id'))['data']));

  Future<List<ProductSummary>> related(int id) async =>
      asJsonList((await _get('/products/$id/related'))['data'])
          .map(ProductSummary.fromJson)
          .toList();

  Future<ApiPage<ProductReview>> productReviews(int id, {int page = 1}) async =>
      ApiPage.from(
        await _get('/products/$id/reviews', query: {'page': page}),
        ProductReview.fromJson,
      );

  Future<List<Voucher>> productVouchers(int id) async =>
      asJsonList((await _get('/products/$id/vouchers'))['data'])
          .map(Voucher.fromJson)
          .toList();

  /// Returns whether the product is on the wishlist now.
  Future<bool> toggleWishlist(int productId) async => asBool(
    (await _send(
      'POST',
      '/wishlist/toggle',
      data: {'product_id': productId},
    ))['wishlisted'],
  );

  // Shops --------------------------------------------------------------------

  Future<ShopProfile> shop(String shopKey) async =>
      ShopProfile.fromJson(asJson((await _get('/shops/$shopKey'))['data']));

  Future<List<Voucher>> shopVouchers(int sellerId) async =>
      asJsonList((await _get('/shops/$sellerId/vouchers'))['data'])
          .map(Voucher.fromJson)
          .toList();

  Future<ApiPage<ProductReview>> shopReviews(
    String shopKey, {
    int page = 1,
  }) async => ApiPage.from(
    await _get('/shops/$shopKey/reviews', query: {'page': page}),
    ProductReview.fromJson,
  );

  Future<ApiPage<ShopComment>> shopComments(
    String shopKey, {
    int page = 1,
  }) async => ApiPage.from(
    await _get('/shops/$shopKey/shop-reviews', query: {'page': page}),
    ShopComment.fromJson,
  );

  Future<MyShopComment> myShopComment(String shopKey) async =>
      MyShopComment.fromJson(
        asJson((await _get('/shops/$shopKey/my-shop-review'))['data']),
      );

  /// Writes the buyer's comment, or edits it when [editing].
  Future<void> saveShopComment(
    String shopKey, {
    required String comment,
    required List<String> tags,
    required bool editing,
  }) => _send(
    editing ? 'PATCH' : 'POST',
    '/shops/$shopKey/my-shop-review',
    data: {'comment': comment, 'tags': tags},
  );

  /// Returns whether the buyer follows the shop now.
  Future<bool> toggleFollow(int sellerId) async => asBool(
    (await _send(
      'POST',
      '/store-follows/toggle',
      data: {'seller_id': sellerId},
    ))['following'],
  );

  // Checkout -----------------------------------------------------------------

  Future<CheckoutQuote> quote(
    CheckoutRequest request, {
    int? addressId,
    Map<int, String> storeVouchers = const {},
    String? platformVoucher,
    String? shippingVoucher,
  }) async => CheckoutQuote.fromJson(
    asJson(
      (await _send(
        'POST',
        '/checkout/quote',
        data: {
          ...request.toJson(),
          'address_id': ?addressId,
          'vouchers': _vouchers(
            storeVouchers,
            platformVoucher,
            shippingVoucher,
          ),
        },
      ))['data'],
    ),
  );

  Future<List<ShopGcash>> checkoutShops(List<int> sellerIds) async =>
      asJsonList(
        (await _get(
          '/checkout/shops',
          query: {'seller_ids': sellerIds.join(',')},
        ))['data'],
      ).map(ShopGcash.fromJson).toList();

  /// `POST /checkout/place-order` with an `Idempotency-Key`: the same key on a retry never makes a second order.
  /// For GCash, [gcashReferences] and [gcashProofs] are keyed by seller id. Returns the server's message.
  Future<String> placeOrder(
    CheckoutRequest request, {
    required String idempotencyKey,
    required String paymentMethod,
    required int addressId,
    required num expectedTotal,
    Map<int, String> storeVouchers = const {},
    String? platformVoucher,
    String? shippingVoucher,
    Map<int, String> gcashReferences = const {},
    Map<int, PickedPhoto> gcashProofs = const {},
    ProgressCallback? onSendProgress,
  }) async {
    final fields = <String, dynamic>{
      ...request.toJson(),
      'payment_method': paymentMethod,
      'address_id': addressId,
      'expected_total': expectedTotal,
      'vouchers': _vouchers(storeVouchers, platformVoucher, shippingVoucher),
    };
    final Object data;
    if (paymentMethod == 'gcash') {
      final form = FormData();
      _flatten(fields, '', form);
      gcashReferences.forEach(
        (sellerId, reference) =>
            form.fields.add(MapEntry('gcash[$sellerId][reference]', reference)),
      );
      gcashProofs.forEach(
        (sellerId, photo) => form.files.add(
          MapEntry('gcash_proof[$sellerId]', photo.toMultipart()),
        ),
      );
      data = form;
    } else {
      data = fields;
    }
    final body = await _send(
      'POST',
      '/checkout/place-order',
      data: data,
      headers: {'Idempotency-Key': idempotencyKey},
      onSendProgress: onSendProgress,
    );
    return asString(body['message']) ?? 'Order placed successfully!';
  }

  static Json _vouchers(
    Map<int, String> store,
    String? platform,
    String? shipping,
  ) => {
    'store': {for (final e in store.entries) '${e.key}': e.value},
    'platform': platform,
    'shipping': shipping,
  };

  /// Laravel reads `items[0][variant_id]` and `vouchers[store][12]` from a multipart form.
  static void _flatten(Object? value, String prefix, FormData form) {
    if (value is Map) {
      value.forEach(
        (key, child) =>
            _flatten(child, prefix.isEmpty ? '$key' : '$prefix[$key]', form),
      );
    } else if (value is List) {
      for (var i = 0; i < value.length; i++) {
        _flatten(value[i], '$prefix[$i]', form);
      }
    } else if (value != null) {
      form.fields.add(MapEntry(prefix, '$value'));
    }
  }

  // Orders -------------------------------------------------------------------

  /// One tab of orders. The tab counts ride along in `meta['counts']`.
  Future<ApiPage<Order>> orders(OrderTab tab, {int page = 1}) async {
    final body = await _get(
      '/buyer/orders',
      query: {'tab': tab.key, 'page': page, 'per_page': 10},
    );
    final orders = ApiPage.from(body, Order.fromJson);
    return ApiPage(
      items: orders.items,
      currentPage: orders.currentPage,
      lastPage: orders.lastPage,
      total: orders.total,
      meta: {...orders.meta, 'counts': body['counts']},
    );
  }

  /// How many orders are in each tab, keyed by [OrderTab.key].
  Future<Map<String, int>> orderCounts() async {
    final body = await _get(
      '/buyer/orders',
      query: {'tab': OrderTab.toPay.key, 'per_page': 5},
    );
    return asJson(body['counts'])
        .map((key, value) => MapEntry(key, asInt(value)));
  }

  Future<Order> order(int id) async =>
      Order.fromJson(asJson((await _get('/buyer/orders/$id'))['data']));

  Future<String> cancelOrder(int id, String reason, String? details) async =>
      asString(
        (await _send(
          'POST',
          '/buyer/orders/$id/cancel',
          data: {'reason': reason, 'details': details},
        ))['message'],
      ) ??
      'Order cancelled.';

  Future<String> confirmReceipt(int id) async =>
      asString(
        (await _send('POST', '/buyer/orders/$id/confirm-receipt'))['message'],
      ) ??
      'Thanks! The order is complete.';

  Future<String> requestReturn(
    int id, {
    required String reason,
    required String description,
    required List<PickedPhoto> photos,
    ProgressCallback? onSendProgress,
  }) async {
    final form = FormData.fromMap({
      'reason': reason,
      'description': description,
    });
    for (final photo in photos) {
      form.files.add(MapEntry('photos[]', photo.toMultipart()));
    }
    final body = await _send(
      'POST',
      '/buyer/orders/$id/request-return',
      data: form,
      onSendProgress: onSendProgress,
    );
    return asString(body['message']) ?? 'Return requested.';
  }

  Future<String> escalateReturn(int id) async =>
      asString(
        (await _send('POST', '/buyer/orders/$id/escalate-return'))['message'],
      ) ??
      'Sent to Loved-IT for review.';

  Future<ParcelTracking> tracking(String trackingNumber) async =>
      ParcelTracking.fromJson(
        asJson(
          (await _get(
            '/parcels/${Uri.encodeComponent(trackingNumber)}/tracking',
          ))['data'],
        ),
      );

  /// The rider's delivery photo. Private: kept in memory only, never saved on the phone.
  Future<List<int>> deliveryProof(String trackingNumber, {int photo = 1}) =>
      _run(() async {
        final response = await _dio.get<List<int>>(
          '/parcels/${Uri.encodeComponent(trackingNumber)}/delivery-proof',
          queryParameters: {if (photo == 2) 'photo': 2},
          options: Options(responseType: ResponseType.bytes),
        );
        return response.data ?? const [];
      });

  /// Opens (or reopens) the chat with the rider bringing the parcel. Returns the conversation id.
  Future<int> startRiderChat(String trackingNumber) async => asInt(
    asJson(
      (await _send(
        'POST',
        '/parcels/${Uri.encodeComponent(trackingNumber)}/rider-chat',
      ))['data'],
    )['id'],
  );

  // Reviews ------------------------------------------------------------------

  Future<List<PendingReview>> pendingReviews() async =>
      asJsonList((await _get('/buyer/reviews/pending'))['data'])
          .map(PendingReview.fromJson)
          .toList();

  Future<List<MyReview>> myReviews() async =>
      asJsonList((await _get('/buyer/reviews'))['data'])
          .map(MyReview.fromJson)
          .toList();

  Future<void> writeReview({
    required int orderId,
    required int productId,
    required int rating,
    required String comment,
    required List<PickedPhoto> photos,
    ProgressCallback? onSendProgress,
  }) async {
    final form = FormData.fromMap({
      'order_id': orderId,
      'product_id': productId,
      'rating': rating,
      if (comment.isNotEmpty) 'comment': comment,
    });
    for (final photo in photos) {
      form.files.add(MapEntry('photos[]', photo.toMultipart()));
    }
    await _send(
      'POST',
      '/buyer/reviews',
      data: form,
      onSendProgress: onSendProgress,
    );
  }

  Future<void> editReview(
    int id, {
    required int rating,
    required String comment,
  }) => _send(
    'PATCH',
    '/buyer/reviews/$id',
    data: {'rating': rating, 'comment': comment},
  );

  // Messages -----------------------------------------------------------------

  Future<List<Conversation>> conversations() async =>
      asJsonList((await _get('/conversations'))['data'])
          .map(Conversation.fromJson)
          .toList();

  Future<int> unreadMessages() async => asInt(
    asJson((await _get('/conversations/unread-count'))['data'])['unread_count'],
  );

  Future<Conversation> conversation(int id) async =>
      Conversation.fromJson(asJson((await _get('/conversations/$id'))['data']));

  /// Opens the chat with a shop, or Loved-IT Support when [sellerId] is null. Returns the conversation id.
  Future<int> startChat({int? sellerId, int? productId, int? orderId}) async =>
      asInt(
        asJson(
          (await _send(
            'POST',
            '/conversations/start',
            data: {
              'type': sellerId == null ? 'buyer_admin' : 'buyer_seller',
              'seller_id': ?sellerId,
              'product_id': ?productId,
              'order_id': ?orderId,
            },
          ))['data'],
        )['id'],
      );

  /// The messages, oldest first, and whether the buyer may still send (`meta.can_send`). Fetching marks them read.
  Future<(List<ChatMessage>, Json)> messages(int conversationId) async {
    final body = await _get('/conversations/$conversationId/messages');
    return (
      asJsonList(body['data']).map(ChatMessage.fromJson).toList(),
      asJson(body['meta']),
    );
  }

  Future<ChatMessage> sendMessage(
    int conversationId, {
    String? body,
    String? attachmentType,
    Json? attachment,
    PickedPhoto? image,
  }) async {
    final Object data = image == null
        ? {
            'body': ?body,
            'attachment_type': ?attachmentType,
            'attachment_data': ?attachment,
          }
        : FormData.fromMap({
            'body': ?body,
            'attachment_type': 'image',
            'image': image.toMultipart(),
          });
    return ChatMessage.fromJson(
      asJson(
        (await _send(
          'POST',
          '/conversations/$conversationId/messages',
          data: data,
        ))['data'],
      ),
    );
  }

  Future<List<Json>> attachable(int conversationId, String kind) async =>
      asJsonList(
        (await _get('/conversations/$conversationId/attachable-$kind'))['data'],
      );

  Future<void> handoffToPerson(int conversationId) =>
      _send('POST', '/conversations/$conversationId/handoff');

  Future<void> backToAssistant(int conversationId) =>
      _send('POST', '/conversations/$conversationId/assistant');

  // Notifications ------------------------------------------------------------

  Future<ApiPage<AppNotification>> notifications({int page = 1}) async =>
      ApiPage.from(
        await _get('/notifications', query: {'page': page}),
        AppNotification.fromJson,
      );

  Future<int> unreadNotifications() async => asInt(
    asJson((await _get('/notifications/unread-count'))['data'])['unread'],
  );

  Future<void> markNotificationRead(String id) =>
      _send('POST', '/notifications/$id/read');

  Future<void> markAllNotificationsRead() =>
      _send('POST', '/notifications/read-all');

  // Account ------------------------------------------------------------------

  Future<List<Address>> addresses() async =>
      asJsonList((await _get('/addresses'))['data'])
          .map(Address.fromJson)
          .toList();

  Future<Address> saveAddress(Json fields, {int? id}) async => Address.fromJson(
    asJson(
      (await _send(
        id == null ? 'POST' : 'PATCH',
        id == null ? '/addresses' : '/addresses/$id',
        data: fields,
      ))['data'],
    ),
  );

  Future<void> deleteAddress(int id) => _send('DELETE', '/addresses/$id');

  Future<void> makeDefaultAddress(int id) =>
      _send('PATCH', '/addresses/$id/default');

  Future<IdVerification> idVerification() async => IdVerification.fromJson(
    asJson((await _get('/account/id-verification'))['data']),
  );

  Future<void> submitId({
    required GovernmentId type,
    required PickedPhoto front,
    PickedPhoto? back,
    ProgressCallback? onSendProgress,
  }) => _send(
    'POST',
    '/account/id-verification',
    data: FormData.fromMap({
      'government_id_type': type.key,
      'government_id_image': front.toMultipart(),
      if (back != null) 'government_id_image_back': back.toMultipart(),
    }),
    onSendProgress: onSendProgress,
  );

  Future<ApiPage<WishlistEntry>> wishlist({int page = 1}) async => ApiPage.from(
    await _get('/wishlist', query: {'page': page}),
    WishlistEntry.fromJson,
  );

  Future<ApiPage<FollowedShop>> followedShops({int page = 1}) async =>
      ApiPage.from(
        await _get('/store-follows', query: {'page': page}),
        FollowedShop.fromJson,
      );

  Future<List<Voucher>> myVouchers() async =>
      asJsonList((await _get('/buyer/vouchers'))['data'])
          .map(Voucher.fromJson)
          .toList();

  Future<List<Voucher>> platformVouchers() async =>
      asJsonList((await _get('/vouchers/platform'))['data'])
          .map(Voucher.fromJson)
          .toList();

  /// Saves a voucher to the wallet by id (from a list) or by the code the buyer typed. Returns the message.
  Future<String> claimVoucher({int? id, String? code}) async =>
      asString(
        (await _send(
          'POST',
          '/buyer/vouchers/claim',
          data: {'voucher_id': ?id, 'code': ?code},
        ))['message'],
      ) ??
      'Voucher saved.';

  Future<String> sendFeedback(String message) async =>
      asString(
        (await _send(
          'POST',
          '/feedback',
          data: {'message': message, 'page_url': 'app://loved-it/account'},
        ))['message'],
      ) ??
      'Thanks for your feedback!';

  Future<Json> policies() async =>
      asJson((await _get('/platform/policies'))['data']);
}

// Shared data the screens watch -------------------------------------------------

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(buyerApiProvider).categories(),
);

final featuredShopsProvider = FutureProvider.autoDispose<List<FeaturedShop>>(
  (ref) => ref.watch(buyerApiProvider).featuredShops(),
);

final productProvider = FutureProvider.autoDispose.family<ProductDetail, int>(
  (ref, id) => ref.watch(buyerApiProvider).product(id),
);

final addressesProvider = FutureProvider.autoDispose<List<Address>>((ref) {
  ref.watch(currentUserProvider.select((user) => user?.id));
  return ref.watch(buyerApiProvider).addresses();
});

final idVerificationProvider = FutureProvider.autoDispose<IdVerification>((
  ref,
) {
  ref.watch(currentUserProvider.select((user) => user?.id));
  return ref.watch(buyerApiProvider).idVerification();
});
