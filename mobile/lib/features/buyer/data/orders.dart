import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';

/// The order statuses (backend `OrderStatus`), worded like the website's `utils/orderStatus.ts`.
enum OrderStatus {
  placed('PLACED', 'Order Placed', StatusTone.amber),
  confirmed('CONFIRMED', 'Order Confirmed', StatusTone.blue),
  preparing('PREPARING', 'Preparing Package', StatusTone.blue),
  readyForPickup('READY_FOR_PICKUP', 'Ready for Pickup', StatusTone.blue),
  pickedUp('PICKED_UP', 'Picked Up by Rider', StatusTone.blue),
  atSortingCenter('AT_SORTING_CENTER', 'At Sorting Center', StatusTone.blue),
  sorted('SORTED', 'Sorted for Dispatch', StatusTone.blue),
  assignedToRider('ASSIGNED_TO_RIDER', 'Assigned to Rider', StatusTone.blue),
  outForDelivery('OUT_FOR_DELIVERY', 'Out for Delivery', StatusTone.blue),
  delivered('DELIVERED', 'Delivered', StatusTone.emerald),
  completed('COMPLETED', 'Order Completed', StatusTone.emerald),
  deliveryFailed(
    'DELIVERY_FAILED',
    'Delivery Attempt Failed',
    StatusTone.amber,
  ),
  returned('RETURNED', 'Returned to Seller', StatusTone.rose),
  cancelled('CANCELLED', 'Order Cancelled', StatusTone.gray),
  disputed('DISPUTED', 'Disputed / Return Requested', StatusTone.rose);

  const OrderStatus(this.code, this.label, this.tone);

  final String code;
  final String label;
  final StatusTone tone;

  static OrderStatus from(Object? value) {
    final code = '${value ?? ''}'.toUpperCase();
    return OrderStatus.values.firstWhere(
      (status) => status.code == code,
      orElse: () => OrderStatus.placed,
    );
  }
}

/// The tabs of the buyer's order list (`GET /buyer/orders?tab=`), in the website's order.
enum OrderTab {
  toPay('to_pay', 'To pay'),
  toShip('to_ship', 'To ship'),
  toReceive('to_receive', 'To receive'),
  completed('completed', 'Completed'),
  cancelled('cancelled', 'Cancelled'),
  returns('return_refund', 'Returns');

  const OrderTab(this.key, this.label);

  final String key;
  final String label;
}

/// The reasons the server accepts (backend `OrderCanceller::BUYER_REASONS`, `Dispute::REASONS`).
abstract final class OrderReasons {
  static const cancel = [
    'Changed my mind',
    'Found a better price',
    'Ordered by mistake',
    'Need to change the delivery address',
    'Need to change the payment method',
    'Other',
  ];

  static const returns = [
    'Damaged item',
    'Wrong item',
    'Missing item or parts',
    'Not as described',
    'Defective or not working',
    'Expired product',
  ];
}

class OrderItem {
  const OrderItem({
    required this.id,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.subtotal,
    this.productId,
    this.variantLabel,
    this.imageUrl,
    this.isGift = false,
  });

  final int id;
  final int? productId;
  final String productName;
  final String? variantLabel;
  final int quantity;
  final num unitPrice;
  final num subtotal;
  final String? imageUrl;
  final bool isGift;

  factory OrderItem.fromJson(Json json) => OrderItem(
    id: asInt(json['id']),
    productId: asIntOrNull(json['product_id']),
    productName: asString(json['product_name']) ?? 'Product',
    variantLabel: asString(json['variant_label']),
    quantity: asInt(json['quantity'], 1),
    unitPrice: asDouble(json['unit_price']),
    subtotal: asDouble(json['subtotal']),
    imageUrl: asString(json['image_url']),
    isGift: asBool(json['is_gift']),
  );
}

/// The return request on an order, with the shop's answer.
class ReturnRequest {
  const ReturnRequest({
    required this.reason,
    required this.description,
    required this.status,
    required this.photos,
    required this.canEscalate,
    this.sellerReason,
    this.respondBy,
    this.escalateBy,
    this.refundAmount,
    this.resolutionNote,
  });

  final String reason;
  final String description;

  /// `pending`, `approved`, `rejected`, `escalated`, `closed`, `open`, `in_progress` or `resolved`.
  final String status;
  final List<String> photos;
  final bool canEscalate;
  final String? sellerReason;
  final DateTime? respondBy;
  final DateTime? escalateBy;
  final num? refundAmount;
  final String? resolutionNote;

