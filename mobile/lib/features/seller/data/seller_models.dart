import '../../../core/api/json.dart';
import '../../../core/returns/return_pickups.dart';

/// The Seller Centre's models, read from the `/seller/*` endpoints the website uses. Amounts stay as the server sent
/// them; the app never works one out.

/// `GET /seller/dashboard/stats`.
class SellerStats {
  const SellerStats({
    required this.todaySales,
    required this.yesterdaySales,
    required this.ordersToPack,
    required this.totalProducts,
    required this.lowStockCount,
    required this.pending,
    required this.available,
  });

  final double todaySales;
  final double yesterdaySales;
  final int ordersToPack;
  final int totalProducts;
  final int lowStockCount;

  /// Earnings still in escrow, and earnings that can be paid out.
  final double pending;
  final double available;

  factory SellerStats.fromJson(Json json) {
    final balance = asJson(json['balance']);
    return SellerStats(
      todaySales: asDouble(json['today_sales']),
      yesterdaySales: asDouble(json['yesterday_sales']),
      ordersToPack: asInt(json['orders_to_pack']),
      totalProducts: asInt(json['total_products']),
      lowStockCount: asInt(json['low_stock_count']),
      pending: asDouble(balance['pending']),
      available: asDouble(balance['available']),
    );
  }
}

/// One "needs your attention" line on the dashboard.
typedef SellerAttention = ({String type, String label, String sub});

/// The order tabs, the same as the website's.
enum SellerOrderTab {
  newOrders('new', 'New'),
  toShip('to_ship', 'To ship'),
  shipping('shipping', 'Shipping'),
  returns('return_refund', 'Returns'),
  completed('completed', 'Completed'),
  cancelled('cancelled', 'Cancelled');

  const SellerOrderTab(this.key, this.label);

  final String key;
  final String label;
}

class SellerOrderItem {
  const SellerOrderItem({
    required this.name,
    required this.variant,
    required this.quantity,
    required this.subtotal,
    this.imageUrl,
  });

  final String name;
  final String variant;
  final int quantity;
  final double subtotal;
  final String? imageUrl;

  factory SellerOrderItem.fromJson(Json json) => SellerOrderItem(
    name: asString(json['product_name']) ?? 'Item',
    variant: asString(json['variant_label']) ?? '',
    quantity: asInt(json['quantity'], 1),
    subtotal: asDouble(json['subtotal']),
    imageUrl: asString(json['image_url']),
  );
}

/// The buyer's return request on an order.
class SellerReturnRequest {
  const SellerReturnRequest({
    required this.status,
    required this.reason,
    required this.description,
    required this.photos,
    this.respondBy,
    this.sellerReason,
  });

  /// `pending`, `approved`, `rejected`, `escalated` or `closed`.
  final String status;
  final String reason;
  final String description;
  final List<String> photos;
  final DateTime? respondBy;
  final String? sellerReason;

  static SellerReturnRequest? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    return SellerReturnRequest(
      status: asString(json['status']) ?? '',
      reason: asString(json['reason']) ?? '',
      description: asString(json['description']) ?? '',
      photos: asStringList(json['photos']),
      respondBy: asDate(json['respond_by']),
      sellerReason: asString(json['seller_reason']),
    );
  }
}

/// A refund the shop sends to the buyer's GCash by hand.
class SellerRefund {
  const SellerRefund({
    required this.status,
    required this.amount,
    required this.canSend,
    required this.overdue,
    this.gcashNumber,
    this.gcashName,
    this.sendBy,
    this.reference,
  });

  final String status;
  final double amount;
  final bool canSend;
  final bool overdue;
  final String? gcashNumber;
  final String? gcashName;
  final DateTime? sendBy;
  final String? reference;

  String get statusLabel => switch (status) {
    'awaiting_account' => 'Waiting for the buyer\'s GCash number',
    'awaiting_shop' => 'Send the refund',
    'sent' => 'Sent, waiting for the buyer',
    'not_received' => 'Buyer says it did not arrive',
    'received' => 'Buyer received it',
    _ => status,
  };

  static SellerRefund? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    return SellerRefund(
      status: asString(json['status']) ?? '',
      amount: asDouble(json['amount']),
      canSend: asBool(json['can_send']),
      overdue: asBool(json['overdue']),
      gcashNumber: asString(json['gcash_number']),
      gcashName: asString(json['gcash_name']),
      sendBy: asDate(json['send_by']),
      reference: asString(json['reference']),
    );
  }
}

