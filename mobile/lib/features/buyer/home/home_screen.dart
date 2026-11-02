import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/web_links.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/badges.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';

/// The Home tab (B0, B3), in the website's order: search, the hero banner, the categories, Trending now, the shops to
/// know, then every product.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// The website shuffles the product grid with a seed, so loading more never repeats a product.
  final _seed = Random().nextInt(1 << 30);

  Future<void> _refreshSections() async {
    ref.invalidate(categoriesProvider);
    ref.invalidate(featuredShopsProvider);
    ref.invalidate(_trendingProvider);
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(buyerApiProvider);
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      body: PagedList<ProductSummary>(
        onRefresh: _refreshSections,
        gridColumns: 2,
        gridAspectRatio: productGridAspectRatio,
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          0,
          AppSpace.lg,
          AppSpace.lg,
        ),
        spacing: AppSpace.lg,
        load: (page) => api.products(page: page, sort: 'random', seed: _seed),
        itemBuilder: (_, product) => ProductCard(product: product),
        empty: const EmptyState(
          icon: LucideIcons.package,
          title: 'No products yet',
          message: 'Shops are adding products. Check back soon.',
        ),
        header: [
          const SliverAppBar(
            pinned: true,
            toolbarHeight: 68,
            titleSpacing: AppSpace.lg,
            title: _SearchField(),
            actions: [
              _BellButton(),
              SizedBox(width: AppSpace.lg),
            ],
          ),
          if (user != null)
            SliverToBoxAdapter(child: _Greeting(name: user.firstName)),
          if (user?.isSeller ?? false)
            const SliverToBoxAdapter(child: _SellerNote()),
          const SliverToBoxAdapter(child: _HeroCarousel()),
          const SliverToBoxAdapter(child: _Categories()),
          const SliverToBoxAdapter(child: _Trending()),
          const SliverToBoxAdapter(child: _ShopsToKnow()),
          const SliverToBoxAdapter(child: SectionHeader(title: 'Discover')),
        ],
      ),
    );
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final part = hour < 12
        ? 'morning'
        : hour < 18
        ? 'afternoon'
        : 'evening';
    return FadeSlideIn(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.xs,
          AppSpace.lg,
          AppSpace.lg,
        ),
        child: Text(
          name.isEmpty ? 'Good $part' : 'Good $part, $name',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: BuyerText.screenTitle.copyWith(fontSize: 26),
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField();

  @override
  Widget build(BuildContext context) {
    void open() => context.push(BuyerPaths.search);
    return Semantics(
      button: true,
      label: 'Search products',
      onTap: open,
      excludeSemantics: true,
      child: PressScale(
        scale: 0.985,
        onTap: open,
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(BuyerRadius.button),
            boxShadow: BuyerShadow.card,
          ),
          child: const Row(
            children: [
              Icon(LucideIcons.search, size: 18, color: AppColors.stone600),
              SizedBox(width: AppSpace.md),
              Text(
                'Search Loved-IT',
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w400,
                  color: AppColors.stone500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BellButton extends ConsumerWidget {
  const _BellButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    return Tooltip(
      message: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      child: PressScale(
        scale: 0.92,
        onTap: () => context.push(BuyerPaths.notifications),
        child: Container(
          width: 48,
          height: 48,
          margin: const EdgeInsets.only(left: AppSpace.sm),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(BuyerRadius.button),
            boxShadow: BuyerShadow.card,
          ),
          alignment: Alignment.center,
          child: Badge(
            isLabelVisible: unread > 0,
            backgroundColor: AppColors.brandRed,
            offset: const Offset(8, -6),
            label: PopOnChange(
              value: unread,
              child: Text(unread > 99 ? '99+' : '$unread'),
            ),
            child: const Icon(
              LucideIcons.bell,
              size: 21,
              color: AppColors.stone800,
            ),
          ),
        ),
      ),
    );
  }
}

class _SellerNote extends StatelessWidget {
  const _SellerNote();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const MessageBanner(
            message: 'Your shop is run from the website. Use loved-it.shop on a computer for the Seller Centre.',
            tone: StatusTone.blue,
            icon: LucideIcons.store,
          ),
          TextButton.icon(
            onPressed: () => openWebsite('/seller'),
            icon: const Icon(LucideIcons.externalLink, size: 18),
            label: const Text('Open the Seller Centre'),
          ),
        ],
      ),
    );
  }
}