  String get statusLabel => switch (status) {
    'pending' => 'Waiting for the shop',
    'approved' => 'Approved by the shop',
    'rejected' => 'Refused by the shop',
    'escalated' || 'open' || 'in_progress' => 'Loved-IT is reviewing it',
    'resolved' || 'closed' => 'Closed',
    _ => status,
  };

  static ReturnRequest? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    return ReturnRequest(
      reason: asString(json['reason']) ?? '',
      description: asString(json['description']) ?? '',
      status: asString(json['status']) ?? 'pending',
      photos: asStringList(json['photos']),
      canEscalate: asBool(json['can_escalate']),
      sellerReason: asString(json['seller_reason']),
      respondBy: asDate(json['respond_by']),
      escalateBy: asDate(json['escalate_by']),
      refundAmount: asDoubleOrNull(json['refund_amount']),
      resolutionNote: asString(json['resolution_note']),
    );
  }
}

class OrderHistoryEntry {
  const OrderHistoryEntry({required this.status, this.at, this.note});

  final OrderStatus status;
  final DateTime? at;
  final String? note;

  factory OrderHistoryEntry.fromJson(Json json) => OrderHistoryEntry(
    status: OrderStatus.from(json['to_status'] ?? json['status']),
    at: asDate(json['created_at'] ?? json['changed_at']),
    note: asString(json['note']) ?? asString(json['reason']),
  );
}

/// A buyer's order (`GET /buyer/orders`, `GET /buyer/orders/{id}`). Each one is one shop's part of a checkout.
class Order {
  const Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.subtotal,
    required this.shippingFee,
    required this.total,
    required this.items,
    required this.history,
    required this.canCancel,
    required this.canReturn,
    required this.deliveryProofCount,
    this.trackingNumber,
    this.shopName,
    this.sellerId,
    this.courierName,
    this.createdAt,
    this.deliveredAt,
    this.autoCompleteAt,
    this.completedAt,
    this.shippingName,
    this.shippingPhone,
    this.shippingAddress,
    this.discount = 0,
    this.paymentReference,
    this.rejectionReason,
    this.cancelReason,
    this.refundStatus,
    this.returnRequest,
    this.returnUnavailableReason,
    this.returnWindowEndsAt,
    this.failedAttempts,
    this.maxAttempts,
  });

  final int id;
  final String orderNumber;
  final String? trackingNumber;
  final OrderStatus status;

  /// `cod`, `gcash`, `e_wallet` or `card`.
  final String paymentMethod;

  /// `pending`, `paid` or `failed`.
  final String paymentStatus;
  final num subtotal;
  final num shippingFee;

  /// Every voucher and promotion together, as the server stored them.
  final num discount;
  final num total;
  final List<OrderItem> items;
  final List<OrderHistoryEntry> history;
  final String? shopName;
  final int? sellerId;
  final String? courierName;
  final DateTime? createdAt;
  final DateTime? deliveredAt;

  /// When an unconfirmed delivered order completes by itself.
  final DateTime? autoCompleteAt;
  final DateTime? completedAt;
  final String? shippingName;
  final String? shippingPhone;
  final String? shippingAddress;
  final String? paymentReference;
  final String? rejectionReason;
  final String? cancelReason;
  final String? refundStatus;
  final bool canCancel;
  final bool canReturn;
  final ReturnRequest? returnRequest;
  final String? returnUnavailableReason;
  final DateTime? returnWindowEndsAt;
  final int deliveryProofCount;
  final int? failedAttempts;
  final int? maxAttempts;

  String get paymentLabel => switch (paymentMethod) {
    'cod' => 'Cash on delivery',
    'gcash' => 'GCash',
    'e_wallet' => 'E-wallet',
    'card' => 'Card',
    _ => paymentMethod,
  };

  /// A parcel exists from Ready for Pickup on, so the package can be tracked.
  bool get canTrack => trackingNumber != null;

  bool get canConfirmReceipt => status == OrderStatus.delivered;

  factory Order.fromJson(Json json) {
    final items = asJsonList(json['items']).map(OrderItem.fromJson).toList();
    final firstItem = asJsonList(json['items']).firstOrNull ?? const {};
    final attempts = asJson(json['delivery_attempt']);
    final discount = [
      'promo_discount',
      'store_voucher_discount',
      'platform_voucher_discount',
      'shipping_voucher_discount',
    ].fold<double>(0, (sum, key) => sum + asDouble(json[key]));

    return Order(
      id: asInt(json['id']),
      orderNumber: asString(json['order_number']) ?? '',
      trackingNumber: asString(json['tracking_number']),
      status: OrderStatus.from(json['status']),
      paymentMethod: asString(json['payment_method']) ?? 'cod',
      paymentStatus: asString(json['payment_status']) ?? 'pending',
      subtotal: asDouble(json['subtotal']),
      shippingFee: asDouble(json['shipping_fee']),
      discount: discount,
      total: asDouble(json['total']),
      items: items,
      history: asJsonList(json['status_history'])
          .map(OrderHistoryEntry.fromJson)
          .toList(),
      shopName: asString(json['shop_name']) ?? asString(firstItem['shop_name']),
      sellerId:
          asIntOrNull(json['seller_id']) ?? asIntOrNull(firstItem['seller_id']),
      courierName: asString(asJson(json['courier'])['name']),
      createdAt: asDate(json['created_at']),
      deliveredAt: asDate(json['delivered_at']),
      autoCompleteAt: asDate(json['auto_complete_at']),
      completedAt: asDate(json['completed_at']),
      shippingName: asString(json['shipping_name']),
      shippingPhone: asString(json['shipping_phone']),
      shippingAddress: [
        json['shipping_address'],
        json['shipping_barangay'],
        json['shipping_city'],
        json['shipping_province'],
      ].map(asString).whereType<String>().join(', '),
      paymentReference: asString(json['payment_reference']),
      rejectionReason: asString(json['rejection_reason']),
      cancelReason: asString(json['cancel_reason']),
      refundStatus: asString(json['refund_status']),
      canCancel: asBool(json['can_cancel']),
      canReturn: asBool(json['can_return']),
      returnRequest: ReturnRequest.fromJson(json['dispute']),
      returnUnavailableReason: asString(json['return_unavailable_reason']),
      returnWindowEndsAt: asDate(json['return_window_ends_at']),
      deliveryProofCount: asInt(
        json['delivery_proof_count'],
        asBool(json['delivery_proof_available']) ? 1 : 0,
      ),
      failedAttempts: attempts.isEmpty ? null : asInt(attempts['failed']),
      maxAttempts: attempts.isEmpty ? null : asInt(attempts['max']),
    );
  }
}

