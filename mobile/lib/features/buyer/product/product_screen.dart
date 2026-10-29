import 'dart:async';

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
import '../data/cart.dart';
import '../data/catalog.dart';
import '../data/checkout.dart';
import '../widgets/buyer_widgets.dart';
import '../widgets/photo_viewer.dart';
import 'option_sheet.dart';
import 'reviews_sheet.dart';

/// The product page (B4): swipeable photos, the price block with any sale or flash sale, options, the shop card,
/// details, reviews and related products. Add to cart and Buy now stay at the bottom.
class ProductScreen extends ConsumerWidget {
  const ProductScreen({super.key, required this.productId});

  final int productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(productId));
    return product.when(
      loading: () => Scaffold(appBar: AppBar(), body: const _ProductSkeleton()),
      error: (error, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(productProvider(productId)),
        ),
      ),
      data: (product) => _ProductView(product: product),
    );
  }
}

class _ProductView extends ConsumerStatefulWidget {
  const _ProductView({required this.product});

  final ProductDetail product;

  @override
  ConsumerState<_ProductView> createState() => _ProductViewState();
}

class _ProductViewState extends ConsumerState<_ProductView> {
  late bool _wishlisted = widget.product.isWishlisted;
  bool _togglingWishlist = false;

  ProductDetail get product => widget.product;

  Future<void> _toggleWishlist() async {
    if (_togglingWishlist) return;
    setState(() {
      _togglingWishlist = true;
      _wishlisted = !_wishlisted;
    });
    try {
      final now = await ref.read(buyerApiProvider).toggleWishlist(product.id);
      if (mounted) setState(() => _wishlisted = now);
    } catch (error) {
      if (!mounted) return;
      setState(() => _wishlisted = !_wishlisted);
      showSnack(context, ApiFailure.from(error).message, error: true);
    } finally {
      if (mounted) setState(() => _togglingWishlist = false);
    }
  }

  Future<void> _choose(OptionAction action) async {
    final choice = await showOptionSheet(
      context,
      product: product,
      action: action,
    );
    if (choice == null || !mounted) return;
    if (action == OptionAction.buyNow) {
      context.push(
        BuyerPaths.checkout,
        extra: CheckoutRequest.buyNow(choice.option.variantId, choice.quantity),
      );
      return;
    }
    try {
      final message = await ref
          .read(cartProvider.notifier)
          .add(choice.option.variantId, choice.quantity);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(message),
            behavior: SnackBarBehavior.floating,
            action: SnackBarAction(
              label: 'View cart',
              onPressed: () => context.go(BuyerPaths.cart),
            ),
          ),
        );
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  Future<void> _chat() async {
    try {
      final id = await ref
          .read(buyerApiProvider)
          .startChat(sellerId: product.seller.id, productId: product.id);
      if (mounted) context.push(BuyerPaths.chat(id));
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final blocked = product.soldOut || product.onVacation;
    return Scaffold(
      backgroundColor: AppColors.stone50,
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(productProvider(product.id)),
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              expandedHeight: MediaQuery.sizeOf(context).width,
              backgroundColor: AppColors.white,
              actions: [
                IconButton(
                  tooltip: _wishlisted
                      ? 'Remove from wishlist'
                      : 'Add to wishlist',
                  onPressed: _toggleWishlist,
                  icon: Icon(
                    LucideIcons.heart,
                    color: _wishlisted ? AppColors.brandRed : null,
                    fill: _wishlisted ? 1 : 0,
                  ),
                ),
                IconButton(
                  tooltip: 'Cart',
                  onPressed: () => context.go(BuyerPaths.cart),
                  icon: const Icon(LucideIcons.shoppingCart),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: _Gallery(images: product.images),
              ),
            ),
            SliverToBoxAdapter(child: _PriceBlock(product: product)),
            SliverToBoxAdapter(child: _Vouchers(productId: product.id)),
            SliverToBoxAdapter(
              child: _OptionsRow(
                product: product,
                onTap: () => _choose(OptionAction.addToCart),
              ),
            ),
            SliverToBoxAdapter(
              child: _ShopCard(seller: product.seller, onChat: _chat),
            ),
            SliverToBoxAdapter(child: _Details(product: product)),
            SliverToBoxAdapter(child: _ReviewsBlock(product: product)),
            SliverToBoxAdapter(child: _Related(productId: product.id)),
            const SliverToBoxAdapter(child: SizedBox(height: AppSpace.xl)),
          ],
        ),
      ),
      bottomNavigationBar: _BuyBar(
        blocked: blocked,
        blockedLabel: product.onVacation ? 'Shop on vacation' : 'Sold out',
        onChat: _chat,
        onAddToCart: () => _choose(OptionAction.addToCart),
        onBuyNow: () => _choose(OptionAction.buyNow),
      ),
    );
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.images});

  final List<String> images;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _current = 0;

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    if (images.isEmpty) return const NetImage(null);
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          itemCount: images.length,
          onPageChanged: (index) => setState(() => _current = index),
          itemBuilder: (context, index) => GestureDetector(
            onTap: () => showPhotoViewer(context, images, initial: index),
            child: NetImage(images[index]),
          ),
        ),
        if (images.length > 1)
          Positioned(
            right: AppSpace.md,
            bottom: AppSpace.md,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.stone900.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                '${_current + 1}/${images.length}',
                style: const TextStyle(color: AppColors.white, fontSize: 12),
              ),
            ),
          ),
      ],
    );
  }
}

