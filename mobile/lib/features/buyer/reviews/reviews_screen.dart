import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';

/// Reviews (B10): what is waiting for a review, and the reviews already written.
class ReviewsScreen extends ConsumerStatefulWidget {
  const ReviewsScreen({super.key});

  @override
  ConsumerState<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends ConsumerState<ReviewsScreen> {
  final _pending = GlobalKey<PagedListState<PendingReview>>();
  final _mine = GlobalKey<PagedListState<MyReview>>();

  Future<void> _open(Object target) async {
    final saved = await context.push<bool>(
      BuyerPaths.writeReview,
      extra: target,
    );
    if (saved == true) {
      await Future.wait([
        ?_pending.currentState?.refresh(),
        ?_mine.currentState?.refresh(),
      ]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(buyerApiProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.stone50,
        appBar: AppBar(
          title: const Text('Reviews'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'To review'),
              Tab(text: 'My reviews'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            PagedList<PendingReview>(
              key: _pending,
              load: (_) async => ApiPage.single(await api.pendingReviews()),
              itemBuilder: (_, item) =>
                  _PendingTile(item: item, onTap: () => _open(item)),
              empty: const EmptyState(
                icon: LucideIcons.star,
                title: 'Nothing to review',
                message: 'Products from delivered orders show here so you can rate them.',
              ),
            ),
            PagedList<MyReview>(
              key: _mine,
              load: (_) async => ApiPage.single(await api.myReviews()),
              itemBuilder: (_, review) =>
                  _MyReviewTile(review: review, onEdit: () => _open(review)),
              empty: const EmptyState(
                icon: LucideIcons.messageSquare,
                title: 'No reviews yet',
                message: 'Your reviews help other buyers.',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingTile extends StatelessWidget {
  const _PendingTile({required this.item, required this.onTap});

  final PendingReview item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      borderRadius: AppRadius.cardAll,
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.md),
        child: Row(
          children: [
            NetImage(item.imageUrl, width: 60, height: 60, radius: 8),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.productName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    [
                      item.shopName,
                      item.variantLabel,
                      item.orderNumber,
                    ].whereType<String>().join(' · '),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.stone500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandRed,
                minimumSize: const Size(72, 44),
              ),
              onPressed: onTap,
              child: const Text('Rate'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MyReviewTile extends StatelessWidget {
  const _MyReviewTile({required this.review, required this.onEdit});

  final MyReview review;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      borderRadius: AppRadius.cardAll,
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                NetImage(
                  review.productImageUrl,
                  width: 48,
                  height: 48,
                  radius: 8,
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        review.productName ?? 'Product',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Stars(rating: review.rating, size: 13),
                    ],
                  ),
                ),
                if (review.canEdit)
                  TextButton(onPressed: onEdit, child: const Text('Edit')),
              ],
            ),
            if (review.comment != null) ...[
              const SizedBox(height: AppSpace.sm),
              Text(review.comment!, style: const TextStyle(height: 1.4)),
            ],
            const SizedBox(height: AppSpace.xs),
            Text(
              Fmt.date(review.createdAt),
              style: const TextStyle(fontSize: 12, color: AppColors.stone500),
            ),
            if (review.sellerReply != null) ...[
              const SizedBox(height: AppSpace.sm),
              MessageBanner(
                message: 'Shop: ${review.sellerReply}',
                tone: StatusTone.gray,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
