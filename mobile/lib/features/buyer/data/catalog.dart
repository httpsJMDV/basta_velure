import '../../../core/api/json.dart';

/// A flash sale running on a product right now (`flash_sale`).
class FlashSale {
  const FlashSale({
    required this.price,
    required this.remaining,
    required this.endsAt,
    this.variantId,
  });

  final num price;
  final int remaining;
  final DateTime? endsAt;

  /// The one variant on flash sale, or null when every variant is.
  final int? variantId;

  static FlashSale? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    return FlashSale(
      price: asDouble(json['price']),
      remaining: asInt(json['remaining']),
      endsAt: asDate(json['ends_at']),
      variantId: asIntOrNull(json['variant_id']),
    );
  }
}

/// A product card in a list (`GET /products`, `GET /products/{id}/related`).
class ProductSummary {
  const ProductSummary({
    required this.id,
    required this.name,
    required this.price,
    required this.unitsSold,
    required this.reviewCount,
    required this.totalStock,
    required this.onVacation,
    this.thumbnailUrl,
    this.originalPrice,
    this.avgRating,
    this.flashSale,
    this.shopName,
    this.sellerId,
    this.city,
  });

  final int id;
  final String name;
  final String? thumbnailUrl;

  /// The price people pay now (`base_price`); [originalPrice] is struck through when it is higher.
  final num price;
  final num? originalPrice;
  final int unitsSold;
  final double? avgRating;
  final int reviewCount;
  final int totalStock;
  final bool onVacation;
  final FlashSale? flashSale;
  final String? shopName;
  final int? sellerId;
  final String? city;

  bool get soldOut => totalStock <= 0;

  factory ProductSummary.fromJson(Json json) {
    final seller = asJson(json['seller']);
    return ProductSummary(
      id: asInt(json['id']),
      name: asString(json['name']) ?? 'Product',
      thumbnailUrl:
          asString(json['thumbnail_url']) ?? asString(json['image_url']),
      price: asDouble(json['base_price'] ?? json['price']),
      originalPrice: asDoubleOrNull(json['original_price']),
      unitsSold: asInt(json['units_sold']),
      avgRating: asDoubleOrNull(json['avg_rating']),
      reviewCount: asInt(json['review_count']),
      totalStock: asInt(json['total_stock'], 1),
      onVacation: asBool(json['on_vacation']) || asBool(seller['on_vacation']),
      flashSale: FlashSale.fromJson(json['flash_sale']),
      shopName: asString(seller['shop_name']),
      sellerId: asIntOrNull(seller['id']),
      city: asString(seller['city']),
    );
  }
}

/// One way to buy a product: a variant with its option labels (`combinations`).
class ProductOption {
  const ProductOption({
    required this.variantId,
    required this.label,
    required this.parts,
    required this.stock,
    required this.price,
    required this.priceSource,
    this.originalPrice,
  });

  final int variantId;
  final String label;

  /// One label per variation type, in the same order as [ProductDetail.variationTypes] ("Red", "M").
  final List<String> parts;
  final int stock;
  final num price;
  final num? originalPrice;

  /// `regular`, `sale` or `flash`.
  final String priceSource;

  factory ProductOption.fromJson(Json json) => ProductOption(
    variantId: asInt(json['variant_id'] ?? json['id']),
    label: asString(json['label']) ?? '',
    parts: asStringList(json['parts']),
    stock: asInt(json['stock_quantity']),
    price: asDouble(json['price']),
    originalPrice: asDoubleOrNull(json['original_price']),
    priceSource: asString(json['price_source']) ?? 'regular',
  );
}

class ProductSeller {
  const ProductSeller({
    required this.id,
    required this.shopName,
    this.shopSlug,
    this.avatarUrl,
    this.city,
    this.province,
    this.productCount = 0,
    this.avgRating,
    this.unitsSold = 0,
  });