class _PriceBlock extends StatelessWidget {
  const _PriceBlock({required this.product});

  final ProductDetail product;

  @override
  Widget build(BuildContext context) {
    final discount = Fmt.discountPercent(product.price, product.originalPrice);
    final flash = product.flashSale;
    final ranged = product.priceMax > product.priceMin;
    final sold = Fmt.sold(product.unitsSold);

    return Container(
      color: AppColors.white,
      margin: const EdgeInsets.only(bottom: AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (flash != null && flash.endsAt != null)
            _FlashBanner(endsAt: flash.endsAt!, remaining: flash.remaining),
          Padding(
            padding: const EdgeInsets.all(AppSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: AppSpace.sm,
                  children: [
                    Text(
                      ranged
                          ? '${formatPeso(product.priceMin)} – ${formatPeso(product.priceMax)}'
                          : formatPeso(flash?.price ?? product.price),
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brandRed,
                      ),
                    ),
                    if (discount > 0 && !ranged) ...[
                      PesoText(product.originalPrice, struck: true),
                      Text(
                        '-$discount%',
                        style: const TextStyle(
                          color: AppColors.brandRed,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: AppSpace.sm),
                Text(
                  product.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: AppSpace.sm),
                Row(
                  children: [
                    if (product.avgRating != null &&
                        product.reviewCount > 0) ...[
                      Stars(rating: product.avgRating!),
                      const SizedBox(width: 6),
                      Text(
                        '${product.avgRating!.toStringAsFixed(1)} (${product.reviewCount})',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.stone600,
                        ),
                      ),
                    ] else
                      const Text(
                        'No reviews yet',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.stone500,
                        ),
                      ),
                    if (sold != null) ...[
                      const Text(
                        '  ·  ',
                        style: TextStyle(color: AppColors.stone400),
                      ),
                      Text(
                        sold,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.stone600,
                        ),
                      ),
                    ],
                  ],
                ),
                if (product.upcomingFlashStartsAt != null && flash == null) ...[
                  const SizedBox(height: AppSpace.md),
                  MessageBanner(
                    message:
                        'Flash sale starts ${Fmt.dateTime(product.upcomingFlashStartsAt)}.',
                    tone: StatusTone.amber,
                    icon: LucideIcons.zap,
                  ),
                ],
                if (product.onVacation) ...[
                  const SizedBox(height: AppSpace.md),
                  const MessageBanner(
                    message: 'This shop is on vacation. You can order again when it is back.',
                    tone: StatusTone.amber,
                    icon: LucideIcons.store,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The flash sale bar with its countdown, ticking every second while the page is open.
class _FlashBanner extends StatefulWidget {
  const _FlashBanner({required this.endsAt, required this.remaining});

  final DateTime endsAt;
  final int remaining;

  @override
  State<_FlashBanner> createState() => _FlashBannerState();
}

class _FlashBannerState extends State<_FlashBanner> {
  late final Timer _tick = Timer.periodic(
    const Duration(seconds: 1),
    (_) => setState(() {}),
  );

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.brandRed,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.lg,
        vertical: 10,
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.zap, color: AppColors.white, size: 18),
          const SizedBox(width: AppSpace.sm),
          const Text(
            'Flash sale',
            style: TextStyle(
              color: AppColors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(),
          Text(
            'Ends in ${Fmt.countdown(widget.endsAt)}',
            style: const TextStyle(
              color: AppColors.white,
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _Vouchers extends ConsumerStatefulWidget {
  const _Vouchers({required this.productId});

  final int productId;

  @override
  ConsumerState<_Vouchers> createState() => _VouchersState();
}

class _VouchersState extends ConsumerState<_Vouchers> {
  late Future<List<Voucher>> _vouchers = ref
      .read(buyerApiProvider)
      .productVouchers(widget.productId);
  final _claiming = <int>{};

  Future<void> _claim(Voucher voucher) async {
    setState(() => _claiming.add(voucher.id));
    try {
      final message = await ref
          .read(buyerApiProvider)
          .claimVoucher(id: voucher.id);
      if (!mounted) return;
      showSnack(context, message);
      setState(() {
        _vouchers = ref
            .read(buyerApiProvider)
            .productVouchers(widget.productId);
      });
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
        final vouchers = snapshot.data ?? const <Voucher>[];
        if (vouchers.isEmpty) return const SizedBox.shrink();
        return BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(LucideIcons.ticket, size: 18, color: AppColors.brandRed),
                  SizedBox(width: AppSpace.sm),
                  Text(
                    'Vouchers',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.sm),
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

/// A voucher with its discount, minimum spend and a Save button.
class VoucherTile extends StatelessWidget {
  const VoucherTile({
    super.key,
    required this.voucher,
    this.onClaim,
    this.busy = false,
  });

  final Voucher voucher;
  final VoidCallback? onClaim;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final saved = voucher.claimed;
    return Container(
      margin: const EdgeInsets.only(top: AppSpace.sm),
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: StatusTone.amber.background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: StatusTone.amber.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  voucher.label.isEmpty ? voucher.name : voucher.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: StatusTone.amber.foreground,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    if (voucher.minSpend > 0)
                      'Min. spend ${formatPeso(voucher.minSpend)}',
                    if (voucher.endsAt != null)
                      'Until ${Fmt.date(voucher.endsAt)}',
                    if (voucher.shopName != null) voucher.shopName!,
                  ].join(' · '),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.stone600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          if (voucher.fullyUsed)
            const StatusChip(label: 'Used', tone: StatusTone.gray)
          else if (saved)
            const StatusChip(label: 'Saved', tone: StatusTone.emerald)
          else
            FilledButton(
              onPressed: busy ? null : onClaim,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandRed,
                minimumSize: const Size(72, 40),
              ),
              child: Text(busy ? 'Saving…' : 'Save'),
            ),
        ],
      ),
    );
  }
}

class _OptionsRow extends StatelessWidget {
  const _OptionsRow({required this.product, required this.onTap});

  final ProductDetail product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final summary = product.variationTypes.isNotEmpty
        ? 'Choose ${product.variationTypes.join(', ')}'
        : product.options.length > 1
        ? '${product.options.length} options'
        : product.soldOut
        ? 'Sold out'
        : '${product.totalStock} in stock';
    return BlockCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        minTileHeight: 56,
        onTap: product.soldOut || product.onVacation ? null : onTap,
        leading: const Icon(LucideIcons.package, color: AppColors.stone600),
        title: Text(summary),
        subtitle: Text(
          'Delivery in ${product.deliveryDaysMin} to ${product.deliveryDaysMax} days'
          '${product.purchaseLimit != null ? ' · Limit ${product.purchaseLimit} per buyer' : ''}',
        ),
        trailing: const Icon(LucideIcons.chevronRight, size: 18),
      ),
    );
  }
}

class _ShopCard extends StatelessWidget {
  const _ShopCard({required this.seller, required this.onChat});

  final ProductSeller seller;
  final VoidCallback onChat;

  @override
  Widget build(BuildContext context) {
    final place = [seller.city, seller.province].whereType<String>().join(', ');
    return BlockCard(
      child: Column(
        children: [
          Row(
            children: [
              ShopAvatar(
                name: seller.shopName,
                url: seller.avatarUrl,
                size: 48,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      seller.shopName,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    if (place.isNotEmpty)
                      Text(
                        place,
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
          const SizedBox(height: AppSpace.md),
          Row(
            children: [
              _Stat('${seller.productCount}', 'Products'),
              _Stat(seller.avgRating?.toStringAsFixed(1) ?? '—', 'Rating'),
              _Stat('${seller.unitsSold}', 'Sold'),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onChat,
                  icon: const Icon(LucideIcons.messageCircle, size: 16),
                  label: const Text('Chat'),
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      context.push(BuyerPaths.shop(seller.shopKey)),
                  icon: const Icon(LucideIcons.store, size: 16),
                  label: const Text('Visit shop'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.value, this.label);

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
              color: AppColors.brandRed,
            ),
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

class _Details extends StatelessWidget {
  const _Details({required this.product});

  final ProductDetail product;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Product details',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: AppSpace.sm),
          if (product.categoryName != null)
            InfoRow('Category', product.categoryName!),
          for (final row in product.specs.entries) InfoRow(row.key, row.value),
          if (product.description.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            Text(product.description, style: const TextStyle(height: 1.5)),
          ],
          if (product.warranty != null) ...[
            const SizedBox(height: AppSpace.md),
            InfoRow('Warranty', product.warranty!),
          ],
          if (product.returnPolicy != null) ...[
            const SizedBox(height: AppSpace.md),
            Text('Returns', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: AppSpace.xs),
            Text(product.returnPolicy!, style: const TextStyle(height: 1.5)),
          ],
        ],
      ),
    );
  }
}

class _ReviewsBlock extends ConsumerStatefulWidget {
  const _ReviewsBlock({required this.product});

  final ProductDetail product;

  @override
  ConsumerState<_ReviewsBlock> createState() => _ReviewsBlockState();
}

class _ReviewsBlockState extends ConsumerState<_ReviewsBlock> {
  late final _reviews = ref
      .read(buyerApiProvider)
      .productReviews(widget.product.id);

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Reviews (${product.reviewCount})',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              if (product.reviewCount > 0)
                TextButton(
                  onPressed: () => showReviewsSheet(
                    context,
                    title: 'Reviews',
                    load: (page) => ref
                        .read(buyerApiProvider)
                        .productReviews(product.id, page: page),
                  ),
                  child: const Text('See all'),
                ),
            ],
          ),
          FutureBuilder(
            future: _reviews,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Skeleton(child: SkeletonBox(height: 60));
              }
              final reviews = snapshot.data?.items ?? const <ProductReview>[];
              if (reviews.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpace.sm),
                  child: Text(
                    'No reviews yet. Buyers can review after their order is delivered.',
                    style: TextStyle(color: AppColors.stone500),
                  ),
                );
              }
              return Column(
                children: [
                  for (final review in reviews.take(3))
                    ReviewTile(review: review),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Related extends ConsumerStatefulWidget {
  const _Related({required this.productId});

  final int productId;

  @override
  ConsumerState<_Related> createState() => _RelatedState();
}

class _RelatedState extends ConsumerState<_Related> {
  late final _related = ref.read(buyerApiProvider).related(widget.productId);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ProductSummary>>(
      future: _related,
      builder: (context, snapshot) {
        final items = snapshot.data ?? const <ProductSummary>[];
        if (items.isEmpty) return const SizedBox.shrink();
        return Column(
          children: [
            const SectionHeader(title: 'You may also like'),
            SizedBox(
              height: 262,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.md),
                itemBuilder: (_, index) => SizedBox(
                  width: 150,
                  child: ProductCard(product: items[index]),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _BuyBar extends StatelessWidget {
  const _BuyBar({
    required this.blocked,
    required this.blockedLabel,
    required this.onChat,
    required this.onAddToCart,
    required this.onBuyNow,
  });

  final bool blocked;
  final String blockedLabel;
  final VoidCallback onChat;
  final VoidCallback onAddToCart;
  final VoidCallback onBuyNow;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        boxShadow: AppShadow.soft,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.md,
        AppSpace.sm,
        AppSpace.lg,
        AppSpace.sm,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            IconButton(
              tooltip: 'Chat with the shop',
              onPressed: onChat,
              icon: const Icon(LucideIcons.messageCircle),
            ),
            const SizedBox(width: AppSpace.xs),
            if (blocked)
              Expanded(
                child: FilledButton(
                  onPressed: null,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  child: Text(blockedLabel),
                ),
              )
            else ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: onAddToCart,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    foregroundColor: AppColors.brandRed,
                    side: const BorderSide(color: AppColors.brandRed),
                  ),
                  child: const Text('Add to cart'),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: FilledButton(
                  onPressed: onBuyNow,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandRed,
                    minimumSize: const Size.fromHeight(52),
                  ),
                  child: const Text('Buy now'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProductSkeleton extends StatelessWidget {
  const _ProductSkeleton();

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return Skeleton(
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        children: [
          SkeletonBox(width: width, height: width, radius: 0),
          const Padding(
            padding: EdgeInsets.all(AppSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(width: 140, height: 24),
                SizedBox(height: AppSpace.md),
                SkeletonBox(height: 16),
                SizedBox(height: AppSpace.sm),
                SkeletonBox(width: 200, height: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
