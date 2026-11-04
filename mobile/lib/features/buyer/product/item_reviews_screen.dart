import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../reviews/review_guidelines.dart';
import '../widgets/buyer_theme.dart';
import 'reviews_sheet.dart';

/// What the item reviews page hands back to the product page: Add to cart was tapped there.
const itemReviewsAddToCart = 'add_to_cart';

/// Item reviews: every review of one product, on its own page. The verified-purchase banner (its (?) explains star
/// ratings), the average and a bar per number of stars, then Recommended / Most recent / Highest rated, a stars filter
/// and "With photos". Each review has its photos, the shop's reply, Share and Helpful. With the [product] (opened from
/// its page), its price and Add to cart stay at the bottom; Add to cart goes back to the product page, which asks for
/// the options.
class ItemReviewsScreen extends ConsumerStatefulWidget {
  const ItemReviewsScreen({
    super.key,
    required this.productId,
    this.product,
    this.initialRating,
    this.initialWithPhotos = false,
  });

  final int productId;
  final ProductDetail? product;
  final int? initialRating;
  final bool initialWithPhotos;

  @override
  ConsumerState<ItemReviewsScreen> createState() => _ItemReviewsScreenState();
}

class _ItemReviewsScreenState extends ConsumerState<ItemReviewsScreen> {
  final _list = GlobalKey<PagedListState<ProductReview>>();
  ReviewSort _sort = ReviewSort.recommended;
  late int? _rating = widget.initialRating;
  late bool _withPhotos = widget.initialWithPhotos;
  ReviewStats _stats = ReviewStats.empty;

  Future<ApiPage<ProductReview>> _load(int page) => ref
      .read(buyerApiProvider)
      .productReviews(
        widget.productId,
        page: page,
        rating: _rating,
        withPhotos: _withPhotos,
        sort: _sort,
      );

  void _loaded(ApiPage<ProductReview> page) {
    if (page.currentPage == 1 && mounted) {
      setState(() => _stats = ReviewStats.fromMeta(page.meta));
    }
  }

  /// Changes a filter and loads the list again from its first page.
  void _apply(VoidCallback change) {
    setState(change);
    _list.currentState?.refresh();
  }

  Future<void> _chooseSort() async {
    final sort = await showAppSelect<ReviewSort>(
      context,
      title: 'Sort reviews',
      selected: _sort,
      options: const [
        AppOption(
          ReviewSort.recommended,
          'Recommended',
          subtitle: 'Most helpful first, then those with photos',
        ),
        AppOption(ReviewSort.recent, 'Most recent'),
        AppOption(ReviewSort.highest, 'Highest rated'),
      ],
    );
    if (sort != null && sort != _sort) _apply(() => _sort = sort);
  }

  Future<void> _chooseRating() async {
    // 0 is "All": the sheet's choices can't be null.
    final stars = await showAppSelect<int>(
      context,
      title: 'Rating',
      selected: _rating ?? 0,
      options: [
        AppOption(0, 'All ratings', subtitle: '${_stats.total} reviews'),
        for (var stars = 5; stars >= 1; stars--)
          AppOption(
            stars,
            '$stars star${stars == 1 ? '' : 's'}',
            subtitle:
                '${_stats.counts[stars] ?? 0} review${(_stats.counts[stars] ?? 0) == 1 ? '' : 's'}',
          ),
      ],
    );
    if (stars == null) return;
    final rating = stars == 0 ? null : stars;
    if (rating != _rating) _apply(() => _rating = rating);
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    return Scaffold(
      backgroundColor: AppColors.cream,
      appBar: AppBar(title: const Text('Item reviews')),
      body: PagedList<ProductReview>(
        key: _list,
        load: _load,
        onLoaded: _loaded,
        padding: const EdgeInsets.only(top: AppSpace.sm),
        spacing: AppSpace.sm,
        header: [
          SliverToBoxAdapter(
            child: Material(
              color: AppColors.white,
              child: Padding(
                padding: const EdgeInsets.all(AppSpace.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    VerifiedReviewsBanner(
                      onHelp: () => showStarRatingGuidelines(context),
                    ),
                    if (_stats.total > 0) ...[
                      const SizedBox(height: AppSpace.lg),
                      RatingBreakdown(
                        stats: _stats,
                        selected: _rating,
                        onSelect: (stars) => _apply(() => _rating = stars),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Container(
              color: AppColors.white,
              margin: const EdgeInsets.only(top: 1),
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.md,
                AppSpace.lg,
                AppSpace.md,
              ),
              child: Wrap(
                spacing: AppSpace.sm,
                runSpacing: AppSpace.sm,
                children: [
                  ReviewFilterChip(
                    label: _sort.label,
                    trailing: LucideIcons.chevronDown,
                    onTap: _chooseSort,
                  ),
                  ReviewFilterChip(
                    label: _rating == null
                        ? 'Rating'
                        : '$_rating star${_rating == 1 ? '' : 's'}',
                    icon: Icons.star_rounded,
                    selected: _rating != null,
                    trailing: LucideIcons.chevronDown,
                    onTap: _chooseRating,
                  ),
                  ReviewFilterChip(
                    label: 'With photos (${_stats.photoCount})',
                    icon: LucideIcons.images,
                    selected: _withPhotos,
                    onTap: () => _apply(() => _withPhotos = !_withPhotos),
                  ),
                  if (_rating != null || _withPhotos)
                    ReviewFilterChip(
                      label: 'Clear',
                      icon: LucideIcons.x,
                      onTap: () => _apply(() {
                        _rating = null;
                        _withPhotos = false;
                      }),
                    ),
                ],
              ),
            ),
          ),
        ],
        itemBuilder: (_, review) => Material(
          color: AppColors.white,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
            child: ReviewTile(
              key: ValueKey(review.id),
              review: review,
              productId: widget.productId,
              divider: false,
            ),
          ),
        ),
        empty: _rating != null || _withPhotos
            ? EmptyState(
                icon: LucideIcons.listFilter,
                title: 'No reviews match',
                message: 'Try another rating, or show every review.',
                actionLabel: 'Show all reviews',
                onAction: () => _apply(() {
                  _rating = null;
                  _withPhotos = false;
                }),
              )
            : const EmptyState(
                icon: LucideIcons.star,
                title: 'No reviews yet',
                message: 'Buyers can rate this product once their order is completed.',
              ),
      ),
      bottomNavigationBar: product == null ? null : _AddBar(product: product),
    );
  }
}

/// The price and Add to cart, like the product page's bar. Add to cart goes back to the product page with
/// [itemReviewsAddToCart], so the options are chosen in one place.
class _AddBar extends StatelessWidget {
  const _AddBar({required this.product});

  final ProductDetail product;

  @override
  Widget build(BuildContext context) {
    final blocked = product.soldOut || product.onVacation;
    final ranged = product.priceMax > product.priceMin;
    final price = ranged
        ? product.priceMin
        : product.flashSale?.price ?? product.price;
    final discount = !ranged && (product.originalPrice ?? 0) > price;
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
                constraints: const BoxConstraints(maxWidth: 110),
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
                    else if (discount)
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
              Expanded(
                child: FilledButton.icon(
                  onPressed: blocked
                      ? null
                      : () => context.pop(itemReviewsAddToCart),
                  icon: const Icon(LucideIcons.shoppingCart, size: 18),
                  label: Text(
                    blocked
                        ? (product.onVacation ? 'Shop on vacation' : 'Sold out')
                        : 'Add to cart',
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brandRed,
                    minimumSize: const Size.fromHeight(50),
                    shape: const StadiumBorder(),
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
