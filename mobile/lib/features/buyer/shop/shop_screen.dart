import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/env.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../product/product_screen.dart' show VoucherTile;
import '../product/reviews_sheet.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';
import 'report_shop_sheet.dart';

final _shopProvider = FutureProvider.autoDispose.family<ShopProfile, String>(
  (ref, shopKey) => ref.watch(buyerApiProvider).shop(shopKey),
);

/// Opens the report sheet for a shop (reason, what happened, confirm), then the Support chat with the report.
Future<void> _report(
  BuildContext context,
  ShopProfile profile,
  String shopKey,
) => showReportShopSheet(
  context,
  shopName: profile.shopName,
  shopLink: '${Env.webUrl}/shop/${profile.shopSlug ?? shopKey}',
);

/// A shop's page (B5, signed-in only): its profile, follow, chat, vouchers, reviews and comments, and every product.
class ShopScreen extends ConsumerWidget {
  const ShopScreen({super.key, required this.shopKey});

  final String shopKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = ref.watch(_shopProvider(shopKey));
    return Scaffold(
      appBar: AppBar(
        title: Text(shop.value?.shopName ?? 'Shop'),
        actions: [
          if (shop.value case final profile?)
            PopupMenuButton<String>(
              tooltip: 'More',
              icon: const Icon(LucideIcons.ellipsisVertical, size: 20),
              position: PopupMenuPosition.under,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(BuyerRadius.field),
              ),
              onSelected: (_) => _report(context, profile, shopKey),
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'report',
                  child: Row(
                    children: [
                      Icon(
                        LucideIcons.flag,
                        size: 18,
                        color: AppColors.brandRed,
                      ),
                      SizedBox(width: AppSpace.md),
                      Text('Report this shop'),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
      body: shop.when(
        loading: () => const SkeletonList(count: 4),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(_shopProvider(shopKey)),
        ),
        data: (profile) => PagedList<ProductSummary>(
          gridColumns: 2,
          gridAspectRatio: productGridAspectRatio,
          spacing: AppSpace.lg,
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            0,
            AppSpace.lg,
            AppSpace.lg,
          ),
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
  bool _aboutOpen = false;

  Future<void> _toggleFollow() async {
    if (_busy) return;
    HapticFeedback.selectionClick();
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
    final hasAbout =
        profile.responseTime != null ||
        profile.businessHours != null ||
        profile.shippingPolicy != null ||
        profile.returnPolicy != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (profile.bannerUrl != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.xs,
                AppSpace.lg,
                AppSpace.lg,
              ),
              child: AspectRatio(
                aspectRatio: 2.6,
                child: NetImage(profile.bannerUrl, radius: BuyerRadius.card),
              ),
            ),
          BlockCard(
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
                          Text(profile.shopName, style: BuyerText.section),
                          const SizedBox(height: 2),
                          Text(
                            [
                              if (place.isNotEmpty) place,
                              if (profile.joinedAt != null)
                                'Joined ${Fmt.date(profile.joinedAt)}',
                            ].join('\n'),
                            style: const TextStyle(
                              fontSize: 12.5,
                              height: 1.4,
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
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.5,
                      color: AppColors.stone700,
                    ),
                  ),
                ],
                const SizedBox(height: AppSpace.lg),
                Row(
                  children: [
                    _Figure('${profile.totalProducts}', 'Products'),
                    const _FigureDivider(),
                    _Figure('${profile.followerCount}', 'Followers'),
                    const _FigureDivider(),
                    _Figure(
                      profile.avgRating?.toStringAsFixed(1) ?? '—',
                      'Rating',
                    ),
                    const _FigureDivider(),
                    _Figure('${profile.commentCount}', 'Comments'),
                  ],
                ),
                const SizedBox(height: AppSpace.lg),
                Row(
                  children: [
                    Expanded(
                      child: AnimatedSwitcher(
                        duration: Motion.medium,
                        child: profile.isFollowing
                            ? OutlinedButton.icon(
                                key: const ValueKey('following'),
                                onPressed: _busy ? null : _toggleFollow,
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size.fromHeight(46),
                                ),
                                icon: const Icon(LucideIcons.check, size: 16),
                                label: const Text('Following'),
                              )
                            : FilledButton.icon(
                                key: const ValueKey('follow'),
                                onPressed: _busy ? null : _toggleFollow,
                                style: FilledButton.styleFrom(
                                  backgroundColor: AppColors.brandRed,
                                  minimumSize: const Size.fromHeight(46),
                                ),
                                icon: const Icon(LucideIcons.plus, size: 16),
                                label: const Text('Follow'),
                              ),
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _chat,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(46),
                        ),
                        icon: const Icon(LucideIcons.messageCircle, size: 16),
                        label: const Text('Chat'),
                      ),
                    ),
                  ],
                ),
                if (hasAbout) ...[
                  const SizedBox(height: AppSpace.sm),
                  InkWell(
                    borderRadius: BorderRadius.circular(BuyerRadius.field),
                    onTap: () => setState(() => _aboutOpen = !_aboutOpen),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'About this shop',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          AnimatedRotation(
                            turns: _aboutOpen ? 0.5 : 0,
                            duration: Motion.medium,
                            curve: Motion.glide,
                            child: const Icon(
                              LucideIcons.chevronDown,
                              size: 18,
                              color: AppColors.stone500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  AnimatedSize(
                    duration: Motion.medium,
                    curve: Motion.glide,
                    alignment: Alignment.topCenter,
                    child: !_aboutOpen
                        ? const SizedBox(width: double.infinity)
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (profile.responseTime != null)
                                _AboutLine('Replies', profile.responseTime!),
                              if (profile.businessHours != null)
                                _AboutLine('Hours', profile.businessHours!),
                              if (profile.shippingPolicy != null)
                                _AboutLine('Shipping', profile.shippingPolicy!),
                              if (profile.returnPolicy != null)
                                _AboutLine('Returns', profile.returnPolicy!),
                            ],
                          ),
                  ),
                ],
                const SizedBox(height: AppSpace.xs),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => _report(context, profile, widget.shopKey),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.stone500,
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      textStyle: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    icon: const Icon(LucideIcons.flag, size: 14),
                    label: const Text('Report this shop'),
                  ),
                ),
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
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: AppColors.stone900,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            label,
            style: const TextStyle(fontSize: 11.5, color: AppColors.stone500),
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
          MenuRow(
            icon: Icons.star_rounded,
            iconColor: const Color(0xFFF59E0B),
            iconBackground: const Color(0xFFFFF8EC),
            title: 'Product reviews',
            subtitle: profile.totalReviews == 0
                ? 'No reviews yet'
                : '${profile.avgRating?.toStringAsFixed(1) ?? '—'} average from ${profile.totalReviews}',
            onTap: () => showReviewsSheet(
              context,
              title: 'Product reviews',
              load: (page) => ref
                  .read(buyerApiProvider)
                  .shopReviews(profile.shopKey, page: page),
            ),
          ),
          const MenuDivider(),
          MenuRow(
            icon: LucideIcons.messageSquare,
            title: 'Comments about the shop',
            subtitle: profile.commentCount == 0
                ? 'No comments yet'
                : '${profile.commentCount} comments',
            onTap: () => context.push(BuyerPaths.shopComments(profile.shopKey)),
          ),
        ],
      ),
    );
  }
}

class _AboutLine extends StatelessWidget {
  const _AboutLine(this.label, this.text);

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.stone500,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            text,
            style: const TextStyle(
              fontSize: 14,
              height: 1.45,
              color: AppColors.stone800,
            ),
          ),
        ],
      ),
    );
  }
}

class _FigureDivider extends StatelessWidget {
  const _FigureDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 26, color: const Color(0xFFEFEBE6));
}