/// One slide of the website's `HeroCarousel.tsx`. Each picture leaves its left side empty for the words.
class _Slide {
  const _Slide(
    this.asset,
    this.background,
    this.line1,
    this.line2,
    this.cta,
    this.link,
  );

  final String asset;
  final Color background;
  final String line1;
  final String line2;
  final String cta;
  final String link;
}

final _slides = [
  _Slide(
    'assets/hero/scene-fashion-1024.webp',
    const Color(0xFFFEF4E5),
    'Timeless fashion.',
    'Everyday comfort.',
    'Explore fashion',
    BuyerPaths.searchFor(
      parentCategoryId: 'womens-fashion',
      title: "Women's Fashion",
    ),
  ),
  _Slide(
    'assets/hero/scene-tech-1024.webp',
    const Color(0xFFFDEFDC),
    'Cutting-edge tech.',
    'Effortless living.',
    'Shop electronics',
    BuyerPaths.searchFor(
      parentCategoryId: 'mobile-gadgets-computers',
      title: 'Mobile, Gadgets & Computers',
    ),
  ),
  _Slide(
    'assets/hero/scene-home-1024.webp',
    const Color(0xFFFDF0DA),
    'Warm spaces.',
    'Modern aesthetic.',
    'Discover home',
    BuyerPaths.searchFor(
      parentCategoryId: 'home-living',
      title: 'Home & Living',
    ),
  ),
  _Slide(
    'assets/hero/scene-beauty-1024.webp',
    const Color(0xFFFDF1E0),
    'Your daily glow.',
    'Skin and scents.',
    'Shop beauty',
    BuyerPaths.searchFor(
      parentCategoryId: 'health-beauty',
      title: 'Health & Beauty',
    ),
  ),
];

/// The hero banner: the website's whole pictures, never cropped, with the next one peeking in. Words drift across a
/// little faster than the card. It moves on by itself every 5 seconds unless someone is holding it.
class _HeroCarousel extends StatefulWidget {
  const _HeroCarousel();

  @override
  State<_HeroCarousel> createState() => _HeroCarouselState();
}

class _HeroCarouselState extends State<_HeroCarousel> {
  /// Far from the start, so it can always go on to the next slide in the same direction.
  static const _start = 1000;

