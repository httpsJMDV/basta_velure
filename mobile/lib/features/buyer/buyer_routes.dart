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
import 'data/checkout.dart';
import 'home/home_screen.dart';
import 'messages/chat_screen.dart';
import 'messages/messages_screen.dart';
import 'notifications/notifications_screen.dart';
import 'orders/order_detail_screen.dart';
import 'orders/orders_screen.dart';
import 'orders/return_request_screen.dart';
import 'orders/tracking_screen.dart';
import 'product/product_screen.dart';
import 'reviews/reviews_screen.dart';
import 'reviews/write_review_screen.dart';
import 'shop/shop_comments_screen.dart';
import 'shop/shop_screen.dart';

/// Part B (Amaru): every buyer screen lives under `/buyer`. The five tabs share the bottom bar; everything else
/// opens over it.
final buyerRoutes = <RouteBase>[
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => BuyerShell(shell: shell),
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
  GoRoute(
    path: BuyerPaths.search,
    builder: (_, state) {
      final query = state.uri.queryParameters;
      return SearchScreen(
        initialQuery: query['q'],
        categoryId: query['category'],
        parentCategoryId: query['parent'],
        title: query['title'],
        initialSort: query['sort'],
        onSale: query['on_sale'] == '1',
      );
    },
  ),
  GoRoute(
    path: '/buyer/product/:id',
    builder: (_, state) =>
        ProductScreen(productId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: '/buyer/shop/:shop',
    builder: (_, state) => ShopScreen(shopKey: state.pathParameters['shop']!),
  ),
  GoRoute(
    path: '/buyer/shop/:shop/comments',
    builder: (_, state) =>
        ShopCommentsScreen(shopKey: state.pathParameters['shop']!),
  ),
  GoRoute(
    path: BuyerPaths.checkout,
    builder: (_, state) => CheckoutScreen(
      request: state.extra is CheckoutRequest
          ? state.extra! as CheckoutRequest
          : const CheckoutRequest.cart(),
    ),
  ),
  GoRoute(
    path: BuyerPaths.addresses,
    builder: (_, state) =>
        AddressesScreen(picking: state.uri.queryParameters['pick'] == '1'),
  ),
  GoRoute(
    path: BuyerPaths.newAddress,
    builder: (_, _) => const AddressFormScreen(),
  ),
  GoRoute(
    path: BuyerPaths.editAddress,
    builder: (_, state) => AddressFormScreen(
      address: state.extra is Address ? state.extra! as Address : null,
    ),
  ),
  GoRoute(
    path: BuyerPaths.orders,
    builder: (_, state) =>
        OrdersScreen(initialTab: state.uri.queryParameters['tab']),
  ),
  GoRoute(
    path: '/buyer/orders/:id',
    builder: (_, state) =>
        OrderDetailScreen(orderId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: '/buyer/orders/:id/return',
    builder: (_, state) =>
        ReturnRequestScreen(orderId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: '/buyer/track/:tracking',
    builder: (_, state) =>
        TrackingScreen(trackingNumber: state.pathParameters['tracking']!),
  ),
  GoRoute(path: BuyerPaths.reviews, builder: (_, _) => const ReviewsScreen()),
  GoRoute(
    path: BuyerPaths.writeReview,
    builder: (_, state) => WriteReviewScreen(target: state.extra),
  ),
  GoRoute(
    path: '/buyer/chat/:id',
    builder: (_, state) =>
        ChatScreen(conversationId: int.parse(state.pathParameters['id']!)),
  ),
  GoRoute(
    path: BuyerPaths.notifications,
    builder: (_, _) => const NotificationsScreen(),
  ),
  GoRoute(
    path: BuyerPaths.completeProfile,
    builder: (_, _) => const CompleteProfileScreen(),
  ),
  GoRoute(
    path: BuyerPaths.idVerification,
    builder: (_, _) => const IdVerificationScreen(),
  ),
  GoRoute(path: BuyerPaths.profile, builder: (_, _) => const ProfileScreen()),
  GoRoute(
    path: BuyerPaths.password,
    builder: (_, _) => const ChangePasswordScreen(),
  ),
  GoRoute(path: BuyerPaths.email, builder: (_, _) => const ChangeEmailScreen()),
  GoRoute(path: BuyerPaths.phone, builder: (_, _) => const ChangePhoneScreen()),
  GoRoute(path: BuyerPaths.wishlist, builder: (_, _) => const WishlistScreen()),
  GoRoute(
    path: BuyerPaths.following,
    builder: (_, _) => const FollowingScreen(),
  ),
  GoRoute(path: BuyerPaths.vouchers, builder: (_, _) => const VouchersScreen()),
  GoRoute(path: BuyerPaths.feedback, builder: (_, _) => const FeedbackScreen()),
  GoRoute(path: BuyerPaths.policies, builder: (_, _) => const PoliciesScreen()),
];
