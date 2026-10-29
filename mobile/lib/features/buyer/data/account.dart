import '../../../core/api/json.dart';

/// A saved delivery address (`GET /addresses`). Codes are PSGC strings: leading zeros matter.
class Address {
  const Address({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.street,
    required this.province,
    required this.city,
    required this.barangay,
    required this.provinceCode,
    required this.cityCode,
    required this.barangayCode,
    required this.label,
    required this.isDefault,
    required this.needsUpdate,
    this.floorUnit,
    this.region,
    this.regionCode,
  });

  final int id;
  final String fullName;
  final String phone;
  final String street;
  final String? floorUnit;
  final String? region;
  final String? regionCode;
  final String province;

  /// `district` on the server.
  final String city;

  /// `ward` on the server.
  final String barangay;
  final String provinceCode;
  final String cityCode;
  final String barangayCode;

  /// `home` or `office`.
  final String label;
  final bool isDefault;

  /// An old address without PSGC codes: the server asks for it to be picked again before checkout.
  final bool needsUpdate;

  String get oneLine => [
    floorUnit,
    street,
    barangay,
    city,
    province,
  ].whereType<String>().where((part) => part.trim().isNotEmpty).join(', ');

  factory Address.fromJson(Json json) => Address(
    id: asInt(json['id']),
    fullName: asString(json['full_name']) ?? '',
    phone: asString(json['phone']) ?? '',
    street: asString(json['address']) ?? '',
    floorUnit: asString(json['floor_unit']),
    region: asString(json['region']),
    regionCode: asString(json['region_code']),
    province: asString(json['province']) ?? '',
    city: asString(json['district']) ?? '',
    barangay: asString(json['ward']) ?? '',
    provinceCode: asString(json['province_code']) ?? '',
    cityCode: asString(json['city_code']) ?? '',
    barangayCode: asString(json['barangay_code']) ?? '',
    label: asString(json['label']) ?? 'home',
    isDefault: asBool(json['is_default']),
    needsUpdate: asBool(json['address_needs_update']),
  );
}

/// `GET /account/id-verification`. A buyer orders only once this is approved.
class IdVerification {
  const IdVerification({
    required this.status,
    required this.canOrder,
    this.reason,
    this.idType,
  });

  /// `none`, `pending`, `approved` or `rejected`.
  final String status;
  final bool canOrder;

  /// The admin's reason when it was rejected.
  final String? reason;
  final String? idType;

  factory IdVerification.fromJson(Json json) => IdVerification(
    status: asString(json['status']) ?? 'none',
    canOrder: asBool(json['can_order']),
    reason: asString(json['reason']),
    idType: asString(json['id_type']),
  );
}

/// The IDs the server accepts (no school IDs), and which ones need a photo of the back.
enum GovernmentId {
  nationalId('national_id', 'National ID (PhilSys)', false),
  driversLicense('drivers_license', "Driver's license", true),
  passport('passport', 'Passport', false),
  umid('umid', 'UMID', true),
  sssId('sss_id', 'SSS ID', true),
  philhealthId('philhealth_id', 'PhilHealth ID', true),
  votersId('voters_id', "Voter's ID", true),
  postalId('postal_id', 'Postal ID', true);

  const GovernmentId(this.key, this.label, this.hasBack);

  final String key;
  final String label;
  final bool hasBack;

  static GovernmentId? from(String? key) =>
      GovernmentId.values.where((id) => id.key == key).firstOrNull;
}

