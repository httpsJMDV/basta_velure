import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/env.dart';
import '../../../core/format.dart';
import '../../../core/session/session.dart';
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
import '../widgets/guest.dart';
import '../widgets/photo_viewer.dart';
import 'option_sheet.dart';
import 'reviews_sheet.dart';

/// The product page (B4), one long page of plain white sections: the photos, the price, the options and quantity, how
/// delivery, paying and returns work, the reviews, the shop, the details and more to buy. Past the photos, a bar with
/// Overview, Reviews and Recommended jumps to each part and follows the scrolling. The price, Add to cart and Buy now
/// stay at the bottom. Everything shown is the server's; nothing here is a promise it didn't make. The photo comes flying
/// in from the card that was tapped, and shows straight away while the rest of the page loads.
class ProductScreen extends ConsumerWidget {
  const ProductScreen({super.key, required this.productId, this.hero});

  final int productId;
  final ProductHero? hero;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // What the server says about this person (their wishlist, what they already bought) changes when they sign in.
    ref.listen(
      currentUserProvider.select((user) => user?.id),
      (_, _) => ref.invalidate(productProvider(productId)),
    );
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
  /// The top bar's height, under the status bar.
  static const _barBody = 56.0;

  late bool _wishlisted = widget.product.isWishlisted;
  bool _togglingWishlist = false;
  int _quantity = 1;
  num? _freeDeliveryMin;
  int? _returnDays;
  bool _hasRelated = false;
  int _tab = 0;

  /// How solid the top bar is: 0 over the photo, 1 past it.
  double _solid = 0;
  final _scroll = ScrollController();
  final _reviewsAnchor = GlobalKey();
  final _relatedAnchor = GlobalKey();
  late final Future<List<ProductSummary>> _related = ref
      .read(buyerApiProvider)
      .related(product.id);

  ProductDetail get product => widget.product;

  @override
  void didUpdateWidget(_ProductView old) {
    super.didUpdateWidget(old);
    if (old.product.isWishlisted != product.isWishlisted) {
      _wishlisted = product.isWishlisted;
    }
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadExtras();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// What the page can say besides the product itself. Each one that can't load just isn't said.
  Future<void> _loadExtras() async {
    final api = ref.read(buyerApiProvider);
    try {
      final shops = await api.checkoutShops([product.seller.id]);
      if (mounted) {
        setState(() => _freeDeliveryMin = shops.firstOrNull?.freeDeliveryMin);
      }
    } catch (_) {}
    try {
      final policies = await api.policies();
      final days = asIntOrNull(
        asJson(policies['return_policy'])['return_window_days'],
      );
      if (mounted) setState(() => _returnDays = days);
    } catch (_) {}
    try {
      final related = await _related;
      if (mounted) setState(() => _hasRelated = related.isNotEmpty);
    } catch (_) {}
  }

  double get _barHeight => MediaQuery.paddingOf(context).top + _barBody;

  /// How far to scroll for [anchor] to reach the top of the screen.
  double? _offsetOf(GlobalKey anchor) {
    final box = anchor.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached) return null;
    return RenderAbstractViewport.of(box).getOffsetToReveal(box, 0).offset;
  }

  int get _tabInView {
    final line = _scroll.offset + _barHeight + 8;
    final related = _hasRelated ? _offsetOf(_relatedAnchor) : null;
    // The page can end before the last part reaches the top.
    final atEnd = _scroll.offset >= _scroll.position.maxScrollExtent - 4;
    if (related != null && (atEnd || line >= related)) return 2;
    final reviews = _offsetOf(_reviewsAnchor);
    return reviews != null && line >= reviews ? 1 : 0;
  }

  void _onScroll() {
    final start = MediaQuery.sizeOf(context).width - _barHeight - 56;
    final solid = ((_scroll.offset - start) / 56).clamp(0.0, 1.0);
    final tab = _tabInView;
    if (solid != _solid || tab != _tab) {
      setState(() {
        _solid = solid;
        _tab = tab;
      });
    }
  }

  void _goToTab(int tab) {
    final anchor = switch (tab) {
      1 => _reviewsAnchor,
      2 => _relatedAnchor,
      _ => null,
    };
    final target = anchor == null ? 0.0 : (_offsetOf(anchor) ?? 0) - _barHeight;
    final end = target.clamp(0.0, _scroll.position.maxScrollExtent);
    if (MediaQuery.disableAnimationsOf(context)) {
      _scroll.jumpTo(end);
    } else {
      _scroll.animateTo(end, duration: Motion.slow, curve: Motion.settle);
    }
  }