  /// The seller's user id: `seller_id` everywhere else (chat, vouchers, follow).
  final int id;
  final String shopName;
  final String? shopSlug;
  final String? avatarUrl;
  final String? city;
  final String? province;
  final int productCount;
  final double? avgRating;
  final int unitsSold;

  /// The shop page takes the slug, or the id for a shop without one.
  String get shopKey => shopSlug ?? '$id';

  factory ProductSeller.fromJson(Json json) => ProductSeller(
    id: asInt(json['id']),
    shopName: asString(json['shop_name']) ?? 'Shop',
    shopSlug: asString(json['shop_slug']),
    avatarUrl: asString(json['avatar_url']) ?? asString(json['logo_url']),
    city: asString(json['city']),
    province: asString(json['province']),
    productCount: asInt(json['product_count']),
    avgRating: asDoubleOrNull(json['avg_rating']),
    unitsSold: asInt(json['units_sold']),
  );
}

/// `GET /products/{id}`.
class ProductDetail {
  const ProductDetail({
    required this.id,
    required this.name,
    required this.description,
    required this.images,
    required this.price,
    required this.priceMin,
    required this.priceMax,
    required this.unitsSold,
    required this.reviewCount,
    required this.totalStock,
    required this.onVacation,
    required this.seller,
    required this.variationTypes,
    required this.options,
    required this.specs,
    required this.isWishlisted,
    required this.purchasedByYou,
    required this.deliveryDaysMin,
    required this.deliveryDaysMax,
    this.originalPrice,
    this.avgRating,
    this.flashSale,
    this.upcomingFlashStartsAt,
    this.purchaseLimit,
    this.categoryName,
    this.returnPolicy,
    this.warranty,
  });

  final int id;
  final String name;
  final String description;
  final List<String> images;
  final num price;
  final num? originalPrice;
  final num priceMin;
  final num priceMax;
  final int unitsSold;
  final double? avgRating;
  final int reviewCount;
  final int totalStock;
  final bool onVacation;
  final ProductSeller seller;

  /// The seller's names for the options ("Color", "Size"). Empty when the product has one kind only.
  final List<String> variationTypes;
  final List<ProductOption> options;

  /// The details table ("Weight", "Material"…), only the rows the seller filled in.
  final Map<String, String> specs;
  final bool isWishlisted;
  final int purchasedByYou;
  final int deliveryDaysMin;
  final int deliveryDaysMax;
  final FlashSale? flashSale;
  final DateTime? upcomingFlashStartsAt;

  /// The most one buyer may buy over time, or null for no limit.
  final int? purchaseLimit;
  final String? categoryName;
  final String? returnPolicy;
  final String? warranty;

  bool get soldOut => totalStock <= 0;

  /// How many more this buyer may add, after the stock and the purchase limit.
  int maxFor(ProductOption option) {
    final limitLeft = purchaseLimit == null
        ? option.stock
        : (purchaseLimit! - purchasedByYou);
    return [option.stock, limitLeft].reduce((a, b) => a < b ? a : b);
  }

  static const _specLabels = {
    'whats_in_box': "What's in the box",
    'weight_grams': 'Weight (g)',
    'dimensions_cm': 'Dimensions (cm)',
    'sku': 'SKU',
    'ingredients': 'Ingredients',
    'net_weight_volume': 'Net weight / volume',
    'storage_instructions': 'Storage',
    'expiry_best_before': 'Best before',
    'allergen_info': 'Allergens',
    'fda_registration_number': 'FDA registration no.',
    'key_ingredients': 'Key ingredients',
    'skin_type_suitability': 'Skin type',
    'battery_info': 'Battery',
    'ports_connectivity': 'Ports and connectivity',
    'compatibility': 'Compatibility',
    'material': 'Material',
    'care_instructions': 'Care',
  };

