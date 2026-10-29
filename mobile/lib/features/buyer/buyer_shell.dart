import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import 'data/badges.dart';
import 'data/cart.dart';

/// The buyer app's frame (B0): the five tabs at the bottom, each keeping its own place when you switch.
class BuyerShell extends ConsumerWidget {
  const BuyerShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartLines = ref.watch(cartProvider).value?.lines ?? 0;
    final unread = ref.watch(unreadMessagesProvider).value ?? 0;

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        // Tapping the open tab again goes back to its first screen.
        onDestinationSelected: (index) =>
            shell.goBranch(index, initialLocation: index == shell.currentIndex),
        destinations: [
          const NavigationDestination(
            icon: Icon(LucideIcons.house),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(LucideIcons.layoutGrid),
            label: 'Categories',
          ),
          NavigationDestination(
            icon: _Badged(count: unread, icon: LucideIcons.messageCircle),
            label: 'Messages',
            tooltip: unread > 0 ? 'Messages, $unread unread' : 'Messages',
          ),
          NavigationDestination(
            icon: _Badged(count: cartLines, icon: LucideIcons.shoppingCart),
            label: 'Cart',
            tooltip: cartLines > 0 ? 'Cart, $cartLines items' : 'Cart',
          ),
          const NavigationDestination(
            icon: Icon(LucideIcons.user),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}

class _Badged extends StatelessWidget {
  const _Badged({required this.count, required this.icon});

  final int count;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Badge(
      isLabelVisible: count > 0,
      backgroundColor: AppColors.brandRed,
      label: Text(count > 99 ? '99+' : '$count'),
      child: Icon(icon),
    );
  }
}
