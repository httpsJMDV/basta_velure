import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/catalog.dart';
import '../widgets/buyer_widgets.dart';
import '../widgets/photo_viewer.dart';

/// Every review, a page at a time, in a tall sheet.
Future<void> showReviewsSheet(
  BuildContext context, {
  required String title,
  required Future<ApiPage<ProductReview>> Function(int page) load,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.85,
      child: Column(
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpace.sm),
          Expanded(
            child: PagedList<ProductReview>(
              load: load,
              spacing: 0,
              itemBuilder: (_, review) => ReviewTile(review: review),
              empty: const EmptyState(
                icon: LucideIcons.star,
                title: 'No reviews yet',
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// One product review: stars, the buyer's (masked) name, text, photos and the shop's reply.
class ReviewTile extends StatelessWidget {
  const ReviewTile({super.key, required this.review});

  final ProductReview review;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.md),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.stone200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  review.buyerName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
              Text(
                Fmt.date(review.createdAt),
                style: const TextStyle(fontSize: 12, color: AppColors.stone500),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Stars(rating: review.rating, size: 13),
          if (review.variantLabel != null || review.productName != null) ...[
            const SizedBox(height: 4),
            Text(
              [
                review.productName,
                review.variantLabel,
              ].whereType<String>().join(' · '),
              style: const TextStyle(fontSize: 12, color: AppColors.stone500),
            ),
          ],
          if (review.comment != null) ...[
            const SizedBox(height: AppSpace.sm),
            Text(review.comment!, style: const TextStyle(height: 1.45)),
          ],
          if (review.images.isNotEmpty) ...[
            const SizedBox(height: AppSpace.sm),
            SizedBox(
              height: 64,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: review.images.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.sm),
                itemBuilder: (context, index) => GestureDetector(
                  onTap: () =>
                      showPhotoViewer(context, review.images, initial: index),
                  child: NetImage(
                    review.images[index],
                    width: 64,
                    height: 64,
                    radius: 8,
                  ),
                ),
              ),
            ),
          ],
          if (review.sellerReply != null) ...[
            const SizedBox(height: AppSpace.sm),
            _Reply(text: review.sellerReply!),
          ],
        ],
      ),
    );
  }
}

class _Reply extends StatelessWidget {
  const _Reply({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: AppColors.stone100,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            const TextSpan(
              text: "Shop's reply: ",
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            TextSpan(text: text),
          ],
        ),
        style: const TextStyle(fontSize: 13, height: 1.4),
      ),
    );
  }
}

/// A shop comment (no stars): the text, the quick tags and the shop's reply.
class ShopCommentTile extends StatelessWidget {
  const ShopCommentTile({super.key, required this.comment});

  final ShopComment comment;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.md),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.stone200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  comment.buyerName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
              Text(
                '${Fmt.date(comment.createdAt)}${comment.edited ? ' · edited' : ''}',
                style: const TextStyle(fontSize: 12, color: AppColors.stone500),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Text(comment.comment, style: const TextStyle(height: 1.45)),
          if (comment.tags.isNotEmpty) ...[
            const SizedBox(height: AppSpace.sm),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final tag in comment.tags)
                  StatusChip(label: tag, tone: StatusTone.gray),
              ],
            ),
          ],
          if (comment.sellerReply != null) ...[
            const SizedBox(height: AppSpace.sm),
            _Reply(text: comment.sellerReply!),
          ],
        ],
      ),
    );
  }
}