  factory ProductDetail.fromJson(Json json) {
    final range = asJson(json['price_range']);
    final specs = asJson(json['specs']);
    final price = asDouble(json['base_price']);
    final images = asJsonList(json['images'])
        .map((image) => asString(image['url']))
        .whereType<String>()
        .toList();
    final thumbnail = asString(json['thumbnail_url']);
    final category = asJson(json['category']);
    final upcoming = asJson(json['upcoming_flash_sale']);

    return ProductDetail(
      id: asInt(json['id']),
      name: asString(json['name']) ?? 'Product',
      description:
          asString(json['description']) ?? asString(specs['description']) ?? '',
      images: images.isEmpty && thumbnail != null ? [thumbnail] : images,
      price: price,
      originalPrice: asDoubleOrNull(json['original_price']),
      priceMin: asDouble(range['min'], price.toDouble()),
      priceMax: asDouble(range['max'], price.toDouble()),
      unitsSold: asInt(json['units_sold']),
      avgRating: asDoubleOrNull(json['avg_rating']),
      reviewCount: asInt(json['review_count']),
      totalStock: asInt(json['total_stock']),
      onVacation: asBool(json['on_vacation']),
      seller: ProductSeller.fromJson(asJson(json['seller'])),
      variationTypes: asStringList(json['variation_types']),
      options: asJsonList(json['combinations'] ?? json['variants'])
          .map(ProductOption.fromJson)
          .toList(),
      specs: {
        for (final entry in _specLabels.entries)
          if (asString(specs[entry.key]) != null)
            entry.value: asString(specs[entry.key])!,
      },
      isWishlisted: asBool(json['is_wishlisted']),
      purchasedByYou: asInt(json['purchased_by_you']),
      deliveryDaysMin: asInt(json['estimated_delivery_days_min'], 3),
      deliveryDaysMax: asInt(json['estimated_delivery_days_max'], 7),
      flashSale: FlashSale.fromJson(json['flash_sale']),
      upcomingFlashStartsAt: asDate(upcoming['starts_at']),
      purchaseLimit: asIntOrNull(json['purchase_limit']),
      categoryName: asString(category['name']),
      returnPolicy: asString(json['return_policy']),
      warranty: asString(json['warranty']),
    );
  }
}

/// `GET /categories`: the parents with their children.
class Category {
  const Category({
    required this.id,
    required this.slug,
    required this.name,
    required this.productCount,
    required this.children,
    this.photoUrl,
    this.imageUrl,
  });

  final int id;
  final String slug;
  final String name;
  final int productCount;

  /// The admin's uploaded photo, shown first.
  final String? photoUrl;

  /// The best seller's photo, shown when there is no uploaded or built-in photo.
  final String? imageUrl;
  final List<Category> children;

  /// The catch-all "Others" category, left off the home grid like the website.
  bool get isOthers => slug == 'others' || slug == 'other-items';

  factory Category.fromJson(Json json) => Category(
    id: asInt(json['id']),
    slug: asString(json['slug']) ?? '',
    name: asString(json['name']) ?? '',
    productCount: asInt(json['product_count']),
    photoUrl: asString(json['photo_url']),
    imageUrl: asString(json['image_url']),
    children: asJsonList(json['children']).map(Category.fromJson).toList(),
  );
}

/// A shop on the home page (`GET /shops`).
class FeaturedShop {
  const FeaturedShop({
    required this.sellerId,
    required this.shopName,
    required this.productCount,
    required this.unitsSold,
    required this.reviewCount,
    required this.products,
    this.shopSlug,
    this.logoUrl,
    this.city,
    this.avgRating,
  });

  final int sellerId;
  final String shopName;
  final String? shopSlug;
  final String? logoUrl;
  final String? city;
  final int productCount;
  final int unitsSold;
  final double? avgRating;
  final int reviewCount;
  final List<ProductSummary> products;

  String get shopKey => shopSlug ?? '$sellerId';