  final _pages = PageController(
    initialPage: _start * 4,
    viewportFraction: 0.92,
  );
  Timer? _timer;
  int _current = 0;
  bool _held = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _timer?.cancel();
    // Reduced motion: no moving by itself.
    if (!MediaQuery.disableAnimationsOf(context)) {
      _timer = Timer.periodic(const Duration(seconds: 5), (_) {
        if (_held || !_pages.hasClients || !mounted) return;
        // Not while another tab or screen is showing.
        if (!TickerMode.valuesOf(context).enabled) return;
        _pages.nextPage(
          duration: const Duration(milliseconds: 620),
          curve: Motion.glide,
        );
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pages.dispose();
    super.dispose();
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification is ScrollStartNotification &&
        notification.dragDetails != null) {
      _held = true;
    } else if (notification is ScrollEndNotification) {
      _held = false;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width * 0.92;
    return Column(
      children: [
        SizedBox(
          // The pictures are 16:9, so the card shows all of each one.
          height: (width - AppSpace.sm) * 9 / 16,
          child: NotificationListener<ScrollNotification>(
            onNotification: _onScroll,
            child: PageView.builder(
              controller: _pages,
              onPageChanged: (index) =>
                  setState(() => _current = index % _slides.length),
              itemBuilder: (context, index) => AnimatedBuilder(
                animation: _pages,
                builder: (context, _) {
                  final page =
                      _pages.hasClients && _pages.position.haveDimensions
                      ? _pages.page ?? index.toDouble()
                      : index.toDouble();
                  return _HeroSlide(
                    slide: _slides[index % _slides.length],
                    shift: (page - index).clamp(-1.0, 1.0),
                  );
                },
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpace.md),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < _slides.length; i++)
              AnimatedContainer(
                duration: Motion.medium,
                curve: Motion.glide,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: i == _current ? 22 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: i == _current ? AppColors.ink : AppColors.stone300,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _HeroSlide extends StatelessWidget {
  const _HeroSlide({required this.slide, required this.shift});

  final _Slide slide;

  /// How far this slide is from the middle: 0 in place, up to 1 either way.
  final double shift;

  @override
  Widget build(BuildContext context) {
    final distance = shift.abs();
    return Transform.scale(
      scale: 1 - distance * 0.03,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.xs),
        child: PressScale(
          scale: 0.985,
          onTap: () => context.push(slide.link),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: ColoredBox(
              color: slide.background,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    slide.asset,
                    fit: BoxFit.cover,
                    alignment: Alignment.centerRight,
                    cacheWidth: 1024,
                    errorBuilder: (_, _, _) => const SizedBox.shrink(),
                  ),
                  Transform.translate(
                    offset: Offset(shift * -36, 0),
                    child: Opacity(
                      opacity: (1 - distance * 1.3).clamp(0.0, 1.0),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: FractionallySizedBox(
                          widthFactor: 0.46,
                          alignment: Alignment.centerLeft,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Flexible(
                                child: Text(
                                  slide.line1,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: BuyerText.section.copyWith(
                                    fontSize: 22,
                                    height: 1.12,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                slide.line2,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  color: AppColors.stone600,
                                ),
                              ),
                              const SizedBox(height: AppSpace.md),
                              _HeroAction(label: slide.cta),
                            ],
                          ),
                        ),
                      ),
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

class _HeroAction extends StatelessWidget {
  const _HeroAction({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.white,
              ),
            ),
          ),
          const SizedBox(width: 4),
          const Icon(LucideIcons.arrowRight, size: 14, color: AppColors.white),
        ],
      ),
    );
  }
}

/// A sideways row of tall photo cards, with the name on the picture. "Others" stays off Home like the website.
class _Categories extends ConsumerWidget {
  const _Categories();

  static const _cardWidth = 112.0;
  static const _cardHeight = 142.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    // Nothing to show: no heading over an empty gap.
    if (categories.value?.every((category) => category.isOthers) ?? false) {
      return const SizedBox.shrink();
    }
    return Column(
      children: [
        SectionHeader(
          title: 'Categories',
          onAction: () => context.go(BuyerPaths.categories),
        ),
        SizedBox(
          height: _cardHeight,
          child: categories.when(
            loading: () =>
                const RowSkeleton(width: _cardWidth, height: _cardHeight),
            error: (error, _) => Center(
              child: TextButton(
                onPressed: () => ref.invalidate(categoriesProvider),
                child: const Text("Couldn't load categories. Try again"),
              ),
            ),
            data: (all) {
              final shown = all
                  .where((category) => !category.isOthers)
                  .toList();
              return ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                itemCount: shown.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (context, index) => FadeSlideIn(
                  delay: Duration(milliseconds: 40 * index.clamp(0, 5)),
                  child: _CategoryCard(category: shown[index]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.category});

  final Category category;

  @override
  Widget build(BuildContext context) {
    void open() => context.push(
      BuyerPaths.searchFor(
        parentCategoryId: '${category.id}',
        title: category.name,
      ),
    );
    return Semantics(
      button: true,
      label: category.name,
      onTap: open,
      excludeSemantics: true,
      child: PressScale(
        onTap: open,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(BuyerRadius.button),
          child: Stack(
            children: [
              CategoryArt(
                category: category,
                size: _Categories._cardWidth,
                height: _Categories._cardHeight,
                radius: 0,
              ),
              // A scrim only where the name sits, so the photo stays bright above it.
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0x001E1B18), Color(0xB31E1B18)],
                      stops: [0.45, 1],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Text(
                  category.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.2,
                    fontWeight: FontWeight.w600,
                    color: AppColors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final _trendingProvider = FutureProvider.autoDispose<List<ProductSummary>>(
  (ref) async =>
      (await ref
              .watch(buyerApiProvider)
              .products(sort: 'trending', perPage: 10))
          .items,
);

/// The best sellers, ranked, like the website's Trending now.
class _Trending extends ConsumerWidget {
  const _Trending();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(_trendingProvider);
    final items = trending.value ?? const <ProductSummary>[];
    if (trending.hasError || (trending.hasValue && items.isEmpty)) {
      return const SizedBox.shrink();
    }
    return Column(
      children: [
        SectionHeader(
          title: 'Trending now',
          onAction: () => context.push(
            BuyerPaths.searchFor(sort: 'trending', title: 'Trending now'),
          ),
        ),
        SizedBox(
          height: productRowHeight,
          child: trending.isLoading
              ? const RowSkeleton(
                  width: productRowCardWidth,
                  height: productRowHeight - 8,
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: AppSpace.md),
                  itemBuilder: (context, index) => SizedBox(
                    width: productRowCardWidth,
                    child: FadeSlideIn(
                      delay: Duration(milliseconds: 50 * index.clamp(0, 4)),
                      child: Stack(
                        children: [
                          ProductCard(
                            product: items[index],
                            heroScope: 'trending',
                          ),
                          Positioned(
                            top: AppSpace.sm,
                            right: AppSpace.sm,
                            child: _Rank(rank: index + 1),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _Rank extends StatelessWidget {
  const _Rank({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: AppColors.ink,
          shape: BoxShape.circle,
        ),
        child: Text(
          '$rank',
          style: const TextStyle(
            fontFamily: 'serif',
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppColors.white,
          ),
        ),
      ),
    );
  }
}

class _ShopsToKnow extends ConsumerWidget {
  const _ShopsToKnow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shops = ref.watch(featuredShopsProvider);
    final items = shops.value ?? const <FeaturedShop>[];
    if (shops.hasError || (shops.hasValue && items.isEmpty)) {
      return const SizedBox.shrink();
    }
    return Column(
      children: [
        const SectionHeader(title: 'Shops to know'),
        SizedBox(
          height: 208,
          child: shops.isLoading
              ? const RowSkeleton(width: 272, height: 208)
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  clipBehavior: Clip.none,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: AppSpace.md),
                  itemBuilder: (context, index) =>
                      _ShopCard(shop: items[index]),
                ),
        ),
      ],
    );
  }
}

class _ShopCard extends StatelessWidget {
  const _ShopCard({required this.shop});

  final FeaturedShop shop;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: shop.shopName,
      child: PressScale(
        scale: 0.98,
        onTap: () => context.push(BuyerPaths.shop(shop.shopKey)),
        child: Container(
          width: 272,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BuyerRadius.cardAll,
            boxShadow: BuyerShadow.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ShopAvatar(name: shop.shopName, url: shop.logoUrl, size: 42),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          shop.shopName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          [
                            if (shop.city != null) shop.city!,
                            '${shop.productCount} products',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.stone500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    LucideIcons.chevronRight,
                    size: 18,
                    color: AppColors.stone400,
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.md),
              Expanded(
                child: Row(
                  children: [
                    for (final (i, product) in shop.products.take(3).indexed)
                      Expanded(
                        child: Padding(
                          padding: EdgeInsets.only(left: i == 0 ? 0 : 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: NetImage(
                                  product.thumbnailUrl,
                                  width: double.infinity,
                                  radius: 12,
                                ),
                              ),
                              const SizedBox(height: 6),
                              PesoText(
                                product.price,
                                style: BuyerText.price.copyWith(fontSize: 12.5),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
