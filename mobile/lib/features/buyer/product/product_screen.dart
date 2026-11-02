import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';
import '../widgets/photo_viewer.dart';
import 'option_sheet.dart';
import 'reviews_sheet.dart';

/// The product page (B4): swipeable photos under a soft sheet, the price block with any sale or flash sale, options,
/// the shop card, details, reviews and related products. Add to cart and Buy now stay at the bottom. The photo comes
/// flying in from the card that was tapped, and shows straight away while the rest of the page loads.
class ProductScreen extends ConsumerWidget {
  const ProductScreen({super.key, required this.productId, this.hero});

  final int productId;
  final ProductHero? hero;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(productId));
    return product.when(
      loading: () => Scaffold(body: _ProductSkeleton(hero: hero)),
      error: (error, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(productProvider(productId)),
        ),
      ),
      data: (product) => _ProductView(product: product, hero: hero),
    );
  }
}

class _ProductView extends ConsumerStatefulWidget {
  const _ProductView({required this.product, this.hero});

  final ProductDetail product;
  final ProductHero? hero;

  @override
  ConsumerState<_ProductView> createState() => _ProductViewState();
}

class _ProductViewState extends ConsumerState<_ProductView> {
  late bool _wishlisted = widget.product.isWishlisted;
  bool _togglingWishlist = false;

  ProductDetail get product => widget.product;

