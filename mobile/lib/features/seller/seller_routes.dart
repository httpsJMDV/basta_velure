import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../buyer/buyer_shell.dart';
import '../buyer/widgets/buyer_theme.dart';
import 'home/seller_home_screen.dart';
import 'more/seller_more_screen.dart';
import 'orders/seller_order_screen.dart';
import 'orders/seller_orders_screen.dart';
import 'products/seller_products_screen.dart';

/// Every Seller Centre address. All sit under `/seller`, so the router keeps them in the seller home.
abstract final class SellerPaths {
  static const home = '/seller';
  static const orders = '/seller/orders';
  static const products = '/seller/products';
  static const more = '/seller/more';

  static String order(int id) => '/seller/orders/$id';

  /// The website's Seller Centre, for what the app leaves to it (adding products, promotions, payouts, reports).
  static const web = '/seller';
}

/// The Seller Centre in the app, for a shop owner on the go: today's sales and what needs doing, orders from new to
/// shipped (with returns and refunds), and quick stock, price and show or hide changes. Adding and editing products,
/// promotions, vouchers, payouts and reports stay on the website.
final sellerRoutes = <RouteBase>[
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => BuyerThemed(child: _SellerShell(shell: shell)),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: SellerPaths.home,
            builder: (_, _) => const SellerHomeScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: SellerPaths.orders,
            builder: (_, state) => SellerOrdersScreen(
              initialTab: state.uri.queryParameters['tab'],
            ),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: SellerPaths.products,
            builder: (_, _) => const SellerProductsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: SellerPaths.more,
            builder: (_, _) => const SellerMoreScreen(),
          ),
        ],
      ),
    ],
  ),
  GoRoute(
    path: '/seller/orders/:id',
    builder: (_, state) => BuyerThemed(
      child: SellerOrderScreen(orderId: int.parse(state.pathParameters['id']!)),
    ),
  ),
];

class _SellerShell extends StatelessWidget {
  const _SellerShell({required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: shell,
      bottomNavigationBar: BuyerDock(
        index: shell.currentIndex,
        onSelected: (index) {
          if (index != shell.currentIndex) HapticFeedback.selectionClick();
          shell.goBranch(index, initialLocation: index == shell.currentIndex);
        },
        items: const [
          DockItem(icon: LucideIcons.layoutDashboard, label: 'Home'),
          DockItem(icon: LucideIcons.receipt, label: 'Orders'),
          DockItem(icon: LucideIcons.package, label: 'Products'),
          DockItem(icon: LucideIcons.store, label: 'Shop'),
        ],
      ),
    );
  }
}
