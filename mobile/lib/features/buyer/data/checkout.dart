import '../../../core/api/json.dart';
import 'cart.dart';

/// A voucher code as the quote applied it, or why it did not apply.
class QuoteVoucher {
  const QuoteVoucher({
    required this.code,
    required this.applied,
    required this.discount,
    this.message,
  });

  final String code;
  final bool applied;
  final num discount;
  final String? message;

  static QuoteVoucher? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    return QuoteVoucher(
      code: asString(json['code']) ?? '',
      applied: asBool(json['applied']),
      discount: asDouble(json['discount']),
      message: asString(json['message']),
    );
  }
}

class QuoteLine {
  const QuoteLine({
    required this.variantId,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.subtotal,
    required this.status,
    this.variantLabel,
    this.imageUrl,
    this.message,
  });

  final int variantId;
  final String name;
  final String? variantLabel;
  final String? imageUrl;
  final int quantity;
  final num unitPrice;
  final num subtotal;
  final String status;
  final String? message;

  factory QuoteLine.fromJson(Json json) => QuoteLine(
    variantId: asInt(json['variant_id']),
    name: asString(json['name']) ?? 'Product',
    variantLabel: asString(json['variant_label']),
    imageUrl: asString(json['image_url']),
    quantity: asInt(json['quantity'], 1),
    unitPrice: asDouble(json['unit_price']),
    subtotal: asDouble(json['subtotal']),
    status: asString(json['status']) ?? 'available',
    message: asString(json['message']),
  );
}

/// One shop in the quote. Each shop becomes its own order with its own delivery fee.
class QuoteStore {
  const QuoteStore({
    required this.seller,
    required this.lines,
    required this.merchandise,
    required this.promoDiscount,
    required this.storeDiscount,
    required this.shippingFee,
    required this.serviceable,
    required this.freeDelivery,
    required this.platformDiscount,
    required this.shippingDiscount,
    required this.total,
    this.storeVoucher,
    this.shippingMessage,
  });

  final StoreRef seller;
  final List<QuoteLine> lines;
  final num merchandise;
  final num promoDiscount;
  final QuoteVoucher? storeVoucher;
  final num storeDiscount;
  final num shippingFee;

  /// False when no courier delivers from this shop to the address ("We cannot deliver to this address yet").
  final bool serviceable;
  final String? shippingMessage;
  final bool freeDelivery;
  final num platformDiscount;
  final num shippingDiscount;
  final num total;

  factory QuoteStore.fromJson(Json json) {
    final shipping = asJson(json['shipping']);
    return QuoteStore(
      seller: StoreRef.fromJson(asJson(json['seller'])),
      lines: asJsonList(json['lines']).map(QuoteLine.fromJson).toList(),
      merchandise: asDouble(json['merchandise']),
      promoDiscount: asDouble(json['promo_discount']),
      storeVoucher: QuoteVoucher.fromJson(json['store_voucher']),
      storeDiscount: asDouble(json['store_discount']),
      shippingFee: asDouble(shipping['fee']),
      serviceable:
          shipping['serviceable'] == null || asBool(shipping['serviceable']),
      shippingMessage: asString(shipping['message']),
      freeDelivery: asBool(shipping['free_delivery']),
      platformDiscount: asDouble(json['platform_discount']),
      shippingDiscount: asDouble(json['shipping_discount']),
      total: asDouble(json['total']),
    );
  }
}

class CheckoutProblem {
  const CheckoutProblem(this.type, this.message);

  final String type;
  final String message;

  factory CheckoutProblem.fromJson(Json json) => CheckoutProblem(
    asString(json['type']) ?? '',
    asString(json['message']) ?? '',
  );
}

/// A voucher in the buyer's wallet, with what it would do for this checkout.
class WalletOption {
  const WalletOption({
    required this.code,
    required this.name,
    required this.scope,
    required this.label,
    required this.applicable,
    this.sellerId,
    this.message,
  });

  final String code;
  final String name;

  /// `store`, `platform` or `shipping`.
  final String scope;
  final String label;
  final bool applicable;
  final int? sellerId;
  final String? message;