/// A notification in the bell (`GET /notifications`).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.read,
    this.createdAt,
    this.orderId,
    this.conversationId,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final bool read;
  final DateTime? createdAt;
  final int? orderId;
  final int? conversationId;

  AppNotification markedRead() => AppNotification(
    id: id,
    kind: kind,
    title: title,
    body: body,
    read: true,
    createdAt: createdAt,
    orderId: orderId,
    conversationId: conversationId,
  );

  factory AppNotification.fromJson(Json json) {
    final meta = asJson(json['meta']);
    return AppNotification(
      id: asString(json['id']) ?? '',
      kind: asString(json['kind']) ?? '',
      title: asString(json['title']) ?? '',
      body: asString(json['body']) ?? '',
      read: json['read_at'] != null,
      createdAt: asDate(json['created_at']),
      orderId: asIntOrNull(meta['order_id']),
      conversationId: asIntOrNull(meta['conversation_id']),
    );
  }
}

/// A chat in the buyer's inbox: a shop, Loved-IT Support, or the rider bringing a parcel.
class Conversation {
  const Conversation({
    required this.id,
    required this.type,
    required this.title,
    required this.unread,
    required this.canSend,
    this.subtitle,
    this.avatarUrl,
    this.lastMessage,
    this.lastMessageAt,
    this.closedMessage,
    this.supportMode,
    this.assistantAvailable = false,
    this.sellerId,
  });

  final int id;

  /// `buyer_seller`, `buyer_admin` (Loved-IT Support) or `rider_buyer`.
  final String type;
  final String title;
  final String? subtitle;
  final String? avatarUrl;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unread;

  /// A rider thread is read-only once the parcel is delivered (send answers 409).
  final bool canSend;
  final String? closedMessage;

  /// Loved-IT Support only: `ai` while the assistant answers, `human` once a person took over.
  final String? supportMode;
  final bool assistantAvailable;
  final int? sellerId;

  bool get isSupport => type == 'buyer_admin';
  bool get isRider => type == 'rider_buyer';

  factory Conversation.fromJson(Json json) {
    final recipient = asJson(json['recipient']);
    final last = asJson(json['last_message']);
    final type = asString(json['type']) ?? 'buyer_seller';
    return Conversation(
      id: asInt(json['id']),
      type: type,
      title:
          asString(recipient['shop_name']) ??
          asString(recipient['name']) ??
          (type == 'buyer_admin' ? 'Loved-IT Support' : 'Chat'),
      subtitle: asString(recipient['subtext']) ?? asString(json['subject']),
      avatarUrl:
          asString(recipient['shop_logo']) ?? asString(recipient['avatar']),
      lastMessage: asString(last['body']),
      lastMessageAt: asDate(json['last_message_at']),
      unread: asInt(json['unread']),
      canSend: json['can_send'] == null || asBool(json['can_send']),
      closedMessage: asString(json['closed_message']),
      supportMode: asString(json['support_mode']),
      assistantAvailable: asBool(json['assistant_available']),
      sellerId: asIntOrNull(json['seller_id']),
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.senderRole,
    this.body,
    this.attachmentType,
    this.attachment = const {},
    this.createdAt,
    this.readAt,
  });

  final int id;
  final int? senderId;
  final String senderName;

  /// `buyer`, `seller`, `admin`, `rider`, `assistant` or `system`.
  final String senderRole;
  final String? body;

  /// `product_card`, `order_card`, `image` or another card the server sends.
  final String? attachmentType;
  final Json attachment;
  final DateTime? createdAt;
  final DateTime? readAt;

  factory ChatMessage.fromJson(Json json) => ChatMessage(
    id: asInt(json['id']),
    senderId: asIntOrNull(json['sender_id']),
    senderName: asString(json['sender_name']) ?? '',
    senderRole: asString(json['sender_role']) ?? '',
    body: asString(json['body']),
    attachmentType: asString(json['attachment_type']),
    attachment: asJson(json['attachment_data']),
    createdAt: asDate(json['created_at']),
    readAt: asDate(json['read_at']),
  );
}

/// A product on the wishlist (`GET /wishlist`).
class WishlistEntry {
  const WishlistEntry({
    required this.productId,
    required this.name,
    required this.price,
    required this.availability,
    this.thumbnailUrl,
    this.originalPrice,
    this.shopName,
  });