  factory FeaturedShop.fromJson(Json json) => FeaturedShop(
    sellerId: asInt(json['seller_id']),
    shopName: asString(json['shop_name']) ?? 'Shop',
    shopSlug: asString(json['shop_slug']),
    logoUrl: asString(json['logo_url']),
    city: asString(json['city']),
    productCount: asInt(json['product_count']),
    unitsSold: asInt(json['units_sold']),
    avgRating: asDoubleOrNull(json['avg_rating']),
    reviewCount: asInt(json['review_count']),
    products: asJsonList(json['products'])
        .map(ProductSummary.fromJson)
        .toList(),
  );
}

/// `GET /shops/{shop}`, the public shop page (signed-in only).
class ShopProfile {
  const ShopProfile({
    required this.sellerId,
    required this.shopName,
    required this.totalProducts,
    required this.totalReviews,
    required this.followerCount,
    required this.isFollowing,
    required this.onVacation,
    required this.commentCount,
    this.shopSlug,
    this.description,
    this.logoUrl,
    this.bannerUrl,
    this.city,
    this.province,
    this.avgRating,
    this.joinedAt,
    this.responseTime,
    this.returnPolicy,
    this.shippingPolicy,
    this.businessHours,
  });

  final int sellerId;
  final String shopName;
  final String? shopSlug;
  final String? description;
  final String? logoUrl;
  final String? bannerUrl;
  final String? city;
  final String? province;
  final double? avgRating;
  final int totalProducts;
  final int totalReviews;
  final int followerCount;
  final bool isFollowing;
  final bool onVacation;

  /// Comments about the shop (no stars), separate from the product reviews.
  final int commentCount;
  final DateTime? joinedAt;
  final String? responseTime;
  final String? returnPolicy;
  final String? shippingPolicy;
  final String? businessHours;

  String get shopKey => shopSlug ?? '$sellerId';

  ShopProfile copyWith({bool? isFollowing, int? followerCount}) => ShopProfile(
    sellerId: sellerId,
    shopName: shopName,
    shopSlug: shopSlug,
    description: description,
    logoUrl: logoUrl,
    bannerUrl: bannerUrl,
    city: city,
    province: province,
    avgRating: avgRating,
    totalProducts: totalProducts,
    totalReviews: totalReviews,
    followerCount: followerCount ?? this.followerCount,
    isFollowing: isFollowing ?? this.isFollowing,
    onVacation: onVacation,
    commentCount: commentCount,
    joinedAt: joinedAt,
    responseTime: responseTime,
    returnPolicy: returnPolicy,
    shippingPolicy: shippingPolicy,
    businessHours: businessHours,
  );

  factory ShopProfile.fromJson(Json json) => ShopProfile(
    sellerId: asInt(json['seller_id']),
    shopName: asString(json['shop_name']) ?? 'Shop',
    shopSlug: asString(json['shop_slug']),
    description:
        asString(json['shop_bio']) ?? asString(json['shop_description']),
    logoUrl: asString(json['logo_url']),
    bannerUrl: asString(json['banner_url']),
    city: asString(json['address_city']),
    province: asString(json['address_province']),
    avgRating: asDoubleOrNull(json['avg_rating']),
    totalProducts: asInt(json['total_products']),
    totalReviews: asInt(json['total_reviews']),
    followerCount: asInt(json['follower_count']),
    isFollowing: asBool(json['is_following']),
    onVacation: asBool(json['on_vacation']),
    commentCount: asInt(asJson(json['shop_reviews'])['count']),
    joinedAt: asDate(json['joined_date']),
    responseTime: asString(json['response_time']),
    returnPolicy: asString(json['return_policy']),
    shippingPolicy: asString(json['shipping_policy']),
    businessHours: asString(json['business_hours']),
  );
}

/// A product review with stars (`/products/{id}/reviews`, `/shops/{shop}/reviews`).
class ProductReview {
  const ProductReview({
    required this.id,
    required this.rating,
    required this.buyerName,
    required this.images,
    this.comment,
    this.createdAt,
    this.variantLabel,
    this.productName,
    this.sellerReply,
  });

