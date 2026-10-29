import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../product/product_screen.dart' show VoucherTile;
import '../product/reviews_sheet.dart';
import '../widgets/buyer_widgets.dart';

final _shopProvider = FutureProvider.autoDispose.family<ShopProfile, String>(
  (ref, shopKey) => ref.watch(buyerApiProvider).shop(shopKey),
);

/// A shop's page (B5, signed-in only): its profile, follow, chat, vouchers, reviews and comments, and every product.
class ShopScreen extends ConsumerWidget {
  const ShopScreen({super.key, required this.shopKey});

  final String shopKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = ref.watch(_shopProvider(shopKey));
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: Text(shop.value?.shopName ?? 'Shop')),
      body: shop.when(
        loading: () => const SkeletonList(count: 4),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(_shopProvider(shopKey)),
        ),
        data: (profile) => PagedList<ProductSummary>(
          gridColumns: 2,
          gridAspectRatio: productGridAspectRatio,
          onRefresh: () async => ref.invalidate(_shopProvider(shopKey)),
          load: (page) => ref
              .read(buyerApiProvider)
              .products(
                page: page,
                sellerId: profile.sellerId,
                sort: 'best_selling',
              ),
          itemBuilder: (_, product) => ProductCard(product: product),
          empty: const EmptyState(
            icon: LucideIcons.package,
            title: 'No products yet',
            message: 'This shop has not listed anything yet.',
          ),
          header: [
            SliverToBoxAdapter(
              child: _ShopHeader(profile: profile, shopKey: shopKey),
            ),
            SliverToBoxAdapter(
              child: _ShopVouchers(sellerId: profile.sellerId),
            ),
            SliverToBoxAdapter(child: _ShopFeedback(profile: profile)),
            SliverToBoxAdapter(
              child: SectionHeader(
                title: 'Products (${profile.totalProducts})',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShopHeader extends ConsumerStatefulWidget {
  const _ShopHeader({required this.profile, required this.shopKey});

  final ShopProfile profile;
  final String shopKey;

  @override
  ConsumerState<_ShopHeader> createState() => _ShopHeaderState();
}

class _ShopHeaderState extends ConsumerState<_ShopHeader> {
  late ShopProfile _profile = widget.profile;
  bool _busy = false;

  Future<void> _toggleFollow() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final following = await ref
          .read(buyerApiProvider)
          .toggleFollow(_profile.sellerId);
      if (!mounted) return;
      setState(
        () => _profile = _profile.copyWith(
          isFollowing: following,
          followerCount: _profile.followerCount + (following ? 1 : -1),
        ),
      );
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _chat() async {
    try {
      final id = await ref
          .read(buyerApiProvider)
          .startChat(sellerId: _profile.sellerId);
      if (mounted) context.push(BuyerPaths.chat(id));
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    final place = [
      profile.city,
      profile.province,
    ].whereType<String>().join(', ');
    return Container(
      color: AppColors.white,
      margin: const EdgeInsets.only(bottom: AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (profile.bannerUrl != null)
            AspectRatio(aspectRatio: 3, child: NetImage(profile.bannerUrl)),
          Padding(
            padding: const EdgeInsets.all(AppSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    ShopAvatar(
                      name: profile.shopName,
                      url: profile.logoUrl,
                      size: 60,
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            profile.shopName,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          if (place.isNotEmpty)
                            Text(
                              place,
                              style: const TextStyle(
                                fontSize: 13,
                                color: AppColors.stone500,
                              ),
                            ),
                          if (profile.joinedAt != null)
                            Text(
                              'Joined ${Fmt.date(profile.joinedAt)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.stone500,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (profile.onVacation) ...[
                  const SizedBox(height: AppSpace.md),
                  const MessageBanner(
                    message: 'This shop is on vacation. You can browse, but ordering is paused.',
                    tone: StatusTone.amber,
                  ),
                ],
                if (profile.description != null) ...[
                  const SizedBox(height: AppSpace.md),
                  Text(
                    profile.description!,
                    style: const TextStyle(height: 1.45),
                  ),
                ],
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    _Figure('${profile.totalProducts}', 'Products'),
                    _Figure('${profile.followerCount}', 'Followers'),
                    _Figure(
                      profile.avgRating?.toStringAsFixed(1) ?? '—',
                      'Rating',
                    ),
                    _Figure('${profile.commentCount}', 'Comments'),
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    Expanded(
                      child: profile.isFollowing
                          ? OutlinedButton.icon(
                              onPressed: _busy ? null : _toggleFollow,
                              icon: const Icon(LucideIcons.check, size: 16),
                              label: const Text('Following'),
                            )
                          : FilledButton.icon(
                              onPressed: _busy ? null : _toggleFollow,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.brandRed,
                              ),
                              icon: const Icon(LucideIcons.plus, size: 16),
                              label: const Text('Follow'),
                            ),
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _chat,
                        icon: const Icon(LucideIcons.messageCircle, size: 16),
                        label: const Text('Chat'),
                      ),
                    ),
                  ],
                ),
                if (profile.responseTime != null ||
                    profile.businessHours != null ||
                    profile.shippingPolicy != null ||
                    profile.returnPolicy != null) ...[
                  const SizedBox(height: AppSpace.md),
                  if (profile.responseTime != null)
                    InfoRow('Replies', profile.responseTime!),
                  if (profile.businessHours != null)
                    InfoRow('Hours', profile.businessHours!),
                  if (profile.shippingPolicy != null)
                    InfoRow('Shipping', profile.shippingPolicy!),
                  if (profile.returnPolicy != null)
                    InfoRow('Returns', profile.returnPolicy!),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure(this.value, this.label);

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.stone500),
          ),
        ],
      ),
    );
  }
}

class _ShopVouchers extends ConsumerStatefulWidget {
  const _ShopVouchers({required this.sellerId});

  final int sellerId;

  @override
  ConsumerState<_ShopVouchers> createState() => _ShopVouchersState();
}

class _ShopVouchersState extends ConsumerState<_ShopVouchers> {
  late Future<List<Voucher>> _vouchers = ref
      .read(buyerApiProvider)
      .shopVouchers(widget.sellerId);
  final _claiming = <int>{};

  Future<void> _claim(Voucher voucher) async {
    setState(() => _claiming.add(voucher.id));
    try {
      final message = await ref
          .read(buyerApiProvider)
          .claimVoucher(id: voucher.id);
      if (!mounted) return;
      showSnack(context, message);
      setState(
        () => _vouchers = ref
            .read(buyerApiProvider)
            .shopVouchers(widget.sellerId),
      );
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    } finally {
      if (mounted) setState(() => _claiming.remove(voucher.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Voucher>>(
      future: _vouchers,
      builder: (context, snapshot) {
        final vouchers = (snapshot.data ?? const <Voucher>[])
            .where((voucher) => voucher.status != 'ended')
            .toList();
        if (vouchers.isEmpty) return const SizedBox.shrink();
        return BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Shop vouchers',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              for (final voucher in vouchers)
                VoucherTile(
                  voucher: voucher,
                  busy: _claiming.contains(voucher.id),
                  onClaim: voucher.claimed ? null : () => _claim(voucher),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ShopFeedback extends ConsumerWidget {
  const _ShopFeedback({required this.profile});

  final ShopProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return BlockCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          ListTile(
            minTileHeight: 56,
            leading: const Icon(LucideIcons.star, color: Color(0xFFF59E0B)),
            title: const Text('Product reviews'),
            subtitle: Text(
              profile.totalReviews == 0
                  ? 'No reviews yet'
                  : '${profile.avgRating?.toStringAsFixed(1) ?? '—'} average from ${profile.totalReviews}',
            ),
            trailing: const Icon(LucideIcons.chevronRight, size: 18),
            onTap: () => showReviewsSheet(
              context,
              title: 'Product reviews',
              load: (page) => ref
                  .read(buyerApiProvider)
                  .shopReviews(profile.shopKey, page: page),
            ),
          ),
          const Divider(height: 1),
          ListTile(
            minTileHeight: 56,
            leading: const Icon(
              LucideIcons.messageSquare,
              color: AppColors.stone600,
            ),
            title: const Text('Comments about the shop'),
            subtitle: Text(
              profile.commentCount == 0
                  ? 'No comments yet'
                  : '${profile.commentCount} comments',
            ),
            trailing: const Icon(LucideIcons.chevronRight, size: 18),
            onTap: () => context.push(BuyerPaths.shopComments(profile.shopKey)),
          ),
        ],
      ),
    );
  }
}