class SellerOrder {
  const SellerOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.total,
    required this.earnings,
    required this.buyerName,
    required this.shippingPhone,
    required this.shippingAddress,
    required this.items,
    required this.canCancel,
    this.createdAt,
    this.trackingNumber,
    this.paymentProofUrl,
    this.pickupSlotLabel,
    this.pickupSlotDate,
    this.pickupSlotWindow,
    this.returnRequest,
    this.returnPickup,
    this.refund,
    this.notes,
  });

  final int id;
  final String orderNumber;
  final String status;
  final String paymentMethod;
  final String paymentStatus;
  final double total;

  /// What the shop earns from it after commission.
  final double earnings;
  final String buyerName;
  final String shippingPhone;
  final String shippingAddress;
  final List<SellerOrderItem> items;
  final bool canCancel;
  final DateTime? createdAt;
  final String? trackingNumber;

  /// A signed link to the buyer's GCash receipt (it expires within the hour).
  final String? paymentProofUrl;
  final String? pickupSlotLabel;
  final String? pickupSlotDate;
  final String? pickupSlotWindow;
  final SellerReturnRequest? returnRequest;
  final ReturnPickup? returnPickup;
  final SellerRefund? refund;
  final String? notes;

  bool get isGcash => paymentMethod == 'gcash';
  bool get awaitingGcashCheck =>
      isGcash && status == 'PLACED' && paymentStatus == 'pending_verification';

  String get statusLabel => switch (status) {
    'PLACED' => awaitingGcashCheck ? 'Check the GCash payment' : 'New order',
    'CONFIRMED' => 'Accepted',
    'PREPARING' => 'Packing',
    'READY_FOR_PICKUP' => 'Waiting for the rider',
    'PICKED_UP' => 'Picked up',
    'AT_SORTING_CENTER' || 'SORTED' => 'At the hub',
    'ASSIGNED_TO_RIDER' || 'OUT_FOR_DELIVERY' => 'Out for delivery',
    'DELIVERY_FAILED' => 'Delivery failed',
    'DELIVERED' => 'Delivered',
    'COMPLETED' => 'Completed',
    'CANCELLED' => 'Cancelled',
    'DISPUTED' => 'Return requested',
    'RETURNED' => 'Returned',
    _ => status,
  };

  factory SellerOrder.fromJson(Json json) {
    final buyer = asJson(json['buyer']);
    final slot = asJson(json['pickup_slot']);
    return SellerOrder(
      id: asInt(json['id']),
      orderNumber: asString(json['order_number']) ?? '',
      status: asString(json['status']) ?? '',
      paymentMethod: asString(json['payment_method']) ?? '',
      paymentStatus: asString(json['payment_status']) ?? '',
      total: asDouble(json['order_total']),
      earnings: asDouble(json['seller_earnings']),
      buyerName:
          asString(json['shipping_name']) ?? asString(buyer['name']) ?? 'Buyer',
      shippingPhone: asString(json['shipping_phone']) ?? '',
      shippingAddress: [
        json['shipping_address'],
        json['shipping_barangay'],
        json['shipping_city'],
        json['shipping_province'],
      ].map(asString).whereType<String>().where((s) => s.isNotEmpty).join(', '),
      items: asJsonList(json['items']).map(SellerOrderItem.fromJson).toList(),
      canCancel: asBool(json['can_cancel']),
      createdAt: asDate(json['created_at']),
      trackingNumber: asString(json['tracking_number']),
      paymentProofUrl: asString(json['payment_proof_url']),
      pickupSlotLabel: asString(slot['label']),
      pickupSlotDate: asString(slot['date']),
      pickupSlotWindow: asString(slot['window']),
      returnRequest: SellerReturnRequest.fromJson(json['dispute']),
      returnPickup: ReturnPickup.fromJson(json['return_pickup']),
      refund: SellerRefund.fromJson(json['refund']),
      notes: asString(json['notes']),
    );
  }
}

class SellerVariant {
  const SellerVariant({
    required this.id,
    required this.label,
    required this.stock,
    required this.price,
    required this.lowStock,
  });

  final int id;
  final String label;
  final int stock;
  final double price;
  final bool lowStock;

  factory SellerVariant.fromJson(Json json) => SellerVariant(
    id: asInt(json['id']),
    label: asString(json['label']) ?? 'Default',
    stock: asInt(json['stock_quantity']),
    price: asDouble(json['price']),
    lowStock: asBool(json['low_stock']),
  );
}

class SellerProduct {
  const SellerProduct({
    required this.id,
    required this.name,
    required this.status,
    required this.totalStock,
    required this.unitsSold,
    required this.variants,
    this.thumbnailUrl,
    this.priceMin,
    this.priceMax,
    this.rejectionReason,
  });

  final int id;
  final String name;

  /// `active`, `archived`, `pending_review`, `rejected` or `draft`.
  final String status;
  final int totalStock;
  final int unitsSold;
  final List<SellerVariant> variants;
  final String? thumbnailUrl;
  final double? priceMin;
  final double? priceMax;
  final String? rejectionReason;

  bool get isLive => status == 'active';

  String get statusLabel => switch (status) {
    'active' => 'Live',
    'archived' => 'Hidden',
    'pending_review' => 'Being checked',
    'rejected' => 'Not approved',
    'draft' => 'Draft',
    _ => status,
  };

  factory SellerProduct.fromJson(Json json) => SellerProduct(
    id: asInt(json['id']),
    name: asString(json['name']) ?? 'Product',
    status: asString(json['status']) ?? '',
    totalStock: asInt(json['total_stock']),
    unitsSold: asInt(json['units_sold']),
    variants: asJsonList(json['variants']).map(SellerVariant.fromJson).toList(),
    thumbnailUrl: asString(json['thumbnail_url']),
    priceMin: asDoubleOrNull(asJson(json['price_range'])['min']),
    priceMax: asDoubleOrNull(asJson(json['price_range'])['max']),
    rejectionReason: asString(json['rejection_reason']),
  );
}
