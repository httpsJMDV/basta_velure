/// Every buyer screen's address. All of them sit under `/buyer`, so the router keeps them in the buyer home.
abstract final class BuyerPaths {
  // The five tabs of the bottom bar.
  static const home = '/buyer';
  static const categories = '/buyer/categories';
  static const messages = '/buyer/messages';
  static const cart = '/buyer/cart';
  static const account = '/buyer/account';

  static const search = '/buyer/search';
  static const checkout = '/buyer/checkout';
  static const addresses = '/buyer/addresses';
  static const newAddress = '/buyer/addresses/new';
  static const editAddress = '/buyer/addresses/edit';
  static const orders = '/buyer/orders';
  static const reviews = '/buyer/reviews';
  static const writeReview = '/buyer/reviews/write';
  static const notifications = '/buyer/notifications';
  static const completeProfile = '/buyer/complete-profile';
  static const idVerification = '/buyer/account/id-verification';
  static const profile = '/buyer/account/profile';
  static const password = '/buyer/account/password';
  static const email = '/buyer/account/email';
  static const phone = '/buyer/account/phone';
  static const wishlist = '/buyer/account/wishlist';
  static const following = '/buyer/account/following';
  static const vouchers = '/buyer/account/vouchers';
  static const feedback = '/buyer/account/feedback';
  static const policies = '/buyer/account/policies';

  static String product(int id) => '/buyer/product/$id';
  static String shop(String shopKey) =>
      '/buyer/shop/${Uri.encodeComponent(shopKey)}';
  static String shopComments(String shopKey) =>
      '/buyer/shop/${Uri.encodeComponent(shopKey)}/comments';
  static String order(int id) => '/buyer/orders/$id';
  static String orderReturn(int id) => '/buyer/orders/$id/return';
  static String track(String trackingNumber) =>
      '/buyer/track/${Uri.encodeComponent(trackingNumber)}';
  static String chat(int conversationId) => '/buyer/chat/$conversationId';

  /// The product list for a search, a category or a filter. [title] names the screen.
  static String searchFor({
    String? q,
    String? categoryId,
    String? parentCategoryId,
    String? title,
    String? sort,
    bool onSale = false,
  }) => Uri(
    path: search,
    queryParameters: {
      if (q != null && q.isNotEmpty) 'q': q,
      'category': ?categoryId,
      'parent': ?parentCategoryId,
      'title': ?title,
      'sort': ?sort,
      if (onSale) 'on_sale': '1',
    },
  ).toString();

  static String ordersTab(String tabKey) =>
      Uri(path: orders, queryParameters: {'tab': tabKey}).toString();
}
