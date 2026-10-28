import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/web_links.dart';
import '../../core/widgets/widgets.dart';
import '../auth/placeholder_home.dart';

/// The buyer home. Part B replaces this with the real Home tab and the bottom bar (task B0).
class BuyerHomeScreen extends ConsumerWidget {
  const BuyerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isSeller = ref.watch(currentUserProvider)?.isSeller ?? false;
    return PlaceholderHome(
      title: 'Loved-IT',
      icon: LucideIcons.shoppingBag,
      message: 'Shopping, cart, checkout and orders come in Part B.',
      // Sellers shop in the app too; their shop is run from the website (task A6).
      notice: isSeller
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const MessageBanner(
                  message: 'Your shop is run from the website. Use loved-it.shop on a computer for the Seller Centre.',
                  tone: StatusTone.blue,
                  icon: LucideIcons.store,
                ),
                const SizedBox(height: AppSpace.xs),
                TextButton.icon(
                  onPressed: () => openWebsite('/seller'),
                  icon: const Icon(LucideIcons.externalLink, size: 18),
                  label: const Text('Open the Seller Centre'),
                ),
              ],
            )
          : null,
    );
  }
}
