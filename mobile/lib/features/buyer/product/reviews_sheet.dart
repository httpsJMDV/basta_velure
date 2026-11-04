import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/env.dart';
import '../../../core/format.dart';
import '../../../core/share.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../widgets/buyer_widgets.dart';
import '../widgets/guest.dart';
import '../widgets/photo_viewer.dart';

/// Every review, a page at a time, in a tall sheet (a shop's reviews of all its products).
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
              itemBuilder: (_, review) =>
                  ReviewTile(key: ValueKey(review.id), review: review),
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

/// One product review, like the big marketplaces show it: the buyer's (masked) name, picture and date, the stars in
/// words, what they bought, their text and photos, the shop's reply, and Share and Helpful.
///
/// Helpful changes at once and goes back if the server refuses; the server's count wins when it answers. A guest is
/// asked to sign in first. [productId] names the product for sharing when the review doesn't (a product's own list).
class ReviewTile extends ConsumerStatefulWidget {
  const ReviewTile({
    super.key,
    required this.review,
    this.productId,
    this.divider = true,
  });

  final ProductReview review;
  final int? productId;

  /// A thin line under the review. Off where each review sits in its own block.
  final bool divider;

  static String wordFor(int stars) => switch (stars) {
    5 => 'Excellent',
    4 => 'Good',
    3 => 'Okay',
    2 => 'Poor',
    _ => 'Bad',
  };

  @override
  ConsumerState<ReviewTile> createState() => _ReviewTileState();
}

class _ReviewTileState extends ConsumerState<ReviewTile> {
  late int _count = widget.review.helpfulCount;
  late bool _helped = widget.review.helped;
  bool _busy = false;

  ProductReview get review => widget.review;

  @override
  void didUpdateWidget(ReviewTile old) {
    super.didUpdateWidget(old);
    if (old.review.id != review.id) {
      _count = review.helpfulCount;
      _helped = review.helped;
    }
  }

