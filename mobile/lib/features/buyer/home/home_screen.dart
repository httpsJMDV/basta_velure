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
import '../widgets/buyer_widgets.dart';

/// The Home tab (B0, B3), in the website's order: search, the hero banner, the category grid, Trending now, the
/// shops to know, then every product.
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
    final isSeller = ref.watch(currentUserProvider)?.isSeller ?? false;

    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(
        titleSpacing: AppSpace.lg,
        title: const _SearchField(),
        actions: const [
          _BellButton(),
          SizedBox(width: AppSpace.xs),
        ],
      ),
      body: PagedList<ProductSummary>(
        onRefresh: _refreshSections,
        gridColumns: 2,
        gridAspectRatio: productGridAspectRatio,
        load: (page) => api.products(page: page, sort: 'random', seed: _seed),
        itemBuilder: (_, product) => ProductCard(product: product),
        empty: const EmptyState(
          icon: LucideIcons.package,
          title: 'No products yet',
          message: 'Shops are adding products. Check back soon.',
        ),
        header: [
          if (isSeller) const SliverToBoxAdapter(child: _SellerNote()),
          const SliverToBoxAdapter(child: _HeroCarousel()),
          const SliverToBoxAdapter(child: _CategoryGrid()),
          const SliverToBoxAdapter(child: _Trending()),
          const SliverToBoxAdapter(child: _ShopsToKnow()),
          const SliverToBoxAdapter(
            child: SectionHeader(title: 'Discover', icon: LucideIcons.sparkles),
          ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Search products',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        onTap: () => context.push(BuyerPaths.search),
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
          decoration: BoxDecoration(
            color: AppColors.stone100,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: const Row(
            children: [
              Icon(LucideIcons.search, size: 18, color: AppColors.stone500),
              SizedBox(width: AppSpace.sm),
              Text(
                'Search Loved-IT',
                style: TextStyle(fontSize: 14, color: AppColors.stone500),
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
    return IconButton(
      tooltip: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      onPressed: () => context.push(BuyerPaths.notifications),
      icon: Badge(
        isLabelVisible: unread > 0,
        backgroundColor: AppColors.brandRed,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: const Icon(LucideIcons.bell),
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
        AppSpace.md,
        AppSpace.lg,
        0,
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

/// One slide of the website's `HeroCarousel.tsx`.
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
    'assets/hero/hero-slide-1.png',
    const Color(0xFFFBF3E6),
    'Everything you love.',
    'In one place.',
    'Browse products',
    BuyerPaths.search,
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

/// The hero banner: the website's photos at about 16:9, swipeable, moving on by itself every 6 seconds.
class _HeroCarousel extends StatefulWidget {
  const _HeroCarousel();

  @override
  State<_HeroCarousel> createState() => _HeroCarouselState();
}

class _HeroCarouselState extends State<_HeroCarousel> {
  final _pages = PageController();
  Timer? _timer;
  int _current = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _timer?.cancel();
    // Reduced motion: no moving by itself.
    if (!MediaQuery.of(context).disableAnimations) {
      _timer = Timer.periodic(const Duration(seconds: 6), (_) {
        if (!_pages.hasClients) return;
        _pages.animateToPage(
          (_current + 1) % _slides.length,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeOut,
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

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.md,
        AppSpace.lg,
        0,
      ),
      child: ClipRRect(
        borderRadius: AppRadius.cardAll,
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: Stack(
            children: [
              PageView.builder(
                controller: _pages,
                itemCount: _slides.length,
                onPageChanged: (index) => setState(() => _current = index),
                itemBuilder: (context, index) =>
                    _HeroSlide(slide: _slides[index]),
              ),
              Positioned(
                bottom: AppSpace.sm,
                right: AppSpace.md,
                child: Row(
                  children: [
                    for (var i = 0; i < _slides.length; i++)
                      AnimatedContainer(
                        duration: kMotion,
                        margin: const EdgeInsets.only(left: 4),
                        width: i == _current ? 16 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: i == _current
                              ? AppColors.brandRed
                              : AppColors.stone300,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
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

class _HeroSlide extends StatelessWidget {
  const _HeroSlide({required this.slide});

  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: slide.background,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: FractionallySizedBox(
              widthFactor: 0.62,
              heightFactor: 1,
              child: Image.asset(
                slide.asset,
                fit: BoxFit.cover,
                cacheWidth: 900,
              ),
            ),
          ),
          // The picture fades into the banner where the headline sits, like the website's mask.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  slide.background,
                  slide.background,
                  slide.background.withValues(alpha: 0),
                ],
                stops: const [0, 0.38, 0.62],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpace.lg),
            child: FractionallySizedBox(
              widthFactor: 0.6,
              alignment: Alignment.centerLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      '${slide.line1}\n${slide.line2}',
                      style: const TextStyle(
                        fontSize: 19,
                        height: 1.2,
                        fontWeight: FontWeight.w700,
                        color: AppColors.stone900,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                  FilledButton(
                    onPressed: () => context.push(slide.link),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandRed,
                      minimumSize: const Size(0, 36),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      textStyle: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: Text(slide.cta),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Two rows of photo tiles that scroll sideways. "Others" stays off the home grid like the website.
class _CategoryGrid extends ConsumerWidget {
  const _CategoryGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    return Column(
      children: [
        SectionHeader(
          title: 'Categories',
          onAction: () => context.go(BuyerPaths.categories),
        ),
        SizedBox(
          height: 228,
          child: categories.when(
            loading: () => const _TileRowSkeleton(),
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
              return GridView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: AppSpace.sm,
                  crossAxisSpacing: AppSpace.sm,
                  childAspectRatio: 1.25,
                ),
                itemCount: shown.length,
                itemBuilder: (context, index) =>
                    _CategoryTile(category: shown[index]),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.category});

  final Category category;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: AppRadius.cardAll,
      onTap: () => context.push(
        BuyerPaths.searchFor(
          parentCategoryId: '${category.id}',
          title: category.name,
        ),
      ),
      child: Column(
        children: [
          CategoryArt(category: category, size: 68),
          const SizedBox(height: 6),
          Text(
            category.name,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11.5,
              height: 1.2,
              color: AppColors.stone800,
            ),
          ),
        ],
      ),
    );
  }
}

class _TileRowSkeleton extends StatelessWidget {
  const _TileRowSkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
        itemCount: 5,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpace.md),
        itemBuilder: (_, _) =>
            const SkeletonBox(width: 130, height: 200, radius: 12),
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
          icon: LucideIcons.flame,
          onAction: () => context.push(
            BuyerPaths.searchFor(sort: 'trending', title: 'Trending now'),
          ),
        ),
        SizedBox(
          height: 262,
          child: trending.isLoading
              ? const _TileRowSkeleton()
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: AppSpace.md),
                  itemBuilder: (context, index) => SizedBox(
                    width: 150,
                    child: Stack(
                      children: [
                        ProductCard(product: items[index]),
                        Positioned(
                          top: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: const BoxDecoration(
                              color: AppColors.stone900,
                              borderRadius: BorderRadius.only(
                                topRight: Radius.circular(AppRadius.card),
                                bottomLeft: Radius.circular(AppRadius.card),
                              ),
                            ),
                            child: Text(
                              '#${index + 1}',
                              style: const TextStyle(
                                color: AppColors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
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
        const SectionHeader(title: 'Shops to know', icon: LucideIcons.store),
        SizedBox(
          height: 196,
          child: shops.isLoading
              ? const _TileRowSkeleton()
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
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
    return SizedBox(
      width: 260,
      child: Material(
        color: AppColors.white,
        borderRadius: AppRadius.cardAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push(BuyerPaths.shop(shop.shopKey)),
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    ShopAvatar(
                      name: shop.shopName,
                      url: shop.logoUrl,
                      size: 40,
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            shop.shopName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
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
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                Expanded(
                  child: Row(
                    children: [
                      for (final product in shop.products.take(3))
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: NetImage(
                                    product.thumbnailUrl,
                                    width: double.infinity,
                                    radius: 8,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                PesoText(
                                  product.price,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.brandRed,
                                  ),
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
      ),
    );
  }
}