  Future<void> _toggleWishlist() async {
    if (_togglingWishlist) return;
    HapticFeedback.lightImpact();
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
      HapticFeedback.mediumImpact();
      // The router, not this page's context: the message can outlast the page.
      final router = GoRouter.of(context);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(message),
            behavior: SnackBarBehavior.floating,
            // A message with a button stays until tapped unless told otherwise,
            // and this one would sit over the cart's Check out button.
            persist: false,
            duration: const Duration(seconds: 3),
            action: SnackBarAction(
              label: 'View cart',
              onPressed: () => router.go(BuyerPaths.cart),
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
    final width = MediaQuery.sizeOf(context).width;
    final cartLines = ref.watch(cartProvider).value?.lines ?? 0;
    return Scaffold(
      body: RefreshIndicator(
        edgeOffset: MediaQuery.paddingOf(context).top,
        onRefresh: () async => ref.invalidate(productProvider(product.id)),
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              stretch: true,
              expandedHeight: width,
              toolbarHeight: 60,
              leadingWidth: 62,
              automaticallyImplyLeading: false,
              backgroundColor: AppColors.cream,
              leading: Padding(
                padding: const EdgeInsets.only(left: AppSpace.lg),
                child: Center(
                  child: FloatingRoundButton(
                    tooltip: 'Back',
                    onPressed: () => context.pop(),
                    child: const Icon(
                      LucideIcons.arrowLeft,
                      size: 20,
                      color: AppColors.stone900,
                    ),
                  ),
                ),
              ),
              actions: [
                FloatingRoundButton(
                  tooltip: _wishlisted
                      ? 'Remove from wishlist'
                      : 'Add to wishlist',
                  onPressed: _toggleWishlist,
                  child: PopOnChange(
                    value: _wishlisted,
                    child: AnimatedSwitcher(
                      duration: Motion.fast,
                      child: Icon(
                        _wishlisted
                            ? Icons.favorite_rounded
                            : LucideIcons.heart,
                        key: ValueKey(_wishlisted),
                        size: 20,
                        color: _wishlisted
                            ? AppColors.brandRed
                            : AppColors.stone900,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                FloatingRoundButton(
                  tooltip: 'Cart',
                  onPressed: () => context.go(BuyerPaths.cart),
                  child: Badge(
                    isLabelVisible: cartLines > 0,
                    backgroundColor: AppColors.brandRed,
                    offset: const Offset(7, -6),
                    label: PopOnChange(
                      value: cartLines,
                      child: Text(cartLines > 99 ? '99+' : '$cartLines'),
                    ),
                    child: const Icon(
                      LucideIcons.shoppingBag,
                      size: 20,
                      color: AppColors.stone900,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.lg),
              ],
              flexibleSpace: FlexibleSpaceBar(
                stretchModes: const [StretchMode.zoomBackground],
                background: _Gallery(images: product.images, hero: widget.hero),
              ),
            ),
            SliverToBoxAdapter(
              child: FadeSlideIn(child: _PriceBlock(product: product)),
            ),
            SliverToBoxAdapter(child: _Vouchers(productId: product.id)),
            SliverToBoxAdapter(
              child: FadeSlideIn(
                delay: const Duration(milliseconds: 60),
                child: _OptionsRow(
                  product: product,
                  onTap: () => _choose(OptionAction.addToCart),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: FadeSlideIn(
                delay: const Duration(milliseconds: 120),
                child: _ShopCard(seller: product.seller, onChat: _chat),
              ),
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
  const _Gallery({required this.images, this.hero});

  final List<String> images;
  final ProductHero? hero;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _current = 0;

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    final hero = widget.hero;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (images.isEmpty)
          const NetImage(null)
        else
          PageView.builder(
            itemCount: images.length,
            onPageChanged: (index) => setState(() => _current = index),
            itemBuilder: (context, index) {
              final photo = GestureDetector(
                onTap: () => showPhotoViewer(context, images, initial: index),
                child: NetImage(images[index]),
              );
              return index == 0 && hero != null
                  ? Hero(tag: hero.tag, child: photo)
                  : photo;
            },
          ),
        // The page's sheet starts here, over the bottom of the photo.
        const Align(
          alignment: Alignment.bottomCenter,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.cream,
              borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
            ),
            child: SizedBox(height: 26, width: double.infinity),
          ),
        ),
        if (images.length > 1)
          Positioned(
            left: 0,
            right: 0,
            bottom: 38,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: AppColors.ink.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < images.length && i < 8; i++)
                      AnimatedContainer(
                        duration: Motion.medium,
                        curve: Motion.glide,
                        margin: const EdgeInsets.symmetric(horizontal: 2.5),
                        width: i == _current ? 16 : 5,
                        height: 5,
                        decoration: BoxDecoration(
                          color: i == _current
                              ? AppColors.white
                              : AppColors.white.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                      ),
                  ],
                ),
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

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (flash != null && flash.endsAt != null) ...[
            _FlashBanner(endsAt: flash.endsAt!, remaining: flash.remaining),
            const SizedBox(height: AppSpace.md),
          ],
          Text(
            product.name,
            style: BuyerText.screenTitle.copyWith(fontSize: 23, height: 1.2),
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              if (product.avgRating != null && product.reviewCount > 0) ...[
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
                  style: TextStyle(fontSize: 13, color: AppColors.stone500),
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
          const SizedBox(height: AppSpace.md),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpace.sm,
            children: [
              Text(
                ranged
                    ? '${formatPeso(product.priceMin)} – ${formatPeso(product.priceMax)}'
                    : formatPeso(flash?.price ?? product.price),
                style: BuyerText.price.copyWith(fontSize: 28),
              ),
              if (discount > 0 && !ranged) ...[
                PesoText(product.originalPrice, struck: true),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.brandRedTint,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    '-$discount%',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.brandRed,
                      fontWeight: FontWeight.w700,
                    ),
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
  void initState() {
    super.initState();
    _tick;
  }

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.md,
        vertical: 10,
      ),
      decoration: BoxDecoration(
        color: AppColors.brandRed,
        borderRadius: BorderRadius.circular(BuyerRadius.field),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.zap, color: AppColors.white, size: 16),
          const SizedBox(width: AppSpace.sm),
          const Text(
            'Flash sale',
            style: TextStyle(
              fontSize: 13.5,
              color: AppColors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(),
          Text(
            'Ends in ${Fmt.countdown(widget.endsAt)}',
            style: const TextStyle(
              fontSize: 13.5,
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
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8EC),
        borderRadius: BorderRadius.circular(BuyerRadius.field),
        border: Border.all(color: const Color(0xFFF6E3BF)),
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
          AnimatedSwitcher(
            duration: Motion.medium,
            child: voucher.fullyUsed
                ? const StatusChip(
                    key: ValueKey('used'),
                    label: 'Used',
                    tone: StatusTone.gray,
                  )
                : saved
                ? const StatusChip(
                    key: ValueKey('saved'),
                    label: 'Saved',
                    tone: StatusTone.emerald,
                  )
                : FilledButton(
                    key: const ValueKey('save'),
                    onPressed: busy ? null : onClaim,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.ink,
                      minimumSize: const Size(68, 38),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      shape: const StadiumBorder(),
                      textStyle: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: Text(busy ? 'Saving…' : 'Save'),
                  ),
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
      child: MenuRow(
        icon: LucideIcons.package,
        title: summary,
        subtitle:
            'Delivery in ${product.deliveryDaysMin} to ${product.deliveryDaysMax} days'
            '${product.purchaseLimit != null ? ' · Limit ${product.purchaseLimit} per buyer' : ''}',
        onTap: product.soldOut || product.onVacation ? null : onTap,
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
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (place.isNotEmpty)
                      Text(
                        place,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.stone500,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          Row(
            children: [
              _Stat('${seller.productCount}', 'Products'),
              const _StatDivider(),
              _Stat(seller.avgRating?.toStringAsFixed(1) ?? '—', 'Rating'),
              const _StatDivider(),
              _Stat('${seller.unitsSold}', 'Sold'),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onChat,
                  icon: const Icon(LucideIcons.messageCircle, size: 16),
                  label: const Text('Chat'),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
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
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.stone900,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.stone500),
          ),
        ],
      ),
    );
  }
}

class _Details extends StatefulWidget {
  const _Details({required this.product});

  final ProductDetail product;

  @override
  State<_Details> createState() => _DetailsState();
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
              Expanded(child: BlockTitle('Reviews (${product.reviewCount})')),
              if (product.reviewCount > 0)
                TextButton(
                  onPressed: () => showReviewsSheet(
                    context,
                    title: 'Reviews',
                    load: (page) => ref
                        .read(buyerApiProvider)
                        .productReviews(product.id, page: page),
                  ),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: const Text('See all'),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),
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
              height: productRowHeight,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.md),
                itemBuilder: (_, index) => SizedBox(
                  width: productRowCardWidth,
                  child: ProductCard(
                    product: items[index],
                    heroScope: 'related',
                  ),
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
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Color(0x141E1B18),
            blurRadius: 24,
            offset: Offset(0, -6),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.md,
        AppSpace.md,
        AppSpace.lg,
        AppSpace.md,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Tooltip(
              message: 'Chat with the shop',
              child: PressScale(
                scale: 0.92,
                onTap: onChat,
                child: Container(
                  width: 50,
                  height: 50,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.stone100,
                    borderRadius: BuyerRadius.buttonAll,
                  ),
                  child: const Icon(
                    LucideIcons.messageCircle,
                    size: 21,
                    color: AppColors.stone800,
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            if (blocked)
              Expanded(
                child: FilledButton(
                  onPressed: null,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                  ),
                  child: Text(blockedLabel),
                ),
              )
            else ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: onAddToCart,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    foregroundColor: AppColors.ink,
                    side: const BorderSide(color: AppColors.ink),
                  ),
                  child: const Text('Add to cart', maxLines: 1),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: FilledButton(
                  onPressed: onBuyNow,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandRed,
                    minimumSize: const Size.fromHeight(50),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: const Text('Buy now', maxLines: 1),
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
  const _ProductSkeleton({this.hero});

  final ProductHero? hero;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final known = hero;
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        if (known != null)
          SizedBox(
            width: width,
            height: width,
            child: Hero(tag: known.tag, child: NetImage(known.imageUrl)),
          )
        else
          Skeleton(
            child: SkeletonBox(width: width, height: width, radius: 0),
          ),
        const Skeleton(
          child: Padding(
            padding: EdgeInsets.all(AppSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 22),
                SizedBox(height: AppSpace.sm),
                SkeletonBox(width: 200, height: 22),
                SizedBox(height: AppSpace.md),
                SkeletonBox(width: 120, height: 14),
                SizedBox(height: AppSpace.lg),
                SkeletonBox(width: 140, height: 30),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 26, color: const Color(0xFFEFEBE6));
}

class _DetailsState extends State<_Details> {
  /// Long text folds to this many lines until "Read more".
  static const _foldedLines = 5;
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final long = product.description.length > 240;
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BlockTitle('Product details'),
          const SizedBox(height: AppSpace.md),
          if (product.categoryName != null)
            InfoRow('Category', product.categoryName!),
          for (final row in product.specs.entries) InfoRow(row.key, row.value),
          if (product.description.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            AnimatedSize(
              duration: Motion.medium,
              curve: Motion.glide,
              alignment: Alignment.topCenter,
              child: Text(
                product.description,
                maxLines: long && !_open ? _foldedLines : null,
                overflow: long && !_open
                    ? TextOverflow.ellipsis
                    : TextOverflow.clip,
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.55,
                  color: AppColors.stone700,
                ),
              ),
            ),
            if (long)
              TextButton(
                onPressed: () => setState(() => _open = !_open),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 36),
                ),
                child: Text(_open ? 'Show less' : 'Read more'),
              ),
          ],
          if (product.warranty != null) ...[
            const SizedBox(height: AppSpace.md),
            InfoRow('Warranty', product.warranty!),
          ],
          if (product.returnPolicy != null) ...[
            const SizedBox(height: AppSpace.md),
            const Text(
              'Returns',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpace.xs),
            Text(
              product.returnPolicy!,
              style: const TextStyle(
                fontSize: 14,
                height: 1.55,
                color: AppColors.stone700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
