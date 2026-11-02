import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';

const _railItemWidth = 84.0;
const _railPhoto = 56.0;
const _railRing = 5.0;

/// The Categories tab: the main categories across the top as round photos, and one page for each underneath. Swipe the
/// page or tap a photo; the other follows.
class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});

  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  final _pages = PageController();
  final _rail = ScrollController();
  int _selected = 0;

  @override
  void dispose() {
    _pages.dispose();
    _rail.dispose();
    super.dispose();
  }

  /// Keeps the chosen photo near the middle of the row.
  void _centerRail(int index) {
    if (!_rail.hasClients) return;
    final position = _rail.position;
    final target =
        (AppSpace.sm +
                index * _railItemWidth +
                _railItemWidth / 2 -
                position.viewportDimension / 2)
            .clamp(0.0, position.maxScrollExtent);
    if (MediaQuery.disableAnimationsOf(context)) {
      _rail.jumpTo(target);
    } else {
      _rail.animateTo(target, duration: Motion.medium, curve: Motion.glide);
    }
  }

  void _onTapRail(int index) {
    if (index == _selected) return;
    HapticFeedback.selectionClick();
    final neighbour = (index - _selected).abs() == 1;
    setState(() => _selected = index);
    _centerRail(index);
    // Sliding past several pages only flashes them by, so a far one is simply opened.
    if (neighbour && !MediaQuery.disableAnimationsOf(context)) {
      _pages.animateToPage(index, duration: Motion.slow, curve: Motion.glide);
    } else {
      _pages.jumpToPage(index);
    }
  }

  void _onSwipe(int index) {
    if (index == _selected) return;
    HapticFeedback.selectionClick();
    setState(() => _selected = index);
    _centerRail(index);
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Categories'),
        actions: [
          IconButton(
            tooltip: 'Search',
            icon: const Icon(LucideIcons.search, size: 21),
            onPressed: () => context.push(BuyerPaths.search),
          ),
          const SizedBox(width: AppSpace.xs),
        ],
      ),
      body: categories.when(
        loading: () => const _CategoriesSkeleton(),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(categoriesProvider),
        ),
        data: (all) {
          if (all.isEmpty) {
            return const EmptyState(
              icon: LucideIcons.layoutGrid,
              title: 'No categories yet',
            );
          }
          final selected = _selected.clamp(0, all.length - 1);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                // Room for two lines of name, however large the phone's text is.
                height:
                    _railPhoto +
                    _railRing * 2 +
                    AppSpace.sm * 2 +
                    MediaQuery.textScalerOf(context).scale(32),
                child: ListView.builder(
                  controller: _rail,
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
                  itemExtent: _railItemWidth,
                  itemCount: all.length,
                  itemBuilder: (context, i) => _RailItem(
                    category: all[i],
                    selected: i == selected,
                    onTap: () => _onTapRail(i),
                  ),
                ),
              ),
              const Divider(height: 1, thickness: 1, color: AppColors.stone200),
              Expanded(
                child: PageView.builder(
                  controller: _pages,
                  itemCount: all.length,
                  onPageChanged: _onSwipe,
                  itemBuilder: (context, i) =>
                      _CategoryPage(parent: all[i], index: i, pages: _pages),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final Category category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: category.name,
      onTap: onTap,
      excludeSemantics: true,
      child: PressScale(
        scale: 0.95,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.only(top: AppSpace.sm),
          child: Column(
            children: [
              AnimatedContainer(
                duration: Motion.medium,
                curve: Motion.settle,
                padding: const EdgeInsets.all(_railRing - 2),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    width: 2,
                    color: selected ? AppColors.brandRed : Colors.transparent,
                  ),
                ),
                child: CategoryArt(
                  category: category,
                  size: _railPhoto,
                  radius: _railPhoto / 2,
                ),
              ),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: AnimatedDefaultTextStyle(
                  duration: Motion.medium,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 11.5,
                    height: 1.25,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    color: selected ? AppColors.ink : AppColors.stone600,
                  ),
                  child: Text(
                    category.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
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

/// One main category: its banner, its types, and what is selling in it.
class _CategoryPage extends StatelessWidget {
  const _CategoryPage({
    required this.parent,
    required this.index,
    required this.pages,
  });

  final Category parent;
  final int index;
  final PageController pages;

  @override
  Widget build(BuildContext context) {
    final types = parent.children;
    return CustomScrollView(
      key: PageStorageKey('category-${parent.id}'),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.lg,
              AppSpace.lg,
              0,
            ),
            child: _Banner(parent: parent, index: index, pages: pages),
          ),
        ),
        if (types.isNotEmpty) ...[
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.only(top: AppSpace.sm),
              child: SectionHeader(title: 'Shop by type'),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
            sliver: _TypeGrid(types: types),
          ),
        ],
        SliverToBoxAdapter(child: _Popular(parent: parent)),
        SliverToBoxAdapter(
          child: SizedBox(height: AppSpace.xl + dockInset(context)),
        ),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.parent,
    required this.index,
    required this.pages,
  });

  final Category parent;
  final int index;
  final PageController pages;

  String get _count => switch (parent.productCount) {
    0 => 'No products yet',
    1 => 'See 1 product',
    final count => 'See all $count products',
  };

  @override
  Widget build(BuildContext context) {
    void open() => context.push(
      BuyerPaths.searchFor(
        parentCategoryId: '${parent.id}',
        title: parent.name,
      ),
    );
    return Semantics(
      button: true,
      label: '${parent.name}. $_count',
      onTap: open,
      excludeSemantics: true,
      child: PressScale(
        scale: 0.985,
        onTap: open,
        child: ClipRRect(
          borderRadius: BuyerRadius.cardAll,
          child: AspectRatio(
            aspectRatio: 1.9,
            child: LayoutBuilder(
              builder: (context, constraints) => Stack(
                fit: StackFit.expand,
                children: [
                  CategoryArt(
                    category: parent,
                    size: constraints.maxWidth,
                    height: constraints.maxHeight,
                    radius: 0,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: [0.15, 0.95],
                        colors: [Color(0x001E1B18), Color(0xD91E1B18)],
                      ),
                    ),
                  ),
                  Positioned(
                    left: AppSpace.lg,
                    right: AppSpace.lg,
                    bottom: AppSpace.md,
                    child: AnimatedBuilder(
                      animation: pages,
                      builder: (context, child) {
                        // The words drift a little behind the photo as the page is swiped.
                        final page =
                            pages.hasClients && pages.position.haveDimensions
                            ? pages.page ?? index.toDouble()
                            : index.toDouble();
                        final away = page - index;
                        return Opacity(
                          opacity: (1 - away.abs() * 1.4).clamp(0.0, 1.0),
                          child: Transform.translate(
                            offset: Offset(away * 48, 0),
                            child: child,
                          ),
                        );
                      },
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  parent.name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: BuyerText.section.copyWith(
                                    fontSize: 22,
                                    height: 1.15,
                                    color: AppColors.white,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _count,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: AppSpace.md),
                          Container(
                            width: 38,
                            height: 38,
                            decoration: const BoxDecoration(
                              color: AppColors.white,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              LucideIcons.arrowRight,
                              size: 18,
                              color: AppColors.ink,
                            ),
                          ),
                        ],
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

/// Three across, every tile the same size however long its name, so the rows stay straight.
class _TypeGrid extends StatelessWidget {
  const _TypeGrid({required this.types});

  final List<Category> types;

  static const _columns = 3;
  static const _gap = AppSpace.md;

  @override
  Widget build(BuildContext context) {
    final tile =
        (MediaQuery.sizeOf(context).width -
            AppSpace.lg * 2 -
            _gap * (_columns - 1)) /
        _columns;
    return SliverGrid.builder(
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: _columns,
        crossAxisSpacing: _gap,
        mainAxisSpacing: AppSpace.sm,
        // The photo, then room for two lines of name.
        mainAxisExtent: tile + 8 + MediaQuery.textScalerOf(context).scale(34),
      ),
      itemCount: types.length,
      itemBuilder: (context, index) {
        final type = types[index];
        void open() => context.push(
          BuyerPaths.searchFor(categoryId: '${type.id}', title: type.name),
        );
        return FadeSlideIn(
          delay: Duration(milliseconds: 24 * index.clamp(0, 8)),
          offset: 8,
          child: Semantics(
            button: true,
            label: type.name,
            onTap: open,
            excludeSemantics: true,
            child: PressScale(
              scale: 0.96,
              onTap: open,
              child: Column(
                children: [
                  // A hairline, so a photo on a white background keeps its edge against the cream page.
                  DecoratedBox(
                    position: DecorationPosition.foreground,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(BuyerRadius.field),
                      border: Border.all(color: const Color(0x121E1B18)),
                    ),
                    child: CategoryArt(
                      category: type,
                      size: tile,
                      radius: BuyerRadius.field,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    type.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 12.5,
                      height: 1.25,
                      fontWeight: FontWeight.w500,
                      color: AppColors.stone800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

final _popularProvider = FutureProvider.autoDispose
    .family<List<ProductSummary>, int>(
      (ref, parentId) async =>
          (await ref
                  .watch(buyerApiProvider)
                  .products(
                    parentCategoryId: parentId,
                    sort: 'trending',
                    perPage: 10,
                  ))
              .items,
    );

/// What is selling in this category. Nothing shows until there is something to show.
class _Popular extends ConsumerWidget {
  const _Popular({required this.parent});

  final Category parent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final popular = ref.watch(_popularProvider(parent.id));
    final items = popular.value ?? const <ProductSummary>[];
    if (popular.hasError || (popular.hasValue && items.isEmpty)) {
      return const SizedBox.shrink();
    }
    return Column(
      children: [
        const SizedBox(height: AppSpace.sm),
        SectionHeader(
          title: 'Popular right now',
          onAction: () => context.push(
            BuyerPaths.searchFor(
              parentCategoryId: '${parent.id}',
              title: parent.name,
              sort: 'trending',
            ),
          ),
        ),
        SizedBox(
          height: productRowHeight,
          child: popular.isLoading
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
                      child: ProductCard(
                        product: items[index],
                        // Its own scope: a product can be in the row on the next page too.
                        heroScope: 'category-${parent.id}',
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _CategoriesSkeleton extends StatelessWidget {
  const _CategoriesSkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: SingleChildScrollView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpace.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (var i = 0; i < 4; i++)
                  const SkeletonBox(
                    width: _railPhoto,
                    height: _railPhoto,
                    radius: _railPhoto / 2,
                  ),
              ],
            ),
            const SizedBox(height: AppSpace.xl),
            const AspectRatio(
              aspectRatio: 1.9,
              child: SkeletonBox(radius: BuyerRadius.card),
            ),
            const SizedBox(height: AppSpace.xl),
            for (var row = 0; row < 3; row++)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.lg),
                child: Row(
                  children: [
                    for (var i = 0; i < 3; i++) ...[
                      if (i > 0) const SizedBox(width: AppSpace.md),
                      const Expanded(
                        child: AspectRatio(
                          aspectRatio: 1,
                          child: SkeletonBox(radius: BuyerRadius.field),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
