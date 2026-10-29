import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';

/// The wishlist (B13).
class WishlistScreen extends ConsumerStatefulWidget {
  const WishlistScreen({super.key});

  @override
  ConsumerState<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends ConsumerState<WishlistScreen> {
  final _list = GlobalKey<PagedListState<WishlistEntry>>();

  Future<void> _remove(WishlistEntry entry) async {
    try {
      await ref.read(buyerApiProvider).toggleWishlist(entry.productId);
      await _list.currentState?.refresh();
      if (mounted) showSnack(context, 'Removed from your wishlist.');
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('Wishlist')),
      body: PagedList<WishlistEntry>(
        key: _list,
        load: (page) => ref.read(buyerApiProvider).wishlist(page: page),
        itemBuilder: (_, entry) => Material(
          color: AppColors.white,
          borderRadius: AppRadius.cardAll,
          child: InkWell(
            borderRadius: AppRadius.cardAll,
            onTap: () => context.push(BuyerPaths.product(entry.productId)),
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.md),
              child: Row(
                children: [
                  NetImage(
                    entry.thumbnailUrl,
                    width: 72,
                    height: 72,
                    radius: 8,
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (entry.shopName != null)
                          Text(
                            entry.shopName!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            PesoText(
                              entry.price,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppColors.brandRed,
                              ),
                            ),
                            const SizedBox(width: AppSpace.sm),
                            if (entry.availability != 'available')
                              StatusChip(
                                label: switch (entry.availability) {
                                  'sold_out' => 'Sold out',
                                  'on_vacation' => 'Shop away',
                                  _ => 'Unavailable',
                                },
                                tone: StatusTone.gray,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove from wishlist',
                    onPressed: () => _remove(entry),
                    icon: const Icon(
                      LucideIcons.heart,
                      color: AppColors.brandRed,
                      fill: 1,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        empty: EmptyState(
          icon: LucideIcons.heart,
          title: 'Your wishlist is empty',
          message: 'Tap the heart on a product to save it here.',
          actionLabel: 'Start shopping',
          onAction: () => context.go(BuyerPaths.home),
        ),
      ),
    );
  }
}

/// The shops the buyer follows (B13).
class FollowingScreen extends ConsumerWidget {
  const FollowingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('Shops I follow')),
      body: PagedList<FollowedShop>(
        load: (page) => ref.read(buyerApiProvider).followedShops(page: page),
        itemBuilder: (_, shop) => Material(
          color: AppColors.white,
          borderRadius: AppRadius.cardAll,
          child: ListTile(
            minTileHeight: 72,
            shape: RoundedRectangleBorder(borderRadius: AppRadius.cardAll),
            onTap: () => context.push(BuyerPaths.shop(shop.shopKey)),
            leading: ShopAvatar(name: shop.shopName, url: shop.logoUrl),
            title: Text(
              shop.shopName,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              [
                '${shop.productCount} products',
                if (shop.avgRating != null)
                  '${shop.avgRating!.toStringAsFixed(1)}★',
              ].join(' · '),
            ),
            trailing: shop.hasSale
                ? const StatusChip(label: 'Sale', tone: StatusTone.rose)
                : const Icon(LucideIcons.chevronRight, size: 18),
          ),
        ),
        empty: const EmptyState(
          icon: LucideIcons.store,
          title: 'No shops yet',
          message: 'Tap Follow on a shop page to see it here.',
        ),
      ),
    );
  }
}
