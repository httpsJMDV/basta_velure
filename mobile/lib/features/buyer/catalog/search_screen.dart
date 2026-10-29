import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../widgets/buyer_widgets.dart';

/// The filters the product list can send (B3). Price limits are text exactly as typed, so "500.50" stays "500.50".
class ProductFilters {
  const ProductFilters({
    this.sort = 'best_match',
    this.minPrice,
    this.maxPrice,
    this.minRating,
    this.onSale = false,
    this.newArrivals = false,
  });

  final String sort;
  final String? minPrice;
  final String? maxPrice;
  final int? minRating;
  final bool onSale;
  final bool newArrivals;

  int get activeCount => [
    minPrice != null || maxPrice != null,
    minRating != null,
    onSale,
    newArrivals,
  ].where((on) => on).length;

  @override
  bool operator ==(Object other) =>
      other is ProductFilters &&
      other.sort == sort &&
      other.minPrice == minPrice &&
      other.maxPrice == maxPrice &&
      other.minRating == minRating &&
      other.onSale == onSale &&
      other.newArrivals == newArrivals;

  @override
  int get hashCode =>
      Object.hash(sort, minPrice, maxPrice, minRating, onSale, newArrivals);
}

const _sorts = {
  'best_match': 'Best match',
  'trending': 'Trending',
  'best_selling': 'Top sales',
  'newest': 'Newest',
  'price_asc': 'Price: low to high',
  'price_desc': 'Price: high to low',
  'highest_rated': 'Top rated',
};

/// Search results, a category, or a filtered list (Trending, On sale). Typing waits until the person stops (about
/// 400 ms) and an empty box never searches.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({
    super.key,
    this.initialQuery,
    this.categoryId,
    this.parentCategoryId,
    this.title,
    this.initialSort,
    this.onSale = false,
  });

  final String? initialQuery;
  final String? categoryId;
  final String? parentCategoryId;
  final String? title;
  final String? initialSort;
  final bool onSale;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final _box = TextEditingController(text: widget.initialQuery ?? '');
  Timer? _debounce;
  late String? _query = Rules.searchQuery(widget.initialQuery);
  late ProductFilters _filters = ProductFilters(
    sort: widget.initialSort ?? 'best_match',
    onSale: widget.onSale,
  );

  /// A category, a sort or a filter shows products even before anything is typed.
  bool get _browsing =>
      widget.categoryId != null ||
      widget.parentCategoryId != null ||
      widget.initialSort != null ||
      widget.onSale;

  @override
  void dispose() {
    _debounce?.cancel();
    _box.dispose();
    super.dispose();
  }

  void _typed(String value) {
    // Shows or hides the clear button straight away; the search itself waits.
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      final next = Rules.searchQuery(value);
      if (next != _query && mounted) setState(() => _query = next);
    });
  }

  void _submit(String value) {
    _debounce?.cancel();
    setState(() => _query = Rules.searchQuery(value));
  }

  Future<void> _openFilters() async {
    final next = await showModalBottomSheet<ProductFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FilterSheet(initial: _filters),
    );
    if (next != null && mounted) setState(() => _filters = next);
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(buyerApiProvider);
    final showResults = _query != null || _browsing;

    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _box,
          autofocus: !_browsing && _query == null,
          textInputAction: TextInputAction.search,
          inputFormatters: [Only.max(100)],
          onChanged: _typed,
          onSubmitted: _submit,
          decoration: InputDecoration(
            hintText: widget.title == null
                ? 'Search Loved-IT'
                : 'Search in ${widget.title}',
            isDense: true,
            prefixIcon: const Icon(LucideIcons.search, size: 18),
            suffixIcon: _box.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear',
                    icon: const Icon(LucideIcons.x, size: 18),
                    onPressed: () {
                      _box.clear();
                      _submit('');
                    },
                  ),
          ),
        ),
        actions: const [SizedBox(width: AppSpace.md)],
      ),
      body: !showResults
          ? const EmptyState(
              icon: LucideIcons.search,
              title: 'What are you looking for?',
              message: 'Search by product, shop or category.',
            )
          : PagedList<ProductSummary>(
              key: ValueKey(Object.hash(_query, _filters)),
              gridColumns: 2,
              gridAspectRatio: productGridAspectRatio,
              load: (page) => api.products(
                page: page,
                q: _query,
                categoryId: widget.categoryId,
                parentCategoryId: widget.parentCategoryId,
                sort: _filters.sort,
                minPrice: _filters.minPrice,
                maxPrice: _filters.maxPrice,
                minRating: _filters.minRating,
                onSale: _filters.onSale,
                newArrivals: _filters.newArrivals,
              ),
              itemBuilder: (_, product) => ProductCard(product: product),
              empty: EmptyState(
                icon: LucideIcons.searchX,
                title: 'No products found',
                message: _filters.activeCount > 0
                    ? 'Try fewer filters or another word.'
                    : 'Try another word, or browse the categories.',
                actionLabel: _filters.activeCount > 0 ? 'Clear filters' : null,
                onAction: () => setState(
                  () => _filters = ProductFilters(sort: _filters.sort),
                ),
              ),
              header: [
                SliverToBoxAdapter(
                  child: _SortBar(
                    title: widget.title,
                    filters: _filters,
                    onSort: (sort) => setState(
                      () => _filters = ProductFilters(
                        sort: sort,
                        minPrice: _filters.minPrice,
                        maxPrice: _filters.maxPrice,
                        minRating: _filters.minRating,
                        onSale: _filters.onSale,
                        newArrivals: _filters.newArrivals,
                      ),
                    ),
                    onFilters: _openFilters,
                  ),
                ),
              ],
            ),
    );
  }
}

