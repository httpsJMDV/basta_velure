import 'package:flutter/material.dart';
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
import '../widgets/buyer_widgets.dart';

/// The Categories tab: the main categories down the left, the selected one's sub-categories on the right.
class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});

  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Categories'),
        actions: [
          IconButton(
            tooltip: 'Search',
            icon: const Icon(LucideIcons.search),
            onPressed: () => context.push(BuyerPaths.search),
          ),
        ],
      ),
      body: categories.when(
        loading: () => const SkeletonList(),
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
          final index = _selected.clamp(0, all.length - 1);
          final parent = all[index];
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 104,
                child: ColoredBox(
                  color: AppColors.stone100,
                  child: ListView.builder(
                    itemCount: all.length,
                    itemBuilder: (context, i) => _ParentTab(
                      category: all[i],
                      selected: i == index,
                      onTap: () => setState(() => _selected = i),
                    ),
                  ),
                ),
              ),
              Expanded(child: _Children(parent: parent)),
            ],
          );
        },
      ),
    );
  }
}

class _ParentTab extends StatelessWidget {
  const _ParentTab({
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
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppColors.white : null,
            border: Border(
              left: BorderSide(
                color: selected ? AppColors.brandRed : Colors.transparent,
                width: 3,
              ),
            ),
          ),
          alignment: Alignment.centerLeft,
          child: Text(
            category.name,
            style: TextStyle(
              fontSize: 12.5,
              height: 1.25,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
              color: selected ? AppColors.brandRed : AppColors.stone700,
            ),
          ),
        ),
      ),
    );
  }
}

class _Children extends StatelessWidget {
  const _Children({required this.parent});

  final Category parent;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      key: PageStorageKey(parent.id),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.lg),
            child: InkWell(
              borderRadius: AppRadius.cardAll,
              onTap: () => context.push(
                BuyerPaths.searchFor(
                  parentCategoryId: '${parent.id}',
                  title: parent.name,
                ),
              ),
              child: Row(
                children: [
                  CategoryArt(category: parent, size: 56),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          parent.name,
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'See all ${parent.productCount} products',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.brandRed,
                            fontWeight: FontWeight.w600,
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
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            0,
            AppSpace.lg,
            AppSpace.xl,
          ),
          sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: AppSpace.md,
              crossAxisSpacing: AppSpace.sm,
              childAspectRatio: 0.72,
            ),
            itemCount: parent.children.length,
            itemBuilder: (context, index) {
              final child = parent.children[index];
              return InkWell(
                borderRadius: AppRadius.cardAll,
                onTap: () => context.push(
                  BuyerPaths.searchFor(
                    categoryId: '${child.id}',
                    title: child.name,
                  ),
                ),
                child: Column(
                  children: [
                    CategoryArt(category: child, size: 64),
                    const SizedBox(height: 6),
                    Text(
                      child.name,
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, height: 1.2),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
