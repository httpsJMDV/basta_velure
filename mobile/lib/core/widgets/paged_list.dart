import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/json.dart';
import '../theme/app_theme.dart';
import 'skeleton.dart';
import 'states.dart';

/// A list that loads one page at a time from the API: placeholders while the first page loads, Try again when it
/// fails, an empty state, pull to refresh, and the next page when the person nears the end. Give it a new [key]
/// when its filters change and it starts again from page 1.
class PagedList<T> extends StatefulWidget {
  const PagedList({
    super.key,
    required this.load,
    required this.itemBuilder,
    required this.empty,
    this.header = const [],
    this.gridColumns,
    this.gridAspectRatio = 0.6,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.spacing = AppSpace.md,
    this.onLoaded,
    this.onRefresh,
  });

  final Future<ApiPage<T>> Function(int page) load;
  final Widget Function(BuildContext context, T item) itemBuilder;

  /// Shown under the [header] when the first page has nothing.
  final Widget empty;

  /// Slivers above the items (a filter bar, a shop header). They stay while the list loads or fails.
  final List<Widget> header;

  /// Two product cards per row: a grid instead of a list.
  final int? gridColumns;
  final double gridAspectRatio;
  final EdgeInsets padding;
  final double spacing;

  /// Every loaded page, for extras in `meta` (tab counts, unread totals).
  final void Function(ApiPage<T> page)? onLoaded;

  /// Also run on pull to refresh, for what sits in the [header] (a shop profile, the home sections).
  final Future<void> Function()? onRefresh;

  @override
  State<PagedList<T>> createState() => PagedListState<T>();
}

class PagedListState<T> extends State<PagedList<T>> {
  final _items = <T>[];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  ApiFailure? _firstPageFailure;
  ApiFailure? _nextPageFailure;

  /// Bumped on every refresh, so a slow page from before the refresh is thrown away.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _loadNext();
  }

  /// Starts again from page 1, for pull to refresh and after the person changed something.
  Future<void> refresh() async {
    _generation++;
    setState(() {
      _items.clear();
      _page = 0;
      _hasMore = true;
      _loading = false;
      _firstPageFailure = null;
      _nextPageFailure = null;
    });
    await _loadNext();
  }

  Future<void> _loadNext() async {
    if (_loading || !_hasMore) return;
    final generation = _generation;
    setState(() {
      _loading = true;
      _nextPageFailure = null;
    });
    try {
      final page = await widget.load(_page + 1);
      if (!mounted || generation != _generation) return;
      widget.onLoaded?.call(page);
      setState(() {
        _items.addAll(page.items);
        _page = page.currentPage;
        _hasMore = page.hasMore && page.items.isNotEmpty;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      final failure = ApiFailure.from(error);
      setState(() {
        _loading = false;
        if (_items.isEmpty) {
          _firstPageFailure = failure;
        } else {
          _nextPageFailure = failure;
        }
      });
    }
  }

  bool _nearEnd(ScrollNotification notification) {
    if (notification.metrics.extentAfter < 600 &&
        _nextPageFailure == null &&
        _firstPageFailure == null) {
      _loadNext();
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final firstLoad = _items.isEmpty && _loading;
    final slivers = <Widget>[
      ...widget.header,
      if (_firstPageFailure != null)
        SliverFillRemaining(
          hasScrollBody: false,
          child: ErrorRetry(failure: _firstPageFailure!, onRetry: refresh),
        )
      else if (firstLoad)
        SliverToBoxAdapter(child: _placeholders())
      else if (_items.isEmpty)
        SliverFillRemaining(hasScrollBody: false, child: widget.empty)
      else ...[
        SliverPadding(padding: widget.padding, sliver: _itemsSliver()),
        SliverToBoxAdapter(child: _footer()),
      ],
    ];

    return NotificationListener<ScrollNotification>(
      onNotification: _nearEnd,
      child: RefreshIndicator(
        onRefresh: () => Future.wait([refresh(), ?widget.onRefresh?.call()]),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: slivers,
        ),
      ),
    );
  }

  Widget _itemsSliver() {
    final columns = widget.gridColumns;
    if (columns != null) {
      return SliverGrid.builder(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: columns,
          mainAxisSpacing: widget.spacing,
          crossAxisSpacing: widget.spacing,
          childAspectRatio: widget.gridAspectRatio,
        ),
        itemCount: _items.length,
        itemBuilder: (context, index) =>
            widget.itemBuilder(context, _items[index]),
      );
    }
    return SliverList.separated(
      itemCount: _items.length,
      separatorBuilder: (_, _) => SizedBox(height: widget.spacing),
      itemBuilder: (context, index) =>
          widget.itemBuilder(context, _items[index]),
    );
  }

  Widget _placeholders() {
    if (widget.gridColumns == null) {
      return const SizedBox(height: 520, child: SkeletonList(count: 5));
    }
    return Skeleton(
      child: GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: widget.padding,
        crossAxisCount: widget.gridColumns!,
        mainAxisSpacing: widget.spacing,
        crossAxisSpacing: widget.spacing,
        childAspectRatio: widget.gridAspectRatio,
        children: List.generate(
          4,
          (_) => const SkeletonBox(height: double.infinity, radius: 12),
        ),
      ),
    );
  }

  Widget _footer() {
    if (_nextPageFailure != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.xl),
        child: Center(
          child: TextButton(
            onPressed: _loadNext,
            child: const Text("Couldn't load more. Try again"),
          ),
        ),
      );
    }
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(AppSpace.lg),
        child: Center(
          child: SizedBox.square(
            dimension: 24,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
        ),
      );
    }
    return const SizedBox(height: AppSpace.xl);
  }
}
