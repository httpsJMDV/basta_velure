import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'account/account_screen.dart';
import 'account/complete_profile_screen.dart';
import 'account/help_screens.dart';
import 'account/id_verification_screen.dart';
import 'account/profile_screens.dart';
import 'account/saved_screens.dart';
import 'account/vouchers_screen.dart';
import 'addresses/address_form_screen.dart';
import 'addresses/addresses_screen.dart';
import 'buyer_paths.dart';
import 'buyer_shell.dart';
import 'cart/cart_screen.dart';
import 'catalog/categories_screen.dart';
import 'catalog/search_screen.dart';
import 'checkout/checkout_screen.dart';
import 'data/account.dart';
import 'data/catalog.dart' show ProductDetail;
import 'data/checkout.dart';
import 'home/home_screen.dart';
import 'messages/chat_screen.dart';
import 'messages/messages_screen.dart';
import 'notifications/notifications_screen.dart';
import 'orders/order_detail_screen.dart';
import 'orders/orders_screen.dart';
import 'orders/return_request_screen.dart';
import 'orders/tracking_screen.dart';
import 'product/item_reviews_screen.dart';
import 'product/product_screen.dart';
import 'reviews/reviews_screen.dart';
import 'reviews/write_review_screen.dart';
import 'shop/shop_comments_screen.dart';
import 'shop/shop_screen.dart';
import 'widgets/buyer_theme.dart';
import 'widgets/buyer_widgets.dart' show ProductHero;

/// A buyer screen outside the tabs, in the buyer app's look.
GoRoute _screen(String path, Widget Function(GoRouterState state) build) =>
    GoRoute(
      path: path,
      builder: (_, state) => BuyerThemed(child: build(state)),
    );

/// Part B (Amaru): every buyer screen lives under `/buyer`. The five tabs share the dock; everything else opens over
/// it.
final buyerRoutes = <RouteBase>[
  StatefulShellRoute(
    builder: (_, _, shell) => BuyerShell(shell: shell),
    navigatorContainerBuilder: (_, shell, children) =>
        BuyerBranches(index: shell.currentIndex, children: children),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(path: BuyerPaths.home, builder: (_, _) => const HomeScreen()),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: BuyerPaths.categories,
            builder: (_, _) => const CategoriesScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: BuyerPaths.messages,
            builder: (_, _) => const MessagesScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(path: BuyerPaths.cart, builder: (_, _) => const CartScreen()),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: BuyerPaths.account,
            builder: (_, _) => const AccountScreen(),
          ),
        ],
      ),
    ],
  ),
  _screen(BuyerPaths.search, (state) {
    final query = state.uri.queryParameters;
    return SearchScreen(
      initialQuery: query['q'],
      categoryId: query['category'],
      parentCategoryId: query['parent'],
      title: query['title'],
      initialSort: query['sort'],
      onSale: query['on_sale'] == '1',
    );
  }),
  _screen(
    '/buyer/product/:id',
    (state) => ProductScreen(
      productId: int.parse(state.pathParameters['id']!),
      hero: state.extra is ProductHero ? state.extra! as ProductHero : null,
    ),
  ),
  _screen(
    '/buyer/product/:id/reviews',
    (state) => ItemReviewsScreen(
      productId: int.parse(state.pathParameters['id']!),
      product: state.extra is ProductDetail
          ? state.extra! as ProductDetail
          : null,
      initialRating: int.tryParse(state.uri.queryParameters['rating'] ?? ''),
      initialWithPhotos: state.uri.queryParameters['photos'] == '1',
    ),
  ),
  _screen(
    '/buyer/shop/:shop',
    (state) => ShopScreen(shopKey: state.pathParameters['shop']!),
  ),
  _screen(
    '/buyer/shop/:shop/comments',
    (state) => ShopCommentsScreen(shopKey: state.pathParameters['shop']!),
  ),
  _screen(
    BuyerPaths.checkout,
    (state) => CheckoutScreen(
      request: state.extra is CheckoutRequest
          ? state.extra! as CheckoutRequest
          : const CheckoutRequest.cart(),
    ),
  ),
  _screen(
    BuyerPaths.addresses,
    (state) =>
        AddressesScreen(picking: state.uri.queryParameters['pick'] == '1'),
  ),
  _screen(BuyerPaths.newAddress, (_) => const AddressFormScreen()),
  _screen(
    BuyerPaths.editAddress,
    (state) => AddressFormScreen(
      address: state.extra is Address ? state.extra! as Address : null,
    ),
  ),
  _screen(
    BuyerPaths.orders,
    (state) => OrdersScreen(initialTab: state.uri.queryParameters['tab']),
  ),
  _screen(
    '/buyer/orders/:id',
    (state) =>
        OrderDetailScreen(orderId: int.parse(state.pathParameters['id']!)),
  ),
  _screen(
    '/buyer/orders/:id/return',
    (state) =>
        ReturnRequestScreen(orderId: int.parse(state.pathParameters['id']!)),
  ),
  _screen(
    '/buyer/track/:tracking',
    (state) =>
        TrackingScreen(trackingNumber: state.pathParameters['tracking']!),
  ),
  _screen(BuyerPaths.reviews, (_) => const ReviewsScreen()),
  _screen(
    BuyerPaths.writeReview,
    (state) => WriteReviewScreen(target: state.extra),
  ),
  _screen(
    '/buyer/chat/:id',
    (state) =>
        ChatScreen(conversationId: int.parse(state.pathParameters['id']!)),
  ),
  _screen(BuyerPaths.notifications, (_) => const NotificationsScreen()),
  _screen(BuyerPaths.completeProfile, (_) => const CompleteProfileScreen()),
  _screen(BuyerPaths.idVerification, (_) => const IdVerificationScreen()),
  _screen(BuyerPaths.profile, (_) => const ProfileScreen()),
  _screen(BuyerPaths.password, (_) => const ChangePasswordScreen()),
  _screen(BuyerPaths.email, (_) => const ChangeEmailScreen()),
  _screen(BuyerPaths.phone, (_) => const ChangePhoneScreen()),
  _screen(BuyerPaths.wishlist, (_) => const WishlistScreen()),
  _screen(BuyerPaths.following, (_) => const FollowingScreen()),
  _screen(BuyerPaths.vouchers, (_) => const VouchersScreen()),
  _screen(BuyerPaths.feedback, (_) => const FeedbackScreen()),
  _screen(BuyerPaths.policies, (_) => const PoliciesScreen()),
];
