import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../widgets/buyer_theme.dart';

/// How star ratings work, from the (?) beside a product's rating. Every word here is what the server does: only a
/// completed order's buyer can rate (A12), and the overall rating is the average of every visible rating
/// (`ProductRatings`).
Future<void> showStarRatingGuidelines(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (context) => Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: AppSpace.xl),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.xl,
          AppSpace.sm,
          AppSpace.xl,
          AppSpace.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                tooltip: 'Close',
                icon: const Icon(LucideIcons.x, size: 20),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            Text(
              'Guidelines for star rating',
              textAlign: TextAlign.center,
              style: BuyerText.section.copyWith(fontSize: 19),
            ),
            const SizedBox(height: AppSpace.md),
            const Text(
              'Star ratings and reviews help you decide if a product is right for you. Every rating and review on '
              'Loved-IT comes from a verified purchase: only a buyer whose order was completed can rate what they '
              'bought, once per product per order. A product\'s overall star rating is the average of all the star '
              'ratings given to it.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                height: 1.55,
                color: AppColors.stone700,
              ),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                showReviewGuidelines(context);
              },
              child: const Text(
                'Read the review guidelines',
                style: TextStyle(decoration: TextDecoration.underline),
              ),
            ),
            const SizedBox(height: AppSpace.sm),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandRed,
                minimumSize: const Size.fromHeight(50),
                shape: const StadiumBorder(),
              ),
              child: const Text('OK'),
            ),
          ],
        ),
      ),
    ),
  );
}

/// The rules for writing a review and adding photos, in a tall sheet. Opened from the star rating guidelines and from
/// the write-a-review screen.
Future<void> showReviewGuidelines(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          0,
          AppSpace.lg,
          AppSpace.xxl,
        ),
        children: [
          Text('Review guidelines', style: BuyerText.screenTitle),
          const SizedBox(height: AppSpace.sm),
          const Text(
            'Honest reviews help other buyers choose well and help shops get better. Please follow these when you '
            'rate a product.',
            style: TextStyle(height: 1.5, color: AppColors.stone600),
          ),
          for (final section in _sections) _GuidelineSection(section: section),
        ],
      ),
    ),
  );
}

class _Section {
  const _Section(this.icon, this.title, this.lines);

  final IconData icon;
  final String title;
  final List<String> lines;
}

const _sections = [
  _Section(LucideIcons.badgeCheck, 'Who can review', [
    'Only the buyer of a completed order can review what they bought. An order completes when you tap Order received, or by itself a few days after delivery.',
    'You can review each product once per order, within 30 days of the order completing.',
  ]),
  _Section(LucideIcons.star, 'Choosing your stars', [
    '5 Excellent, 4 Good, 3 Okay, 2 Poor, 1 Bad.',
    'Rate the product itself: its quality, size and whether it matches the listing.',
    'For the shop\'s packing, shipping or how it answered you, leave a comment on the shop\'s page instead.',
  ]),
  _Section(LucideIcons.penLine, 'Writing your review', [
    'Up to 500 characters. Say what you liked or didn\'t, and how you use it.',
    'Write about your own experience. Don\'t copy other reviews or write for someone else.',
    'No phone numbers, links, addresses or other personal details, and no offers to buy or sell outside Loved-IT.',
    'No insults, hate, threats or adult content.',
  ]),
  _Section(LucideIcons.camera, 'Adding photos', [
    'Add up to 5 photos of the product you received. Real photos help other buyers the most.',
    'Show only the product. Leave out faces, IDs, receipts, shipping labels and anything with your address or name.',
    'No unrelated, edited or borrowed photos.',
    'The app shrinks each photo and removes its hidden location data before it is sent.',
  ]),
  _Section(LucideIcons.refreshCw, 'Changing your review', [
    'You can change your stars and words once, within 30 days of posting.',
    'Photos can\'t be changed after you post, so choose them with care.',
  ]),
  _Section(LucideIcons.messagesSquare, 'Replies and Helpful', [
    'The shop can reply to your review once, in public, under it.',
    'Tap Helpful on reviews that helped you decide. Under Recommended, the reviews with the most Helpful votes show first. You can\'t mark your own.',
  ]),
  _Section(LucideIcons.scale, 'Fair to everyone', [
    'Every star rating counts in a product\'s average, good or bad. Loved-IT doesn\'t remove a review for being negative.',
  ]),
];

class _GuidelineSection extends StatelessWidget {
  const _GuidelineSection({required this.section});

  final _Section section;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.brandRedTint,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(section.icon, size: 17, color: AppColors.brandRed),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Text(
                  section.title,
                  style: const TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          for (final line in section.lines)
            Padding(
              padding: const EdgeInsets.only(top: AppSpace.sm, left: 44),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Icon(
                      Icons.circle,
                      size: 5,
                      color: AppColors.stone400,
                    ),
                  ),
                  const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: Text(
                      line,
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.5,
                        color: AppColors.stone700,
                      ),
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