  final int productId;
  final String name;
  final String? thumbnailUrl;
  final num price;
  final num? originalPrice;

  /// `available`, `sold_out`, `on_vacation` or `unavailable`.
  final String availability;
  final String? shopName;

  factory WishlistEntry.fromJson(Json json) {
    final product = asJson(json['product']);
    return WishlistEntry(
      productId: asInt(product['id']),
      name: asString(product['name']) ?? 'Product',
      thumbnailUrl: asString(product['thumbnail_url']),
      price: asDouble(product['base_price']),
      originalPrice: asDoubleOrNull(product['original_price']),
      availability: asString(product['availability']) ?? 'available',
      shopName: asString(asJson(product['seller'])['shop_name']),
    );
  }
}

/// A shop the buyer follows (`GET /store-follows`).
class FollowedShop {
  const FollowedShop({
    required this.sellerId,
    required this.shopName,
    required this.productCount,
    required this.hasSale,
    this.shopSlug,
    this.logoUrl,
    this.avgRating,
  });

  final int sellerId;
  final String shopName;
  final String? shopSlug;
  final String? logoUrl;
  final double? avgRating;
  final int productCount;
  final bool hasSale;

  String get shopKey => shopSlug ?? '$sellerId';

  factory FollowedShop.fromJson(Json json) {
    final seller = asJson(json['seller']);
    return FollowedShop(
      sellerId: asInt(seller['id']),
      shopName: asString(seller['shop_name']) ?? 'Shop',
      shopSlug: asString(seller['shop_slug']),
      logoUrl: asString(seller['logo_url']),
      avgRating: asDoubleOrNull(seller['avg_rating']),
      productCount: asInt(seller['product_count']),
      hasSale: asBool(seller['has_sale']),
    );
  }
}

/// A product the buyer can still review (`GET /buyer/reviews/pending`).
class PendingReview {
  const PendingReview({
    required this.orderId,
    required this.orderNumber,
    required this.productId,
    required this.productName,
    this.imageUrl,
    this.variantLabel,
    this.shopName,
  });

  final int orderId;
  final String orderNumber;
  final int productId;
  final String productName;
  final String? imageUrl;
  final String? variantLabel;
  final String? shopName;

  factory PendingReview.fromJson(Json json) {
    final product = asJson(json['product']);
    return PendingReview(
      orderId: asInt(json['order_id']),
      orderNumber: asString(json['order_number']) ?? '',
      productId: asInt(product['id']),
      productName: asString(product['name']) ?? 'Product',
      imageUrl: asString(product['image_url']),
      variantLabel: asString(json['variant_label']),
      shopName: asString(json['shop_name']),
    );
  }
}

/// A review the buyer wrote (`GET /buyer/reviews`).
class MyReview {
  const MyReview({
    required this.id,
    required this.rating,
    required this.images,
    required this.canEdit,
    this.comment,
    this.productName,
    this.productImageUrl,
    this.orderNumber,
    this.createdAt,
    this.sellerReply,
  });

  final int id;
  final int rating;
  final String? comment;
  final List<String> images;

  /// Rating and text can be changed for a while after posting.
  final bool canEdit;
  final String? productName;
  final String? productImageUrl;
  final String? orderNumber;
  final DateTime? createdAt;
  final String? sellerReply;

  factory MyReview.fromJson(Json json) {
    final product = asJson(json['product']);
    return MyReview(
      id: asInt(json['id']),
      rating: asInt(json['rating']),
      comment: asString(json['comment']),
      images: asStringList(json['images']),
      canEdit: asBool(json['can_edit']),
      productName: asString(product['name']),
      productImageUrl: asString(product['image_url']),
      orderNumber: asString(asJson(json['order'])['order_number']),
      createdAt: asDate(json['created_at']),
      sellerReply: asString(asJson(json['seller_reply'])['body']),
    );
  }
}