  factory WalletOption.fromJson(Json json) => WalletOption(
    code: asString(json['code']) ?? '',
    name: asString(json['name']) ?? '',
    scope: asString(json['scope']) ?? 'store',
    label: asString(json['label']) ?? '',
    applicable: json['applicable'] == null || asBool(json['applicable']),
    sellerId: asIntOrNull(asJson(json['seller'])['id']),
    message: asString(json['message']),
  );
}

/// `POST /checkout/quote`: the server's prices for this checkout. The app shows them and never adds anything up.
class CheckoutQuote {
  const CheckoutQuote({
    required this.stores,
    required this.problems,
    required this.canPlace,
    required this.wallet,
    required this.merchandise,
    required this.promoDiscount,
    required this.storeDiscount,
    required this.platformDiscount,
    required this.shipping,
    required this.shippingDiscount,
    required this.total,
    this.platformVoucher,
    this.shippingVoucher,
  });

  final List<QuoteStore> stores;
  final QuoteVoucher? platformVoucher;
  final QuoteVoucher? shippingVoucher;
  final List<CheckoutProblem> problems;
  final bool canPlace;
  final List<WalletOption> wallet;
  final num merchandise;
  final num promoDiscount;
  final num storeDiscount;
  final num platformDiscount;
  final num shipping;
  final num shippingDiscount;
  final num total;

  /// GCash works only when every shop in the checkout has a GCash account.
  bool get gcashPossible =>
      stores.isNotEmpty && stores.every((store) => store.seller.acceptsGcash);

  factory CheckoutQuote.fromJson(Json json) {
    final totals = asJson(json['totals']);
    return CheckoutQuote(
      stores: asJsonList(json['stores']).map(QuoteStore.fromJson).toList(),
      platformVoucher: QuoteVoucher.fromJson(json['platform_voucher']),
      shippingVoucher: QuoteVoucher.fromJson(json['shipping_voucher']),
      problems: asJsonList(json['problems'])
          .map(CheckoutProblem.fromJson)
          .toList(),
      canPlace: asBool(json['can_place']),
      wallet: asJsonList(json['wallet']).map(WalletOption.fromJson).toList(),
      merchandise: asDouble(totals['merchandise']),
      promoDiscount: asDouble(totals['promo_discount']),
      storeDiscount: asDouble(totals['store_discount']),
      platformDiscount: asDouble(totals['platform_discount']),
      shipping: asDouble(totals['shipping']),
      shippingDiscount: asDouble(totals['shipping_discount']),
      total: asDouble(totals['total']),
    );
  }
}

/// A shop's GCash for paying it directly (`GET /checkout/shops`).
class ShopGcash {
  const ShopGcash({
    required this.sellerId,
    required this.shopName,
    required this.acceptsGcash,
    this.number,
    this.accountName,
    this.qrUrl,
  });

  final int sellerId;
  final String shopName;
  final bool acceptsGcash;
  final String? number;
  final String? accountName;

  /// The shop's GCash QR code, when it uploaded one.
  final String? qrUrl;

  factory ShopGcash.fromJson(Json json) {
    final gcash = asJson(json['gcash']);
    return ShopGcash(
      sellerId: asInt(json['seller_id']),
      shopName: asString(json['shop_name']) ?? 'Shop',
      acceptsGcash: asBool(json['accepts_gcash']),
      number: asString(gcash['number']),
      accountName: asString(gcash['name']),
      qrUrl: asString(gcash['qr_url']),
    );
  }
}

/// What the buyer is checking out: the selected cart lines, or one item from Buy now.
class CheckoutRequest {
  const CheckoutRequest.cart() : buyNowVariantId = null, buyNowQuantity = 0;

  const CheckoutRequest.buyNow(int variantId, int quantity)
    : buyNowVariantId = variantId,
      buyNowQuantity = quantity;

  final int? buyNowVariantId;
  final int buyNowQuantity;

  bool get isBuyNow => buyNowVariantId != null;

  Json toJson() => isBuyNow
      ? {
          'source': 'buy_now',
          'items': [
            {'variant_id': buyNowVariantId, 'quantity': buyNowQuantity},
          ],
        }
      : {'source': 'cart'};
}