  Future<void> _toggleHelpful() async {
    if (_busy || sendGuestToSignIn(context, ref)) return;
    final want = !_helped;
    HapticFeedback.selectionClick();
    setState(() {
      _busy = true;
      _helped = want;
      _count = (_count + (want ? 1 : -1)).clamp(0, 1 << 30);
    });
    try {
      final result = await ref
          .read(buyerApiProvider)
          .setHelpful(review.id, helpful: want);
      if (mounted) {
        setState(() {
          _helped = result.helped;
          _count = result.count;
        });
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _helped = !want;
        _count = (_count + (want ? -1 : 1)).clamp(0, 1 << 30);
      });
      showSnack(context, ApiFailure.from(error).message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    final productId = review.productId ?? widget.productId;
    final link = productId == null
        ? Env.webUrl
        : '${Env.webUrl}/products/$productId';
    final stars = '★' * review.rating + '☆' * (5 - review.rating);
    final comment = review.comment;
    final quote = comment == null
        ? null
        : comment.length > 200
        ? '"${comment.substring(0, 200).trimRight()}…"'
        : '"$comment"';
    final text = [
      '$stars ${ReviewTile.wordFor(review.rating)}'
          '${review.productName == null ? '' : ' · ${review.productName}'}',
      ?quote,
      '${review.buyerName}, a verified buyer on Loved-IT',
      link,
    ].join('\n');
    if (await shareText(
      text,
      subject: 'A review on Loved-IT',
      title: 'Share review',
    )) {
      return;
    }
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) {
      showSnack(context, 'Review copied. Paste it anywhere to share.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final bought = [
      review.productName,
      review.variantLabel,
    ].whereType<String>().join(' · ');
    const muted = TextStyle(fontSize: 12.5, color: AppColors.stone500);
    return Container(
      padding: const EdgeInsets.only(top: AppSpace.lg, bottom: AppSpace.xs),
      decoration: widget.divider
          ? const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.stone200)),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ShopAvatar(
                name: review.buyerName,
                url: review.avatarUrl,
                size: 34,
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: review.buyerName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: AppColors.ink,
                        ),
                      ),
                      if (review.createdAt != null)
                        TextSpan(
                          text: '  on ${Fmt.date(review.createdAt)}',
                          style: muted,
                        ),
                    ],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Stars(rating: review.rating, size: 17),
              const SizedBox(width: AppSpace.sm),
              Text(
                ReviewTile.wordFor(review.rating),
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: StatusTone.amber.foreground,
                ),
              ),
            ],
          ),
          if (bought.isNotEmpty || review.verifiedPurchase) ...[
            const SizedBox(height: 6),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: AppSpace.sm,
              runSpacing: 2,
              children: [
                if (bought.isNotEmpty) Text('Purchased: $bought', style: muted),
                if (review.verifiedPurchase)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        LucideIcons.badgeCheck,
                        size: 13,
                        color: StatusTone.emerald.foreground,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        'Verified purchase',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: StatusTone.emerald.foreground,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ],
          if (review.comment != null) ...[
            const SizedBox(height: AppSpace.sm),
            _ExpandableText(review.comment!),
          ],
          if (review.images.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            _ReviewPhotos(urls: review.images),
          ],
          if (review.sellerReply != null) ...[
            const SizedBox(height: AppSpace.md),
            _Reply(text: review.sellerReply!, at: review.sellerRepliedAt),
          ],
          const SizedBox(height: AppSpace.xs),
          // Each side gives way (its words cut short) on a narrow phone with large text.
          Row(
            children: [
              Flexible(
                child: _ActionButton(
                  icon: LucideIcons.share2,
                  label: 'Share',
                  onTap: _share,
                ),
              ),
              Container(
                width: 1,
                height: 14,
                color: AppColors.stone300,
                margin: const EdgeInsets.symmetric(horizontal: AppSpace.xs),
              ),
              Flexible(
                child: review.isMine
                    ? const Padding(
                        padding: EdgeInsets.symmetric(horizontal: AppSpace.sm),
                        child: Text(
                          'Your review',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppColors.stone500,
                          ),
                        ),
                      )
                    : _ActionButton(
                        icon: LucideIcons.thumbsUp,
                        label: _count > 0 ? 'Helpful ($_count)' : 'Helpful',
                        active: _helped,
                        semantics: _helped
                            ? 'Helpful, $_count. You marked it; tap to undo.'
                            : 'Helpful, $_count. Tap to mark as helpful.',
                        onTap: _toggleHelpful,
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Share or Helpful under a review: an icon and a word, a full-height tap target.
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.semantics,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;
  final String? semantics;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.brandRed : AppColors.stone700;
    return Semantics(
      button: true,
      selected: active,
      label: semantics ?? label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: kMinTap),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedSwitcher(
                  duration: kMotion,
                  transitionBuilder: (child, animation) =>
                      ScaleTransition(scale: animation, child: child),
                  child: Icon(
                    icon,
                    key: ValueKey(active),
                    size: 18,
                    color: color,
                    fill: active ? 1 : 0,
                  ),
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                      color: color,
                    ),
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

/// A review's text, cut at five lines with "Read more" when it is longer.
class _ExpandableText extends StatefulWidget {
  const _ExpandableText(this.text);

  final String text;

  @override
  State<_ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<_ExpandableText> {
  static const _lines = 5;
  static const _style = TextStyle(
    fontSize: 14.5,
    height: 1.5,
    color: AppColors.stone900,
  );
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          text: TextSpan(
            text: widget.text,
            style: DefaultTextStyle.of(context).style.merge(_style),
          ),
          maxLines: _lines,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        final long = painter.didExceedMaxLines;
        painter.dispose();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              style: _style,
              maxLines: _open ? null : _lines,
              overflow: _open ? null : TextOverflow.ellipsis,
            ),
            if (long)
              GestureDetector(
                onTap: () => setState(() => _open = !_open),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
                  child: Text(
                    _open ? 'Show less' : 'Read more',
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// A review's photos, big enough to see: two across for one or two photos, three across for more, "+2" on the last
/// one shown when there are more than three. A tap opens them full screen.
class _ReviewPhotos extends StatelessWidget {
  const _ReviewPhotos({required this.urls});

  final List<String> urls;

  @override
  Widget build(BuildContext context) {
    const gap = AppSpace.sm;
    return LayoutBuilder(
      builder: (context, constraints) {
        final across = urls.length <= 2 ? 2 : 3;
        final size = (constraints.maxWidth - gap * (across - 1)) / across;
        final shown = urls.length.clamp(0, 3);
        final more = urls.length - shown;
        return Row(
          children: [
            for (var i = 0; i < shown; i++) ...[
              if (i > 0) const SizedBox(width: gap),
              Semantics(
                button: true,
                label: 'Review photo ${i + 1} of ${urls.length}',
                child: GestureDetector(
                  onTap: () => showPhotoViewer(context, urls, initial: i),
                  child: Stack(
                    children: [
                      NetImage(urls[i], width: size, height: size, radius: 10),
                      if (more > 0 && i == shown - 1)
                        Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: AppColors.stone900.withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Center(
                              child: Text(
                                '+$more',
                                style: const TextStyle(
                                  color: AppColors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// The shop's answer under a review or comment.
class _Reply extends StatelessWidget {
  const _Reply({required this.text, this.at});

  final String text;
  final DateTime? at;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: AppColors.stone100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                LucideIcons.messageSquareReply,
                size: 15,
                color: AppColors.stone600,
              ),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                  "Shop's reply",
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.stone700,
                  ),
                ),
              ),
              if (at != null)
                Text(
                  Fmt.date(at),
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.stone500,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            text,
            style: const TextStyle(
              fontSize: 13.5,
              height: 1.45,
              color: AppColors.stone800,
            ),
          ),
        ],
      ),
    );
  }
}

/// "All reviews are from verified purchases", green, with a (?) that explains star ratings.
class VerifiedReviewsBanner extends StatelessWidget {
  const VerifiedReviewsBanner({super.key, required this.onHelp});

  final VoidCallback onHelp;

  @override
  Widget build(BuildContext context) {
    final green = StatusTone.emerald;
    return Material(
      color: green.background,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onHelp,
        child: Semantics(
          button: true,
          label:
              'All reviews are from verified purchases. How star ratings work.',
          excludeSemantics: true,
          child: Row(
            children: [
              Container(
                width: 40,
                height: 44,
                color: green.foreground,
                child: const Icon(
                  LucideIcons.shieldCheck,
                  size: 20,
                  color: AppColors.white,
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Text(
                  'All reviews are from verified purchases',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    color: green.foreground,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
                child: Icon(
                  LucideIcons.circleHelp,
                  size: 18,
                  color: green.foreground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The average, its stars, and one bar per number of stars with its share of the reviews. With [onSelect], tapping a
/// bar shows only those reviews, and tapping the chosen one again shows all.
class RatingBreakdown extends StatelessWidget {
  const RatingBreakdown({
    super.key,
    required this.stats,
    this.selected,
    this.onSelect,
  });

  final ReviewStats stats;
  final int? selected;
  final ValueChanged<int?>? onSelect;

  @override
  Widget build(BuildContext context) {
    final total = stats.total;
    final average = stats.average;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 104,
          child: Column(
            children: [
              Text(
                average == null ? '–' : average.toStringAsFixed(1),
                style: const TextStyle(
                  fontSize: 38,
                  height: 1.1,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 4),
              Stars(rating: average ?? 0, size: 15),
              const SizedBox(height: 4),
              Text(
                '$total rating${total == 1 ? '' : 's'}',
                style: const TextStyle(fontSize: 12, color: AppColors.stone500),
              ),
            ],
          ),
        ),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(
            children: [
              for (var stars = 5; stars >= 1; stars--)
                _Bar(
                  stars: stars,
                  count: stats.counts[stars] ?? 0,
                  total: total,
                  selected: selected == stars,
                  dimmed: selected != null && selected != stars,
                  onTap: onSelect == null || (stats.counts[stars] ?? 0) == 0
                      ? null
                      : () => onSelect!(selected == stars ? null : stars),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({
    required this.stars,
    required this.count,
    required this.total,
    required this.selected,
    required this.dimmed,
    this.onTap,
  });

  final int stars;
  final int count;
  final int total;
  final bool selected;
  final bool dimmed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final share = total == 0 ? 0.0 : count / total;
    final percent = (share * 100).round();
    final ink = dimmed ? AppColors.stone400 : AppColors.ink;
    return Semantics(
      button: onTap != null,
      selected: selected,
      label:
          '$stars stars, $count review${count == 1 ? '' : 's'}, $percent percent',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 3.5),
          child: Row(
            children: [
              SizedBox(
                width: 12,
                child: Text(
                  '$stars',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: ink,
                  ),
                ),
              ),
              Icon(Icons.star_rounded, size: 13, color: ink),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  child: Stack(
                    children: [
                      Container(height: 7, color: AppColors.stone200),
                      FractionallySizedBox(
                        widthFactor: share,
                        child: Container(height: 7, color: ink),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(
                width: 40,
                child: Text(
                  '$percent%',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                    color: dimmed ? AppColors.stone400 : AppColors.stone600,
                    fontFeatures: const [FontFeature.tabularFigures()],
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

/// A rounded filter above a review list. A chosen one turns dark; [trailing] is a down arrow for one that opens choices.
class ReviewFilterChip extends StatelessWidget {
  const ReviewFilterChip({
    super.key,
    required this.label,
    required this.onTap,
    this.selected = false,
    this.icon,
    this.trailing,
  });

  final String label;
  final VoidCallback onTap;
  final bool selected;
  final IconData? icon;
  final IconData? trailing;

  @override
  Widget build(BuildContext context) {
    final foreground = selected ? AppColors.white : AppColors.ink;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.ink : AppColors.white,
        shape: StadiumBorder(
          side: BorderSide(
            color: selected ? AppColors.ink : AppColors.stone300,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 40),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 15, color: foreground),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w500,
                      color: foreground,
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: 4),
                    Icon(trailing, size: 16, color: foreground),
                  ],
                ],
              ),
            ),
          ),
        ),
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