class _SortBar extends StatelessWidget {
  const _SortBar({
    required this.title,
    required this.filters,
    required this.onSort,
    required this.onFilters,
  });

  final String? title;
  final ProductFilters filters;
  final ValueChanged<String> onSort;
  final VoidCallback onFilters;

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
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.sm),
              child: Text(
                title!,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          Row(
            children: [
              Expanded(
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: filters.sort,
                    isExpanded: true,
                    icon: const Icon(LucideIcons.chevronDown, size: 18),
                    items: [
                      for (final entry in _sorts.entries)
                        DropdownMenuItem(
                          value: entry.key,
                          child: Text(entry.value),
                        ),
                    ],
                    onChanged: (value) {
                      if (value != null) onSort(value);
                    },
                  ),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              OutlinedButton.icon(
                onPressed: onFilters,
                icon: const Icon(LucideIcons.slidersHorizontal, size: 16),
                label: Text(
                  filters.activeCount == 0
                      ? 'Filters'
                      : 'Filters (${filters.activeCount})',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});

  final ProductFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  final _form = GlobalKey<FormState>();
  late final _min = TextEditingController(text: widget.initial.minPrice ?? '');
  late final _max = TextEditingController(text: widget.initial.maxPrice ?? '');
  late int? _rating = widget.initial.minRating;
  late bool _onSale = widget.initial.onSale;
  late bool _newArrivals = widget.initial.newArrivals;

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  String? _price(TextEditingController box) {
    final text = box.text.trim();
    return text.isEmpty || double.tryParse(text) == null ? null : text;
  }

  void _apply() {
    if (!_form.currentState!.validate()) return;
    Navigator.of(context).pop(
      ProductFilters(
        sort: widget.initial.sort,
        minPrice: _price(_min),
        maxPrice: _price(_max),
        minRating: _rating,
        onSale: _onSale,
        newArrivals: _newArrivals,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom + AppSpace.lg,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Filters', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AppSpace.lg),
              const Text(
                'Price',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: AppSpace.sm),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: AppTextField(
                      label: 'Minimum ₱',
                      controller: _min,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [Only.pesos],
                      validator: (_) => Rules.priceRange(_min.text, _max.text),
                    ),
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: AppTextField(
                      label: 'Maximum ₱',
                      controller: _max,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [Only.pesos],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.lg),
              const Text(
                'Rating',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: AppSpace.sm),
              Wrap(
                spacing: AppSpace.sm,
                children: [
                  for (final stars in [4, 3, 2])
                    ChoiceChip(
                      label: Text('$stars★ and up'),
                      selected: _rating == stars,
                      onSelected: (on) =>
                          setState(() => _rating = on ? stars : null),
                    ),
                ],
              ),
              const SizedBox(height: AppSpace.md),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('On sale'),
                value: _onSale,
                onChanged: (on) => setState(() => _onSale = on),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('New arrivals'),
                value: _newArrivals,
                onChanged: (on) => setState(() => _newArrivals = on),
              ),
              const SizedBox(height: AppSpace.md),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                      ),
                      onPressed: () =>
                          Navigator.of(context)
                              .pop(ProductFilters(sort: widget.initial.sort)),
                      child: const Text('Clear'),
                    ),
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brandRed,
                        minimumSize: const Size.fromHeight(52),
                      ),
                      onPressed: _apply,
                      child: const Text('Show products'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
