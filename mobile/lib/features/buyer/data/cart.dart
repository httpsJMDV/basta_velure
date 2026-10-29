import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/session/session.dart';

/// One cart line (`GET /cart`). Prices are the server's: the app never works them out.
class CartLine {
  const CartLine({
    required this.id,
    required this.variantId,
    required this.productId,
    required this.name,
    required this.quantity,
    required this.selected,
    required this.status,
    required this.maxQuantity,
    required this.unitPrice,
    required this.regularPrice,
    required this.subtotal,
    this.variantLabel,
    this.imageUrl,
    this.message,
    this.priceChanged,
  });

  final int id;
  final int variantId;
  final int productId;
  final String name;
  final String? variantLabel;
  final String? imageUrl;
  final int quantity;
  final bool selected;

  /// `available`, `sold_out`, `unavailable`, `on_vacation`, `insufficient_stock` or `limit_exceeded`.
  final String status;

  /// The server's note for a line that can't be bought as it is ("Only 2 left").
  final String? message;

  /// The most this buyer may order now, after stock and the purchase limit.
  final int maxQuantity;
  final num unitPrice;
  final num regularPrice;
  final num subtotal;

  /// `up` or `down` when the price moved since it was added.
  final String? priceChanged;

  /// Sold out, hidden or on vacation: shown, but can't be selected (B6).
  bool get blocked =>
      status == 'sold_out' ||
      status == 'unavailable' ||
      status == 'on_vacation';

  factory CartLine.fromJson(Json json) => CartLine(
    id: asInt(json['id']),
    variantId: asInt(json['variant_id']),
    productId: asInt(json['product_id']),
    name: asString(json['name']) ?? 'Product',
    variantLabel: asString(json['variant_label']),
    imageUrl: asString(json['image_url']),
    quantity: asInt(json['quantity'], 1),
    selected: asBool(json['selected']),
    status: asString(json['status']) ?? 'available',
    message: asString(json['message']),
    maxQuantity: asInt(json['max_quantity'], 1),
    unitPrice: asDouble(json['unit_price']),
    regularPrice: asDouble(json['regular_price']),
    subtotal: asDouble(json['subtotal']),
    priceChanged: asString(json['price_changed']),
  );
}

/// A shop as the cart and checkout name it.
class StoreRef {
  const StoreRef({
    required this.id,
    required this.shopName,
    required this.acceptsGcash,
    required this.onVacation,
    this.shopSlug,
  });

  /// The seller's user id.
  final int id;
  final String shopName;
  final String? shopSlug;
  final bool acceptsGcash;
  final bool onVacation;

  String get shopKey => shopSlug ?? '$id';

  factory StoreRef.fromJson(Json json) => StoreRef(
    id: asInt(json['id']),
    shopName: asString(json['shop_name']) ?? 'Shop',
    shopSlug: asString(json['shop_slug']),
    acceptsGcash: asBool(json['accepts_gcash']),
    onVacation: asBool(json['on_vacation']),
  );
}

class CartStore {
  const CartStore({
    required this.seller,
    required this.lines,
    required this.promoDiscount,
  });

  final StoreRef seller;
  final List<CartLine> lines;
  final num promoDiscount;

  bool get allSelected {
    final selectable = lines.where((line) => !line.blocked);
    return selectable.isNotEmpty && selectable.every((line) => line.selected);
  }

  factory CartStore.fromJson(Json json) => CartStore(
    seller: StoreRef.fromJson(asJson(json['seller'])),
    lines: asJsonList(json['lines']).map(CartLine.fromJson).toList(),
    promoDiscount: asDouble(json['promo_discount']),
  );
}

class CartView {
  const CartView({
    required this.stores,
    required this.lines,
    required this.units,
    required this.selectedLines,
    required this.selectedUnits,
    required this.total,
    required this.promoDiscount,
  });

  static const empty = CartView(
    stores: [],
    lines: 0,
    units: 0,
    selectedLines: 0,
    selectedUnits: 0,
    total: 0,
    promoDiscount: 0,
  );

  final List<CartStore> stores;
  final int lines;
  final int units;
  final int selectedLines;
  final int selectedUnits;

  /// What the selected lines cost, after shop promotions, before delivery and vouchers.
  final num total;
  final num promoDiscount;

  bool get allSelected =>
      stores.isNotEmpty && stores.every((store) => store.allSelected);

  factory CartView.fromJson(Json json) {
    final summary = asJson(json['summary']);
    return CartView(
      stores: asJsonList(json['stores']).map(CartStore.fromJson).toList(),
      lines: asInt(summary['lines']),
      units: asInt(summary['units']),
      selectedLines: asInt(summary['selected_lines']),
      selectedUnits: asInt(summary['selected_units']),
      total: asDouble(summary['total']),
      promoDiscount: asDouble(summary['promo_discount']),
    );
  }
}

/// The signed-in buyer's cart, kept on the server so it is the same as on the website. Every change answers with
/// the whole cart, which replaces this state; the bottom bar's count reads [CartView.lines].
final cartProvider = AsyncNotifierProvider<CartController, CartView>(
  CartController.new,
);

class CartController extends AsyncNotifier<CartView> {
  Dio get _api => ref.read(dioProvider);

  @override
  Future<CartView> build() async {
    // A new person signing in gets their own cart.
    if (ref.watch(currentUserProvider) == null) return CartView.empty;
    return _fetch();
  }

  Future<CartView> _fetch() async {
    final response = await _api.get<Json>('/cart');
    return CartView.fromJson(asJson(response.data?['data']));
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }

  /// `POST /cart/items`. Returns the server's message ("Added to cart"). Throws [ApiFailure].
  Future<String> add(int variantId, int quantity) async {
    final response = await _call(
      () => _api.post<Json>(
        '/cart/items',
        data: {'variant_id': variantId, 'quantity': quantity},
      ),
    );
    return asString(response?['message']) ?? 'Added to cart.';
  }

  Future<void> setQuantity(int lineId, int quantity) => _call(
    () => _api.patch<Json>('/cart/items/$lineId', data: {'quantity': quantity}),
  );

  Future<void> setSelected(int lineId, bool selected) => _call(
    () => _api.patch<Json>('/cart/items/$lineId', data: {'selected': selected}),
  );

  /// The whole cart, or one shop's lines when [sellerId] is given.
  Future<void> selectAll(bool selected, {int? sellerId}) => _call(
    () => _api.post<Json>(
      '/cart/select',
      data: {'selected': selected, 'seller_id': sellerId},
    ),
  );

  Future<void> remove(int lineId) =>
      _call(() => _api.delete<Json>('/cart/items/$lineId'));

  /// Runs a cart change and keeps the cart it answers with. On a failure the cart is fetched again, so the screen
  /// never shows a quantity the server refused.
  Future<Json?> _call(Future<Response<Json>> Function() request) async {
    try {
      final response = await request();
      final data = response.data?['data'];
      if (data is Map) state = AsyncData(CartView.fromJson(asJson(data)));
      return response.data;
    } on DioException catch (error) {
      final failure = ApiFailure.fromDio(error);
      if (failure.kind == FailureKind.validation ||
          failure.kind == FailureKind.conflict ||
          failure.kind == FailureKind.notFound) {
        unawaited(refresh());
      }
      throw failure;
    }
  }
}