/// A place on the way: the shop, the hub, the buyer.
class TrackingPlace {
  const TrackingPlace({required this.name, required this.address});

  final String name;
  final String address;

  static TrackingPlace? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    return TrackingPlace(
      name: asString(json['name']) ?? '',
      address:
          asString(json['full_address']) ??
          [
            json['barangay'],
            json['city'],
            json['province'],
          ].map(asString).whereType<String>().join(', '),
    );
  }
}

class TrackingEvent {
  const TrackingEvent({required this.title, required this.detail, this.at});

  final String title;
  final String detail;
  final DateTime? at;

  factory TrackingEvent.fromJson(Json json) => TrackingEvent(
    title: asString(json['title']) ?? '',
    detail: asString(json['detail']) ?? '',
    at: asDate(json['at']),
  );
}

/// `GET /parcels/{tracking}/tracking`.
class ParcelTracking {
  const ParcelTracking({
    required this.trackingNumber,
    required this.status,
    required this.events,
    required this.canMessageRider,
    required this.proofCount,
    this.origin,
    this.hub,
    this.destination,
    this.courierName,
    this.vehicleType,
    this.courierState,
    this.latitude,
    this.longitude,
    this.locationAt,
  });

  final String trackingNumber;
  final OrderStatus status;
  final TrackingPlace? origin;
  final TrackingPlace? hub;
  final TrackingPlace? destination;
  final List<TrackingEvent> events;
  final bool canMessageRider;
  final int proofCount;
  final String? courierName;
  final String? vehicleType;

  /// Whether the rider's phone is sharing its position (`sharing`, `not_sharing`, …).
  final String? courierState;
  final double? latitude;
  final double? longitude;
  final DateTime? locationAt;

  bool get hasLocation => latitude != null && longitude != null;

  factory ParcelTracking.fromJson(Json json) {
    final courier = asJson(json['courier']);
    final location = asJson(courier['location']);
    return ParcelTracking(
      trackingNumber: asString(json['tracking_number']) ?? '',
      status: OrderStatus.from(json['status']),
      origin: TrackingPlace.fromJson(json['origin']),
      hub: TrackingPlace.fromJson(json['hub']),
      destination: TrackingPlace.fromJson(json['destination']),
      events: asJsonList(json['events']).map(TrackingEvent.fromJson).toList(),
      canMessageRider: asBool(json['can_message_rider']),
      proofCount: asInt(asJson(json['proof'])['count']),
      courierName: asString(courier['name']),
      vehicleType: asString(courier['vehicle_type']),
      courierState: asString(courier['state']),
      latitude: asDoubleOrNull(location['latitude']),
      longitude: asDoubleOrNull(location['longitude']),
      locationAt: asDate(location['updated_at']),
    );
  }
}