  void _copyLink() {
    Clipboard.setData(
      ClipboardData(text: '${Env.webUrl}/products/${product.id}'),
    );
    showSnack(context, 'Link copied.');
  }

  Future<void> _toggleWishlist() async {
    if (_togglingWishlist || sendGuestToSignIn(context, ref)) return;
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

  /// A product with one way to buy it needs no choosing: the page's own quantity is the answer. [justLooking] is the
  /// Options row, which a guest may open to see what there is. Choosing there still needs an account.
  Future<void> _choose(OptionAction action, {bool justLooking = false}) async {
    if (!justLooking && sendGuestToSignIn(context, ref)) return;
    final only = product.options.length == 1 ? product.options.first : null;
    final max = only == null ? 0 : product.maxFor(only);
    final choice = only != null && max > 0 && !justLooking
        ? OptionChoice(only, _quantity.clamp(1, max))
        : await showOptionSheet(
            context,
            product: product,
            action: action,
            quantity: _quantity,
          );
    if (choice == null || !mounted) return;
    if (justLooking && sendGuestToSignIn(context, ref)) return;
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
    if (sendGuestToSignIn(context, ref)) return;
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
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        body: Stack(
          children: [
            RefreshIndicator(
              edgeOffset: _barHeight,
              onRefresh: () async =>
                  ref.invalidate(productProvider(product.id)),
              child: CustomScrollView(
                controller: _scroll,
                slivers: [
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: width,
                      child: _Gallery(
                        images: product.images,
                        hero: widget.hero,
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: FadeSlideIn(
                      child: _PriceBlock(
                        product: product,
                        wishlisted: _wishlisted,
                        onWishlist: _toggleWishlist,
                        onReviews: () => _goToTab(1),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: FadeSlideIn(
                      delay: const Duration(milliseconds: 60),
                      child: _BuyOptions(
                        product: product,
                        quantity: _quantity,
                        freeDeliveryMin: _freeDeliveryMin,
                        onQuantity: (value) =>
                            setState(() => _quantity = value),
                        onOptions: () =>
                            _choose(OptionAction.addToCart, justLooking: true),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: _Services(
                      product: product,
                      freeDeliveryMin: _freeDeliveryMin,
                      returnDays: _returnDays,
                    ),
                  ),
                  SliverToBoxAdapter(child: _Vouchers(productId: product.id)),
                  SliverToBoxAdapter(
                    child: KeyedSubtree(
                      key: _reviewsAnchor,
                      child: _ReviewsBlock(product: product),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: _ShopBand(seller: product.seller, onChat: _chat),
                  ),
                  SliverToBoxAdapter(
                    child: _Details(
                      product: product,
                      wishlisted: _wishlisted,
                      onWishlist: _toggleWishlist,
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: KeyedSubtree(
                      key: _relatedAnchor,
                      child: _Related(items: _related),
                    ),
                  ),
                  // Room for the cart button at the end of the page.
                  const SliverToBoxAdapter(child: SizedBox(height: 84)),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: _TopBar(
                solid: _solid,
                tabs: ['Overview', 'Reviews', if (_hasRelated) 'Recommended'],
                tab: _tab,
                onTab: _goToTab,
                onBack: () => context.canPop()
                    ? context.pop()
                    : context.go(BuyerPaths.home),
                onSearch: () => context.push(BuyerPaths.search),
                onShare: _copyLink,
              ),
            ),
            Positioned(
              right: AppSpace.md,
              bottom: AppSpace.md,
              child: _CartBubble(
                count: cartLines,
                onTap: () {
                  if (!sendGuestToSignIn(context, ref)) {
                    context.go(BuyerPaths.cart);
                  }
                },
              ),
            ),
          ],
        ),
        bottomNavigationBar: _BuyBar(
          product: product,
          blocked: blocked,
          blockedLabel: product.onVacation ? 'Shop on vacation' : 'Sold out',
          onAddToCart: () => _choose(OptionAction.addToCart),
          onBuyNow: () => _choose(OptionAction.buyNow),
        ),
      ),
    );
  }
}

/// One plain white part of the page, on the cream behind it.
class _Section extends StatelessWidget {
  const _Section({
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.gap = true,
  });

  final Widget child;
  final EdgeInsets padding;
  final bool gap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: gap ? AppSpace.sm : 0),
      child: Material(
        color: AppColors.white,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// A sheet saying how something works, in plain words.
Future<void> _showInfo(
  BuildContext context, {
  required String title,
  required List<String> lines,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          0,
          AppSpace.lg,
          AppSpace.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: BuyerText.section.copyWith(fontSize: 19)),
            for (final line in lines) ...[
              const SizedBox(height: AppSpace.md),
              Text(
                line,
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: AppColors.stone700,
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

/// Round buttons over the photo. Past it the bar turns white, and Overview, Reviews and Recommended appear.
class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.solid,
    required this.tabs,
    required this.tab,
    required this.onTab,
    required this.onBack,
    required this.onSearch,
    required this.onShare,
  });

  final double solid;
  final List<String> tabs;
  final int tab;
  final ValueChanged<int> onTab;
  final VoidCallback onBack;
  final VoidCallback onSearch;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final showing = solid > 0.6;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: solid),
        border: Border(
          bottom: BorderSide(
            color: AppColors.stone200.withValues(alpha: solid),
          ),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        child: SizedBox(
          height: _ProductViewState._barBody,
          child: Row(
            children: [
              const SizedBox(width: AppSpace.xs),
              _BarButton(
                icon: LucideIcons.arrowLeft,
                tooltip: 'Back',
                solid: solid,
                onPressed: onBack,
              ),
              Expanded(
                child: ExcludeSemantics(
                  excluding: !showing,
                  child: IgnorePointer(
                    ignoring: !showing,
                    child: Opacity(
                      opacity: solid,
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (var i = 0; i < tabs.length; i++)
                                _BarTab(
                                  label: tabs[i],
                                  selected: i == tab,
                                  onTap: () => onTab(i),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              _BarButton(
                icon: LucideIcons.search,
                tooltip: 'Search',
                solid: solid,
                onPressed: onSearch,
              ),
              _BarButton(
                icon: LucideIcons.link,
                tooltip: 'Copy the link',
                solid: solid,
                onPressed: onShare,
              ),
              const SizedBox(width: AppSpace.xs),
            ],
          ),
        ),
      ),
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({
    required this.icon,
    required this.tooltip,
    required this.solid,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final double solid;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(3),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.white,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: AppColors.ink.withValues(alpha: 0.14 * (1 - solid)),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          iconSize: 19,
          color: AppColors.stone900,
          constraints: const BoxConstraints.tightFor(width: 38, height: 38),
          padding: EdgeInsets.zero,
          icon: Icon(icon),
        ),
      ),
    );
  }
}

class _BarTab extends StatelessWidget {
  const _BarTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final calm = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(7, 10, 7, 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? AppColors.ink : AppColors.stone500,
                ),
              ),
              const SizedBox(height: 5),
              AnimatedContainer(
                duration: calm ? Duration.zero : Motion.fast,
                width: selected ? 24 : 0,
                height: 3,
                decoration: BoxDecoration(
                  color: AppColors.brandRed,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The way to the cart, always in reach, with how many lines are in it.
class _CartBubble extends StatelessWidget {
  const _CartBubble({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: count > 0 ? 'Cart, $count in it' : 'Cart',
      excludeSemantics: true,
      onTap: onTap,
      child: PressScale(
        scale: 0.92,
        onTap: onTap,
        child: Badge(
          isLabelVisible: count > 0,
          backgroundColor: AppColors.brandRed,
          offset: const Offset(-2, 0),
          label: PopOnChange(
            value: count,
            child: Text(count > 99 ? '99+' : '$count'),
          ),
          child: Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: AppColors.white,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.brandRed, width: 2),
              boxShadow: BuyerShadow.floating,
            ),
            child: const MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.noScaling),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    LucideIcons.shoppingBag,
                    size: 19,
                    color: AppColors.brandRed,
                  ),
                  SizedBox(height: 1),
                  Text(
                    'Cart',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.brandRed,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
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
        if (images.length > 1)
          Positioned(
            right: AppSpace.md,
            bottom: AppSpace.md,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.ink.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                '${_current + 1}/${images.length}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.white,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PriceBlock extends StatelessWidget {
  const _PriceBlock({
    required this.product,
    required this.wishlisted,
    required this.onWishlist,
    required this.onReviews,
  });

  final ProductDetail product;
  final bool wishlisted;
  final VoidCallback onWishlist;
  final VoidCallback onReviews;

  @override
  Widget build(BuildContext context) {
    final discount = Fmt.discountPercent(product.price, product.originalPrice);
    final flash = product.flashSale;
    final ranged = product.priceMax > product.priceMin;
    final sold = Fmt.sold(product.unitsSold);
    final lowStock = product.totalStock > 0 && product.totalStock <= 5;

    return _Section(
      gap: false,
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.md,
        AppSpace.sm,
        AppSpace.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (flash != null && flash.endsAt != null) ...[
            Padding(
              padding: const EdgeInsets.only(right: AppSpace.sm),
              child: _FlashBanner(
                endsAt: flash.endsAt!,
                remaining: flash.remaining,
              ),
            ),
            const SizedBox(height: AppSpace.md),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: AppSpace.sm,
                  children: [
                    Text(
                      ranged
                          ? '${formatPeso(product.priceMin)} – ${formatPeso(product.priceMax)}'
                          : formatPeso(flash?.price ?? product.price),
                      style: BuyerText.price.copyWith(fontSize: 27),
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
              ),
              IconButton(
                tooltip: wishlisted
                    ? 'Remove from wishlist'
                    : 'Add to wishlist',
                onPressed: onWishlist,
                icon: PopOnChange(
                  value: wishlisted,
                  child: Icon(
                    wishlisted ? Icons.favorite_rounded : LucideIcons.heart,
                    size: 23,
                    color: wishlisted ? AppColors.brandRed : AppColors.stone700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),
          Padding(
            padding: const EdgeInsets.only(right: AppSpace.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: BuyerText.screenTitle.copyWith(
                    fontSize: 20,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: AppSpace.sm),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (product.avgRating != null && product.reviewCount > 0)
                      GestureDetector(
                        onTap: onReviews,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Stars(rating: product.avgRating!),
                            const SizedBox(width: 6),
                            Text(
                              '${product.avgRating!.toStringAsFixed(1)} (${product.reviewCount})',
                              style: const TextStyle(
                                fontSize: 13,
                                color: AppColors.stone600,
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      const Text(
                        'No reviews yet',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.stone500,
                        ),
                      ),
                    if (sold != null)
                      Text(
                        '·  $sold',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.stone600,
                        ),
                      ),
                    if (lowStock)
                      Text(
                        '·  Only ${product.totalStock} left',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.brandRed,
                        ),
                      ),
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

/// A green outlined fact with a tick.
class _BenefitChip extends StatelessWidget {
  const _BenefitChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    final green = StatusTone.emerald.foreground;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: green, width: 1.3),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.check, size: 14, color: green),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: green,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The options to choose from, what comes with the product, and how many.
class _BuyOptions extends StatelessWidget {
  const _BuyOptions({
    required this.product,
    required this.quantity,
    required this.onQuantity,
    required this.onOptions,
    this.freeDeliveryMin,
  });

  final ProductDetail product;
  final int quantity;
  final ValueChanged<int> onQuantity;
  final VoidCallback onOptions;
  final num? freeDeliveryMin;

  @override
  Widget build(BuildContext context) {
    final blocked = product.soldOut || product.onVacation;
    final only = product.options.length == 1 ? product.options.first : null;
    final limitLeft = product.purchaseLimit == null
        ? product.totalStock
        : product.purchaseLimit! - product.purchasedByYou;
    final most = only != null
        ? product.maxFor(only)
        : (limitLeft < product.totalStock ? limitLeft : product.totalStock);
    final max = most < 1 ? 1 : most;
    final types = product.variationTypes;
    return _Section(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (only == null && product.options.isNotEmpty) ...[
            InkWell(
              onTap: blocked ? null : onOptions,
              borderRadius: BorderRadius.circular(10),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        types.isEmpty
                            ? 'Choose from ${product.options.length} options'
                            : 'Choose ${types.join(' and ')}',
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.stone900,
                        ),
                      ),
                    ),
                    const Icon(
                      LucideIcons.chevronRight,
                      size: 18,
                      color: AppColors.stone500,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpace.md),
          ],
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: [
              _BenefitChip(
                'Arrives in ${product.deliveryDaysMin} to ${product.deliveryDaysMax} days',
              ),
              if (freeDeliveryMin != null)
                _BenefitChip(
                  'Free delivery from ${formatPeso(freeDeliveryMin)}',
                ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          Row(
            children: [
              const Text(
                'Qty',
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.stone900,
                ),
              ),
              const SizedBox(width: AppSpace.md),
              QuantityStepper(
                value: quantity.clamp(1, max),
                max: max,
                enabled: !blocked && most > 0,
                onChanged: onQuantity,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Text(
                  [
                    if (only != null && !blocked) '${only.stock} in stock',
                    if (product.purchaseLimit != null)
                      'Limit ${product.purchaseLimit} per buyer',
                  ].join(' · '),
                  textAlign: TextAlign.end,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.stone500,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A row saying how delivery, paying or returns work. Tapping it says more.
class _ServiceRow extends StatelessWidget {
  const _ServiceRow({
    required this.icon,
    required this.title,
    required this.onTap,
    this.lines = const [],
    this.below,
    this.titleColor = AppColors.stone900,
  });

  final IconData icon;
  final String title;
  final List<String> lines;
  final Widget? below;
  final Color titleColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 21, color: StatusTone.emerald.foreground),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: titleColor,
                    ),
                  ),
                  for (final line in lines)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                        line,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.35,
                          color: AppColors.stone600,
                        ),
                      ),
                    ),
                  if (below != null) ...[
                    const SizedBox(height: AppSpace.sm),
                    below!,
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpace.xs),
            const Icon(
              LucideIcons.chevronRight,
              size: 18,
              color: AppColors.stone400,
            ),
          ],
        ),
      ),
    );
  }
}

class _Services extends StatelessWidget {
  const _Services({
    required this.product,
    this.freeDeliveryMin,
    this.returnDays,
  });

  final ProductDetail product;
  final num? freeDeliveryMin;
  final int? returnDays;

  @override
  Widget build(BuildContext context) {
    final seller = product.seller;
    final from = [seller.city, seller.province].whereType<String>().join(', ');
    final days = returnDays;
    final freeLine = freeDeliveryMin == null
        ? null
        : 'This shop delivers for free on orders from ${formatPeso(freeDeliveryMin)}.';
    return _Section(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _ServiceRow(
            icon: LucideIcons.truck,
            title:
                'Delivery in ${product.deliveryDaysMin} to ${product.deliveryDaysMax} days',
            titleColor: StatusTone.emerald.foreground,
            lines: [
              ?freeLine,
              if (from.isNotEmpty) 'Ships from $from',
              'You see the delivery fee at checkout, before you pay.',
            ],
            onTap: () => _showInfo(
              context,
              title: 'How delivery works',
              lines: [
                'One parcel per shop, priced by route and weight, carried by partner couriers matched to your area.',
                'Every parcel has a tracking number. You see the exact fee at checkout, before you pay.',
                ?freeLine,
              ],
            ),
          ),
          const Divider(height: 1, indent: AppSpace.lg, endIndent: AppSpace.lg),
          _ServiceRow(
            icon: LucideIcons.shieldCheck,
            title: 'Pay by cash or GCash',
            lines: const [
              'Directly to the shop, when your parcel arrives or by GCash.',
            ],
            onTap: () => _showInfo(
              context,
              title: 'How paying works',
              lines: const [
                'Pay each shop directly by GCash, or in cash when your parcel arrives.',
                'Very large orders may need GCash. Checkout tells you when they do.',
              ],
            ),
          ),
          const Divider(height: 1, indent: AppSpace.lg, endIndent: AppSpace.lg),
          _ServiceRow(
            icon: LucideIcons.badgeCheck,
            title: 'Buyer protection',
            below: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _Guarantee(days == null ? 'Returns' : '$days-day returns'),
                const _Guarantee('Verified shop'),
                const _Guarantee('Tracked parcel'),
              ],
            ),
            onTap: () => _showInfo(
              context,
              title: 'Buyer protection',
              lines: [
                'Every shop is verified before it can sell.',
                days == null
                    ? 'Something wrong? Open a return; our team reviews any claim a shop will not settle.'
                    : 'Something wrong? Open a return within $days days; our team reviews any claim a shop will not settle.',
                if (product.returnPolicy != null)
                  "This shop's return policy: ${product.returnPolicy}",
              ],
            ),
          ),
          if (product.bulky != null) ...[
            const Divider(
              height: 1,
              indent: AppSpace.lg,
              endIndent: AppSpace.lg,
            ),
            _HeavyNotice(bulky: product.bulky!),
          ],
        ],
      ),
    );
  }
}

class _Guarantee extends StatelessWidget {
  const _Guarantee(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: StatusTone.emerald.foreground,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.white,
        ),
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
    if (sendGuestToSignIn(context, ref)) return;
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
        return _Section(
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

class _HeavyNotice extends StatelessWidget {
  const _HeavyNotice({required this.bulky});

  final BulkyInfo bulky;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpace.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(LucideIcons.weight, size: 21, color: AppColors.stone700),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  bulky.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.stone900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  bulky.message,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.45,
                    color: AppColors.stone600,
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

/// The shop, on the portal's dark band, so it reads as who you are buying from.
class _ShopBand extends StatelessWidget {
  const _ShopBand({required this.seller, required this.onChat});

  final ProductSeller seller;
  final VoidCallback onChat;

  @override
  Widget build(BuildContext context) {
    void visit() => context.push(BuyerPaths.shop(seller.shopKey));
    final dim = AppColors.white.withValues(alpha: 0.7);
    final place = [seller.city, seller.province].whereType<String>().join(', ');
    final joined = seller.joinedAt == null ? null : Fmt.date(seller.joinedAt);
    final buttons = OutlinedButton.styleFrom(
      backgroundColor: Colors.transparent,
      foregroundColor: AppColors.white,
      side: BorderSide(color: AppColors.white.withValues(alpha: 0.35)),
      minimumSize: const Size.fromHeight(42),
      shape: const StadiumBorder(),
    );
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.sm),
      child: Material(
        color: AppColors.ink,
        child: InkWell(
          onTap: visit,
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    ShopAvatar(
                      name: seller.shopName,
                      url: seller.avatarUrl,
                      size: 54,
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            seller.shopName,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppColors.white,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            [
                              '${seller.productCount} product${seller.productCount == 1 ? '' : 's'}',
                              '${seller.unitsSold} sold',
                              if (seller.avgRating != null)
                                '${seller.avgRating!.toStringAsFixed(1)} rating',
                            ].join('  •  '),
                            style: TextStyle(fontSize: 13, color: dim),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Icon(LucideIcons.chevronRight, size: 18, color: dim),
                  ],
                ),
                if (joined != null || place.isNotEmpty) ...[
                  const SizedBox(height: AppSpace.md),
                  Row(
                    children: [
                      Icon(
                        joined != null
                            ? LucideIcons.badgeCheck
                            : LucideIcons.mapPin,
                        size: 16,
                        color: AppColors.heroEmerald,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          joined != null
                              ? 'Selling on Loved-IT since $joined'
                              : place,
                          style: TextStyle(fontSize: 13, color: dim),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: buttons,
                        onPressed: onChat,
                        icon: const Icon(LucideIcons.messageCircle, size: 16),
                        label: const Text('Chat'),
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        style: buttons,
                        onPressed: visit,
                        icon: const Icon(LucideIcons.store, size: 16),
                        label: const Text('Visit shop'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Details extends StatefulWidget {
  const _Details({
    required this.product,
    required this.wishlisted,
    required this.onWishlist,
  });

  final ProductDetail product;
  final bool wishlisted;
  final VoidCallback onWishlist;

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
  /// Which reviews show: all of them, or only this many stars.
  int? _stars;

  /// How many reviews have each number of stars, from the first answer. A filtered answer counts the same ones.
  Map<int, int> _counts = const {};
  late Future<ApiPage<ProductReview>> _reviews = _load();

  Future<ApiPage<ProductReview>> _load() async {
    final page = await ref
        .read(buyerApiProvider)
        .productReviews(widget.product.id, rating: _stars);
    final counts = asJson(page.meta['rating_counts']);
    final known = {
      for (var stars = 5; stars >= 1; stars--) stars: asInt(counts['$stars']),
    };
    if (mounted && _counts.isEmpty) setState(() => _counts = known);
    return page;
  }

  void _filter(int? stars) {
    setState(() {
      _stars = stars;
      _reviews = _load();
    });
  }

  void _seeAll() {
    final stars = _stars;
    showReviewsSheet(
      context,
      title: 'Reviews',
      load: (page) => ref
          .read(buyerApiProvider)
          .productReviews(widget.product.id, page: page, rating: stars),
    );
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final rated = product.avgRating != null && product.reviewCount > 0;
    final filters = _counts.entries.where((entry) => entry.value > 0).toList();
    final green = StatusTone.emerald;
    return _Section(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: rated ? _seeAll : null,
            child: Row(
              children: [
                Expanded(
                  child: rated
                      ? Wrap(
                          spacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              product.avgRating!.toStringAsFixed(1),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink,
                              ),
                            ),
                            Stars(rating: product.avgRating!, size: 17),
                            Text(
                              '(${product.reviewCount})',
                              style: const TextStyle(
                                fontSize: 13.5,
                                color: AppColors.stone600,
                              ),
                            ),
                          ],
                        )
                      : const BlockTitle('Reviews'),
                ),
                if (rated)
                  const Icon(
                    LucideIcons.chevronRight,
                    size: 18,
                    color: AppColors.stone400,
                  ),
              ],
            ),
          ),
          if (rated) ...[
            const SizedBox(height: AppSpace.md),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpace.md,
                vertical: AppSpace.sm,
              ),
              decoration: BoxDecoration(
                color: green.background,
                borderRadius: BorderRadius.circular(BuyerRadius.field),
              ),
              child: Row(
                children: [
                  Icon(
                    LucideIcons.shieldCheck,
                    size: 17,
                    color: green.foreground,
                  ),
                  const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: Text(
                      'Reviews come from buyers who received their order',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: green.foreground,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (filters.length > 1) ...[
            const SizedBox(height: AppSpace.md),
            Wrap(
              spacing: AppSpace.sm,
              runSpacing: AppSpace.sm,
              children: [
                _StarFilter(
                  label: 'All',
                  selected: _stars == null,
                  onTap: () => _filter(null),
                ),
                for (final entry in filters)
                  _StarFilter(
                    label:
                        '${entry.key} star${entry.key == 1 ? '' : 's'} (${entry.value})',
                    selected: _stars == entry.key,
                    onTap: () => _filter(entry.key),
                  ),
              ],
            ),
          ],
          const SizedBox(height: AppSpace.xs),
          FutureBuilder<ApiPage<ProductReview>>(
            future: _reviews,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.only(top: AppSpace.sm),
                  child: Skeleton(child: SkeletonBox(height: 60)),
                );
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
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final review in reviews.take(3))
                    ReviewTile(review: review),
                  if ((snapshot.data?.total ?? 0) > 3) ...[
                    const SizedBox(height: AppSpace.md),
                    OutlinedButton(
                      onPressed: _seeAll,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(44),
                        shape: const StadiumBorder(),
                        foregroundColor: AppColors.ink,
                      ),
                      child: Text('See all ${snapshot.data!.total} reviews'),
                    ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _StarFilter extends StatelessWidget {
  const _StarFilter({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: PressScale(
        scale: 0.96,
        onTap: onTap,
        child: AnimatedContainer(
          duration: Motion.fast,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? AppColors.ink : AppColors.white,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(
              color: selected ? AppColors.ink : AppColors.stone300,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: selected ? AppColors.white : AppColors.stone800,
            ),
          ),
        ),
      ),
    );
  }
}

/// More to buy, two to a row.
class _Related extends StatelessWidget {
  const _Related({required this.items});

  final Future<List<ProductSummary>> items;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ProductSummary>>(
      future: items,
      builder: (context, snapshot) {
        final related = snapshot.data ?? const <ProductSummary>[];
        if (related.isEmpty) return const SizedBox.shrink();
        final width =
            (MediaQuery.sizeOf(context).width - AppSpace.lg * 2 - AppSpace.md) /
            2;
        return _Section(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Recommended',
                style: BuyerText.section.copyWith(fontSize: 19),
              ),
              const SizedBox(height: AppSpace.md),
              Wrap(
                spacing: AppSpace.md,
                runSpacing: AppSpace.lg,
                children: [
                  for (final product in related)
                    SizedBox(
                      width: width,
                      height: width / productGridAspectRatio,
                      child: ProductCard(
                        product: product,
                        heroScope: 'related',
                      ),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

/// The price, and the two ways to buy. They stay on screen the whole way down.
class _BuyBar extends StatelessWidget {
  const _BuyBar({
    required this.product,
    required this.blocked,
    required this.blockedLabel,
    required this.onAddToCart,
    required this.onBuyNow,
  });

  final ProductDetail product;
  final bool blocked;
  final String blockedLabel;
  final VoidCallback onAddToCart;
  final VoidCallback onBuyNow;

  @override
  Widget build(BuildContext context) {
    final discount = Fmt.discountPercent(product.price, product.originalPrice);
    final ranged = product.priceMax > product.priceMin;
    final price = ranged
        ? product.priceMin
        : product.flashSale?.price ?? product.price;
    const shape = StadiumBorder();
    const words = TextStyle(
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: FontWeight.w600,
    );
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(top: BorderSide(color: AppColors.stone200)),
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.sm,
        AppSpace.md,
        AppSpace.sm,
      ),
      child: SafeArea(
        top: false,
        child: MediaQuery.withClampedTextScaling(
          maxScaleFactor: 1.15,
          child: Row(
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 100),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (ranged)
                      const Text(
                        'From',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.stone500,
                        ),
                      )
                    else if (discount > 0)
                      PesoText(
                        product.originalPrice,
                        struck: true,
                        style: const TextStyle(fontSize: 12),
                      ),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        formatPeso(price),
                        style: BuyerText.price.copyWith(fontSize: 19),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.md),
              if (blocked)
                Expanded(
                  child: FilledButton(
                    onPressed: null,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      shape: shape,
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
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      foregroundColor: AppColors.ink,
                      side: const BorderSide(color: AppColors.ink),
                      shape: shape,
                      textStyle: words,
                    ),
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Add to cart', maxLines: 1),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: FilledButton(
                    onPressed: onBuyNow,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandRed,
                      minimumSize: const Size.fromHeight(50),
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      shape: shape,
                      textStyle: words,
                    ),
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Buy now', maxLines: 1),
                    ),
                  ),
                ),
              ],
            ],
          ),
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

class _DetailsState extends State<_Details> {
  /// Long text folds to this many lines until "Read more".
  static const _foldedLines = 5;

  /// Facts that show before "See all details".
  static const _shownFacts = 3;
  bool _open = false;
  bool _allFacts = false;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final long = product.description.length > 240;
    final facts = <String, String>{
      if (product.categoryName != null) 'Category': product.categoryName!,
      ...product.specs,
    };
    return _Section(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Product details',
                  style: BuyerText.section.copyWith(fontSize: 19),
                ),
              ),
              TextButton.icon(
                onPressed: widget.onWishlist,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.stone800,
                  minimumSize: const Size(0, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                icon: Icon(
                  widget.wishlisted
                      ? Icons.favorite_rounded
                      : LucideIcons.heart,
                  size: 17,
                  color: widget.wishlisted
                      ? AppColors.brandRed
                      : AppColors.stone800,
                ),
                label: Text(widget.wishlisted ? 'Saved' : 'Save'),
              ),
            ],
          ),
          if (facts.isNotEmpty) ...[
            const SizedBox(height: AppSpace.sm),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpace.md),
              decoration: BoxDecoration(
                color: AppColors.stone100,
                borderRadius: BorderRadius.circular(BuyerRadius.field),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final row
                      in (_allFacts
                              ? facts.entries
                              : facts.entries.take(_shownFacts))
                          .toList())
                    InfoRow(row.key, row.value),
                  if (facts.length > _shownFacts)
                    TextButton(
                      onPressed: () => setState(() => _allFacts = !_allFacts),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 36),
                        foregroundColor: AppColors.stone800,
                      ),
                      child: Text(_allFacts ? 'Show less' : 'See all details'),
                    ),
                ],
              ),
            ),
          ],
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
          if (product.images.length > 1) ...[
            const SizedBox(height: AppSpace.lg),
            const Text(
              'More photos',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpace.sm),
            SizedBox(
              height: 104,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: product.images.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.sm),
                itemBuilder: (context, index) => GestureDetector(
                  onTap: () =>
                      showPhotoViewer(context, product.images, initial: index),
                  child: NetImage(
                    product.images[index],
                    width: 104,
                    height: 104,
                    radius: 10,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