  final int id;
  final int rating;
  final String? comment;
  final String buyerName;
  final List<String> images;
  final DateTime? createdAt;
  final String? variantLabel;
  final String? productName;
  final String? sellerReply;

  factory ProductReview.fromJson(Json json) => ProductReview(
    id: asInt(json['id']),
    rating: asInt(json['rating']),
    comment: asString(json['comment']),
    buyerName: asString(asJson(json['buyer'])['name']) ?? 'Buyer',
    images: asStringList(json['images']),
    createdAt: asDate(json['created_at']),
    variantLabel: asString(json['variant_label']),
    productName:
        asString(asJson(json['product'])['name']) ??
        asString(json['product_name']),
    sellerReply: asString(asJson(json['seller_reply'])['body']),
  );
}

/// A comment about a shop, without stars (`/shops/{shop}/shop-reviews`).
class ShopComment {
  const ShopComment({
    required this.id,
    required this.comment,
    required this.tags,
    required this.buyerName,
    required this.edited,
    this.createdAt,
    this.sellerReply,
  });

  final int id;
  final String comment;
  final List<String> tags;
  final String buyerName;
  final bool edited;
  final DateTime? createdAt;
  final String? sellerReply;

  factory ShopComment.fromJson(Json json) => ShopComment(
    id: asInt(json['id']),
    comment: asString(json['comment']) ?? '',
    tags: asStringList(json['tags']),
    buyerName:
        asString(asJson(json['buyer'])['name']) ??
        asString(json['buyer_name']) ??
        'Buyer',
    edited: asBool(json['edited']),
    createdAt: asDate(json['created_at']),
    sellerReply: asString(asJson(json['seller_reply'])['body']),
  );
}

/// `GET /shops/{shop}/my-shop-review`: whether this buyer may comment, and their comment.
class MyShopComment {
  const MyShopComment({
    required this.canReview,
    required this.editsLeftToday,
    required this.tags,
    this.reason,
    this.review,
  });

  final bool canReview;
  final String? reason;
  final ShopComment? review;
  final int editsLeftToday;

  /// The quick tags the server accepts ("Fast shipping"…).
  final List<String> tags;

  factory MyShopComment.fromJson(Json json) => MyShopComment(
    canReview: asBool(json['can_review']),
    reason: asString(json['reason']),
    review: json['review'] is Map
        ? ShopComment.fromJson(asJson(json['review']))
        : null,
    editsLeftToday: asInt(json['edits_left_today']),
    tags: asStringList(json['tags']),
  );
}

/// A voucher as a buyer sees it (wallet, shop and product vouchers, platform vouchers).
class Voucher {
  const Voucher({
    required this.id,
    required this.code,
    required this.name,
    required this.scope,
    required this.label,
    required this.minSpend,
    required this.claimed,
    required this.fullyUsed,
    required this.status,
    this.endsAt,
    this.shopName,
  });

  final int id;
  final String code;
  final String name;

  /// `store`, `platform` or `shipping`.
  final String scope;

  /// The server's own wording of the discount ("₱50 off", "10% off up to ₱100").
  final String label;
  final num minSpend;
  final bool claimed;
  final bool fullyUsed;

  /// `upcoming`, `ongoing` or `ended`.
  final String status;
  final DateTime? endsAt;
  final String? shopName;

  factory Voucher.fromJson(Json json) => Voucher(
    id: asInt(json['id']),
    code: asString(json['code']) ?? '',
    name: asString(json['name']) ?? '',
    scope: asString(json['scope']) ?? 'store',
    label: asString(json['label']) ?? '',
    minSpend: asDouble(json['min_spend']),
    claimed: asBool(json['claimed']),
    fullyUsed: asBool(json['fully_used']) || asBool(json['used_up_by_you']),
    status: asString(json['status']) ?? 'ongoing',
    endsAt: asDate(json['ends_at']),
    shopName: asString(asJson(json['seller'])['shop_name']),
  );
}
